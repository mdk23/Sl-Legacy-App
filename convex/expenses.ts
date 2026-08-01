import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireUser } from "./authHelpers";
import { processCashPayment } from "./caixaHelpers";

function monthKeyOf(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7); // "YYYY-MM"
}

function emptyCounterBucket() {
  return {
    totalCount: 0,
    paidCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    cancelledCount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    expensesByCategory: {} as Record<string, number>,
    recurringCount: 0,
    manualCount: 0,
  };
}

async function patchExpenseCounterBucket(ctx: any, id: string, diffs: {
  diffTotalCount?: number;
  diffPaidCount?: number; diffPendingCount?: number; diffOverdueCount?: number; diffCancelledCount?: number;
  diffPaidAmount?: number; diffPendingAmount?: number; diffOverdueAmount?: number;
  categoryDelta?: { category: string; amount: number };
  diffRecurringCount?: number; diffManualCount?: number;
}) {
  const counter = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q: any) => q.eq("id", id)).first();
  const existingCategory = counter?.expensesByCategory || {};
  const expensesByCategory = { ...existingCategory };
  if (diffs.categoryDelta) {
    expensesByCategory[diffs.categoryDelta.category] = Math.max(
      0,
      (expensesByCategory[diffs.categoryDelta.category] || 0) + diffs.categoryDelta.amount
    );
  }

  const values = {
    totalCount: Math.max(0, (counter?.totalCount || 0) + (diffs.diffTotalCount || 0)),
    paidCount: Math.max(0, (counter?.paidCount || 0) + (diffs.diffPaidCount || 0)),
    pendingCount: Math.max(0, (counter?.pendingCount || 0) + (diffs.diffPendingCount || 0)),
    overdueCount: Math.max(0, (counter?.overdueCount || 0) + (diffs.diffOverdueCount || 0)),
    cancelledCount: Math.max(0, (counter?.cancelledCount || 0) + (diffs.diffCancelledCount || 0)),
    paidAmount: Math.max(0, (counter?.paidAmount || 0) + (diffs.diffPaidAmount || 0)),
    pendingAmount: Math.max(0, (counter?.pendingAmount || 0) + (diffs.diffPendingAmount || 0)),
    overdueAmount: Math.max(0, (counter?.overdueAmount || 0) + (diffs.diffOverdueAmount || 0)),
    expensesByCategory,
    recurringCount: Math.max(0, (counter?.recurringCount || 0) + (diffs.diffRecurringCount || 0)),
    manualCount: Math.max(0, (counter?.manualCount || 0) + (diffs.diffManualCount || 0)),
  };

  if (counter) {
    await ctx.db.patch(counter._id, values);
  } else {
    await ctx.db.insert("expenseCounters", { id, ...values });
  }
}

