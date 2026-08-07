import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { recomputeCustomerIntelligence } from "./intelligence";
import { normalizePaymentMethod } from "./utils";
import { reconcileBalances, applyCustomerLedger } from "./ledgerHelpers";
import { processCashPayment, validateCaixaForCash, getActiveCaixaSession, resolveCaixaSession } from "./caixaHelpers";
import { updateDailyMovementStats } from "./utils";
import { requireUser } from "./authHelpers";
import { updateInventoryCountersHelper } from "./products";
import { updateFinancialStats } from "./analyticsHelpers";

async function updateFinancialCountersHelper(ctx: any, args: { diffCredit?: number, diffDebt?: number, diffOverdue?: number, diffOverdueAccounts?: number, recoveredDebt?: number, creditUsed?: number }) {
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);

  const mainCounter = await ctx.db.query("financialCounters").withIndex("by_counter_id", (q: any) => q.eq("id", "main")).first();
  if (mainCounter) {
    await ctx.db.patch(mainCounter._id, {
      totalCustomerCredit: Math.max(0, mainCounter.totalCustomerCredit + (args.diffCredit || 0)),
      totalCustomerDebt: Math.max(0, mainCounter.totalCustomerDebt + (args.diffDebt || 0)),
      overdueDebtAmount: Math.max(0, mainCounter.overdueDebtAmount + (args.diffOverdue || 0)),
      overdueAccounts: Math.max(0, mainCounter.overdueAccounts + (args.diffOverdueAccounts || 0)),
    });
  } else {
    await ctx.db.insert("financialCounters", {
      id: "main",
      totalCustomerCredit: Math.max(0, args.diffCredit || 0),
      totalCustomerDebt: Math.max(0, args.diffDebt || 0),
      overdueDebtAmount: Math.max(0, args.diffOverdue || 0),
      overdueAccounts: Math.max(0, args.diffOverdueAccounts || 0),
    });
  }

  if (args.recoveredDebt || args.creditUsed) {
    const monthCounter = await ctx.db.query("financialCounters").withIndex("by_counter_id", (q: any) => q.eq("id", monthStr)).first();
    if (monthCounter) {
      await ctx.db.patch(monthCounter._id, {
        debtRecoveredThisMonth: (monthCounter.debtRecoveredThisMonth || 0) + (args.recoveredDebt || 0),
        creditUsedThisMonth: (monthCounter.creditUsedThisMonth || 0) + (args.creditUsed || 0),
      });
    } else {
      await ctx.db.insert("financialCounters", {
        id: monthStr,
        totalCustomerCredit: 0,
        totalCustomerDebt: 0,
        overdueDebtAmount: 0,
        overdueAccounts: 0,
        debtRecoveredThisMonth: args.recoveredDebt || 0,
        creditUsedThisMonth: args.creditUsed || 0,
      });
    }
  }
}


async function hydrateTransactions(ctx: any, transactions: any[]) {
  const customerIds = Array.from(
    new Set(transactions.map((tx) => tx.customerId).filter(Boolean))
  );
  
  const productIds = Array.from(
    new Set(
      transactions.flatMap((tx) => (tx.items || []).map((item: any) => item.productId)).filter(Boolean)
    )
  );

  const [customers, products] = await Promise.all([
    Promise.all(customerIds.map((id) => ctx.db.get(id))),
    Promise.all(productIds.map((id) => ctx.db.get(id))),
  ]);

  const customerMap = new Map(customers.filter(Boolean).map((c: any) => [c._id, c]));
  const productMap = new Map(products.filter(Boolean).map((p: any) => [p._id, p]));

  return transactions.map((tx) => {
    let customerName = tx.customerName;
    let customerTier = tx.customerTier;

    if (!customerName && tx.customerId) {
      const customer = customerMap.get(tx.customerId);
      customerName = customer ? `${customer.firstName} ${customer.lastName}` : "Walk-in";
      customerTier = "Regular";
    }

    const itemsWithDetails = (tx.items || []).map((item: any) => {
      if (item.name) return item;
      const product = productMap.get(item.productId);
      return {
        ...item,
        name: product?.name || "Unknown Product",
        photo: product?.imageUrl || "",
      };
    });

    const totalPaid = (tx.paymentBreakdown || []).reduce((acc: number, p: any) => acc + p.amount, 0);
    const balance = Math.max(0, tx.total - totalPaid);

    return {
      ...tx,
      items: itemsWithDetails,
      customerName: customerName || "Walk-in",
      customerTier: customerTier || "Regular",
      paymentStatus: balance === 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Pending",
      balance,
      paymentMethod: tx.paymentBreakdown?.length === 1 ? tx.paymentBreakdown[0].method : "Split",
    };
  });
}

export const list = query({
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").order("desc").take(100);
    return await hydrateTransactions(ctx, transactions);
  },
});

