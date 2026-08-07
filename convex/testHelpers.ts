// Shared seeding helpers for convex-test integration tests.
import { Id } from "./_generated/dataModel";

const TEST_CLERK_ID = "test-clerk-id";
const TEST_USERNAME = "tester";

export async function seedAdminUser(t: any) {
  await t.run(async (ctx: any) => {
    await ctx.db.insert("users", {
      clerkId: TEST_CLERK_ID,
      username: TEST_USERNAME,
      role: "admin",
    });
  });
  return t.withIdentity({ subject: TEST_CLERK_ID });
}

export async function seedOpenCaixaSession(t: any, openedAt: number = Date.now()) {
  return await t.run(async (ctx: any) => {
    return await ctx.db.insert("caixaSessions", {
      openedBy: TEST_USERNAME,
      openedAt,
      openingAmount: 0,
      status: "OPEN",
      expectedCash: 100000,
      totalCashSales: 0,
      totalCashIn: 0,
      totalCashOut: 0,
    });
  });
}

export async function seedProduct(t: any, overrides: Partial<Record<string, any>> = {}) {
  return await t.run(async (ctx: any) => {
    return await ctx.db.insert("products", {
      code: "TEST-SKU",
      name: "Test Ring",
      category: "Rings",
      costPrice: 50,
      sellingPrice: 150,
      stock: 100,
      reorderLevel: 5,
      archived: false,
      ...overrides,
    });
  });
}

export async function seedCustomer(t: any, overrides: Partial<Record<string, any>> = {}) {
  return await t.run(async (ctx: any) => {
    return await ctx.db.insert("customers", {
      firstName: "Test",
      lastName: "Customer",
      phone1: "800000000",
      customerType: "Registered",
      totalSpent: 0,
      creditBalance: 0,
      debitBalance: 0,
      orderCount: 0,
      ...overrides,
    });
  });
}

export async function getCustomerBalance(t: any, customerId: Id<"customers">) {
  return await t.run(async (ctx: any) => {
    const customer = await ctx.db.get(customerId);
    return { creditBalance: customer.creditBalance || 0, debitBalance: customer.debitBalance || 0 };
  });
}
