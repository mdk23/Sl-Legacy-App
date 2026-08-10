/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedAdminUser, seedOpenCaixaSession, seedProduct, seedCustomer, getCustomerBalance } from "./testHelpers";

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

test("smoke: create a walk-in cash sale without throwing", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);

  const result = await asAdmin.mutation(api.transactions.create, {
    items: [{ productId, quantity: 1, price: 150 }],
    subtotal: 150,
    discount: 0,
    taxes: 0,
    total: 150,
    profit: 100,
    amountReceived: 150,
    changeGiven: 0,
    deliveryStatus: "Delivered",
    paymentBreakdown: [{ method: "Cash", amount: 150 }],
  });

  expect(result.receiptNumber).toBeTruthy();
});

test("full payment via a single method leaves credit/debit untouched", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 150,
    paymentBreakdown: [{ method: "BIM", amount: 150 }],
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
});

test("overpayment refunded as Cash does not grant store credit", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  await makeSale(asAdmin, productId, {
    customerId,
    total: 100,
    amountReceived: 150,
    changeGiven: 50,
    changeHandling: "Cash",
    paymentBreakdown: [{ method: "Cash", amount: 150 }],
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
});

test("underpayment never nets against unrelated existing store credit", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t, { creditBalance: 150 });

  await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 0,
    paymentBreakdown: [],
    addRemainingToAccount: true,
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 150, debitBalance: 150 });
});

test("underpayment without opt-in leaves the sale unpaid with no account debt", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  const result = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 50,
    paymentBreakdown: [{ method: "Cash", amount: 50 }],
    // addRemainingToAccount intentionally omitted
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
  const tx: any = await t.run((ctx: any) => ctx.db.get(result.transactionId));
  expect(tx.debtAddedToAccount).toBeFalsy();
  expect(tx.status).toBe("Partially Paid");
});

test("registered customer can pay entirely with existing store credit", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t, { creditBalance: 150 });

  const result = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 150,
    paymentBreakdown: [{ method: "Store Credit", amount: 150 }],
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
  const tx: any = await t.run((ctx: any) => ctx.db.get(result.transactionId));
  expect(tx.status).toBe("Completed");
});

test("deleting a non-final transaction correctly replays the remaining balance", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  // TX1: underpayment of 100 -> debt 100 (opted in)
  const tx1 = await makeSale(asAdmin, productId, {
    customerId,
    total: 100,
    amountReceived: 0,
    paymentBreakdown: [],
    addRemainingToAccount: true,
  });

  // TX2: overpayment of 100 banked as Store Credit -> nets TX1's debt to 0/0
  await makeSale(asAdmin, productId, {
    customerId,
    total: 50,
    amountReceived: 150,
    changeGiven: 100,
    changeHandling: "Store Credit",
    paymentBreakdown: [{ method: "Cash", amount: 150 }],
  });

  // TX3: a THIRD, unrelated underpayment of 80 -> fresh debt 80 (opted in)
  await makeSale(asAdmin, productId, {
    customerId,
    total: 80,
    amountReceived: 0,
    paymentBreakdown: [],
    addRemainingToAccount: true,
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 80 });

  // Delete TX1 (the first, non-final transaction). Correct answer: replaying the
  // remaining ledger (TX2's CREDIT 100, TX3's DEBIT 80) from zero gives {100, 80} —
  // NOT a delta-reversal of TX1 applied to the CURRENT (already-drifted) balance.
  await asAdmin.mutation(api.transactions.remove, { id: tx1.transactionId });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 100, debitBalance: 80 });
});