export const getRecent = query({
  args: { 
    limit: v.number(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.startDate !== undefined && args.endDate !== undefined) {
      q = ctx.db.query("transactions")
        .withIndex("by_createdAt", (qIndex) =>
          qIndex.gte("createdAt", args.startDate!).lte("createdAt", args.endDate!)
        );
    } else if (args.startDate !== undefined) {
      q = ctx.db.query("transactions")
        .withIndex("by_createdAt", (qIndex) =>
          qIndex.gte("createdAt", args.startDate!)
        );
    } else if (args.endDate !== undefined) {
      q = ctx.db.query("transactions")
        .withIndex("by_createdAt", (qIndex) =>
          qIndex.lte("createdAt", args.endDate!)
        );
    } else {
      q = ctx.db.query("transactions");
    }

    const transactions = await q.order("desc").take(args.limit);
    return await hydrateTransactions(ctx, transactions);
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        price: v.number(), // Price at time of sale
      })
    ),
    subtotal: v.number(),
    discount: v.number(),
    taxes: v.number(),
    total: v.number(),
    profit: v.number(),
    cashierName: v.optional(v.string()),
    receiptNumber: v.optional(v.string()),
    amountReceived: v.number(),
    changeGiven: v.number(),
    changeHandling: v.optional(v.string()),
    deliveryStatus: v.string(), // "Pending", "Shipped", "Delivered"
    paymentBreakdown: v.array(
      v.object({
        method: v.string(),
        amount: v.number(),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    const now = Date.now();
    const todayStr = new Date(now).toISOString().split("T")[0];

    const session = await resolveCaixaSession(ctx.db, now);

    let sequenceNumber = 1;
    const existingStat = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", todayStr))
      .first();
    if (existingStat) {
      sequenceNumber = existingStat.transactionCount + 1;
    }

    const finalReceiptNumber = args.receiptNumber || `ORD-${String(sequenceNumber).padStart(3, "0")}`;

    // 0. Caixa validation for cash payments
    const cashPayment = args.paymentBreakdown.find(p => p.method.toLowerCase() === "cash");
    if (cashPayment && cashPayment.amount > 0) {
      await validateCaixaForCash(ctx.db, now);
    }

    // 1. Determine Status & Validate Settlement
    const totalPayments = args.paymentBreakdown.reduce((acc, p) => acc + p.amount, 0);

    // Validate split payments match amountReceived
    if (Math.abs(totalPayments - args.amountReceived) > 0.01) {
      throw new Error(`Split payments total (${totalPayments}) does not match amount received (${args.amountReceived}).`);
    }

    let status = "Pending";
    if (args.amountReceived >= args.total) {
      status = "Completed";
    } else if (args.amountReceived > 0) {
      status = "Partially Paid";
    }

    const change = args.amountReceived - args.total;
    const isOverpayment = change > 0;
    const isUnderpayment = change < 0;

    // Validate generic customer constraints
    if (!args.customerId && isUnderpayment) {
      throw new Error("Walk-in transactions must be fully settled at checkout. No credit/debit allowed.");
    }

    if (isOverpayment && !args.changeHandling) {
      throw new Error("Change handling method is required for overpayments.");
    }

    // 2. Fetch Customer and Update Balances
    let customer = null;
    let newCreditBalance = 0;
    let newDebitBalance = 0;
    let customerName = "Walk-in";
    let customerTier = "Regular";

    let isNewCustomer = 0;
    let isReturningCustomer = 0;
    let creditIssuedToday = 0;
    let creditRedeemedToday = 0;
    let debtCreatedToday = 0;
    let debtRecoveredToday = 0;

    if (args.customerId) {
      customer = await ctx.db.get(args.customerId);
      if (!customer) throw new Error("Customer not found");

      customerName = `${customer.firstName} ${customer.lastName}`;
      customerTier = "Regular";
      newCreditBalance = customer.creditBalance || 0;
      newDebitBalance = customer.debitBalance || 0;

      const storeCreditUsed = args.paymentBreakdown
        .filter(p => p.method === "Store Credit")
        .reduce((sum, p) => sum + p.amount, 0);

      if (storeCreditUsed > 0) {
        if (newCreditBalance >= storeCreditUsed) {
          newCreditBalance -= storeCreditUsed;
        } else {
          throw new ConvexError("Insufficient store credit to cover payment amount.");
        }
      }

      if (isOverpayment && args.changeHandling === "Store Credit") {
        const reconciled = reconcileBalances(newCreditBalance, newDebitBalance, change);
        newCreditBalance = reconciled.creditBalance;
        newDebitBalance = reconciled.debitBalance;
      } else if (isUnderpayment) {
        const reconciled = reconcileBalances(newCreditBalance, newDebitBalance, change); // change is negative
        newCreditBalance = reconciled.creditBalance;
        newDebitBalance = reconciled.debitBalance;
      }

      await ctx.db.patch(args.customerId, {
        creditBalance: newCreditBalance,
        debitBalance: newDebitBalance,
      });

      const oldCredit = customer.creditBalance || 0;
      const oldDebt = customer.debitBalance || 0;
      const diffCredit = newCreditBalance - oldCredit;
      const diffDebt = newDebitBalance - oldDebt;
      const recoveredDebt = oldDebt > newDebitBalance ? oldDebt - newDebitBalance : 0;

      if ((customer.orderCount || 0) === 0) {
        isNewCustomer = 1;
      } else {
        isReturningCustomer = 1;
      }

      creditRedeemedToday = storeCreditUsed;
      if (isOverpayment && args.changeHandling === "Store Credit") {
        creditIssuedToday = change;
      }
      if (isUnderpayment) {
        debtCreatedToday = Math.abs(change);
      }
      debtRecoveredToday = recoveredDebt;

      await updateFinancialCountersHelper(ctx, {
        diffCredit,
        diffDebt,
        recoveredDebt,
        creditUsed: storeCreditUsed,
      });
    }

    // Prepare denormalized items
    const denormalizedItems = await Promise.all(args.items.map(async (item) => {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      return {
        ...item,
        name: product.name,
        photo: product.imageUrl,
      };
    }));

    // 3. Create Transaction
    const transactionId = await ctx.db.insert("transactions", {
      customerId: args.customerId,
      receiptNumber: finalReceiptNumber,
      subtotal: args.subtotal,
      discount: args.discount,
      taxes: args.taxes,
      total: args.total,
      profit: args.profit,
      cashierName: user.username,
      status,
      settlementType: status === "Completed" ? "Fully Paid" : status,
      deliveryStatus: args.deliveryStatus,
      paymentBreakdown: args.paymentBreakdown,
      items: denormalizedItems,
      refundedAmount: 0,
      amountReceived: args.amountReceived,
      changeGiven: isOverpayment ? change : 0,
      changeHandling: isOverpayment ? args.changeHandling : undefined,
      notes: args.notes,
      customerName,
      customerTier,
      sessionId: session._id,
      createdAt: now,
      updatedAt: now,
    });

    // First adjust by store credit used (withdrawal from customer credit)
    const storeCreditUsed = args.paymentBreakdown
      .filter(p => p.method === "Store Credit")
      .reduce((sum, p) => sum + p.amount, 0);

    if (args.customerId && storeCreditUsed > 0) {
      await applyCustomerLedger(ctx.db, args.customerId, {
        type: "USE_CREDIT",
        amount: storeCreditUsed,
        description: `Used store credit for ${finalReceiptNumber}`,
        referenceId: transactionId,
        referenceType: "transaction",
        sessionId: session._id,
      });
    }

    // A. Ledger: SALE
    if (args.customerId) {
      await applyCustomerLedger(ctx.db, args.customerId, {
        type: "SALE",
        amount: args.total,
        description: `Sale ${finalReceiptNumber}`,
        referenceId: transactionId,
        referenceType: "transaction",
        sessionId: session._id,
      });
    }

    // 5. Ledger & Payments: PAYMENT
    for (const pay of args.paymentBreakdown) {
      const paymentId = await ctx.db.insert("payments", {
        transactionId,
        customerId: args.customerId,
        sessionId: session._id,
        amount: pay.amount,
        paymentMethod: pay.method,
        paymentDate: now,
        status: "Completed",
        createdAt: now,
        updatedAt: now,
      });

      if (args.customerId) {
        // Audit-trail only — the sale's effect on credit/debt is already fully
        // accounted for above (store credit used, overpayment/underpayment).
        // Do NOT route this through applyCustomerLedger: its "PAYMENT" case treats
        // the amount as a fresh credit deposit, which would double-count this money
        // as store credit on top of the sale it's actually paying for.
        await ctx.db.insert("ledger", {
          customerId: args.customerId,
          sessionId: session._id,
          type: "PAYMENT",
          amount: pay.amount,
          balanceAfter: { credit: newCreditBalance, debit: newDebitBalance },
          referenceId: paymentId,
          referenceType: "payment",
          description: `Payment via ${pay.method} for ${finalReceiptNumber}`,
          createdAt: now,
        });
      }
    }

    // 5.5. Caixa Movement
    if (cashPayment && cashPayment.amount > 0) {
      let netCash = cashPayment.amount;
      if (isOverpayment && args.changeHandling === "Cash") {
        netCash -= change; // Adjust if we gave cash change
      }

      await processCashPayment(ctx.db, {
        amount: netCash,
        type: "SALE",
        description: `Cash sale for ${finalReceiptNumber}`,
        userId: user.username,
        timestamp: now,
        referenceId: transactionId,
        referenceType: "transaction",
      });
    }

    // 6. Ledger: Change Handling (REFUND or CREDIT) / Underpayment (DEBIT)
    if (args.customerId) {
      if (isOverpayment) {
        const changeType = args.changeHandling === "Store Credit" ? "CREDIT" : "REFUND";
        await applyCustomerLedger(ctx.db, args.customerId, {
          type: changeType,
          amount: change,
          description: `${changeType === "CREDIT" ? "Store Credit" : "Change Refund"} for ${finalReceiptNumber}`,
          referenceId: transactionId,
          referenceType: "transaction",
          sessionId: session._id,
        });
      } else if (isUnderpayment) {
        await applyCustomerLedger(ctx.db, args.customerId, {
          type: "DEBIT",
          amount: Math.abs(change),
          description: `Outstanding balance for ${finalReceiptNumber}`,
          referenceId: transactionId,
          referenceType: "transaction",
          sessionId: session._id,
        });
      }
    }

    // Fetch all products involved in this transaction in a single parallel call
    const products = await Promise.all(
      args.items.map((item: any) => ctx.db.get(item.productId))
    );
    const productMap = new Map(products.filter(Boolean).map((p: any) => [p._id, p]));

    // 7. Process Items (Inventory)
    let totalDiffUnits = 0;
    let totalDiffValue = 0;
    let totalDiffLowStock = 0;
    let totalDiffOutOfStock = 0;

    for (const item of args.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);

      const previousStock = product.stock;
      const newStock = previousStock - item.quantity;

      // Update Stock
      await ctx.db.patch(item.productId, { stock: newStock });

      // Write to inventory movements
      await ctx.db.insert("inventoryMovements", {
        productId: item.productId,
        movementType: "Sale",
        quantity: -item.quantity,
        previousStock: previousStock,
        newStock: newStock,
        reason: `Sold in receipt ${finalReceiptNumber}`,
        userId: user.username,
        createdAt: now,
      });

      // Track differences for inventoryCounters
      totalDiffUnits -= item.quantity;
      totalDiffValue -= item.quantity * (product.costPrice || 0);

      const wasLow = previousStock <= product.reorderLevel && previousStock > 0;
      const isLow = newStock <= product.reorderLevel && newStock > 0;
      if (!wasLow && isLow) totalDiffLowStock += 1;
      if (wasLow && !isLow) totalDiffLowStock -= 1;

      const wasOut = previousStock <= 0;
      const isOut = newStock <= 0;
      if (!wasOut && isOut) totalDiffOutOfStock += 1;
      if (wasOut && !isOut) totalDiffOutOfStock -= 1;
    }

    // Update global inventory counters
    await updateInventoryCountersHelper(ctx, {
      diffUnits: totalDiffUnits,
      diffValue: totalDiffValue,
      diffLowStock: totalDiffLowStock,
      diffOutOfStock: totalDiffOutOfStock,
    });

    if (args.customerId) {
      await recomputeCustomerIntelligence(ctx.db, args.customerId);
    }

    // 8. Increment Analytics Counters
    const totalItems = args.items.reduce((sum, item) => sum + item.quantity, 0);

    let totalPendingAmount = 0;
    if (args.amountReceived < args.total) {
      totalPendingAmount = args.total - args.amountReceived;
    }

    const paymentsByMethod: Record<string, number> = {};
    for (const pay of args.paymentBreakdown) {
      const targetKey = normalizePaymentMethod(pay.method);
      paymentsByMethod[targetKey] = (paymentsByMethod[targetKey] || 0) + pay.amount;
    }

    const salesByCategory: Record<string, number> = {};
    let inventoryCostSold = 0;
    let inventoryRetailSold = 0;

    for (const item of args.items) {
      const product = productMap.get(item.productId);
      if (product) {
        const cat = product.category || "Unknown";
        salesByCategory[cat] = (salesByCategory[cat] || 0) + item.quantity;
        inventoryCostSold += (product.costPrice || 0) * item.quantity;
        inventoryRetailSold += (product.sellingPrice || 0) * item.quantity;
      }
    }

    await updateFinancialStats(ctx, {
      dateStr: todayStr,
      revenueDelta: args.total,
      profitDelta: args.profit,
      itemsSoldDelta: totalItems,
      transactionDelta: 1,
      pendingAmountDelta: totalPendingAmount,
      paymentsByMethodDelta: paymentsByMethod,
      salesByCategoryDelta: salesByCategory,
      completedOrdersDelta: status === "Completed" ? 1 : 0,
      pendingOrdersDelta: (status !== "Completed" && status !== "Partially Paid") ? 1 : 0,
      partiallyPaidOrdersDelta: status === "Partially Paid" ? 1 : 0,
      inventoryCostSoldDelta: inventoryCostSold,
      inventoryRetailSoldDelta: inventoryRetailSold,
      cashSalesDelta: paymentsByMethod["Cash"] || 0,
      newCustomersDelta: isNewCustomer,
      returningCustomersDelta: isReturningCustomer,
      creditIssuedDelta: creditIssuedToday,
      creditRedeemedDelta: creditRedeemedToday,
      debtCreatedDelta: debtCreatedToday,
      debtRecoveredDelta: debtRecoveredToday,
    });

    // 9. Update Cashier Counters
    const cashierCounter = await ctx.db
      .query("cashierCounters")
      .withIndex("by_userId", (q) => q.eq("userId", user.username))
      .first();

    if (cashierCounter) {
      const newCount = cashierCounter.salesCount + 1;
      const newRev = cashierCounter.totalRevenue + args.total;
      await ctx.db.patch(cashierCounter._id, {
        salesCount: newCount,
        totalRevenue: newRev,
        totalProfit: cashierCounter.totalProfit + args.profit,
        averageOrderValue: newRev / newCount,
        lastSaleAt: now,
      });
    } else {
      await ctx.db.insert("cashierCounters", {
        userId: user.username,
        salesCount: 1,
        totalRevenue: args.total,
        totalProfit: args.profit,
        averageOrderValue: args.total,
        refundsProcessed: 0,
        lastSaleAt: now,
      });
    }

    // 10. Update Product Counters
    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) continue;

      const itemRev = item.quantity * item.price;
      const itemProfit = itemRev - (item.quantity * (product.costPrice || 0));

      const pCounter = await ctx.db
        .query("productCounters")
        .withIndex("by_productId", (q) => q.eq("productId", item.productId))
        .first();

      if (pCounter) {
        await ctx.db.patch(pCounter._id, {
          totalSold: pCounter.totalSold + item.quantity,
          totalRevenue: pCounter.totalRevenue + itemRev,
          totalProfit: pCounter.totalProfit + itemProfit,
          lastSoldAt: now,
        });
      } else {
        await ctx.db.insert("productCounters", {
          productId: item.productId,
          productName: product.name,
          totalSold: item.quantity,
          totalRevenue: itemRev,
          totalProfit: itemProfit,
          lastSoldAt: now,
        });
      }
    }

    return { transactionId, receiptNumber: finalReceiptNumber };
  },
});

