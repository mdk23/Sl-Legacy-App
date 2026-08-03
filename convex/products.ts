import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { updateDailyMovementStats } from "./utils";
import { requireUser } from "./authHelpers";

async function recomputeInventoryCountersHandler(ctx: any) {
  const products = await ctx.db
    .query("products")
    .withIndex("by_archived", (q: any) => q.eq("archived", false))
    .collect();

  let totalUnitsInStock = 0;
  let inventoryValue = 0;
  let lowStockItems = 0;
  let outOfStockItems = 0;

  for (const p of products) {
    totalUnitsInStock += p.stock;
    inventoryValue += p.stock * p.costPrice;
    if (p.stock <= 0) outOfStockItems++;
    else if (p.stock <= p.reorderLevel) lowStockItems++;
  }

  const counter = await ctx.db
    .query("inventoryCounters")
    .withIndex("by_counter_id", (q: any) => q.eq("id", "main"))
    .first();

  const values = {
    totalProducts: products.length,
    totalUnitsInStock,
    inventoryValue,
    lowStockItems,
    outOfStockItems,
  };

  if (counter) {
    await ctx.db.patch(counter._id, values);
  } else {
    await ctx.db.insert("inventoryCounters", {
      id: "main",
      deadStockItems: 0,
      reservedStock: 0,
      ...values,
    });
  }

  return values;
}

export async function updateInventoryCountersHelper(ctx: any, args: {
  diffProducts?: number,
  diffUnits?: number,
  diffValue?: number,
  diffLowStock?: number,
  diffOutOfStock?: number,
}) {
  const counter = await ctx.db.query("inventoryCounters").withIndex("by_counter_id", (q: any) => q.eq("id", "main")).first();
  if (counter) {
    await ctx.db.patch(counter._id, {
      totalProducts: Math.max(0, counter.totalProducts + (args.diffProducts || 0)),
      totalUnitsInStock: Math.max(0, counter.totalUnitsInStock + (args.diffUnits || 0)),
      inventoryValue: Math.max(0, counter.inventoryValue + (args.diffValue || 0)),
      lowStockItems: Math.max(0, counter.lowStockItems + (args.diffLowStock || 0)),
      outOfStockItems: Math.max(0, counter.outOfStockItems + (args.diffOutOfStock || 0)),
    });
  } else {
    await ctx.db.insert("inventoryCounters", {
      id: "main",
      totalProducts: Math.max(0, args.diffProducts || 0),
      totalUnitsInStock: Math.max(0, args.diffUnits || 0),
      inventoryValue: Math.max(0, args.diffValue || 0),
      lowStockItems: Math.max(0, args.diffLowStock || 0),
      outOfStockItems: Math.max(0, args.diffOutOfStock || 0),
      deadStockItems: 0,
      reservedStock: 0,
    });
  }
}

// Get all products (live subscription ready)
export const list = query({
  args: { archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const archivedStatus = args.archived ?? false;
    return await ctx.db
      .query("products")
      .withIndex("by_archived", (q) => q.eq("archived", archivedStatus))
      .take(500);
  },
});