// Single choke-point every expense mutation calls with signed deltas, mirroring
// updateInventoryCountersHelper in products.ts. Patches the "main" (all-time) bucket
// and the due-date month bucket of expenseCounters, plus dailyStats/globalCounters.
export async function updateExpenseCountersHelper(ctx: any, args: {
  monthKey: string;
  diffTotalCount?: number;
  diffPaidCount?: number; diffPendingCount?: number; diffOverdueCount?: number; diffCancelledCount?: number;
  diffPaidAmount?: number; diffPendingAmount?: number; diffOverdueAmount?: number;
  categoryDelta?: { category: string; amount: number };
  diffRecurringCount?: number; diffManualCount?: number;
  dailyTotalExpensesDelta?: number; dailyExpensesPaidDelta?: number;
  globalTotalExpensesDelta?: number; globalTotalExpensesPaidDelta?: number;
}) {
  const bucketDiffs = {
    diffTotalCount: args.diffTotalCount,
    diffPaidCount: args.diffPaidCount,
    diffPendingCount: args.diffPendingCount,
    diffOverdueCount: args.diffOverdueCount,
    diffCancelledCount: args.diffCancelledCount,
    diffPaidAmount: args.diffPaidAmount,
    diffPendingAmount: args.diffPendingAmount,
    diffOverdueAmount: args.diffOverdueAmount,
    categoryDelta: args.categoryDelta,
    diffRecurringCount: args.diffRecurringCount,
    diffManualCount: args.diffManualCount,
  };
  await patchExpenseCounterBucket(ctx, "main", bucketDiffs);
  await patchExpenseCounterBucket(ctx, args.monthKey, bucketDiffs);

  if (args.dailyTotalExpensesDelta || args.dailyExpensesPaidDelta) {
    const dateStr = new Date().toISOString().split("T")[0];
    const dailyStat = await ctx.db.query("dailyStats").withIndex("by_date", (q: any) => q.eq("date", dateStr)).first();
    if (dailyStat) {
      await ctx.db.patch(dailyStat._id, {
        totalExpensesToday: Math.max(0, (dailyStat.totalExpensesToday || 0) + (args.dailyTotalExpensesDelta || 0)),
        expensesPaidToday: Math.max(0, (dailyStat.expensesPaidToday || 0) + (args.dailyExpensesPaidDelta || 0)),
      });
    } else {
      await ctx.db.insert("dailyStats", {
        date: dateStr,
        totalRevenue: 0,
        totalProfit: 0,
        transactionCount: 0,
        itemsSold: 0,
        totalExpensesToday: Math.max(0, args.dailyTotalExpensesDelta || 0),
        expensesPaidToday: Math.max(0, args.dailyExpensesPaidDelta || 0),
      });
    }
  }

  if (args.globalTotalExpensesDelta || args.globalTotalExpensesPaidDelta) {
    const globalCounter = await ctx.db.query("globalCounters").withIndex("by_counter_id", (q: any) => q.eq("id", "main")).first();
    if (globalCounter) {
      await ctx.db.patch(globalCounter._id, {
        totalExpenses: Math.max(0, (globalCounter.totalExpenses || 0) + (args.globalTotalExpensesDelta || 0)),
        totalExpensesPaid: Math.max(0, (globalCounter.totalExpensesPaid || 0) + (args.globalTotalExpensesPaidDelta || 0)),
      });
    } else {
      await ctx.db.insert("globalCounters", {
        id: "main",
        transactionCount: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeClients: 0,
        totalExpenses: Math.max(0, args.globalTotalExpensesDelta || 0),
        totalExpensesPaid: Math.max(0, args.globalTotalExpensesPaidDelta || 0),
      });
    }
  }
}

async function recomputeExpenseCountersHandler(ctx: any) {
  const all = await ctx.db.query("expenses").collect();
  const now = Date.now();
  const buckets = new Map<string, ReturnType<typeof emptyCounterBucket>>();
  const mainBucket = emptyCounterBucket();

  function getBucket(key: string) {
    if (!buckets.has(key)) buckets.set(key, emptyCounterBucket());
    return buckets.get(key)!;
  }

  for (const e of all) {
    const status = e.status === "Pending" && e.dueDate < now ? "Overdue" : e.status;
    const monthKey = monthKeyOf(e.dueDate);
    const bucket = getBucket(monthKey);

    for (const b of [bucket, mainBucket]) {
      if (status !== "Cancelled") {
        b.totalCount += 1;
        if (e.origin === "Recurring") b.recurringCount += 1;
        else b.manualCount += 1;
      }
      if (status === "Paid") {
        b.paidCount += 1;
        b.paidAmount += e.amount;
        b.expensesByCategory[e.category] = (b.expensesByCategory[e.category] || 0) + e.amount;
      } else if (status === "Pending") {
        b.pendingCount += 1;
        b.pendingAmount += e.amount;
      } else if (status === "Overdue") {
        b.overdueCount += 1;
        b.overdueAmount += e.amount;
      } else if (status === "Cancelled") {
        b.cancelledCount += 1;
      }
    }
  }

  for (const [key, bucket] of buckets.entries()) {
    const existing = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q: any) => q.eq("id", key)).first();
    if (existing) await ctx.db.patch(existing._id, bucket);
    else await ctx.db.insert("expenseCounters", { id: key, ...bucket });
  }
  const existingMain = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q: any) => q.eq("id", "main")).first();
  if (existingMain) await ctx.db.patch(existingMain._id, mainBucket);
  else await ctx.db.insert("expenseCounters", { id: "main", ...mainBucket });

  const globalCounter = await ctx.db.query("globalCounters").withIndex("by_counter_id", (q: any) => q.eq("id", "main")).first();
  if (globalCounter) {
    await ctx.db.patch(globalCounter._id, {
      totalExpenses: mainBucket.paidAmount + mainBucket.pendingAmount + mainBucket.overdueAmount,
      totalExpensesPaid: mainBucket.paidAmount,
    });
  }

  return { monthsRebuilt: buckets.size, mainBucket };
}