// Analytics: Revenue & Profit
export const getAnalytics = query({
  handler: async (ctx) => {
    const globalCounter = await ctx.db
      .query("globalCounters")
      .withIndex("by_counter_id", (q) => q.eq("id", "main"))
      .first();
    return {
      totalRevenue: globalCounter?.totalRevenue || 0,
      totalProfit: globalCounter?.totalProfit || 0,
      transactionCount: globalCounter?.transactionCount || 0,
    };
  },
});

export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can delete transactions.");
    }

    const transaction = await ctx.db.get(args.id);
    if (!transaction) throw new Error("Transaction not found");

    // Batch query all products and product counters to eliminate sequential awaits in loops
    const [products, productCounters] = await Promise.all([
      Promise.all(transaction.items.map((item: any) => ctx.db.get(item.productId))),
      Promise.all(
        transaction.items.map((item: any) =>
          ctx.db
            .query("productCounters")
            .withIndex("by_productId", (q) => q.eq("productId", item.productId))
            .first()
        )
      ),
    ]);

    const productMap = new Map(products.filter(Boolean).map((p: any) => [p._id, p]));
    const pCounterMap = new Map(productCounters.filter(Boolean).map((pc: any) => [pc.productId, pc]));

    // 1. Restore Inventory Stock
    let totalDiffUnits = 0;
    let totalDiffValue = 0;
    let totalDiffLowStock = 0;
    let totalDiffOutOfStock = 0;

    for (const item of transaction.items) {
      const product = productMap.get(item.productId);
      if (product) {
        const previousStock = product.stock;
        const newStock = previousStock + item.quantity;

        await ctx.db.patch(item.productId, { stock: newStock });

        // Log restoration movement
        await ctx.db.insert("inventoryMovements", {
          productId: item.productId,
          movementType: "Sale Reversal",
          quantity: item.quantity,
          previousStock,
          newStock,
          reason: `Transaction ${transaction.receiptNumber} Deleted`,
          userId: user.username,
          createdAt: Date.now(),
        });

        await updateDailyMovementStats(ctx, "Sale Reversal", item.quantity);

        // Track differences for inventoryCounters
        totalDiffUnits += item.quantity;
        totalDiffValue += item.quantity * (product.costPrice || 0);

        const wasLow = previousStock <= product.reorderLevel && previousStock > 0;
        const isLow = newStock <= product.reorderLevel && newStock > 0;
        if (!wasLow && isLow) totalDiffLowStock += 1;
        if (wasLow && !isLow) totalDiffLowStock -= 1;

        const wasOut = previousStock <= 0;
        const isOut = newStock <= 0;
        if (!wasOut && isOut) totalDiffOutOfStock += 1;
        if (wasOut && !isOut) totalDiffOutOfStock -= 1;
      }
    }

    // Update global inventory counters
    await updateInventoryCountersHelper(ctx, {
      diffUnits: totalDiffUnits,
      diffValue: totalDiffValue,
      diffLowStock: totalDiffLowStock,
      diffOutOfStock: totalDiffOutOfStock,
    });

    // 3. Delete Associated Payments and their Ledger Entries
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.id))
      .collect();

    const paymentIds = payments.map(p => p._id);
    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }

    // 4. Revert Customer Balances & Delete Ledger Entries
    if (transaction.customerId) {
      const customer = await ctx.db.get(transaction.customerId);
      if (customer) {
        let creditBalance = customer.creditBalance || 0;
        let debitBalance = customer.debitBalance || 0;

        const amountReceived = transaction.amountReceived || 0;
        const change = amountReceived - transaction.total;

        let applyAsDebt = 0;
        let applyAsCredit = 0;

        if (change > 0 && transaction.changeHandling === "Store Credit") {
          applyAsDebt += change;
        } else if (change < 0) {
          applyAsCredit += Math.abs(change);
        }

        const storeCreditUsed = payments
          .filter((p) => p.paymentMethod === "Store Credit")
          .reduce((sum, p) => sum + p.amount, 0);

        applyAsCredit += storeCreditUsed;

        const reconciledDebt = reconcileBalances(creditBalance, debitBalance, -applyAsDebt);
        const finalReconciled = reconcileBalances(reconciledDebt.creditBalance, reconciledDebt.debitBalance, applyAsCredit);

        await ctx.db.patch(transaction.customerId, {
          creditBalance: Math.max(0, finalReconciled.creditBalance),
          debitBalance: Math.max(0, finalReconciled.debitBalance)
        });
      }

      // Delete Ledger Entries tied to this transaction or its payments
      const customerLedgers = await ctx.db
        .query("ledger")
        .withIndex("by_customer", (q) => q.eq("customerId", transaction.customerId))
        .collect();

      for (const entry of customerLedgers) {
        if (entry.referenceId === args.id || (entry.referenceId && paymentIds.includes(entry.referenceId as any))) {
          await ctx.db.delete(entry._id);
        }
      }
    }

    // 6. Caixa SALE_REVERSAL
    const cashPayment = transaction.paymentBreakdown.find((p: any) => p.method.toLowerCase() === "cash");
    if (cashPayment && cashPayment.amount > 0) {
      let netCash = cashPayment.amount;
      const amountReceived = transaction.amountReceived || 0;
      const change = amountReceived - transaction.total;
      const isOverpayment = change > 0;
      if (isOverpayment && transaction.changeHandling === "Cash") {
        netCash -= change;
      }

      await processCashPayment(ctx.db, {
        amount: netCash,
        type: "SALE_REVERSAL",
        description: `Reversal of cash sale for ${transaction.receiptNumber}`,
        userId: user.username,
        timestamp: Date.now(),
        referenceId: transaction._id,
        referenceType: "transaction",
      });
    }

    // 5. Delete Transaction
    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      userId: user.username,
      timestamp: Date.now(),
      action: "DELETE_TRANSACTION",
      beforeValue: { receiptNumber: transaction.receiptNumber, total: transaction.total },
      referenceId: args.id,
    });

    if (transaction.customerId) {
      await recomputeCustomerIntelligence(ctx.db, transaction.customerId);
    }

    // 7. Decrement Analytics Counters
    const txDateStr = new Date(transaction._creationTime).toISOString().split("T")[0];
    const totalItems = transaction.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

    const dailyStat = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", txDateStr))
      .first();

    let totalPendingAmount = 0;
    if ((transaction.amountReceived || 0) < transaction.total) {
      totalPendingAmount = transaction.total - (transaction.amountReceived || 0);
    }

    const paymentsByMethod: Record<string, number> = {};
    for (const pay of (transaction.paymentBreakdown || [])) {
      const targetKey = normalizePaymentMethod(pay.method);
      paymentsByMethod[targetKey] = (paymentsByMethod[targetKey] || 0) + pay.amount;
    }

    const salesByCategory: Record<string, number> = {};
    for (const item of transaction.items) {
      const product = productMap.get(item.productId);
      if (product) {
        const cat = product.category || "Unknown";
        salesByCategory[cat] = (salesByCategory[cat] || 0) + item.quantity;
      }
    }

    const paymentsByMethodNeg: Record<string, number> = {};
    for (const [key, val] of Object.entries(paymentsByMethod)) {
      paymentsByMethodNeg[key] = -val;
    }

    const salesByCategoryNeg: Record<string, number> = {};
    for (const [key, val] of Object.entries(salesByCategory)) {
      salesByCategoryNeg[key] = -val;
    }

    const isCompleted = transaction.status === "Completed";
    const isPartiallyPaid = transaction.status === "Partially Paid";
    const cashSales = paymentsByMethod["Cash"] || 0;
    let inventoryCostSold = 0;
    let inventoryRetailSold = 0;
    for (const item of transaction.items) {
      const product = productMap.get(item.productId);
      if (product) {
        inventoryCostSold += (product.costPrice || 0) * item.quantity;
        inventoryRetailSold += (product.sellingPrice || 0) * item.quantity;
      }
    }

    await updateFinancialStats(ctx, {
      dateStr: txDateStr,
      revenueDelta: -transaction.total,
      profitDelta: -transaction.profit,
      itemsSoldDelta: -totalItems,
      transactionDelta: -1,
      pendingAmountDelta: -totalPendingAmount,
      paymentsByMethodDelta: paymentsByMethodNeg,
      salesByCategoryDelta: salesByCategoryNeg,
      completedOrdersDelta: isCompleted ? -1 : 0,
      pendingOrdersDelta: (!isCompleted && !isPartiallyPaid) ? -1 : 0,
      partiallyPaidOrdersDelta: isPartiallyPaid ? -1 : 0,
      inventoryCostSoldDelta: -inventoryCostSold,
      inventoryRetailSoldDelta: -inventoryRetailSold,
      cashSalesDelta: -cashSales,
      refundDelta: transaction.total,
    });

    // Revert Cashier Counters
    const cashierCounter = await ctx.db
      .query("cashierCounters")
      .withIndex("by_userId", (q) => q.eq("userId", transaction.cashierName))
      .first();

    if (cashierCounter) {
      const newCount = Math.max(0, cashierCounter.salesCount - 1);
      const newRev = Math.max(0, cashierCounter.totalRevenue - transaction.total);
      await ctx.db.patch(cashierCounter._id, {
        salesCount: newCount,
        totalRevenue: newRev,
        totalProfit: Math.max(0, cashierCounter.totalProfit - transaction.profit),
        averageOrderValue: newCount > 0 ? newRev / newCount : 0,
      });
    }

    // Revert Product Counters
    for (const item of transaction.items) {
      const pCounter = pCounterMap.get(item.productId);
      if (pCounter) {
        const itemRev = item.quantity * item.price;
        const product = productMap.get(item.productId);
        const itemProfit = itemRev - (item.quantity * (product?.costPrice || 0));

        await ctx.db.patch(pCounter._id, {
          totalSold: Math.max(0, pCounter.totalSold - item.quantity),
          totalRevenue: Math.max(0, pCounter.totalRevenue - itemRev),
          totalProfit: Math.max(0, pCounter.totalProfit - itemProfit),
        });
      }
    }
  },
});

