import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run loyalty level decay and customer score sweeps weekly every Sunday at midnight
crons.cron(
  "weekly-customer-intelligence-decay-sweep",
  "0 0 * * 0", // weekly Sunday at 00:00
  internal.intelligence.runLoyaltyDecaySweep,
  {}
);

// Idempotent no-op after the first success each month; self-heals if a run is ever missed
crons.cron(
  "daily-recurring-expense-generation",
  "0 0 * * *", // daily at 00:00 UTC — covers Daily/Weekly/Monthly templates
  internal.expenseTemplates.generateRecurringExpensesSweep,
  {}
);

crons.cron(
  "daily-expense-overdue-sweep",
  "5 0 * * *", // daily at 00:05 UTC, staggered slightly after generation
  internal.expenses.sweepOverdueExpenses,
  {}
);

export default crons;
