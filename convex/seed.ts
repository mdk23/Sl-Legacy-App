import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Seed regular customers
    const c1 = await ctx.db.insert("customers", {
      firstName: "Isabel",
      lastName: "dos Santos",
      phone1: "+258 84 000 0001",
      email: "isabel@luxury.mz",
      customerType: "Registered",
      financialTier: "Platinum",
      loyaltyLevel: "Bronze",
      creditStatus: "Good Standing",
      customerScore: 95,
      customerHealth: "Elite Client",
      totalSpent: 1250000,
      orderCount: 1,
      lastPurchaseDate: Date.now() - 5 * 24 * 3600 * 1000,
      notes: "Preferred gold: 18K Rose Gold",
    });

    const c2 = await ctx.db.insert("customers", {
      firstName: "Fernando",
      lastName: "Moma",
      phone1: "+258 84 000 0002",
      email: "moma@business.mz",
      customerType: "Registered",
      financialTier: "Platinum",
      loyaltyLevel: "Bronze",
      creditStatus: "Outstanding",
      customerScore: 82,
      customerHealth: "Valuable Client",
      debitBalance: 400000,
      totalSpent: 800000,
      orderCount: 1,
      lastPurchaseDate: Date.now() - 10 * 24 * 3600 * 1000,
    });

    // 2. Seed products
    const p1 = await ctx.db.insert("products", {
      name: "Solitaire Eternity Ring",
      code: "PRD-001",
      category: "Rings",
      costPrice: 85000,
      sellingPrice: 124000,
      stock: 12,
      reorderLevel: 5,
      archived: false,
      imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&q=80&w=400",
    });

    const p2 = await ctx.db.insert("products", {
      name: "Cuban Link Bracelet",
      code: "PRD-002",
      category: "Bracelets",
      costPrice: 32000,
      sellingPrice: 49500,
      stock: 3,
      reorderLevel: 5,
      archived: false,
      imageUrl: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&q=80&w=400",
    });

    const p3 = await ctx.db.insert("products", {
      name: "Arctic Frost Necklace",
      code: "PRD-003",
      category: "Necklaces",
      costPrice: 150000,
      sellingPrice: 241000,
      stock: 5,
      reorderLevel: 2,
      archived: false,
      imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&q=80&w=400",
    });

    // 3. Seed some transactions
    await ctx.db.insert("transactions", {
      receiptNumber: "INV-2023-001",
      subtotal: 124000,
      discount: 0,
      taxes: 0,
      total: 124000,
      profit: 39000,
      cashierName: "Sl Legacy Admin",
      status: "Completed",
      settlementType: "Fully Paid",
      deliveryStatus: "Delivered",
      paymentBreakdown: [
        { method: "Card", amount: 124000 }
      ],
      items: [
        { productId: p1, quantity: 1, price: 124000 }
      ],
      refundedAmount: 0,
      customerId: c1,
    });

    await ctx.db.insert("transactions", {
      receiptNumber: "INV-2023-002",
      subtotal: 49500,
      discount: 0,
      taxes: 0,
      total: 49500,
      profit: 17500,
      cashierName: "Sl Legacy Admin",
      status: "Partially Paid",
      settlementType: "Partially Paid",
      deliveryStatus: "Pending",
      paymentBreakdown: [
        { method: "M-Pesa", amount: 39500 }
      ],
      items: [
        { productId: p2, quantity: 1, price: 49500 }
      ],
      refundedAmount: 0,
      customerId: c2,
    });

    return "Database seeded successfully!";
  },
});