export const recomputeExpenseCounters = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can recompute expense counters.");
    }
    return await recomputeExpenseCountersHandler(ctx);
  },
});

export const recomputeExpenseCountersInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await recomputeExpenseCountersHandler(ctx);
  },
});

export const createExpense = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    amount: v.number(),
    dueDate: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can create expenses.");
    }
    if (args.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("expenses", {
      title: args.title,
      category: args.category,
      amount: args.amount,
      dueDate: args.dueDate,
      status: "Pending",
      origin: "Manual",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    await updateExpenseCountersHelper(ctx, {
      monthKey: monthKeyOf(args.dueDate),
      diffTotalCount: 1,
      diffPendingCount: 1,
      diffPendingAmount: args.amount,
      diffManualCount: 1,
      dailyTotalExpensesDelta: args.amount,
      globalTotalExpensesDelta: args.amount,
    });

    const inserted = await ctx.db.get(id);
    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: now,
      action: "CREATE_EXPENSE",
      afterValue: inserted,
      referenceId: id,
    });

    return id;
  },
});

export const updateExpense = mutation({
  args: {
    id: v.id("expenses"),
    title: v.optional(v.string()),
    category: v.optional(v.string()),
    amount: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can update expenses.");
    }

    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Expense not found.");
    if (existing.status === "Paid" || existing.status === "Cancelled") {
      throw new Error(`Cannot edit a ${existing.status.toLowerCase()} expense.`);
    }
    if (updates.amount !== undefined && updates.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    const newAmount = updates.amount !== undefined ? updates.amount : existing.amount;
    const newDueDate = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;
    const amountDiff = newAmount - existing.amount;
    const isOverdue = existing.status === "Overdue";

    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });

    if (amountDiff !== 0) {
      const oldMonthKey = monthKeyOf(existing.dueDate);
      const newMonthKey = monthKeyOf(newDueDate);

      if (oldMonthKey === newMonthKey) {
        await updateExpenseCountersHelper(ctx, {
          monthKey: oldMonthKey,
          diffPendingAmount: isOverdue ? 0 : amountDiff,
          diffOverdueAmount: isOverdue ? amountDiff : 0,
          dailyTotalExpensesDelta: amountDiff,
          globalTotalExpensesDelta: amountDiff,
        });
      } else {
        await updateExpenseCountersHelper(ctx, {
          monthKey: oldMonthKey,
          diffTotalCount: -1,
          diffPendingCount: isOverdue ? 0 : -1,
          diffOverdueCount: isOverdue ? -1 : 0,
          diffPendingAmount: isOverdue ? 0 : -existing.amount,
          diffOverdueAmount: isOverdue ? -existing.amount : 0,
          diffManualCount: existing.origin === "Manual" ? -1 : 0,
          diffRecurringCount: existing.origin === "Recurring" ? -1 : 0,
        });
        await updateExpenseCountersHelper(ctx, {
          monthKey: newMonthKey,
          diffTotalCount: 1,
          diffPendingCount: isOverdue ? 0 : 1,
          diffOverdueCount: isOverdue ? 1 : 0,
          diffPendingAmount: isOverdue ? 0 : newAmount,
          diffOverdueAmount: isOverdue ? newAmount : 0,
          diffManualCount: existing.origin === "Manual" ? 1 : 0,
          diffRecurringCount: existing.origin === "Recurring" ? 1 : 0,
          dailyTotalExpensesDelta: amountDiff,
          globalTotalExpensesDelta: amountDiff,
        });
      }
    }

    const updated = await ctx.db.get(id);
    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "UPDATE_EXPENSE",
      beforeValue: existing,
      afterValue: updated,
      referenceId: id,
    });
  },
});

