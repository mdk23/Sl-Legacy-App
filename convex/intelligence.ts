import { DatabaseReader, DatabaseWriter } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";

const HEALTH_COUNTER_FIELD: Record<string, string> = {
  "New Client": "newClients",
  "At Risk": "atRiskClients",
  "Growing Client": "growingClients",
  "Valuable Client": "valuableClients",
  "Elite Client": "eliteClients",
};

async function updateCustomerCountersHelper(db: DatabaseWriter, oldC: any, newC: any) {
  const counter = await db.query("customerCounters").withIndex("by_counter_id", (q) => q.eq("id", "main")).first();
  let diffs: any = {};

  if (oldC.customerHealth !== newC.customerHealth) {
    const oldField = oldC.customerHealth ? HEALTH_COUNTER_FIELD[oldC.customerHealth] : undefined;
    const newField = newC.customerHealth ? HEALTH_COUNTER_FIELD[newC.customerHealth] : undefined;
    if (oldField) diffs[oldField] = (diffs[oldField] || 0) - 1;
    if (newField) diffs[newField] = (diffs[newField] || 0) + 1;
  }

  if (oldC.creditStatus !== newC.creditStatus) {
    if (oldC.creditStatus === "Overdue") diffs.overdueCustomers = -1;
    if (newC.creditStatus === "Overdue") diffs.overdueCustomers = 1;
  }

  if (counter) {
    const patch: any = {};
    for (const [key, val] of Object.entries(diffs)) {
      patch[key] = Math.max(0, (counter as any)[key] + (val as number));
    }
    if (Object.keys(patch).length > 0) {
      await db.patch(counter._id, patch);
    }
  } else {
    const initial: any = {
      id: "main",
      totalCustomers: 1,
      activeCustomers: 1,
      inactiveCustomers: 0,
      newClients: 0,
      atRiskClients: 0,
      growingClients: 0,
      valuableClients: 0,
      eliteClients: 0,
      customersWithCredit: 0,
      customersWithDebt: 0,
      overdueCustomers: 0,
    };
    for (const [key, val] of Object.entries(diffs)) {
      initial[key] = Math.max(0, (initial[key] || 0) + (val as number));
    }
    await db.insert("customerCounters", initial);
  }
}

// Rule-based health classification driven by three signals only:
// how often the customer buys, how much they've spent, and whether they
// carry any debt/credit balance. No composite numeric score.
function computeCustomerHealth(args: {
  orderCount: number;
  totalSpent: number;
  lastPurchaseDate: number | undefined;
  creditStatus: string;
}): string {
  const { orderCount, totalSpent, lastPurchaseDate, creditStatus } = args;

  if (orderCount === 0) return "New Client";

  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 3600 * 1000;
  const isActive = !!lastPurchaseDate && lastPurchaseDate >= ninetyDaysAgo;

  // Unpaid debt past due always caps health at "At Risk", regardless of spend/frequency.
  if (creditStatus === "Overdue") return "At Risk";

  const isFrequentBuyer = orderCount >= 20;
  const isRegularBuyer = orderCount >= 5;
  const isHighSpender = totalSpent >= 500_000;
  const isMidSpender = totalSpent >= 100_000;
  const hasOutstandingDebt = creditStatus === "Outstanding";

  if (isActive && isFrequentBuyer && isHighSpender && !hasOutstandingDebt) {
    return "Elite Client";
  }
  if (isActive && (isFrequentBuyer || isHighSpender) && !hasOutstandingDebt) {
    return "Valuable Client";
  }
  if (isActive && (isRegularBuyer || isMidSpender)) {
    return "Growing Client";
  }
  return "At Risk";
}

export async function recomputeCustomerIntelligence(db: DatabaseWriter | DatabaseReader, customerId: Id<"customers">) {
  const customer = await db.get(customerId);
  if (!customer) return null;

  // 1. Fetch transactions for this customer
  const transactions = await db
    .query("transactions")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();

  const totalSpent = transactions.reduce((acc, tx) => acc + tx.total, 0);
  const orderCount = transactions.length;

  let lastPurchaseDate = customer.lastPurchaseDate;
  if (transactions.length > 0) {
    const sorted = [...transactions].sort((a, b) => b._creationTime - a._creationTime);
    lastPurchaseDate = sorted[0]._creationTime;
  }

  // 2. Fetch all payments for this customer to determine unpaid amounts / overdue invoices
  let creditStatus = "Good Standing";
  let hasOverdue = false;

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

  // Fetch all payments for this customer in a single query to avoid N+1 query pattern
  const allPayments = await db
    .query("payments")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();

  // Group payments by transactionId in-memory
  const paymentsByTxId = new Map<string, number>();
  for (const p of allPayments) {
    paymentsByTxId.set(p.transactionId, (paymentsByTxId.get(p.transactionId) || 0) + p.amount);
  }

  let oldestUnpaidDate = now;

  for (const tx of transactions) {
    const paid = paymentsByTxId.get(tx._id) || 0;

    // If the individual transaction was underpaid, track its date for overdue logic
    if (paid < tx.total && tx._creationTime < oldestUnpaidDate) {
      oldestUnpaidDate = tx._creationTime;
    }
  }

  const currentDebt = customer.debitBalance || 0;

  if (currentDebt > 0 && oldestUnpaidDate < thirtyDaysAgo) {
    hasOverdue = true;
  }

  // Generic Customer Lockdown
  const isGeneric = customer.firstName.toLowerCase() === "walk-in" ||
                    customer.lastName.toLowerCase() === "walk-in" ||
                    customer.firstName.toLowerCase() === "generic" ||
                    customer.lastName.toLowerCase() === "generic";

  if (isGeneric) {
    creditStatus = "Good Standing";
  } else if (hasOverdue) {
    creditStatus = "Overdue";
  } else if (currentDebt > 0) {
    creditStatus = "Outstanding";
  } else {
    creditStatus = "Good Standing";
  }

  // 3. Compute Customer Health from frequency, spend, and debt/credit only
  const customerHealth = isGeneric
    ? "New Client"
    : computeCustomerHealth({ orderCount, totalSpent, lastPurchaseDate, creditStatus });

  // Write changes back to the database
  if ("patch" in db) {
    await (db as DatabaseWriter).patch(customerId, {
      totalSpent,
      orderCount,
      lastPurchaseDate,
      creditStatus,
      customerHealth,
      customerType: "Registered",
    });

    await updateCustomerCountersHelper(db as DatabaseWriter, customer, {
      customerHealth,
      creditStatus,
    });
  }

  return {
    totalSpent,
    orderCount,
    lastPurchaseDate,
    creditStatus,
    customerHealth,
  };
}

export const recomputeAllCustomers = mutation({
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();
    for (const customer of customers) {
      await recomputeCustomerIntelligence(ctx.db, customer._id);
    }
    return `Recomputed intelligence for ${customers.length} customers`;
  },
});

export const forceRecompute = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await recomputeCustomerIntelligence(ctx.db, args.customerId);
  }
});

export const runLoyaltyDecaySweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();
    let updatedCount = 0;
    for (const customer of customers) {
      const result = await recomputeCustomerIntelligence(ctx.db, customer._id);
      if (result) {
        updatedCount++;
      }
    }
    console.log(`Swept ${customers.length} customers, updated intelligence metrics for ${updatedCount} profiles.`);
    return updatedCount;
  }
});
