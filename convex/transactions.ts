import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { recomputeCustomerIntelligence } from "./intelligence";
import { normalizePaymentMethod } from "./utils";
import { applyLedgerEntry, recomputeCustomerBalanceForCustomer } from "./ledgerHelpers";
import { processCashPayment, validateCaixaForCash, getActiveCaixaSession, resolveCaixaSession } from "./caixaHelpers";
import { updateDailyMovementStats } from "./utils";
import { requireUser } from "./authHelpers";
import { updateInventoryCountersHelper } from "./products";
import { updateFinancialStats } from "./analyticsHelpers";
import { deriveSettlementStatus, getTransactionBalance } from "./salesService";
import { createDebt } from "./customerService";

export async function updateFinancialCountersHelper(ctx: any, args: { diffCredit?: number, diffDebt?: number, diffOverdue?: number, diffOverdueAccounts?: number, recoveredDebt?: number, creditUsed?: number }) {
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

  const transactionIds = transactions.map((tx) => tx._id);

  const [customers, products, paymentsPerTx] = await Promise.all([
    Promise.all(customerIds.map((id) => ctx.db.get(id))),
    Promise.all(productIds.map((id) => ctx.db.get(id))),
    Promise.all(
      transactionIds.map((id) =>
        ctx.db.query("payments").withIndex("by_transaction", (q: any) => q.eq("transactionId", id)).collect()
      )
    ),
  ]);

  const customerMap = new Map(customers.filter(Boolean).map((c: any) => [c._id, c]));
  const productMap = new Map(products.filter(Boolean).map((p: any) => [p._id, p]));
  const paymentsMap = new Map(transactionIds.map((id, i) => [id, paymentsPerTx[i]]));

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

    // payments is the single source of truth for "how much has this sale paid" — never
    // derived from a cached transaction field or from customer.debitBalance. This
    // reflects manual payments recorded after checkout too, unlike paymentBreakdown,
    // which is a frozen checkout-time snapshot only.
    const { totalPaid, outstanding: balance } = getTransactionBalance(tx, paymentsMap.get(tx._id) || []);

    return {
      ...tx,
      items: itemsWithDetails,
      customerName: customerName || "Walk-in",
      customerTier: customerTier || "Regular",
      paymentStatus: balance === 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Pending",
      balance,
      paymentMethod:
        !tx.paymentBreakdown || tx.paymentBreakdown.length === 0
          ? "Unpaid"
          : tx.paymentBreakdown.length === 1
            ? tx.paymentBreakdown[0].method
            : "Split",
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
    addRemainingToAccount: v.optional(v.boolean()), // opt-in: convert an underpaid customer-linked sale's shortfall into account debt
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

    const { status, settlementType } = deriveSettlementStatus(args.total, args.amountReceived);

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

      // Incremental application of the same canonical rules used everywhere else
      // (applyLedgerEntry) — computed in memory, no extra reads, exactly one patch.
      let balance = { creditBalance: customer.creditBalance || 0, debitBalance: customer.debitBalance || 0 };

      const storeCreditUsed = args.paymentBreakdown
        .filter(p => p.method === "Store Credit")
        .reduce((sum, p) => sum + p.amount, 0);

      if (storeCreditUsed > 0) {
        if (balance.creditBalance < storeCreditUsed) {
          throw new ConvexError("Insufficient store credit to cover payment amount.");
        }
        balance = applyLedgerEntry(balance, { type: "USE_CREDIT", amount: storeCreditUsed });
      }

      if (isOverpayment && args.changeHandling === "Store Credit") {
        balance = applyLedgerEntry(balance, { type: "CREDIT", amount: change });
      } else if (isUnderpayment && args.addRemainingToAccount === true) {
        // A shortfall never becomes debt automatically — the cashier must opt in via
        // addRemainingToAccount, otherwise the sale is simply left Partially Paid/Pending
        // with no account effect (see transactions.addRemainingToCustomerAccount for the
        // post-hoc path). When it IS opted in, the shortfall must never reach into whatever
        // unrelated store credit the customer happens to already be holding — using existing
        // credit to pay is only ever done explicitly, via a "Store Credit" paymentBreakdown
        // entry (handled above), which is auditable through payments/ledger.
        balance = applyLedgerEntry(balance, { type: "DEBIT", amount: Math.abs(change) });
      }

      newCreditBalance = balance.creditBalance;
      newDebitBalance = balance.debitBalance;

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
      if (isUnderpayment && args.addRemainingToAccount === true) {
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
      settlementType,
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
      debtAddedToAccount: isUnderpayment && args.addRemainingToAccount === true,
      createdAt: now,
      updatedAt: now,
    });

    // First adjust by store credit used (withdrawal from customer credit)
    const storeCreditUsed = args.paymentBreakdown
      .filter(p => p.method === "Store Credit")
      .reduce((sum, p) => sum + p.amount, 0);

    // Audit-trail entries only, from here down — the customer's balance for this sale
    // (store credit used, overpayment-as-credit, underpayment-as-debt) was already fully
    // computed and patched once above (newCreditBalance/newDebitBalance). None of these
    // ledger writes may go through applyCustomerLedger: it re-fetches the customer's
    // (already-updated) balance and reconciles again, silently doubling the effect.
    if (args.customerId && storeCreditUsed > 0) {
      await ctx.db.insert("ledger", {
        customerId: args.customerId,
        sessionId: session._id,
        type: "USE_CREDIT",
        amount: storeCreditUsed,
        balanceAfter: { credit: newCreditBalance, debit: newDebitBalance },
        referenceId: transactionId,
        referenceType: "transaction",
        description: `Used store credit for ${finalReceiptNumber}`,
        createdAt: now,
      });
    }

    // A. Ledger: SALE
    if (args.customerId) {
      await ctx.db.insert("ledger", {
        customerId: args.customerId,
        sessionId: session._id,
        type: "SALE",
        amount: args.total,
        balanceAfter: { credit: newCreditBalance, debit: newDebitBalance },
        referenceId: transactionId,
        referenceType: "transaction",
        description: `Sale ${finalReceiptNumber}`,
        createdAt: now,
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
        source: "checkout",
        createdAt: now,
        updatedAt: now,
      });

      if (args.customerId) {
        // Audit-trail only — the sale's effect on credit/debt is already fully
        // accounted for above (store credit used, overpayment/underpayment).
        // PAYMENT_LOG is always balance-neutral (see applyLedgerEntry) — distinct
        // from "PAYMENT", which means a real manual debt-recovery deposit
        // (payments.ts addPayment) and DOES affect balance.
        await ctx.db.insert("ledger", {
          customerId: args.customerId,
          sessionId: session._id,
          type: "PAYMENT_LOG",
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

    // 6. Ledger: Change Handling (REFUND or CREDIT) / Underpayment (DEBIT) — audit only,
    // see note above; the balance change itself was already applied earlier.
    if (args.customerId) {
      if (isOverpayment) {
        const changeType = args.changeHandling === "Store Credit" ? "CREDIT" : "REFUND";
        await ctx.db.insert("ledger", {
          customerId: args.customerId,
          sessionId: session._id,
          type: changeType,
          amount: change,
          balanceAfter: { credit: newCreditBalance, debit: newDebitBalance },
          referenceId: transactionId,
          referenceType: "transaction",
          description: `${changeType === "CREDIT" ? "Store Credit" : "Change Refund"} for ${finalReceiptNumber}`,
          createdAt: now,
        });
      } else if (isUnderpayment && args.addRemainingToAccount === true) {
        await ctx.db.insert("ledger", {
          customerId: args.customerId,
          sessionId: session._id,
          type: "DEBIT",
          amount: Math.abs(change),
          balanceAfter: { credit: newCreditBalance, debit: newDebitBalance },
          referenceId: transactionId,
          referenceType: "transaction",
          description: `Outstanding balance for ${finalReceiptNumber}`,
          createdAt: now,
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

    // paymentBreakdown is the full, only payment set at creation time (no other
    // payments row can exist yet), so it's equivalent to a live query here.
    const totalPendingAmount = getTransactionBalance({ total: args.total }, args.paymentBreakdown).outstanding;

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

    // Reverse cash for any MANUAL payments recorded after checkout (each one has its
    // own caixaMovements entry, in whatever session was active when it was recorded —
    // possibly a different, already-closed session than the one below). The checkout's
    // own cash contribution is reversed separately below via paymentBreakdown, which
    // nets out any cash change given back; manual payments have no such complexity.
    for (const payment of payments) {
      if (payment.source === "manual" && payment.paymentMethod.toLowerCase() === "cash") {
        await processCashPayment(ctx.db, {
          amount: payment.amount,
          type: "CASH_OUT",
          description: `Reversal of manual payment for transaction ${transaction.receiptNumber} (deleted)`,
          userId: user.username,
          timestamp: Date.now(),
          referenceId: payment._id,
          referenceType: "payment",
        });
      }
    }

    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }

    // 4. Delete Ledger Entries tied to this transaction/its payments, then recompute
    // the customer's balance from whatever history remains. A full replay is the only
    // mathematically correct reversal here — balance is order/state-dependent (a DEBIT
    // is a pure add, but CREDIT/PAYMENT net through existing debt), so there's no valid
    // "inverse delta" for a deleted entry. This is also guaranteed consistent with
    // `create`'s forward logic, since both funnel through the same applyLedgerEntry.
    if (transaction.customerId) {
      const customerLedgers = await ctx.db
        .query("ledger")
        .withIndex("by_customer", (q) => q.eq("customerId", transaction.customerId))
        .collect();

      for (const entry of customerLedgers) {
        if (entry.referenceId === args.id || (entry.referenceId && paymentIds.includes(entry.referenceId as any))) {
          await ctx.db.delete(entry._id);
        }
      }

      await recomputeCustomerBalanceForCustomer(ctx.db, transaction.customerId);
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

    // Derived from the live payments this transaction actually had (fetched above,
    // before they were deleted) — not transaction.amountReceived, which is only a
    // checkout-time snapshot and would miss any manual payments recorded afterward.
    const totalPendingAmount = getTransactionBalance(transaction, payments).outstanding;

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

// Post-hoc opt-in: converts an already-outstanding sale's live remaining balance into
// account-level debt. This is the alternative to opting in at checkout time
// (create's addRemainingToAccount). Once this runs, the sale switches from "sale mode"
// (payments.recordSalePayment) to "account mode" (payments.addPayment) for further
// recovery — see transaction.debtAddedToAccount.
export const addRemainingToCustomerAccount = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx.db, ctx);
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Unauthorized. Only admins and managers can add a balance to a customer's account.");
    }

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) throw new Error("Transaction not found");
    if (!transaction.customerId) throw new Error("This sale has no linked customer — walk-in sales cannot carry account debt.");
    if (transaction.debtAddedToAccount) throw new Error("This sale's balance has already been added to the customer's account.");

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .collect();
    const { outstanding } = getTransactionBalance(transaction, payments);
    if (outstanding <= 0) throw new Error("This sale has no outstanding balance to add.");

    const now = Date.now();
    const session = await resolveCaixaSession(ctx.db, now);

    await createDebt(ctx.db, transaction.customerId, outstanding, {
      description: `Outstanding balance added to account for ${transaction.receiptNumber}`,
      referenceId: args.transactionId,
      referenceType: "transaction",
      sessionId: session._id,
    });

    await ctx.db.patch(args.transactionId, { debtAddedToAccount: true, updatedAt: now });

    await updateFinancialCountersHelper(ctx, { diffDebt: outstanding });

    await recomputeCustomerIntelligence(ctx.db, transaction.customerId);

    return { outstanding };
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

    // Same formula as hydrateTransactions/getTransactionBalance — outstanding is always
    // SUM(payments), never re-derived from a cached field, so this report can't drift
    // from what the Sales table itself shows.
    const sumOutstanding = async (txs: any[]) => {
      const ids = txs.map((s) => s._id);
      const paymentsPerTx = await Promise.all(
        ids.map((id) =>
          ctx.db.query("payments").withIndex("by_transaction", (q) => q.eq("transactionId", id)).collect()
        )
      );
      const paymentsMap = new Map(ids.map((id, i) => [id, paymentsPerTx[i]]));
      return txs.reduce((acc, s) => acc + getTransactionBalance(s, paymentsMap.get(s._id) || []).outstanding, 0);
    };

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

    const totalPending = await sumOutstanding(filteredSales);

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

      const prevPending = await sumOutstanding(prevSales);

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