export const payExpense = mutation({
  args: {
    id: v.id("expenses"),
    paymentMethod: v.string(),
    paymentDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can record payments.");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Expense not found.");
    if (existing.status === "Paid") throw new Error("Expense is already paid.");
    if (existing.status === "Cancelled") throw new Error("Cannot pay a cancelled expense.");

    const paymentDate = args.paymentDate ?? Date.now();

    if (args.paymentMethod === "Cash") {
      await processCashPayment(ctx.db, {
        amount: existing.amount,
        type: "CASH_OUT",
        description: `Expense payment: ${existing.title}`,
        userId: user.username,
        timestamp: paymentDate,
        referenceId: args.id,
        referenceType: "expense",
      });
    }

    await ctx.db.patch(args.id, {
      status: "Paid",
      paymentDate,
      paymentMethod: args.paymentMethod,
      updatedAt: Date.now(),
    });

    const wasOverdue = existing.status === "Overdue";
    await updateExpenseCountersHelper(ctx, {
      monthKey: monthKeyOf(existing.dueDate),
      diffPendingCount: wasOverdue ? 0 : -1,
      diffOverdueCount: wasOverdue ? -1 : 0,
      diffPendingAmount: wasOverdue ? 0 : -existing.amount,
      diffOverdueAmount: wasOverdue ? -existing.amount : 0,
      diffPaidCount: 1,
      diffPaidAmount: existing.amount,
      categoryDelta: { category: existing.category, amount: existing.amount },
      dailyExpensesPaidDelta: existing.amount,
      globalTotalExpensesPaidDelta: existing.amount,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "PAY_EXPENSE",
      beforeValue: { status: existing.status },
      afterValue: { status: "Paid", paymentMethod: args.paymentMethod, paymentDate },
      referenceId: args.id,
    });
  },
});

export const cancelExpense = mutation({
  args: { id: v.id("expenses"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Expense not found.");
    if (existing.status === "Cancelled") throw new Error("Expense is already cancelled.");
    if (!args.reason || args.reason.trim() === "") {
      throw new Error("A reason is required to cancel an expense.");
    }

    const wasPaid = existing.status === "Paid";
    const wasOverdue = existing.status === "Overdue";
    const wasPending = existing.status === "Pending";

    if (wasPaid) {
      if (user.role !== "admin") {
        throw new Error("Only admins can cancel (reverse) a paid expense.");
      }
    } else if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can cancel expenses.");
    }

    await ctx.db.patch(args.id, {
      status: "Cancelled",
      notes: existing.notes ? `${existing.notes}\n[CANCELLED: ${args.reason}]` : `[CANCELLED: ${args.reason}]`,
      updatedAt: Date.now(),
    });

    await updateExpenseCountersHelper(ctx, {
      monthKey: monthKeyOf(existing.dueDate),
      diffTotalCount: -1,
      diffCancelledCount: 1,
      diffPaidCount: wasPaid ? -1 : 0,
      diffPaidAmount: wasPaid ? -existing.amount : 0,
      diffPendingCount: wasPending ? -1 : 0,
      diffPendingAmount: wasPending ? -existing.amount : 0,
      diffOverdueCount: wasOverdue ? -1 : 0,
      diffOverdueAmount: wasOverdue ? -existing.amount : 0,
      diffManualCount: existing.origin === "Manual" ? -1 : 0,
      diffRecurringCount: existing.origin === "Recurring" ? -1 : 0,
      categoryDelta: wasPaid ? { category: existing.category, amount: -existing.amount } : undefined,
      dailyTotalExpensesDelta: -existing.amount,
      globalTotalExpensesDelta: -existing.amount,
      dailyExpensesPaidDelta: wasPaid ? -existing.amount : 0,
      globalTotalExpensesPaidDelta: wasPaid ? -existing.amount : 0,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "CANCEL_EXPENSE",
      beforeValue: { status: existing.status },
      afterValue: { status: "Cancelled", reason: args.reason },
      referenceId: args.id,
    });
  },
});

