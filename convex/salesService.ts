import { DatabaseReader, DatabaseWriter } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export type SettlementStatus = {
  status: "Completed" | "Partially Paid" | "Pending";
  settlementType: string;
};

// Pure — the one formula for what a (total, totalPaid) pair means, used both at
// checkout time (where totalPaid is the validated paymentBreakdown sum) and by
// getTransactionBalance below (where totalPaid is the live payments sum). No DB access.
export function deriveSettlementStatus(total: number, totalPaid: number): SettlementStatus {
  const status: SettlementStatus["status"] =
    totalPaid >= total ? "Completed" : totalPaid > 0 ? "Partially Paid" : "Pending";
  return { status, settlementType: status === "Completed" ? "Fully Paid" : status };
}

export type TransactionBalance = SettlementStatus & {
  totalPaid: number;
  outstanding: number;
};

// Pure — the ONE formula for "how much has this sale paid / how much is outstanding."
// totalPaid = SUM(payments.amount); outstanding = max(0, total - totalPaid). Never derive
// this from customer.debitBalance, and never from a cached amount field on the
// transaction — the payments table is the single source of truth for sale settlement.
export function getTransactionBalance(
  transaction: { total: number },
  payments: { amount: number }[]
): TransactionBalance {
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, transaction.total - totalPaid);
  return { totalPaid, outstanding, ...deriveSettlementStatus(transaction.total, totalPaid) };
}

// "How was THIS sale paid?" — every payments row for a transaction, oldest first.
export async function getPaymentHistory(db: DatabaseReader | DatabaseWriter, transactionId: Id<"transactions">) {
  const payments = await db
    .query("payments")
    .withIndex("by_transaction", (q) => q.eq("transactionId", transactionId))
    .take(100);
  return payments.slice().sort((a, b) => a.paymentDate - b.paymentDate);
}

// Recomputes status/settlementType from the live payments table and patches them onto
// the transaction — a denormalized flag for fast filtering elsewhere (e.g.
// listFiltered's status filter), never an amount field. Call after every payment
// insert/delete so that flag can never drift out of sync with the payments table.
export async function syncTransactionStatus(db: DatabaseWriter, transactionId: Id<"transactions">) {
  const transaction = await db.get(transactionId);
  if (!transaction) return null;

  const payments = await getPaymentHistory(db, transactionId);
  const balance = getTransactionBalance(transaction, payments);

  await db.patch(transactionId, {
    status: balance.status,
    settlementType: balance.settlementType,
    updatedAt: Date.now(),
  });

  return balance;
}