export const listFiltered = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchQuery: v.optional(v.string()),
    statusFilter: v.optional(v.string()),
    paymentFilter: v.optional(v.string()),
    tierFilter: v.optional(v.string()),
    minAmount: v.optional(v.string()),
    maxAmount: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const getStartOfDayStr = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const getEndOfDayStr = (dateStr: string) => {
      const d = new Date(dateStr + "T23:59:59.999");
      return isNaN(d.getTime()) ? Infinity : d.getTime();
    };

    const start = args.startDate ? getStartOfDayStr(args.startDate) : 0;
    const end = args.endDate ? getEndOfDayStr(args.endDate) : Infinity;

    let queryBuilder;
    if (args.startDate || args.endDate) {
      queryBuilder = ctx.db.query("transactions").withIndex("by_createdAt", (q) =>
        q.gte("createdAt", start).lte("createdAt", end)
      );
    } else {
      queryBuilder = ctx.db.query("transactions");
    }

    const allTx = await queryBuilder.order("desc").collect();

    const filtered = allTx.filter((s) => {
      if (args.searchQuery) {
        const queryLower = args.searchQuery.toLowerCase();
        const receiptMatch = (s.receiptNumber || "").toLowerCase().includes(queryLower) ||
          (s.receiptNumber || "").toLowerCase().replace("inv-", "ord-").includes(queryLower);
        const customerMatch = (s.customerName || "Walk-in").toLowerCase().includes(queryLower);
        const cashierMatch = (s.cashierName || "").toLowerCase().includes(queryLower);
        if (!receiptMatch && !customerMatch && !cashierMatch) return false;
      }

      if (args.statusFilter && args.statusFilter !== "All Status") {
        if (s.status !== args.statusFilter) return false;
      }

      if (args.paymentFilter && args.paymentFilter !== "All Methods") {
        const matchesPayment = (s.paymentBreakdown || []).some((p: any) => p.method === args.paymentFilter);
        if (!matchesPayment) return false;
      }

      if (args.tierFilter && args.tierFilter !== "All Tiers") {
        const computedTier = (s.customerTier || "").toLowerCase();
        const isWalkIn = !s.customerId || s.customerName === "Walk-in" || !s.customerName;
        if (args.tierFilter === "Walk-in") {
          if (!isWalkIn) return false;
        } else if (args.tierFilter === "VIP / Platinum") {
          if (isWalkIn || (computedTier !== "vip" && computedTier !== "platinum")) return false;
        } else if (args.tierFilter === "Gold / Premium") {
          if (isWalkIn || (computedTier !== "gold" && computedTier !== "premium")) return false;
        } else if (args.tierFilter === "Standard / Regular") {
          if (isWalkIn || (computedTier !== "standard" && computedTier !== "regular")) return false;
        }
      }

      const min = args.minAmount ? parseFloat(args.minAmount) : -Infinity;
      const max = args.maxAmount ? parseFloat(args.maxAmount) : Infinity;
      if (s.total < min || s.total > max) return false;

      return true;
    });

    const numItems = args.paginationOpts.numItems;
    const cursor = args.paginationOpts.cursor;
    
    let startIndex = 0;
    if (cursor) {
      const cursorVal = parseInt(cursor, 10);
      if (!isNaN(cursorVal)) startIndex = cursorVal;
    }

    const page = filtered.slice(startIndex, startIndex + numItems);
    const hasMore = startIndex + numItems < filtered.length;
    const continueCursor = hasMore ? (startIndex + numItems).toString() : null;

    const hydratedPage = await hydrateTransactions(ctx, page);

    return {
      page: hydratedPage,
      isDone: !hasMore,
      continueCursor: continueCursor || "",
    };
  },
});

