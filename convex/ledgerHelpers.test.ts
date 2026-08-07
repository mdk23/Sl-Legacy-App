import { describe, expect, test } from "vitest";
import { applyLedgerEntry } from "./ledgerHelpers";

const ZERO = { creditBalance: 0, debitBalance: 0 };

describe("applyLedgerEntry", () => {
  test("USE_CREDIT subtracts from credit", () => {
    expect(applyLedgerEntry({ creditBalance: 100, debitBalance: 0 }, { type: "USE_CREDIT", amount: 40 })).toEqual({
      creditBalance: 60,
      debitBalance: 0,
    });
  });

  test("USE_CREDIT floors at 0 rather than going negative", () => {
    expect(applyLedgerEntry({ creditBalance: 10, debitBalance: 0 }, { type: "USE_CREDIT", amount: 40 })).toEqual({
      creditBalance: 0,
      debitBalance: 0,
    });
  });

  test("SALE is always balance-neutral", () => {
    const balance = { creditBalance: 50, debitBalance: 30 };
    expect(applyLedgerEntry(balance, { type: "SALE", amount: 999 })).toEqual(balance);
  });

  test("PAYMENT_LOG is always balance-neutral", () => {
    const balance = { creditBalance: 50, debitBalance: 30 };
    expect(applyLedgerEntry(balance, { type: "PAYMENT_LOG", amount: 999 })).toEqual(balance);
  });

  test("REFUND is always balance-neutral (cash/change back, not store credit)", () => {
    const balance = { creditBalance: 50, debitBalance: 30 };
    expect(applyLedgerEntry(balance, { type: "REFUND", amount: 999 })).toEqual(balance);
  });

  test("DEBIT is a pure add — never nets against existing credit", () => {
    expect(applyLedgerEntry({ creditBalance: 100, debitBalance: 0 }, { type: "DEBIT", amount: 40 })).toEqual({
      creditBalance: 100,
      debitBalance: 40,
    });
  });

  test("CREDIT (store credit granted) nets down existing debt first", () => {
    expect(applyLedgerEntry({ creditBalance: 0, debitBalance: 30 }, { type: "CREDIT", amount: 100 })).toEqual({
      creditBalance: 70,
      debitBalance: 0,
    });
  });

  test("PAYMENT (real manual payment) nets down existing debt first, same as CREDIT", () => {
    expect(applyLedgerEntry({ creditBalance: 0, debitBalance: 30 }, { type: "PAYMENT", amount: 100 })).toEqual({
      creditBalance: 70,
      debitBalance: 0,
    });
  });

  test("a chronological sequence replays consistently regardless of intermediate state", () => {
    const entries: { type: any; amount: number }[] = [
      { type: "DEBIT", amount: 100 }, // {0,100}
      { type: "CREDIT", amount: 100 }, // nets debt -> {0,0}
      { type: "DEBIT", amount: 80 }, // {0,80}
    ];
    const result = entries.reduce(applyLedgerEntry, ZERO);
    expect(result).toEqual({ creditBalance: 0, debitBalance: 80 });
  });
});
