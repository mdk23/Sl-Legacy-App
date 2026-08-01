import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireUser } from "./authHelpers";
import { updateExpenseCountersHelper } from "./expenses";

const DAY_MS = 24 * 60 * 60 * 1000;
const FREQUENCIES = ["Daily", "Weekly", "Monthly"];

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function resolveMonthlyDueDate(dueDay: number, year: number, monthIndex: number): number {
  const clampedDay = Math.min(dueDay, daysInMonth(year, monthIndex));
  return Date.UTC(year, monthIndex, clampedDay);
}

function startOfUTCDay(timestamp: number): number {
  const d = new Date(timestamp);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Computes the current recurrence period ([periodStart, periodEnd)) and the
// due date within it for a template, based on its frequency.
function computeRecurrencePeriod(template: any, now: number) {
  if (template.frequency === "Daily") {
    const periodStart = startOfUTCDay(now);
    return { periodStart, periodEnd: periodStart + DAY_MS, dueDate: periodStart };
  }

  if (template.frequency === "Weekly") {
    const todayStart = startOfUTCDay(now);
    const todayDow = new Date(todayStart).getUTCDay(); // 0 (Sun) - 6 (Sat)
    const periodStart = todayStart - todayDow * DAY_MS;
    const dayOfWeek = template.dayOfWeek ?? 0;
    return { periodStart, periodEnd: periodStart + 7 * DAY_MS, dueDate: periodStart + dayOfWeek * DAY_MS };
  }

  // Monthly
  const nowDate = new Date(now);
  const year = nowDate.getUTCFullYear();
  const monthIndex = nowDate.getUTCMonth();
  const periodStart = Date.UTC(year, monthIndex, 1);
  const periodEnd = Date.UTC(year, monthIndex + 1, 1);
  const dueDate = resolveMonthlyDueDate(template.dueDay ?? 1, year, monthIndex);
  return { periodStart, periodEnd, dueDate };
}

function validateFrequencyFields(frequency: string, dueDay: number | undefined, dayOfWeek: number | undefined) {
  if (!FREQUENCIES.includes(frequency)) {
    throw new Error("Frequency must be Daily, Weekly, or Monthly.");
  }
  if (frequency === "Monthly" && (dueDay === undefined || dueDay < 1 || dueDay > 31)) {
    throw new Error("Due day (1-31) is required for Monthly templates.");
  }
  if (frequency === "Weekly" && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
    throw new Error("Day of week (0-6) is required for Weekly templates.");
  }
}

// Idempotent: returns null (no-op) if an expense generated from this template
// already exists for the current period, per the "never create duplicates" rule.
async function generateForTemplateIfMissing(ctx: any, template: any, now: number) {
  const { periodStart, periodEnd, dueDate } = computeRecurrencePeriod(template, now);
  const monthKey = new Date(dueDate).toISOString().slice(0, 7);

  const existing = await ctx.db
    .query("expenses")
    .withIndex("by_templateId_and_dueDate", (q: any) =>
      q.eq("templateId", template._id).gte("dueDate", periodStart).lt("dueDate", periodEnd)
    )
    .first();
  if (existing) return null;

  const insertedAt = Date.now();
  const id = await ctx.db.insert("expenses", {
    templateId: template._id,
    title: template.name,
    category: template.category,
    amount: template.amount,
    dueDate,
    status: "Pending",
    origin: "Recurring",
    createdAt: insertedAt,
    updatedAt: insertedAt,
  });

  await updateExpenseCountersHelper(ctx, {
    monthKey,
    diffTotalCount: 1,
    diffPendingCount: 1,
    diffPendingAmount: template.amount,
    diffRecurringCount: 1,
    dailyTotalExpensesDelta: template.amount,
    globalTotalExpensesDelta: template.amount,
  });

  await ctx.db.insert("auditLogs", {
    userId: "system",
    timestamp: insertedAt,
    action: "GENERATE_RECURRING_EXPENSE",
    afterValue: await ctx.db.get(id),
    referenceId: id,
  });

  return id;
}

export const list = query({
  args: { active: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.active !== undefined) {
      const active = args.active;
      return await ctx.db.query("expenseTemplates").withIndex("by_active", (q) => q.eq("active", active)).take(200);
    }
    return await ctx.db.query("expenseTemplates").take(200);
  },
});

export const get = query({
  args: { id: v.id("expenseTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createRecurringTemplate = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    amount: v.number(),
    frequency: v.string(),
    dueDay: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can create expense templates.");
    }
    if (args.amount <= 0) throw new Error("Amount must be greater than zero.");
    validateFrequencyFields(args.frequency, args.dueDay, args.dayOfWeek);
    if (args.endDate !== undefined && args.endDate < args.startDate) {
      throw new Error("End date cannot be before start date.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("expenseTemplates", { ...args, active: true, createdAt: now, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: now,
      action: "CREATE_EXPENSE_TEMPLATE",
      afterValue: await ctx.db.get(id),
      referenceId: id,
    });

    return id;
  },
});

export const updateTemplate = mutation({
  args: {
    id: v.id("expenseTemplates"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    amount: v.optional(v.number()),
    frequency: v.optional(v.string()),
    dueDay: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can update expense templates.");
    }

    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Template not found.");
    if (updates.amount !== undefined && updates.amount <= 0) throw new Error("Amount must be greater than zero.");

    const effectiveFrequency = updates.frequency ?? existing.frequency;
    const effectiveDueDay = updates.dueDay ?? existing.dueDay;
    const effectiveDayOfWeek = updates.dayOfWeek ?? existing.dayOfWeek;
    validateFrequencyFields(effectiveFrequency, effectiveDueDay, effectiveDayOfWeek);

    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "UPDATE_EXPENSE_TEMPLATE",
      beforeValue: existing,
      afterValue: await ctx.db.get(id),
      referenceId: id,
    });
  },
});

export const setTemplateActive = mutation({
  args: { id: v.id("expenseTemplates"), active: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can enable/disable expense templates.");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Template not found.");

    await ctx.db.patch(args.id, { active: args.active, updatedAt: Date.now() });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: args.active ? "UPDATE_EXPENSE_TEMPLATE" : "DISABLE_EXPENSE_TEMPLATE",
      beforeValue: { active: existing.active },
      afterValue: { active: args.active },
      referenceId: args.id,
    });
  },
});

export const deleteTemplate = mutation({
  args: { id: v.id("expenseTemplates") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin") {
      throw new Error("Unauthorized. Only admins can delete expense templates.");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Template not found.");

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "DELETE_EXPENSE_TEMPLATE",
      beforeValue: { name: existing.name, category: existing.category, amount: existing.amount },
      referenceId: args.id,
    });
  },
});

// Cron-triggered only (see convex/crons.ts) — no manual/app-load trigger in this phase.
export const generateRecurringExpensesSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("expenseTemplates").withIndex("by_active", (q) => q.eq("active", true)).collect();
    const now = Date.now();

    let generated = 0;
    for (const template of templates) {
      if (template.startDate > now) continue;
      if (template.endDate !== undefined && template.endDate < now) continue;
      const id = await generateForTemplateIfMissing(ctx, template, now);
      if (id) generated += 1;
    }

    return { generated };
  },
});
