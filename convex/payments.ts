import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { recomputeCustomerIntelligence } from "./intelligence";
import { applyCustomerLedger, recomputeCustomerBalanceForCustomer } from "./ledgerHelpers";
import { processCashPayment, resolveCaixaSession } from "./caixaHelpers";
import { requireUser } from "./authHelpers";
import { updateFinancialStats } from "./analyticsHelpers";
import { updateFinancialCountersHelper } from "./transactions";
import { getPaymentHistory, getTransactionBalance, syncTransactionStatus } from "./salesService";
import { createCredit, recoverDebt, redeemCredit } from "./customerService";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("payments").order("desc").take(100);
  },
});

export const getForTransaction = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .take(100);
  },
});

export const getForCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .take(100);
  },
});

function requireManager(user: { role: string }) {
  if (user.role !== "admin" && user.role !== "manager") {
    throw new Error("Unauthorized. Only admins and managers can record or manage payments.");
  }
}

const manualPaymentArgs = {
  customerId: v.id("customers"),
  transactionId: v.id("transactions"),
  amount: v.number(),
  paymentMethod: v.string(),
  reference: v.optional(v.string()),
  notes: v.optional(v.string()),
};

// Shared engine behind addPayment ("account" mode) and recordSalePayment ("sale" mode).
// Account mode recovers the customer's real debitBalance and requires the sale's
// balance to have already been added to the account (transaction.debtAddedToAccount).
// Sale mode settles the sale directly and never touches account credit/debit — the two
// modes are mutually exclusive per sale, switched by that same flag.
async function recordManualPayment(
  ctx: any,
  mode: "account" | "sale",
  args: {
    customerId: Id<"customers">;
    transactionId: Id<"transactions">;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }
) {
  if (args.amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const user = await requireUser(ctx.db, ctx);
  requireManager(user);

  const transaction = await ctx.db.get(args.transactionId);
  if (!transaction) throw new Error("Transaction not found");

  if (mode === "account" && !transaction.debtAddedToAccount) {
    throw new Error(
      "This sale's balance hasn't been added to the customer's account yet. Use recordSalePayment, or add it to the account first."
    );
  }
  if (mode === "sale" && transaction.debtAddedToAccount) {
    throw new Error("This sale's balance has already been added to the customer's account. Use addPayment instead.");
  }

  const customer = await ctx.db.get(args.customerId);
  if (!customer) throw new Error("Customer not found");

  // outstanding is always SUM(payments) as of right now — never a cached amount field,
  // never customer.debitBalance. This is the same formula hydrateTransactions uses.
  const existingPayments = await getPaymentHistory(ctx.db, args.transactionId);
  const { outstanding: outstandingOnSale } = getTransactionBalance(transaction, existingPayments);
  const remaining =
    mode === "account" ? Math.min(outstandingOnSale, customer.debitBalance || 0) : outstandingOnSale;

  if (remaining <= 0) throw new Error("There is no outstanding balance to apply this payment to.");

  const isStoreCredit = args.paymentMethod === "Store Credit";
  let applied = 0;
  let overpay = 0;

  if (isStoreCredit) {
    const cap = Math.min(remaining, customer.creditBalance || 0);
    if (args.amount > cap + 0.01) {
      throw new Error(
        `Insufficient store credit. Trying to apply ${args.amount} but only ${cap} is available.`
      );
    }
    applied = args.amount;
  } else {
    applied = Math.min(args.amount, remaining);
    overpay = args.amount - applied;
  }

  const now = Date.now();
  const session = await resolveCaixaSession(ctx.db, now);

  const paymentId = await ctx.db.insert("payments", {
    transactionId: args.transactionId,
    customerId: args.customerId,
    sessionId: session._id,
    amount: args.amount,
    paymentMethod: args.paymentMethod,
    reference: args.reference,
    paymentDate: now,
    status: "Completed",
    source: "manual",
    notes: args.notes,
    createdAt: now,
    updatedAt: now,
  });

  const receiptRef = transaction.receiptNumber || args.transactionId;
  const ledgerOpts = (description: string) => ({
    description,
    referenceId: paymentId,
    referenceType: "payment",
    sessionId: session._id,
  });

  if (mode === "account") {
    // "USE_CREDIT (if store credit) -> PAYMENT (applied) -> CREDIT (if overpay)":
    // store credit is a form of tender the customer is choosing to pay with, so it
    // both draws down their store credit AND settles their account debt — the two
    // ledger entries are paired, not either/or.
    if (isStoreCredit) {
      await redeemCredit(ctx.db, args.customerId, applied, ledgerOpts(`Store credit applied toward account debt for ${receiptRef}`));
    }
    await recoverDebt(ctx.db, args.customerId, applied, ledgerOpts(`Manual payment via ${args.paymentMethod} for ${receiptRef}`));
    if (overpay > 0) {
      await createCredit(ctx.db, args.customerId, overpay, ledgerOpts(`Overpayment banked as store credit for ${receiptRef}`));
    }
  } else {
    // Sale mode never writes PAYMENT — it never touches account debitBalance.
    if (isStoreCredit) {
      await redeemCredit(ctx.db, args.customerId, applied, ledgerOpts(`Store credit applied to ${receiptRef}`));
    } else {
      // Audit-only (balance-neutral) — no dedicated CustomerService verb, same as
      // create's own PAYMENT_LOG entries.
      await applyCustomerLedger(ctx.db, args.customerId, {
        type: "PAYMENT_LOG",
        amount: applied,
        ...ledgerOpts(`Payment via ${args.paymentMethod} for ${receiptRef}`),
      });
      if (overpay > 0) {
        await createCredit(ctx.db, args.customerId, overpay, ledgerOpts(`Overpayment banked as store credit for ${receiptRef}`));
      }
    }
  }

  if (args.paymentMethod.toLowerCase() === "cash") {
    await processCashPayment(ctx.db, {
      amount: args.amount,
      type: "CASH_IN",
      description: `Manual payment received for transaction ${receiptRef}`,
      userId: user.username,
      timestamp: now,
      referenceId: paymentId,
      referenceType: "payment",
    });
  }

  // Recomputes transaction.status/settlementType from the now-live payments (including
  // the row just inserted) — no amount field is cached/patched here anymore.
  await syncTransactionStatus(ctx.db, args.transactionId);

  const todayStr = new Date(now).toISOString().split("T")[0];
  await updateFinancialStats(ctx, {
    dateStr: todayStr,
    pendingAmountDelta: -applied,
    paymentsByMethodDelta: { [args.paymentMethod]: args.amount },
    cashSalesDelta: args.paymentMethod.toLowerCase() === "cash" ? args.amount : 0,
    debtRecoveredDelta: mode === "account" ? applied : 0,
    creditRedeemedDelta: isStoreCredit ? applied : 0,
    creditIssuedDelta: overpay,
  });

  await updateFinancialCountersHelper(ctx, {
    diffDebt: mode === "account" ? -applied : 0,
    diffCredit: (isStoreCredit ? -applied : 0) + overpay,
    recoveredDebt: mode === "account" ? applied : 0,
    creditUsed: isStoreCredit ? applied : 0,
  });

  await recomputeCustomerIntelligence(ctx.db, args.customerId);

  return paymentId;
}

// Recovers real customer.debitBalance for a sale whose outstanding balance has already
// been converted to account debt (transaction.debtAddedToAccount === true).
export const addPayment = mutation({
  args: manualPaymentArgs,
  handler: async (ctx, args) => {
    return await recordManualPayment(ctx, "account", args);
  },
});

// Settles a sale directly without ever touching the customer's account credit/debit.
// Requires the sale's balance NOT already be on the account (mutually exclusive with
// addPayment via transaction.debtAddedToAccount).
export const recordSalePayment = mutation({
  args: manualPaymentArgs,
  handler: async (ctx, args) => {
    return await recordManualPayment(ctx, "sale", args);
  },
});

// Deletes a manually-recorded payment, reversing its cash/ledger side effects. Checkout
// payments (source !== "manual") can't be deleted individually — they're tied to the
// whole checkout's credit/debit side effects, which are only safely reversible by
// deleting the entire transaction (transactions.remove).
export const deletePayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    requireManager(user);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.source !== "manual") {
      throw new Error(
        "Only manually recorded payments can be deleted individually. Checkout payments are removed by deleting the whole transaction."
      );
    }

    const now = Date.now();

    if (payment.paymentMethod.toLowerCase() === "cash") {
      await processCashPayment(ctx.db, {
        amount: payment.amount,
        type: "CASH_OUT",
        description: `Reversal of manual payment for transaction ${payment.transactionId}`,
        userId: user.username,
        timestamp: now,
        referenceId: payment._id,
        referenceType: "payment",
      });
    }

    if (payment.customerId) {
      const ledgerEntries = await ctx.db
        .query("ledger")
        .withIndex("by_reference", (q) => q.eq("referenceType", "payment").eq("referenceId", args.paymentId))
        .collect();
      for (const entry of ledgerEntries) {
        await ctx.db.delete(entry._id);
      }

      // Full replay, not delta — same rationale as transactions.remove: balance is
      // order/state-dependent (CREDIT/PAYMENT net through existing debt), so there is
      // no valid inverse delta for a removed ledger entry.
      const before = await ctx.db.get(payment.customerId);
      const beforeBalance = { creditBalance: before?.creditBalance || 0, debitBalance: before?.debitBalance || 0 };
      const { after } = await recomputeCustomerBalanceForCustomer(ctx.db, payment.customerId);

      await updateFinancialCountersHelper(ctx, {
        diffCredit: after.creditBalance - beforeBalance.creditBalance,
        diffDebt: after.debitBalance - beforeBalance.debitBalance,
      });

      await recomputeCustomerIntelligence(ctx.db, payment.customerId);
    }

    await ctx.db.delete(args.paymentId);

    // Recomputes transaction.status/settlementType from whatever payments remain —
    // naturally excludes the row just deleted.
    await syncTransactionStatus(ctx.db, payment.transactionId);

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: now,
      action: "DELETE_PAYMENT",
      beforeValue: { amount: payment.amount, method: payment.paymentMethod, transactionId: payment.transactionId },
      referenceId: args.paymentId,
    });

    return { deleted: true };
  },
});

// One-time migration: classify pre-existing payments rows (inserted before the `source`
// field existed) as "checkout" or "manual". Exact createdAt match with the parent
// transaction => checkout; otherwise manual; unresolvable (transaction missing) defaults
// to "checkout" (safer — keeps it non-deletable). Idempotent.
export const backfillPaymentSource = internalMutation({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db.query("payments").collect();
    const missing = payments.filter((p) => p.source === undefined);

    let backfilled = 0;
    for (const payment of missing) {
      const transaction = await ctx.db.get(payment.transactionId);
      const source = transaction && payment.createdAt !== transaction.createdAt ? "manual" : "checkout";
      await ctx.db.patch(payment._id, { source });
      backfilled++;
    }

    return { backfilled };
  },
});
