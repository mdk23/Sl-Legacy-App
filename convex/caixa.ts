import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./authHelpers";

// Helper: Check if a timestamp is from a previous day
const isPreviousDay = (timestamp: number) => {
  const sessionDate = new Date(timestamp);
  const today = new Date();
  return (
    sessionDate.getDate() !== today.getDate() ||
    sessionDate.getMonth() !== today.getMonth() ||
    sessionDate.getFullYear() !== today.getFullYear()
  );
};

export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const session = await ctx.db
      .query("caixaSessions")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .first();
    
    if (!session) return null;

    return {
      ...session,
      isExpired: isPreviousDay(session.openedAt),
    };
  },
});

export const getRecentSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("caixaSessions")
      .withIndex("by_openedAt")
      .order("desc")
      .take(5);
  },
});

export const getSessionMovements = query({
  args: { sessionId: v.id("caixaSessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("caixaMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(500);
  },
});

export const openSession = mutation({
  args: { openingAmount: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);

    const existingOpen = await ctx.db
      .query("caixaSessions")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .first();

    if (existingOpen) {
      throw new Error(`Caixa already opened by ${existingOpen.openedBy}. Please use the existing session.`);
    }

    const sessionId = await ctx.db.insert("caixaSessions", {
      openedBy: user.username,
      openedAt: Date.now(),
      openingAmount: args.openingAmount,
      status: "OPEN",
      expectedCash: args.openingAmount,
      totalCashSales: 0,
      totalCashIn: 0,
      totalCashOut: 0,
    });

    await ctx.db.insert("caixaMovements", {
      sessionId,
      type: "OPENING",
      amount: args.openingAmount,
      description: "Initial float",
      userId: user.username,
      timestamp: Date.now(),
      runningBalance: args.openingAmount,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "OPEN_CAIXA_SESSION",
      afterValue: { sessionId, openingAmount: args.openingAmount },
    });

    return sessionId;
  },
});

// Per-channel payment breakdown for a session, used by the close-session flow
// so the closer can see (and reconcile) every payment method, not just cash.
export const getSessionPaymentSummary = query({
  args: { sessionId: v.id("caixaSessions") },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const byMethod: Record<string, { amount: number; count: number }> = {};
    let total = 0;

    for (const p of payments) {
      if (!byMethod[p.paymentMethod]) byMethod[p.paymentMethod] = { amount: 0, count: 0 };
      byMethod[p.paymentMethod].amount += p.amount;
      byMethod[p.paymentMethod].count += 1;
      total += p.amount;
    }

    return { byMethod, total, paymentCount: payments.length };
  },
});

export const closeSession = mutation({
  args: {
    sessionId: v.id("caixaSessions"),
    countedCash: v.number(),
    closingNote: v.optional(v.string()),
    validatedChannels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "OPEN") {
      throw new Error("Invalid or already closed session.");
    }

    // Every distinct non-cash payment channel used this session must be explicitly
    // validated by the closer before the register can be closed.
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const channelsUsed = new Set(payments.map((p) => p.paymentMethod).filter((m) => m !== "Cash"));
    const validatedSet = new Set(args.validatedChannels);
    const missing = [...channelsUsed].filter((m) => !validatedSet.has(m));
    if (missing.length > 0) {
      throw new Error(`Please validate all payment channels before closing: ${missing.join(", ")}.`);
    }

    const variance = args.countedCash - session.expectedCash;

    if (Math.abs(variance) > 5 && !args.closingNote) {
      throw new Error("Cash variance detected. Please provide an explanation.");
    }

    await ctx.db.patch(args.sessionId, {
      status: "CLOSED",
      closedAt: Date.now(),
      countedCash: args.countedCash,
      variance,
      closingNote: args.closingNote,
    });

    // Add adjustment movement for the variance
    if (variance !== 0) {
      await ctx.db.insert("caixaMovements", {
        sessionId: args.sessionId,
        type: "ADJUSTMENT",
        amount: variance,
        description: `Closing variance: ${args.closingNote || 'No note'}`,
        userId: user.username,
        timestamp: Date.now(),
        runningBalance: session.expectedCash + variance,
      });
    }

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "CLOSE_CAIXA_SESSION",
      beforeValue: { expectedCash: session.expectedCash },
      afterValue: { countedCash: args.countedCash, variance, validatedChannels: args.validatedChannels },
      referenceId: args.sessionId,
    });

    return args.sessionId;
  },
});

export const addMovement = mutation({
  args: {
    sessionId: v.id("caixaSessions"),
    type: v.string(), // "SALE", "CASH_IN", "CASH_OUT", "SALE_REVERSAL"
    amount: v.number(),
    description: v.string(),
    referenceId: v.optional(v.string()),
    referenceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "OPEN") {
      throw new Error("No open Caixa session found.");
    }

    if (isPreviousDay(session.openedAt)) {
      throw new Error("This Caixa session is from a previous day. You must close it and open a new session for today.");
    }

    if (args.type === "CASH_OUT" && args.amount > session.expectedCash) {
      throw new Error("Insufficient cash available in drawer.");
    }

    let runningBalance = session.expectedCash;
    const patch: any = {};

    if (args.type === "SALE" || args.type === "CASH_IN") {
      runningBalance += args.amount;
      patch.expectedCash = runningBalance;
      if (args.type === "SALE") patch.totalCashSales = session.totalCashSales + args.amount;
      if (args.type === "CASH_IN") patch.totalCashIn = session.totalCashIn + args.amount;
    } else if (args.type === "CASH_OUT" || args.type === "SALE_REVERSAL") {
      runningBalance -= args.amount;
      patch.expectedCash = runningBalance;
      if (args.type === "CASH_OUT") patch.totalCashOut = session.totalCashOut + args.amount;
      if (args.type === "SALE_REVERSAL") patch.totalCashSales = session.totalCashSales - args.amount; // Decrease sales
    }

    await ctx.db.patch(args.sessionId, patch);

    const todayStr = new Date().toISOString().split("T")[0];
    const dailyStat = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", todayStr))
      .first();

    if (dailyStat) {
      if (args.type === "CASH_IN") {
        await ctx.db.patch(dailyStat._id, { cashIn: (dailyStat.cashIn || 0) + args.amount });
      } else if (args.type === "CASH_OUT") {
        await ctx.db.patch(dailyStat._id, { cashOut: (dailyStat.cashOut || 0) + args.amount });
      }
    }

    const movementId = await ctx.db.insert("caixaMovements", {
      sessionId: args.sessionId,
      type: args.type,
      amount: args.amount,
      description: args.description,
      userId: user.username,
      timestamp: Date.now(),
      runningBalance,
      referenceId: args.referenceId,
      referenceType: args.referenceType,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: `CAIXA_${args.type}`,
      afterValue: { amount: args.amount, runningBalance },
      referenceId: movementId,
    });

    return movementId;
  },
});