export const getSalesMetrics = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    paymentFilter: v.optional(v.string()),
    tierFilter: v.optional(v.string()),
    statusFilter: v.optional(v.string()),
    minAmount: v.optional(v.string()),
    maxAmount: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const getStartOfDayStr = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const getEndOfDayStr = (dateStr: string) => {
      const d = new Date(dateStr + "T23:59:59.999");
      return isNaN(d.getTime()) ? Infinity : d.getTime();
    };

    const start = args.startDate ? getStartOfDayStr(args.startDate) : 0;
    const end = args.endDate ? getEndOfDayStr(args.endDate) : Infinity;

    const products = await ctx.db.query("products").collect();
    
    let queryBuilder;
    if (args.startDate || args.endDate) {
      queryBuilder = ctx.db.query("transactions").withIndex("by_createdAt", (q) =>
        q.gte("createdAt", start).lte("createdAt", end)
      );
    } else {
      queryBuilder = ctx.db.query("transactions");
    }
    const allTx = await queryBuilder.order("desc").collect();

    const applyFilters = (txs: any[]) => {
      return txs.filter((s) => {
        if (args.statusFilter && args.statusFilter !== "All Status") {
          if (s.status !== args.statusFilter) return false;
        }

        if (args.paymentFilter && args.paymentFilter !== "All Methods") {
          const matchesPayment = (s.paymentBreakdown || []).some((p: any) => p.method === args.paymentFilter);
          if (!matchesPayment) return false;
        }

        if (args.tierFilter && args.tierFilter !== "All Tiers") {
          const computedTier = (s.customerTier || "").toLowerCase();
          const isWalkIn = !s.customerId || s.customerName === "Walk-in" || !s.customerName;
          if (args.tierFilter === "Walk-in") {
            if (!isWalkIn) return false;
          } else if (args.tierFilter === "VIP / Platinum") {
            if (isWalkIn || (computedTier !== "vip" && computedTier !== "platinum")) return false;
          } else if (args.tierFilter === "Gold / Premium") {
            if (isWalkIn || (computedTier !== "gold" && computedTier !== "premium")) return false;
          } else if (args.tierFilter === "Standard / Regular") {
            if (isWalkIn || (computedTier !== "standard" && computedTier !== "regular")) return false;
          }
        }

        const min = args.minAmount ? parseFloat(args.minAmount) : -Infinity;
        const max = args.maxAmount ? parseFloat(args.maxAmount) : Infinity;
        if (s.total < min || s.total > max) return false;

        return true;
      });
    };

    const filteredSales = applyFilters(allTx);

    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.total, 0);
    const totalProfit = filteredSales.reduce((acc, s) => acc + s.profit, 0);

    const clientIds = new Set();
    let walkInCount = 0;
    filteredSales.forEach((s) => {
      if (s.customerId) clientIds.add(s.customerId);
      else walkInCount++;
    });
    const activeClients = clientIds.size + (walkInCount > 0 ? 1 : 0);
    const avgTransaction = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;

    const brief = await ctx.db.query("financialCounters").withIndex("by_counter_id", (q) => q.eq("id", "main")).first();
    const estimatedValuation = brief?.totalCustomerCredit || 0;

    const totalPending = filteredSales.reduce((acc, s) => {
      const amountReceived = s.amountReceived || 0;
      const pending = s.total - amountReceived;
      return acc + (pending > 0 ? pending : 0);
    }, 0);

    const dynamicKPIs = {
      totalRevenue,
      totalProfit,
      activeClients,
      avgTransaction,
      estimatedValuation,
      totalPending,
    };

    let trends = { revenue: 0, profit: 0, activeClients: 0, avgTransaction: 0, totalPending: 0 };
    if (start > 0 && end < Infinity) {
      const duration = end - start;
      const prevEnd = start - 1;
      const prevStart = start - duration;

      const prevTxRaw = await ctx.db.query("transactions")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", prevStart).lte("createdAt", prevEnd))
        .collect();
      const prevSales = applyFilters(prevTxRaw);

      const prevRevenue = prevSales.reduce((acc, s) => acc + s.total, 0);
      const prevProfit = prevSales.reduce((acc, s) => acc + s.profit, 0);
      const prevAvg = prevSales.length > 0 ? prevRevenue / prevSales.length : 0;

      const prevClientIds = new Set();
      let prevWalkIn = 0;
      prevSales.forEach((s) => {
        if (s.customerId) prevClientIds.add(s.customerId);
        else prevWalkIn++;
      });
      const prevClientsCount = prevClientIds.size + (prevWalkIn > 0 ? 1 : 0);

      const prevPending = prevSales.reduce((acc, s) => {
        const amountReceived = s.amountReceived || 0;
        const pending = s.total - amountReceived;
        return acc + (pending > 0 ? pending : 0);
      }, 0);

      const calculatePercentChange = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 1000) / 10;
      };

      trends = {
        revenue: calculatePercentChange(totalRevenue, prevRevenue),
        profit: calculatePercentChange(totalProfit, prevProfit),
        activeClients: calculatePercentChange(activeClients, prevClientsCount),
        avgTransaction: calculatePercentChange(avgTransaction, prevAvg),
        totalPending: calculatePercentChange(totalPending, prevPending),
      };
    }

    const getSparklineDataForMetric = (metric: "total" | "profit" | "count") => {
      if (filteredSales.length === 0) {
        return Array(6).fill(0).map(() => ({ value: 0 }));
      }
      const actualStart = start > 0 ? start : Math.min(...filteredSales.map((s) => s.createdAt || s._creationTime));
      const actualEnd = end < Infinity ? end : Math.max(...filteredSales.map((s) => s.createdAt || s._creationTime));
      const interval = (actualEnd - actualStart) / 6 || 1;

      return Array(6).fill(0).map((_, i) => {
        const intervalStart = actualStart + i * interval;
        const intervalEnd = intervalStart + interval;
        const salesInInterval = filteredSales.filter(
          (s) => (s.createdAt || s._creationTime) >= intervalStart && (s.createdAt || s._creationTime) <= intervalEnd
        );
        let value = 0;
        if (metric === "total") {
          value = salesInInterval.reduce((acc, s) => acc + s.total, 0);
        } else if (metric === "profit") {
          value = salesInInterval.reduce((acc, s) => acc + s.profit, 0);
        } else {
          value = salesInInterval.length;
        }
        return { value };
      });
    };

    const sparklines = {
      total: getSparklineDataForMetric("total"),
      profit: getSparklineDataForMetric("profit"),
      count: getSparklineDataForMetric("count"),
    };

    const formatDateKey = (timestamp: number, format: "hour" | "day" | "date" | "month") => {
      const d = new Date(timestamp);
      if (format === "hour") return `${d.getHours().toString().padStart(2, "0")}:00`;
      if (format === "day") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
      if (format === "date") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    };

    let format: "hour" | "day" | "date" | "month" = "month";
    let durationDays = 30;
    if (start > 0 && end < Infinity) {
      durationDays = (end - start) / (1000 * 60 * 60 * 24);
      if (durationDays <= 2) format = "hour";
      else if (durationDays <= 8) format = "day";
      else if (durationDays <= 35) format = "date";
    }

    const dataMap: Record<string, { name: string; revenue: number; profit: number; orders: number }> = {};
    if (format === "hour") {
      for (let i = 0; i < 24; i += 2) {
        const key = `${i.toString().padStart(2, "0")}:00`;
        dataMap[key] = { name: key, revenue: 0, profit: 0, orders: 0 };
      }
    } else if (format === "day") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const current = new Date(start > 0 ? start : Date.now() - 6 * 24 * 3600 * 1000);
      for (let i = 0; i < 7; i++) {
        const key = days[current.getDay()];
        dataMap[key] = { name: key, revenue: 0, profit: 0, orders: 0 };
        current.setDate(current.getDate() + 1);
      }
    } else if (format === "date") {
      const current = new Date(start > 0 ? start : Date.now() - 29 * 24 * 3600 * 1000);
      const limit = new Date(end < Infinity ? end : Date.now());
      let count = 0;
      while (current <= limit && count < 32) {
        const key = formatDateKey(current.getTime(), "date");
        dataMap[key] = { name: key, revenue: 0, profit: 0, orders: 0 };
        current.setDate(current.getDate() + 1);
        count++;
      }
    } else {
      const monthsSet = new Set<string>();
      filteredSales.forEach((s) => monthsSet.add(formatDateKey(s._creationTime, "month")));
      if (monthsSet.size === 0) {
        const current = new Date();
        for (let i = 0; i < 6; i++) {
          monthsSet.add(formatDateKey(current.getTime(), "month"));
          current.setMonth(current.getMonth() - 1);
        }
      }
      Array.from(monthsSet).reverse().forEach((key) => {
        dataMap[key] = { name: key, revenue: 0, profit: 0, orders: 0 };
      });
    }

    filteredSales.forEach((s) => {
      const key = formatDateKey(s._creationTime, format);
      if (!dataMap[key]) dataMap[key] = { name: key, revenue: 0, profit: 0, orders: 0 };
      dataMap[key].revenue += s.total;
      dataMap[key].profit += s.profit;
      dataMap[key].orders += 1;
    });

    const dynamicRevenueHistory = Object.values(dataMap);

    const categoryCounts: Record<string, number> = {};
    let totalItems = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item: any) => {
        const p = products.find((prod) => prod._id === item.productId);
        const category = p?.category || "Other";
        categoryCounts[category] = (categoryCounts[category] || 0) + item.quantity;
        totalItems += item.quantity;
      });
    });

    const dynamicCategoryDistribution = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      value: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0,
      count,
    })).sort((a, b) => b.value - a.value);

    const methodCounts: Record<string, number> = {};
    let totalPaid = 0;
    filteredSales.forEach((s) => {
      if (s.paymentBreakdown && s.paymentBreakdown.length > 0) {
        s.paymentBreakdown.forEach((p: any) => {
          methodCounts[p.method] = (methodCounts[p.method] || 0) + p.amount;
          totalPaid += p.amount;
        });
      } else if (s.paymentMethod) {
        methodCounts[s.paymentMethod] = (methodCounts[s.paymentMethod] || 0) + s.total;
        totalPaid += s.total;
      }
    });

    const dynamicPayoutDistribution = Object.entries(methodCounts).map(([name, amount]) => ({
      name,
      amount,
      value: totalPaid > 0 ? Math.round((amount / totalPaid) * 100) : 0,
    })).sort((a, b) => b.value - a.value);

    const topItemCounts: Record<string, { name: string; count: number }> = {};
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item: any) => {
        if (!topItemCounts[item.productId]) {
          const p = products.find((prod) => prod._id === item.productId);
          topItemCounts[item.productId] = { name: p?.name || item.name || "Unknown", count: 0 };
        }
        topItemCounts[item.productId].count += item.quantity;
      });
    });

    const topSellingItems = Object.values(topItemCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      dynamicKPIs,
      trends,
      sparklines,
      dynamicRevenueHistory,
      dynamicCategoryDistribution,
      dynamicPayoutDistribution,
      topSellingItems,
    };
  },
});