// Get a single product by ID
export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create or Update Product
export const upsert = mutation({
  args: {
    id: v.optional(v.id("products")),
    code: v.string(),
    name: v.string(),
    category: v.string(),
    costPrice: v.number(),
    sellingPrice: v.number(),
    stock: v.number(),
    reorderLevel: v.number(),
    archived: v.boolean(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    adjustmentReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can create or edit products.");
    }

    const { id, adjustmentReason, ...data } = args;
    let valueDiff = 0;
    let idToReturn = id;

    let diffProducts = 0;
    let diffUnits = 0;
    let diffLowStock = 0;
    let diffOutOfStock = 0;

    if (id) {
      const existing = await ctx.db.get(id);
      if (existing) {
        valueDiff = (data.costPrice * data.stock) - (existing.costPrice * existing.stock);
        diffUnits = data.stock - existing.stock;
        
        const wasLow = existing.stock <= existing.reorderLevel && existing.stock > 0;
        const isLow = data.stock <= data.reorderLevel && data.stock > 0;
        if (!wasLow && isLow) diffLowStock = 1;
        if (wasLow && !isLow) diffLowStock = -1;

        const wasOut = existing.stock <= 0;
        const isOut = data.stock <= 0;
        if (!wasOut && isOut) diffOutOfStock = 1;
        if (wasOut && !isOut) diffOutOfStock = -1;

        if (diffUnits !== 0) {
          if (!adjustmentReason || adjustmentReason.trim() === "") {
            throw new Error("Adjustment reason is required when editing stock quantity.");
          }
          await ctx.db.insert("inventoryMovements", {
            productId: id,
            movementType: "Stock Adjustment",
            quantity: diffUnits,
            previousStock: existing.stock,
            newStock: data.stock,
            reason: adjustmentReason,
            userId: user.username,
            createdAt: Date.now(),
          });
        }
      }
      await ctx.db.patch(id, { ...data, updatedAt: Date.now() });
    } else {
      valueDiff = data.costPrice * data.stock;
      diffProducts = 1;
      diffUnits = data.stock;
      if (data.stock <= data.reorderLevel && data.stock > 0) diffLowStock = 1;
      if (data.stock <= 0) diffOutOfStock = 1;
      idToReturn = await ctx.db.insert("products", {
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      if (data.stock !== 0) {
        await ctx.db.insert("inventoryMovements", {
          productId: idToReturn,
          movementType: "Initial Stock",
          quantity: data.stock,
          previousStock: 0,
          newStock: data.stock,
          reason: "Initial catalog creation",
          userId: user.username,
          createdAt: Date.now(),
        });
      }
    }



    await updateInventoryCountersHelper(ctx, {
      diffProducts,
      diffUnits,
      diffValue: valueDiff,
      diffLowStock,
      diffOutOfStock,
    });

    return idToReturn;
  },
});

// Bulk-create/update products from an uploaded spreadsheet (code, name, category,
// costPrice, sellingPrice, stock, reorderLevel, archived). Rows are matched to
// existing products by `code`; unmatched codes are created. Callers should chunk
// large files client-side (e.g. 200 rows per call) to stay within mutation limits.
export const bulkImport = mutation({
  args: {
    rows: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        category: v.string(),
        costPrice: v.number(),
        sellingPrice: v.number(),
        stock: v.number(),
        reorderLevel: v.number(),
        archived: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can import products.");
    }
    if (args.rows.length === 0) throw new Error("No rows to import.");
    if (args.rows.length > 200) {
      throw new Error("Import batch too large. Split the file into batches of 200 rows or fewer.");
    }

    const now = Date.now();
    let diffProducts = 0;
    let diffUnits = 0;
    let diffValue = 0;
    let diffLowStock = 0;
    let diffOutOfStock = 0;
    let createdCount = 0;
    let updatedCount = 0;

    for (const row of args.rows) {
      const code = row.code.trim();
      if (!code) throw new Error("Row is missing a product code.");
      if (row.costPrice < 0 || row.sellingPrice < 0 || row.stock < 0 || row.reorderLevel < 0) {
        throw new Error(`Negative value not allowed for product code "${code}".`);
      }

      const existing = await ctx.db.query("products").withIndex("by_code", (q) => q.eq("code", code)).first();

      if (existing) {
        const valueDiff = row.costPrice * row.stock - existing.costPrice * existing.stock;
        const unitsDiff = row.stock - existing.stock;

        const wasLow = existing.stock <= existing.reorderLevel && existing.stock > 0;
        const isLow = row.stock <= row.reorderLevel && row.stock > 0;
        if (!wasLow && isLow) diffLowStock += 1;
        if (wasLow && !isLow) diffLowStock -= 1;

        const wasOut = existing.stock <= 0;
        const isOut = row.stock <= 0;
        if (!wasOut && isOut) diffOutOfStock += 1;
        if (wasOut && !isOut) diffOutOfStock -= 1;

        await ctx.db.patch(existing._id, {
          name: row.name,
          category: row.category,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          stock: row.stock,
          reorderLevel: row.reorderLevel,
          archived: row.archived,
          updatedAt: now,
        });

        if (unitsDiff !== 0) {
          await ctx.db.insert("inventoryMovements", {
            productId: existing._id,
            movementType: "Bulk Import Update",
            quantity: unitsDiff,
            previousStock: existing.stock,
            newStock: row.stock,
            reason: "Bulk catalog import",
            userId: user.username,
            createdAt: now,
          });
        }

        diffValue += valueDiff;
        diffUnits += unitsDiff;
        updatedCount += 1;
      } else {
        const newId = await ctx.db.insert("products", {
          code,
          name: row.name,
          category: row.category,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          stock: row.stock,
          reorderLevel: row.reorderLevel,
          archived: row.archived,
          createdAt: now,
          updatedAt: now,
        });

        if (row.stock !== 0) {
          await ctx.db.insert("inventoryMovements", {
            productId: newId,
            movementType: "Initial Stock",
            quantity: row.stock,
            previousStock: 0,
            newStock: row.stock,
            reason: "Bulk catalog import",
            userId: user.username,
            createdAt: now,
          });
        }

        diffProducts += 1;
        diffValue += row.costPrice * row.stock;
        diffUnits += row.stock;
        if (row.stock <= row.reorderLevel && row.stock > 0) diffLowStock += 1;
        if (row.stock <= 0) diffOutOfStock += 1;
        createdCount += 1;
      }
    }

    await updateInventoryCountersHelper(ctx, {
      diffProducts,
      diffUnits,
      diffValue,
      diffLowStock,
      diffOutOfStock,
    });

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: now,
      action: "BULK_IMPORT_PRODUCTS",
      afterValue: { createdCount, updatedCount, totalRows: args.rows.length },
    });

    return { createdCount, updatedCount };
  },
});

