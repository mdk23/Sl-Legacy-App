import { query, internalMutation } from "./_generated/server";

function dateStr(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString().split("T")[0];
}

// Daily snapshot of customer-dashboard metrics, so the /customers KPI cards
// can show real 30-day trend badges instead of static placeholder numbers.
export const snapshotDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();

    let eliteValuableCount = 0;
    let frequentBuyerCount = 0;
    let totalDebt = 0;
    let totalSpentSum = 0;

    for (const c of customers) {
      const health = c.customerHealth || "New Client";
      if (health === "Elite Client" || health === "Valuable Client") eliteValuableCount++;
      if ((c.orderCount || 0) >= 20) frequentBuyerCount++;
      totalDebt += c.debitBalance || 0;
      totalSpentSum += c.totalSpent || 0;
    }

    const today = dateStr(0);
    const snapshot = {
      date: today,
      totalCustomers: customers.length,
      eliteValuableCount,
      frequentBuyerCount,
      totalDebt,
      avgLTV: customers.length > 0 ? totalSpentSum / customers.length : 0,
    };

    const existing = await ctx.db
      .query("customerCounterHistory")
      .withIndex("by_date", (q) => q.eq("date", today))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, snapshot);
    } else {
      await ctx.db.insert("customerCounterHistory", snapshot);
    }
  },
});

// Most recent snapshot at least 30 days old — the baseline the /customers
// KPI trend badges compare today's live figures against. Null until the
// daily cron has accumulated 30+ days of history.
export const getBaseline = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = dateStr(30 * 24 * 3600 * 1000);
    return await ctx.db
      .query("customerCounterHistory")
      .withIndex("by_date", (q) => q.lte("date", cutoff))
      .order("desc")
      .first();
  },
});
