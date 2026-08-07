import { v } from "convex/values";
import { DatabaseWriter, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireUser } from "./authHelpers";

export function reconcileBalances(currentCredit: number, currentDebit: number, netAmount: number) {
  let creditBalance = currentCredit;
  let debitBalance = currentDebit;

  if (netAmount > 0) {
    // Applying credit
    if (debitBalance > 0) {
      if (netAmount >= debitBalance) {
        creditBalance += (netAmount - debitBalance);
        debitBalance = 0;
      } else {
        debitBalance -= netAmount;
      }
    } else {
      creditBalance += netAmount;
    }
  } else if (netAmount < 0) {
    // Applying debt
    const debt = Math.abs(netAmount);
    if (creditBalance > 0) {
      if (debt >= creditBalance) {
        debitBalance += (debt - creditBalance);
        creditBalance = 0;
      } else {
        creditBalance -= debt;
      }
    } else {
      debitBalance += debt;
    }
  }

  return { creditBalance, debitBalance };
}

export type LedgerEntryType = "CREDIT" | "DEBIT" | "USE_CREDIT" | "PAYMENT" | "PAYMENT_LOG" | "REFUND" | "SALE";

export type CustomerBalance = { creditBalance: number; debitBalance: number };

// The single source of truth for "how does one ledger event affect a customer's
// balance." Pure and DB-free — used both incrementally (append one new entry onto
// the current cached balance: create/addPayment) and via full replay (fold a
// customer's entire ledger history from zero: remove/the repair tool). Both modes
// must produce identical results for the same history, which is only possible if
// they share this exact function.
export function applyLedgerEntry(
  balance: CustomerBalance,
  entry: { type: LedgerEntryType; amount: number }
): CustomerBalance {
  if (entry.type === "USE_CREDIT") {
    return { creditBalance: Math.max(0, balance.creditBalance - entry.amount), debitBalance: balance.debitBalance };
  }
  if (entry.type === "SALE" || entry.type === "REFUND" || entry.type === "PAYMENT_LOG") {
    // SALE/PAYMENT_LOG are pure audit entries. REFUND is cash/change handed back to
    // the customer (not store credit) — none of these may affect balance.
    return balance;
  }
  if (entry.type === "DEBIT") {
    // A shortfall always becomes new debt — it must never net against unrelated
    // existing credit (that only happens explicitly, via a "Store Credit" payment).
    return { creditBalance: balance.creditBalance, debitBalance: balance.debitBalance + entry.amount };
  }
  // PAYMENT (real manual debt-recovery payment) or CREDIT (store credit granted).
  return reconcileBalances(balance.creditBalance, balance.debitBalance, entry.amount);
}

export async function applyCustomerLedger(
  db: DatabaseWriter,
  customerId: Id<"customers">,
  params: {
    type: LedgerEntryType;
    amount: number;
    description: string;
    referenceId?: string;
    referenceType?: string;
    sessionId?: Id<"caixaSessions">;
  }
) {
  const customer = await db.get(customerId);
  if (!customer) throw new Error("Customer not found for ledger update.");

  const current = { creditBalance: customer.creditBalance || 0, debitBalance: customer.debitBalance || 0 };
  if (params.type === "USE_CREDIT" && current.creditBalance < params.amount) {
    throw new Error("Insufficient store credit to cover payment amount.");
  }

  const next = applyLedgerEntry(current, params);
  const now = Date.now();

  await db.patch(customerId, next);

  const ledgerId = await db.insert("ledger", {
    customerId,
    sessionId: params.sessionId,
    type: params.type,
    amount: params.amount,
    balanceAfter: { credit: next.creditBalance, debit: next.debitBalance },
    referenceId: params.referenceId,
    referenceType: params.referenceType,
    description: params.description,
    createdAt: now,
  });

  return { ledgerId, creditBalance: next.creditBalance, debitBalance: next.debitBalance };
}

// Rebuilds a customer's creditBalance/debitBalance from scratch by replaying their
// full ledger history through the same canonical rules (applyLedgerEntry) used for
// live writes. This is the only mathematically correct way to reverse a deleted
// transaction (see transactions.ts's `remove`): balance is order/state-dependent
// (a DEBIT is a pure add, but CREDIT/PAYMENT net through existing debt), so there is
// no valid "inverse delta" for a removed entry — only a full replay of what remains
// is guaranteed correct. Also used as an admin drift-repair/audit tool.
export async function recomputeCustomerBalanceForCustomer(db: DatabaseWriter, customerId: Id<"customers">) {
  const customer = await db.get(customerId);
  if (!customer) throw new Error("Customer not found.");

  const entries = await db
    .query("ledger")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  entries.sort((a, b) => a.createdAt - b.createdAt);

  const after = entries.reduce(
    (balance, entry) => applyLedgerEntry(balance, entry as { type: LedgerEntryType; amount: number }),
    { creditBalance: 0, debitBalance: 0 }
  );

  const before = { creditBalance: customer.creditBalance || 0, debitBalance: customer.debitBalance || 0 };
  const changed = before.creditBalance !== after.creditBalance || before.debitBalance !== after.debitBalance;

  if (changed) {
    await db.patch(customerId, after);
  }

  return { customerId, before, after, changed };
}

export const recomputeCustomerBalance = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can recompute customer balances.");
    }
    return await recomputeCustomerBalanceForCustomer(ctx.db, args.customerId);
  },
});

export const recomputeAllCustomerBalances = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can recompute customer balances.");
    }
    const customers = await ctx.db.query("customers").collect();
    const corrections = [];
    for (const customer of customers) {
      const result = await recomputeCustomerBalanceForCustomer(ctx.db, customer._id);
      if (result.changed) corrections.push(result);
    }
    return { checked: customers.length, corrected: corrections.length, corrections };
  },
});

// Same as above, callable from the CLI/backend without a logged-in user.
export const recomputeAllCustomerBalancesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();
    const corrections = [];
    for (const customer of customers) {
      const result = await recomputeCustomerBalanceForCustomer(ctx.db, customer._id);
      if (result.changed) corrections.push(result);
    }
    return { checked: customers.length, corrected: corrections.length, corrections };
  },
});

// One-time backfill: historical checkout-audit ledger rows were mistakenly typed
// "PAYMENT" (same as real manual debt-recovery payments), disambiguated only by
// sniffing the description text. Now that PAYMENT_LOG exists as a distinct, structural
// type, rename those historical rows so replay no longer needs to sniff description.
// Idempotent — safe to run more than once (re-running finds nothing left to rename).
export const backfillPaymentLogType = internalMutation({
  args: {},
  handler: async (ctx) => {
    const paymentEntries = await ctx.db
      .query("ledger")
      .withIndex("by_type", (q) => q.eq("type", "PAYMENT"))
      .collect();
    const toRename = paymentEntries.filter((e) => e.description.startsWith("Payment via"));
    for (const entry of toRename) {
      await ctx.db.patch(entry._id, { type: "PAYMENT_LOG" });
    }
    return { renamed: toRename.length };
  },
});
