import { DatabaseWriter } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { applyCustomerLedger } from "./ledgerHelpers";

type LedgerOpts = {
  description: string;
  referenceId?: string;
  referenceType?: string;
  sessionId?: Id<"caixaSessions">;
};

// "What is the customer's current account balance?"
export async function getBalance(db: DatabaseWriter, customerId: Id<"customers">) {
  const customer = await db.get(customerId);
  return { creditBalance: customer?.creditBalance || 0, debitBalance: customer?.debitBalance || 0 };
}

// Grants new store credit (e.g. overpayment banked as credit).
export async function createCredit(db: DatabaseWriter, customerId: Id<"customers">, amount: number, opts: LedgerOpts) {
  return applyCustomerLedger(db, customerId, { type: "CREDIT", amount, ...opts });
}

// Spends existing store credit — only ever called from an explicit "Use Store Credit"
// tender, never automatically alongside an unrelated unpaid sale.
export async function redeemCredit(db: DatabaseWriter, customerId: Id<"customers">, amount: number, opts: LedgerOpts) {
  return applyCustomerLedger(db, customerId, { type: "USE_CREDIT", amount, ...opts });
}

// Creates new account debt — only ever called when a cashier/admin explicitly opts an
// outstanding sale balance onto the customer's account (never automatic).
export async function createDebt(db: DatabaseWriter, customerId: Id<"customers">, amount: number, opts: LedgerOpts) {
  return applyCustomerLedger(db, customerId, { type: "DEBIT", amount, ...opts });
}

// Recovers existing account debt (a real manual payment reducing debitBalance).
export async function recoverDebt(db: DatabaseWriter, customerId: Id<"customers">, amount: number, opts: LedgerOpts) {
  return applyCustomerLedger(db, customerId, { type: "PAYMENT", amount, ...opts });
}