export const getCaixaReports = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.startDate !== undefined && args.endDate !== undefined) {
      return await ctx.db
        .query("caixaSessions")
        .withIndex("by_openedAt", (q) =>
          q.gte("openedAt", args.startDate!).lte("openedAt", args.endDate!)
        )
        .order("desc")
        .take(500);
    }
    
    if (args.startDate !== undefined) {
      return await ctx.db
        .query("caixaSessions")
        .withIndex("by_openedAt", (q) => q.gte("openedAt", args.startDate!))
        .order("desc")
        .take(500);
    }
    
    if (args.endDate !== undefined) {
      return await ctx.db
        .query("caixaSessions")
        .withIndex("by_openedAt", (q) => q.lte("openedAt", args.endDate!))
        .order("desc")
        .take(500);
    }

    return await ctx.db
      .query("caixaSessions")
      .withIndex("by_openedAt")
      .order("desc")
      .take(500);
  }
});

export const getSessionReportDetails = query({
  args: { sessionId: v.id("caixaSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const ledgerEntries = await ctx.db
      .query("ledger")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const movements = await ctx.db
      .query("caixaMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Fetch and resolve stock movements for the session time range
    const start = session.openedAt;
    const end = session.closedAt ?? Date.now();

    const stockMovements = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", start).lte("createdAt", end))
      .collect();

    const stockMovementsResolved = await Promise.all(
      stockMovements.map(async (m) => {
        const product = await ctx.db.get(m.productId);
        return {
          ...m,
          productName: product?.name || "Unknown Product",
          productCode: product?.code || "N/A",
        };
      })
    );

    let totalCashReceived = 0;
    let totalElectronicReceived = 0;

    for (const p of payments) {
      if (p.paymentMethod.toLowerCase() === "cash") {
        totalCashReceived += p.amount;
      } else {
        totalElectronicReceived += p.amount;
      }
    }

    const debtRecoveries = ledgerEntries.filter((l) => l.type === "PAYMENT");
    const totalDebtRecoveries = debtRecoveries.reduce((sum, l) => sum + l.amount, 0);

    const creditRedemptions = ledgerEntries.filter((l) => l.type === "USE_CREDIT");
    const totalCreditRedemptions = creditRedemptions.reduce((sum, l) => sum + l.amount, 0);

    const cashInMovements = movements.filter((m) => m.type === "CASH_IN");
    const totalCashIn = cashInMovements.reduce((sum, m) => sum + m.amount, 0);

    const cashOutMovements = movements.filter((m) => m.type === "CASH_OUT");
    const totalCashOut = cashOutMovements.reduce((sum, m) => sum + m.amount, 0);

    // Compute additional overview metrics requested by the user
    const totalSessionRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalProfit = transactions.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    const totalSalesVolume = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalCost = totalSalesVolume - totalProfit;
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce(
      (sum, t) => sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );
    const totalDiscounts = transactions.reduce((sum, t) => sum + (t.discount ?? 0), 0);
    const totalPendingBalance = transactions.reduce(
      (sum, t) => sum + Math.max(0, t.total - (t.amountReceived ?? t.total)),
      0
    );
    const totalCustomerCreditIssued = ledgerEntries
      .filter((l) => l.type === "CREDIT")
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCustomerCreditUsed = ledgerEntries
      .filter((l) => l.type === "USE_CREDIT")
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCustomerDebtCreated = ledgerEntries
      .filter((l) => l.type === "DEBIT")
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCustomerDebtRecovered = ledgerEntries
      .filter((l) => l.type === "PAYMENT")
      .reduce((sum, l) => sum + l.amount, 0);

    return {
      session,
      transactions,
      payments,
      ledgerEntries,
      movements,
      stockMovements: stockMovementsResolved,
      summary: {
        openingAmount: session.openingAmount,
        closingAmount: session.countedCash ?? null,
        expectedCash: session.expectedCash,
        variance: session.variance ?? 0,
        totalCashReceived,
        totalElectronicReceived,
        totalCashIn,
        totalCashOut,
        totalDebtRecoveries,
        totalCreditRedemptions,
        totalSessionRevenue,
        totalCost,
        totalProfit,
        totalTransactions,
        totalItemsSold,
        totalDiscounts,
        totalPendingBalance,
        totalCustomerCreditIssued,
        totalCustomerCreditUsed,
        totalCustomerDebtCreated,
        totalCustomerDebtRecovered,
      },
    };
  },
});