export const deleteExpense = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin") {
      throw new Error("Unauthorized. Only admins can delete expenses.");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Expense not found.");
    if (existing.templateId) {
      throw new Error("Recurring-generated expenses cannot be deleted. Cancel it instead.");
    }
    if (existing.status === "Paid") {
      throw new Error("Paid expenses cannot be deleted. Cancel it instead.");
    }

    const wasOverdue = existing.status === "Overdue";
    const wasCancelled = existing.status === "Cancelled";

    await ctx.db.delete(args.id);

    await updateExpenseCountersHelper(ctx, {
      monthKey: monthKeyOf(existing.dueDate),
      diffTotalCount: wasCancelled ? 0 : -1,
      diffCancelledCount: wasCancelled ? -1 : 0,
      diffPendingCount: !wasOverdue && !wasCancelled ? -1 : 0,
      diffPendingAmount: !wasOverdue && !wasCancelled ? -existing.amount : 0,
      diffOverdueCount: wasOverdue ? -1 : 0,
      diffOverdueAmount: wasOverdue ? -existing.amount : 0,
      diffManualCount: existing.origin === "Manual" ? -1 : 0,
      diffRecurringCount: existing.origin === "Recurring" ? -1 : 0,
      dailyTotalExpensesDelta: wasCancelled ? 0 : -existing.amount,
      globalTotalExpensesDelta: wasCancelled ? 0 : -existing.amount,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "DELETE_EXPENSE",
      beforeValue: { title: existing.title, amount: existing.amount, status: existing.status },
      referenceId: args.id,
    });
  },
});

function withDerivedOverdue<T extends { status: string; dueDate: number }>(doc: T, now: number): T {
  if (doc.status === "Pending" && doc.dueDate < now) {
    return { ...doc, status: "Overdue" };
  }
  return doc;
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    origin: v.optional(v.string()),
    templateId: v.optional(v.id("expenseTemplates")),
  },
  handler: async (ctx, args) => {
    let docs;
    if (args.status) {
      const status = args.status;
      docs = await ctx.db.query("expenses").withIndex("by_status_and_dueDate", (q) => q.eq("status", status)).order("desc").take(500);
    } else if (args.templateId) {
      const templateId = args.templateId;
      docs = await ctx.db.query("expenses").withIndex("by_templateId_and_dueDate", (q) => q.eq("templateId", templateId)).order("desc").take(500);
    } else if (args.category) {
      const category = args.category;
      docs = await ctx.db.query("expenses").withIndex("by_category", (q) => q.eq("category", category)).order("desc").take(500);
    } else if (args.origin) {
      const origin = args.origin;
      docs = await ctx.db.query("expenses").withIndex("by_origin", (q) => q.eq("origin", origin)).order("desc").take(500);
    } else {
      docs = await ctx.db.query("expenses").withIndex("by_dueDate").order("desc").take(500);
    }

    const now = Date.now();
    return docs.map((d) => withDerivedOverdue(d, now));
  },
});

export const get = query({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.id);
    if (!expense) return null;
    const derived = withDerivedOverdue(expense, Date.now());
    const template = expense.templateId ? await ctx.db.get(expense.templateId) : null;
    return { expense: derived, template };
  },
});

