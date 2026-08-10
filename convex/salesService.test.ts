/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedAdminUser, seedOpenCaixaSession, seedProduct, seedCustomer, getCustomerBalance } from "./testHelpers";
import { deriveSettlementStatus, getTransactionBalance } from "./salesService";

const modules = import.meta.glob("./**/*.ts");

async function makeSale(asAdmin: any, productId: any, args: Record<string, any> & { total: number }) {
  return await asAdmin.mutation(api.transactions.create, {
    items: [{ productId, quantity: 1, price: args.total }],
    subtotal: args.total,
    discount: 0,
    taxes: 0,
    profit: args.total - 50,
    changeGiven: 0,
    deliveryStatus: "Delivered",
    paymentBreakdown: [],
    amountReceived: 0,
    ...args,
  });
}

async function hydratedSale(t: any, transactionId: any) {
  const all: any[] = await t.query(api.transactions.list, {});
  const found = all.find((s) => s._id === transactionId);
  if (!found) throw new Error("Transaction not found in hydrated list");
  return found;
}

describe("getTransactionBalance / deriveSettlementStatus (pure)", () => {
  test("derives Pending/Partially Paid/Completed from total vs totalPaid", () => {
    expect(deriveSettlementStatus(150, 0)).toEqual({ status: "Pending", settlementType: "Pending" });
    expect(deriveSettlementStatus(150, 75)).toEqual({ status: "Partially Paid", settlementType: "Partially Paid" });
    expect(deriveSettlementStatus(150, 150)).toEqual({ status: "Completed", settlementType: "Fully Paid" });
  });

  test("totalPaid is always SUM(payments), outstanding clamped at zero", () => {
    const balance = getTransactionBalance({ total: 150 }, [{ amount: 50 }, { amount: 130 }]);
    expect(balance.totalPaid).toBe(180);
    expect(balance.outstanding).toBe(0);
    expect(balance.status).toBe("Completed");
  });
});

describe("Acceptance scenarios", () => {
  test("1 — existing credit not used: opted-in debt equals the full sale total, credit untouched", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t, { creditBalance: 50 });

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 0,
      paymentBreakdown: [],
      addRemainingToAccount: true,
    });

    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 50, debitBalance: 150 });
    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(150);
  });

  test("2 — existing credit explicitly used (partial): no opt-in, no debt, outstanding = 100", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t, { creditBalance: 50 });

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 50,
      paymentBreakdown: [{ method: "Store Credit", amount: 50 }],
    });

    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(100);

    const payments: any[] = await t.run((ctx: any) =>
      ctx.db.query("payments").withIndex("by_transaction", (q: any) => q.eq("transactionId", sale.transactionId)).collect()
    );
    expect(payments).toEqual([expect.objectContaining({ paymentMethod: "Store Credit", amount: 50 })]);
  });

  test("3 — partial cash payment: paid = 75, outstanding = 75", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t);

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 75,
      paymentBreakdown: [{ method: "Cash", amount: 75 }],
    });

    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(75);
  });

  test("4 — Store Credit + Cash together fully settle a sale", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t, { creditBalance: 50 });

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 150,
      paymentBreakdown: [
        { method: "Store Credit", amount: 50 },
        { method: "Cash", amount: 100 },
      ],
    });

    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(0);
    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
  });

  test("5 — unpaid sale, no opt-in: outstanding shown, customer debit unchanged", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t);

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 0,
      paymentBreakdown: [],
    });

    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(150);
    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
  });

  test("6 — unpaid sale, opted in: customer debit increases by the full remaining amount", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t);

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 0,
      paymentBreakdown: [],
      addRemainingToAccount: true,
    });

    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(150);
    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 150 });
  });

  test("7 — overpayment saved as credit: sale fully paid, credit granted, cash received is traceable in payment history", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdminUser(t);
    await seedOpenCaixaSession(t);
    const productId = await seedProduct(t);
    const customerId = await seedCustomer(t);

    const sale = await makeSale(asAdmin, productId, {
      customerId,
      total: 150,
      amountReceived: 200,
      changeGiven: 50,
      changeHandling: "Store Credit",
      paymentBreakdown: [{ method: "Cash", amount: 200 }],
    });

    const sold = await hydratedSale(t, sale.transactionId);
    expect(sold.balance).toBe(0);
    expect(sold.status).toBe("Completed");
    expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 50, debitBalance: 0 });

    const payments: any[] = await t.run((ctx: any) =>
      ctx.db.query("payments").withIndex("by_transaction", (q: any) => q.eq("transactionId", sale.transactionId)).collect()
    );
    expect(payments).toEqual([expect.objectContaining({ paymentMethod: "Cash", amount: 200 })]);

    const ledgerEntries: any[] = await t.run((ctx: any) =>
      ctx.db.query("ledger").withIndex("by_customer", (q: any) => q.eq("customerId", customerId)).collect()
    );
    expect(ledgerEntries.some((l) => l.type === "CREDIT" && l.amount === 50)).toBe(true);
  });
});
