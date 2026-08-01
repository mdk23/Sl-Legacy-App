import { DatabaseWriter, DatabaseReader } from "./_generated/server";
import { ConvexError } from "convex/values";

/**
 * Returns the currently open Caixa session, if any.
 * Note: Use resolveCaixaSession instead for transaction/payment attribution.
 */
export async function getActiveCaixaSession(db: DatabaseReader | DatabaseWriter) {
  const session = await db
    .query("caixaSessions")
    .withIndex("by_status", (q) => q.eq("status", "OPEN"))
    .first();
  return session;
}

/**
 * Resolves the correct Caixa Session that was active at the given timestamp.
 */
export async function resolveCaixaSession(db: DatabaseReader | DatabaseWriter, timestamp: number) {
  const sessions = await db.query("caixaSessions").collect();
  const matching = sessions.filter((s) => {
    if (timestamp < s.openedAt) return false;
    if (s.closedAt !== undefined) {
      return timestamp <= s.closedAt;
    }
    return s.status === "OPEN";
  });

  if (matching.length === 0) {
    throw new ConvexError(
      `No Caixa session found active at timestamp ${timestamp} (${new Date(timestamp).toLocaleString()}). Please open a Caixa session first.`
    );
  }
  if (matching.length > 1) {
    throw new ConvexError(
      `Multiple overlapping Caixa sessions found for timestamp ${timestamp} (${new Date(timestamp).toLocaleString()}).`
    );
  }
  return matching[0];
}

/**
 * Validates that a Caixa session was active for the given timestamp (and if it's still open, that it is for today).
 */
export async function validateCaixaForCash(db: DatabaseReader | DatabaseWriter, timestamp: number) {
  const session = await resolveCaixaSession(db, timestamp);
  if (session.status === "OPEN") {
    const sessionDate = new Date(session.openedAt);
    const eventDate = new Date(timestamp);
    if (
      sessionDate.getDate() !== eventDate.getDate() ||
      sessionDate.getMonth() !== eventDate.getMonth() ||
      sessionDate.getFullYear() !== eventDate.getFullYear()
    ) {
      throw new ConvexError("Caixa Session from a previous day is still open. Please close it and open a new session for today.");
    }
  }
  return session;
}

/**
 * Records cash movements into the resolved Caixa session based on timestamp.
 */
export async function recordCaixaCash(
  db: DatabaseWriter,
  amount: number,
  type: "SALE" | "CASH_IN" | "SALE_REVERSAL" | "CASH_OUT",
  description: string,
  userId: string,
  timestamp: number,
  referenceId?: string,
  referenceType?: string
) {
  if (amount <= 0) return;

  const session = await resolveCaixaSession(db, timestamp);

  if (type === "CASH_OUT" && amount > session.expectedCash) {
    throw new ConvexError("Insufficient cash available in drawer.");
  }

  const isOutflow = type === "SALE_REVERSAL" || type === "CASH_OUT";
  const netCash = isOutflow ? -amount : amount;
  const runningBalance = session.expectedCash + netCash;

  const patchData: any = { expectedCash: runningBalance };
  if (type === "SALE") {
    patchData.totalCashSales = session.totalCashSales + amount;
  } else if (type === "SALE_REVERSAL") {
    patchData.totalCashSales = session.totalCashSales - amount;
  } else if (type === "CASH_IN") {
    patchData.totalCashIn = session.totalCashIn + amount;
  } else if (type === "CASH_OUT") {
    patchData.totalCashOut = session.totalCashOut + amount;
  }

  await db.patch(session._id, patchData);

  const movementId = await db.insert("caixaMovements", {
    sessionId: session._id,
    type,
    amount,
    description,
    userId,
    timestamp,
    runningBalance,
    referenceId,
    referenceType,
  });

  await db.insert("auditLogs", {
    userId,
    timestamp,
    action: `CAIXA_${type}`,
    afterValue: { amount, runningBalance },
    referenceId: movementId,
  });

  return movementId;
}

/**
 * Unifies cash drawer validation and logging into a single transactional service call.
 */
export async function processCashPayment(
  db: DatabaseWriter,
  args: {
    amount: number;
    type: "SALE" | "CASH_IN" | "SALE_REVERSAL" | "CASH_OUT";
    description: string;
    userId: string;
    timestamp: number;
    referenceId?: string;
    referenceType?: string;
  }
) {
  if (args.amount <= 0) return null;

  // 1. Validate active drawer exists for current day
  const session = await validateCaixaForCash(db, args.timestamp);

  // 2. Record the movement into Caixa expected cash values
  const movementId = await recordCaixaCash(
    db,
    args.amount,
    args.type,
    args.description,
    args.userId,
    args.timestamp,
    args.referenceId,
    args.referenceType
  );

  return { sessionId: session._id, movementId };
}