export const getAuditTrail = query({
  args: { referenceId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_reference", (q) => q.eq("referenceId", args.referenceId))
      .order("desc")
      .take(100);
  },
});

export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const monthKey = monthKeyOf(now.getTime());
    const bucket = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q) => q.eq("id", monthKey)).first();

    const paid = bucket?.paidAmount || 0;
    const pending = bucket?.pendingAmount || 0;
    const overdue = bucket?.overdueAmount || 0;
    const totalThisMonth = paid + pending + overdue;

    const byCategory = bucket?.expensesByCategory || {};
    const statusBreakdown = {
      Paid: bucket?.paidCount || 0,
      Pending: bucket?.pendingCount || 0,
      Overdue: bucket?.overdueCount || 0,
      Cancelled: bucket?.cancelledCount || 0,
    };

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = monthKeyOf(d.getTime());
      const b = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q) => q.eq("id", key)).first();
      monthlyTrend.push({
        month: key,
        paid: b?.paidAmount || 0,
        pending: b?.pendingAmount || 0,
        overdue: b?.overdueAmount || 0,
      });
    }

    return { totalThisMonth, paid, pending, overdue, byCategory, statusBreakdown, monthlyTrend };
  },
});

export const getMonthlyReport = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const [year, monthNum] = args.month.split("-").map(Number);
    const monthStart = Date.UTC(year, monthNum - 1, 1);
    const monthEnd = Date.UTC(year, monthNum, 1);

    const bucket = await ctx.db.query("expenseCounters").withIndex("by_counter_id", (q) => q.eq("id", args.month)).first();

    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_dueDate", (q) => q.gte("dueDate", monthStart).lt("dueDate", monthEnd))
      .order("asc")
      .take(1000);

    const now = Date.now();
    const derivedRows = rows.map((r) => withDerivedOverdue(r, now));

    const summary = {
      totalCount: bucket?.totalCount || 0,
      paidAmount: bucket?.paidAmount || 0,
      pendingAmount: bucket?.pendingAmount || 0,
      overdueAmount: bucket?.overdueAmount || 0,
      cancelledCount: bucket?.cancelledCount || 0,
    };

    const byCategory = bucket?.expensesByCategory || {};

    const paidVsPending = {
      paid: bucket?.paidAmount || 0,
      pending: (bucket?.pendingAmount || 0) + (bucket?.overdueAmount || 0),
    };

    const recurringVsManual = {
      recurring: derivedRows.filter((r) => r.origin === "Recurring" && r.status !== "Cancelled").reduce((s, r) => s + r.amount, 0),
      manual: derivedRows.filter((r) => r.origin === "Manual" && r.status !== "Cancelled").reduce((s, r) => s + r.amount, 0),
    };

    const paidByPaymentDate = await ctx.db
      .query("expenses")
      .withIndex("by_paymentDate", (q) => q.gte("paymentDate", monthStart).lt("paymentDate", monthEnd))
      .take(1000);
    const paidRowsThisMonth = paidByPaymentDate.filter((r) => r.status === "Paid");
    const cashFlow = {
      totalPaidOut: paidRowsThisMonth.reduce((s, r) => s + r.amount, 0),
      paymentCount: paidRowsThisMonth.length,
    };

    return { summary, byCategory, paidVsPending, recurringVsManual, cashFlow, rows: derivedRows };
  },
});

export const sweepOverdueExpenses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("expenses")
      .withIndex("by_status_and_dueDate", (q) => q.eq("status", "Pending").lt("dueDate", now))
      .take(500);

    for (const expense of stale) {
      await ctx.db.patch(expense._id, { status: "Overdue", updatedAt: now });
      await updateExpenseCountersHelper(ctx, {
        monthKey: monthKeyOf(expense.dueDate),
        diffPendingCount: -1,
        diffPendingAmount: -expense.amount,
        diffOverdueCount: 1,
        diffOverdueAmount: expense.amount,
      });
    }

    return { updatedCount: stale.length };
  },
});
