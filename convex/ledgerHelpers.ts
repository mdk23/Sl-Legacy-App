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

export async function applyCustomerLedger(
  db: DatabaseWriter,
  customerId: Id<"customers">,
  params: {
    type: "CREDIT" | "DEBIT" | "USE_CREDIT" | "PAYMENT" | "REFUND" | "SALE";
    amount: number;
    description: string;
    referenceId?: string;
    referenceType?: string;
    sessionId?: Id<"caixaSessions">;
  }
) {
  const customer = await db.get(customerId);
  if (!customer) throw new Error("Customer not found for ledger update.");

  let creditBalance = customer.creditBalance || 0;
  let debitBalance = customer.debitBalance || 0;
  const now = Date.now();

  if (params.type === "USE_CREDIT") {
    if (creditBalance >= params.amount) {
      creditBalance -= params.amount;
    } else {
      throw new Error("Insufficient store credit to cover payment amount.");
    }
  } else if (params.type === "SALE" || params.type === "REFUND") {
    // SALE just logs the current balance. REFUND is cash/change handed back to the
    // customer (not store credit) — it must not increase their credit balance.
  } else {
    let netAmount = 0;
    if (params.type === "PAYMENT" || params.type === "CREDIT") {
      netAmount = params.amount;
    } else if (params.type === "DEBIT") {
      netAmount = -params.amount;
    }
    const reconciled = reconcileBalances(creditBalance, debitBalance, netAmount);
    creditBalance = reconciled.creditBalance;
    debitBalance = reconciled.debitBalance;
  }

  // Update customer balances
  await db.patch(customerId, {
    creditBalance,
    debitBalance,
  });

  // Insert Ledger Record
  const ledgerId = await db.insert("ledger", {
    customerId,
    sessionId: params.sessionId,
    type: params.type,
    amount: params.amount,
    balanceAfter: { credit: creditBalance, debit: debitBalance },
    referenceId: params.referenceId,
    referenceType: params.referenceType,
    description: params.description,
    createdAt: now,
  });

  return { ledgerId, creditBalance, debitBalance };
}

// Rebuilds a customer's creditBalance/debitBalance from scratch by replaying their
// full ledger history with the CORRECT rules — i.e. treating historical "REFUND"
// entries and checkout-audit "PAYMENT" entries (description "Payment via ...", as
// opposed to "Manual payment via ..." from actual debt-recovery) as balance-neutral,
// the way applyCustomerLedger handles them today. This corrects balances left over
// from before that fix, for both still-existing and since-deleted transactions —
// deleting a transaction removes its ledger entries, so a fresh replay of whatever
// ledger entries remain naturally arrives at the true balance either way.
async function recomputeCustomerBalanceHandler(db: DatabaseWriter, customerId: Id<"customers">) {
  const customer = await db.get(customerId);
  if (!customer) throw new Error("Customer not found.");

  const entries = await db
    .query("ledger")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  entries.sort((a, b) => a.createdAt - b.createdAt);

  let creditBalance = 0;
  let debitBalance = 0;

  for (const entry of entries) {
    if (entry.type === "USE_CREDIT") {
      creditBalance = Math.max(0, creditBalance - entry.amount);
    } else if (entry.type === "SALE" || entry.type === "REFUND") {
      // Balance-neutral, always.
    } else if (entry.type === "PAYMENT" && !entry.description.startsWith("Manual payment")) {
      // Historical bug: checkout audit-log entries were mistakenly typed "PAYMENT" — no balance effect.
    } else if (entry.type === "PAYMENT" || entry.type === "CREDIT") {
      const reconciled = reconcileBalances(creditBalance, debitBalance, entry.amount);
      creditBalance = reconciled.creditBalance;
      debitBalance = reconciled.debitBalance;
    } else if (entry.type === "DEBIT") {
      const reconciled = reconcileBalances(creditBalance, debitBalance, -entry.amount);
      creditBalance = reconciled.creditBalance;
      debitBalance = reconciled.debitBalance;
    }
  }

  const before = { creditBalance: customer.creditBalance || 0, debitBalance: customer.debitBalance || 0 };
  const after = { creditBalance, debitBalance };
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
    return await recomputeCustomerBalanceHandler(ctx.db, args.customerId);
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
      const result = await recomputeCustomerBalanceHandler(ctx.db, customer._id);
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
      const result = await recomputeCustomerBalanceHandler(ctx.db, customer._id);
      if (result.changed) corrections.push(result);
    }
    return { checked: customers.length, corrected: corrections.length, corrections };
  },
});
