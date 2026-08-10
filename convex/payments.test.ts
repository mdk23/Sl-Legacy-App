/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

test("recordSalePayment settles a sale directly without touching account debt", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  const sale = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 50,
    paymentBreakdown: [{ method: "Cash", amount: 50 }],
  });

  await asAdmin.mutation(api.payments.recordSalePayment, {
    customerId,
    transactionId: sale.transactionId,
    amount: 100,
    paymentMethod: "Cash",
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
  const tx: any = await t.run((ctx: any) => ctx.db.get(sale.transactionId));
  expect(tx.status).toBe("Completed");

  const payments: any[] = await t.run((ctx: any) =>
    ctx.db
      .query("payments")
      .withIndex("by_transaction", (q: any) => q.eq("transactionId", sale.transactionId))
      .collect()
  );
  // payments is the single source of truth for "how much has been paid" — not amountReceived.
  expect(payments.reduce((sum, p) => sum + p.amount, 0)).toBe(150);
  const manual = payments.find((p) => p.source === "manual");
  expect(manual).toBeTruthy();
  expect(manual.amount).toBe(100);
});

test("recordSalePayment and addPayment are mutually exclusive via debtAddedToAccount", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  const sale = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 50,
    paymentBreakdown: [{ method: "Cash", amount: 50 }],
  });

  // addPayment ("account" mode) should be rejected before the balance is on the account.
  await expect(
    asAdmin.mutation(api.payments.addPayment, {
      customerId,
      transactionId: sale.transactionId,
      amount: 100,
      paymentMethod: "Cash",
    })
  ).rejects.toThrow();

  await asAdmin.mutation(api.transactions.addRemainingToCustomerAccount, { transactionId: sale.transactionId });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 100 });

  // Now recordSalePayment ("sale" mode) should be rejected, since the balance moved to the account.
  await expect(
    asAdmin.mutation(api.payments.recordSalePayment, {
      customerId,
      transactionId: sale.transactionId,
      amount: 100,
      paymentMethod: "Cash",
    })
  ).rejects.toThrow();

  await asAdmin.mutation(api.payments.addPayment, {
    customerId,
    transactionId: sale.transactionId,
    amount: 100,
    paymentMethod: "Cash",
  });

  expect(await getCustomerBalance(t, customerId)).toEqual({ creditBalance: 0, debitBalance: 0 });
});

test("deletePayment reverses a manual cash payment's caixa movement and ledger entries", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  const sessionId = await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  const sale = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 50,
    paymentBreakdown: [{ method: "Cash", amount: 50 }],
  });

  const expectedCashBefore: number = await t.run((ctx: any) => ctx.db.get(sessionId).then((s: any) => s.expectedCash));

  const paymentId = await asAdmin.mutation(api.payments.recordSalePayment, {
    customerId,
    transactionId: sale.transactionId,
    amount: 100,
    paymentMethod: "Cash",
  });

  const expectedCashAfterPayment: number = await t.run((ctx: any) => ctx.db.get(sessionId).then((s: any) => s.expectedCash));
  expect(expectedCashAfterPayment).toBe(expectedCashBefore + 100);

  await asAdmin.mutation(api.payments.deletePayment, { paymentId });

  const expectedCashAfterDelete: number = await t.run((ctx: any) => ctx.db.get(sessionId).then((s: any) => s.expectedCash));
  expect(expectedCashAfterDelete).toBe(expectedCashBefore);

  const tx: any = await t.run((ctx: any) => ctx.db.get(sale.transactionId));
  expect(tx.status).toBe("Partially Paid");

  const remainingPayments: any[] = await t.run((ctx: any) =>
    ctx.db
      .query("payments")
      .withIndex("by_transaction", (q: any) => q.eq("transactionId", sale.transactionId))
      .collect()
  );
  expect(remainingPayments.reduce((sum, p) => sum + p.amount, 0)).toBe(50);

  const remainingLedger: any[] = await t.run((ctx: any) =>
    ctx.db
      .query("ledger")
      .withIndex("by_reference", (q: any) => q.eq("referenceType", "payment").eq("referenceId", paymentId))
      .collect()
  );
  expect(remainingLedger.length).toBe(0);
});

test("deletePayment rejects checkout-sourced payments", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  const sale = await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 150,
    paymentBreakdown: [{ method: "Cash", amount: 150 }],
  });

  const checkoutPayment: any = await t.run((ctx: any) =>
    ctx.db
      .query("payments")
      .withIndex("by_transaction", (q: any) => q.eq("transactionId", sale.transactionId))
      .first()
  );

  await expect(asAdmin.mutation(api.payments.deletePayment, { paymentId: checkoutPayment._id })).rejects.toThrow();
});

test("backfillPaymentSource is idempotent", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedAdminUser(t);
  await seedOpenCaixaSession(t);
  const productId = await seedProduct(t);
  const customerId = await seedCustomer(t);

  await makeSale(asAdmin, productId, {
    customerId,
    total: 150,
    amountReceived: 150,
    paymentBreakdown: [{ method: "Cash", amount: 150 }],
  });

  // Simulate a legacy row inserted before `source` existed.
  await t.run(async (ctx: any) => {
    const payment = await ctx.db.query("payments").first();
    await ctx.db.patch(payment._id, { source: undefined });
  });

  const first: any = await t.mutation(internal.payments.backfillPaymentSource, {});
  expect(first.backfilled).toBe(1);

  const second: any = await t.mutation(internal.payments.backfillPaymentSource, {});
  expect(second.backfilled).toBe(0);
});