export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can remove products.");
    }

    const product = await ctx.db.get(args.id);
    if (product) {
      const valueDiff = -(product.costPrice * product.stock);
      


      await updateInventoryCountersHelper(ctx, {
        diffProducts: -1,
        diffUnits: -product.stock,
        diffValue: valueDiff,
        diffLowStock: (product.stock <= product.reorderLevel && product.stock > 0) ? -1 : 0,
        diffOutOfStock: product.stock <= 0 ? -1 : 0,
      });

      await ctx.db.insert("auditLogs", {
        userId: user.username,
        timestamp: Date.now(),
        action: "DELETE_PRODUCT",
        beforeValue: { name: product.name, code: product.code, stock: product.stock },
        referenceId: args.id,
      });
    }
    await ctx.db.delete(args.id);
  },
});

export const adjustStock = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(), // + or -
    reason: v.string(),
    type: v.string(), // "Adjustment", "Damage", "Manual Correction"
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can adjust stock.");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const previousStock = product.stock;
    const newStock = previousStock + args.quantity;
    const valueDiff = args.quantity * product.costPrice;

    // Update product stock
    await ctx.db.patch(args.productId, { stock: newStock });

    // Log movement
    await ctx.db.insert("inventoryMovements", {
      productId: args.productId,
      movementType: args.type,
      quantity: args.quantity,
      previousStock,
      newStock,
      reason: args.reason,
      userId: user.username,
      createdAt: Date.now(),
    });



    let diffLowStock = 0;
    let diffOutOfStock = 0;

    const wasLow = previousStock <= product.reorderLevel && previousStock > 0;
    const isLow = newStock <= product.reorderLevel && newStock > 0;
    if (!wasLow && isLow) diffLowStock = 1;
    if (wasLow && !isLow) diffLowStock = -1;

    const wasOut = previousStock <= 0;
    const isOut = newStock <= 0;
    if (!wasOut && isOut) diffOutOfStock = 1;
    if (wasOut && !isOut) diffOutOfStock = -1;

    await updateInventoryCountersHelper(ctx, {
      diffUnits: args.quantity,
      diffValue: valueDiff,
      diffLowStock,
      diffOutOfStock,
    });

    await updateDailyMovementStats(ctx, args.type, args.quantity);

    return newStock;
  },
});

// Recompute inventoryCounters from the products table (fixes drift from direct db writes, e.g. seeding)
export const recomputeInventoryCounters = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can recompute inventory counters.");
    }
    return await recomputeInventoryCountersHandler(ctx);
  },
});

// Same as above, callable from the CLI/backend without a logged-in user (e.g. one-off data fixes)
export const recomputeInventoryCountersInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await recomputeInventoryCountersHandler(ctx);
  },
});

// Smart Logic: Get low stock alerts
export const getLowStock = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .filter((q) => q.lte(q.field("stock"), q.field("reorderLevel")))
      .take(500);
  },
});

export const getInventoryAnalytics = query({
  handler: async (ctx) => {
    // 1. Instantly pull aggregates from pre-computed inventoryCounters (1 doc read)
    const counter = await ctx.db
      .query("inventoryCounters")
      .withIndex("by_counter_id", (q) => q.eq("id", "main"))
      .first();

    const totalStockValue = counter?.inventoryValue || 0;
    const lowStockCount = counter?.lowStockItems || 0;
    const outOfStockCount = counter?.outOfStockItems || 0;
    const deadStockCount = counter?.deadStockItems || 0;

    // 2. Fetch active products using index (instead of full scan)
    const products = await ctx.db
      .query("products")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .take(500);

    // 3. Fetch recent movements (limit to 200 instead of 1000 to keep it very fast)
    const movements = await ctx.db
      .query("inventoryMovements")
      .order("desc")
      .take(200);
    
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const productMovements: Record<string, { velocity: number }> = {};

    products.forEach(p => {
      productMovements[p._id] = { velocity: 0 };
    });

    movements.forEach(m => {
      const pid = m.productId;
      if (productMovements[pid]) {
        if (m.movementType === "Sale" && (m.createdAt || 0) > thirtyDaysAgo) {
          productMovements[pid].velocity += Math.abs(m.quantity);
        }
      }
    });

    const fastMovingProducts = products
      .map(p => ({
        name: p.name,
        velocity: productMovements[p._id]?.velocity || 0
      }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 5);

    return {
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      deadStockCount,
      fastMovingProducts,
      valuationTrend: 12.5,
      lowStockTrend: -2.1
    };
  },
});
