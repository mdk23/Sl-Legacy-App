import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    code: v.string(), // SKU or Product ID
    name: v.string(),
    category: v.string(),
    costPrice: v.number(),
    sellingPrice: v.number(),
    stock: v.number(),
    reservedUntil: v.optional(v.number()), // Timestamp
    reorderLevel: v.number(),
    archived: v.boolean(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_code", ["code"])
    .index("by_category", ["category"])
    .index("by_archived", ["archived"])
    .index("by_createdAt", ["createdAt"]),

  customers: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    phone1: v.string(),
    phone2: v.optional(v.string()),
    phone3: v.optional(v.string()),
    email: v.optional(v.string()),
    customerType: v.optional(v.string()), // "Walk-in", "Registered", "B2B"
    creditStatus: v.optional(v.string()), // "Good Standing", "Outstanding", "Overdue"
    customerHealth: v.optional(v.string()), // "New Client", "At Risk", "Growing Client", "Valuable Client", "Elite Client"
    totalSpent: v.number(),
    creditBalance: v.optional(v.number()),
    debitBalance: v.optional(v.number()),
    orderCount: v.optional(v.number()),
    lastPurchaseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_last_name", ["lastName"])
    .index("by_phone", ["phone1"])
    .index("by_totalSpent", ["totalSpent"])
    .index("by_createdAt", ["createdAt"]),

  transactions: defineTable({
    customerId: v.optional(v.id("customers")),
    receiptNumber: v.optional(v.string()),
    subtotal: v.number(),
    discount: v.number(),
    taxes: v.number(),
    total: v.number(),
    profit: v.number(),
    cashierName: v.string(),
    status: v.string(), // "Completed", "Partially Paid", "Pending"
    settlementType: v.string(), // "Fully Paid", "Partially Paid", "Pending"
    deliveryStatus: v.string(), // "Pending", "Shipped", "Delivered"
    paymentBreakdown: v.array(
      v.object({
        method: v.string(), // "M-Pesa", "e-Mola", "BCI", "BIM Cash", "Card"
        amount: v.number(),
      })
    ),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        price: v.number(), // Price at time of sale
        name: v.optional(v.string()), // Denormalized product name
        photo: v.optional(v.string()), // Denormalized product image
      })
    ),
    refundedAmount: v.number(),
    amountReceived: v.optional(v.number()),
    changeGiven: v.optional(v.number()),
    changeHandling: v.optional(v.string()),
    notes: v.optional(v.string()),
    customerName: v.optional(v.string()), // Denormalized customer name
    customerTier: v.optional(v.string()), // Denormalized customer tier
    sessionId: v.optional(v.id("caixaSessions")),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_receipt", ["receiptNumber"])
    .index("by_customer", ["customerId"])
    .index("by_session", ["sessionId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_userId", ["cashierName"]),

  payments: defineTable({
    transactionId: v.id("transactions"),
    customerId: v.optional(v.id("customers")),
    sessionId: v.id("caixaSessions"),
    amount: v.number(),
    paymentMethod: v.string(),
    reference: v.optional(v.string()), // Transaction reference from provider
    paymentDate: v.number(), // Timestamp
    status: v.string(), // "Completed", "Pending", "Failed"
    notes: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_transaction", ["transactionId"])
    .index("by_customer", ["customerId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_session", ["sessionId"]),

  inventoryMovements: defineTable({
    productId: v.id("products"),
    movementType: v.string(), // "Sale", "Adjustment", "Damage", "Return", "Manual Correction"
    quantity: v.number(), // Positive for stock in, negative for stock out
    previousStock: v.number(),
    newStock: v.number(),
    reason: v.string(),
    userId: v.optional(v.string()), // Tracks cashier/user making the adjustment
    createdAt: v.number(), // Timestamp
    updatedAt: v.optional(v.number()),
  }).index("by_product", ["productId"])
    .index("by_type", ["movementType"])
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  ledger: defineTable({
    customerId: v.optional(v.id("customers")),
    sessionId: v.optional(v.id("caixaSessions")),
    type: v.string(), // "CREDIT", "DEBIT", "PAYMENT", "REFUND", "SALE"
    amount: v.number(),
    balanceAfter: v.object({
      credit: v.number(),
      debit: v.number(),
    }),
    referenceId: v.optional(v.string()), // Transaction or Payment ID
    referenceType: v.optional(v.string()), // "transaction" | "payment" | "caixaMovement"
    description: v.string(),
    createdAt: v.number(), // Timestamp
    updatedAt: v.optional(v.number()),
  }).index("by_customer", ["customerId"])
    .index("by_type", ["type"])
    .index("by_session", ["sessionId"])
    .index("by_reference", ["referenceType", "referenceId"]),

  caixaSessions: defineTable({
    openedBy: v.string(), // User ID or Name
    openedAt: v.number(), // Timestamp
    closedAt: v.optional(v.number()), // Timestamp
    openingAmount: v.number(),
    status: v.string(), // "OPEN", "CLOSED"
    expectedCash: v.number(), // Live computed field
    countedCash: v.optional(v.number()),
    variance: v.optional(v.number()),
    totalCashSales: v.number(),
    totalCashIn: v.number(),
    totalCashOut: v.number(),
    closingNote: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_status", ["status"])
    .index("by_openedAt", ["openedAt"])
    .index("by_userId", ["openedBy"]),

  caixaMovements: defineTable({
    sessionId: v.id("caixaSessions"),
    type: v.string(), // "OPENING", "SALE", "CASH_IN", "CASH_OUT", "SALE_REVERSAL", "CLOSING", "ADJUSTMENT"
    amount: v.number(),
    referenceId: v.optional(v.string()), // orderId, paymentId, etc.
    referenceType: v.optional(v.string()), // "transaction" | "payment" | "session"
    description: v.string(),
    userId: v.string(),
    timestamp: v.number(),
    runningBalance: v.number(),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_session", ["sessionId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_type", ["type"])
    .index("by_userId", ["userId"])
    .index("by_reference", ["referenceType", "referenceId"]),

  auditLogs: defineTable({
    userId: v.string(),
    timestamp: v.number(),
    action: v.string(),
    beforeValue: v.optional(v.any()),
    afterValue: v.optional(v.any()),
    referenceId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  }).index("by_timestamp", ["timestamp"])
    .index("by_action", ["action"])
    .index("by_reference", ["referenceId"]),

  dailyStats: defineTable({
    date: v.string(), // "YYYY-MM-DD" format
    totalRevenue: v.number(),
    totalProfit: v.number(),
    transactionCount: v.number(),
    itemsSold: v.number(),
    totalPending: v.optional(v.number()),
    paymentsByMethod: v.optional(v.any()),
    salesByCategory: v.optional(v.any()),
    totalOrders: v.optional(v.number()),
    completedOrders: v.optional(v.number()),
    pendingOrders: v.optional(v.number()),
    cancelledOrders: v.optional(v.number()),
    refundedOrders: v.optional(v.number()),
    averageOrderValue: v.optional(v.number()),
    damagedItems: v.optional(v.number()),
    returnedItems: v.optional(v.number()),
    adjustedItems: v.optional(v.number()),
    manualCorrections: v.optional(v.number()),
    newCustomers: v.optional(v.number()),
    returningCustomers: v.optional(v.number()),
    fullyPaidOrders: v.optional(v.number()),
    partiallyPaidOrders: v.optional(v.number()),
    creditIssuedToday: v.optional(v.number()),
    creditRedeemedToday: v.optional(v.number()),
    debtCreatedToday: v.optional(v.number()),
    debtRecoveredToday: v.optional(v.number()),
    refundAmount: v.optional(v.number()),
    cashSales: v.optional(v.number()),
    cashIn: v.optional(v.number()),
    cashOut: v.optional(v.number()),
    inventoryCostSold: v.optional(v.number()),
    inventoryRetailSold: v.optional(v.number()),
    totalExpensesToday: v.optional(v.number()),
    expensesPaidToday: v.optional(v.number()),
  }).index("by_date", ["date"]),

  globalCounters: defineTable({
    id: v.string(), // e.g. "main"
    transactionCount: v.number(),
    totalRevenue: v.number(),
    totalProfit: v.number(),
    activeClients: v.number(),
    inventoryValuation: v.optional(v.number()),
    totalOrders: v.optional(v.number()),
    completedOrders: v.optional(v.number()),
    pendingOrders: v.optional(v.number()),
    cancelledOrders: v.optional(v.number()),
    refundedOrders: v.optional(v.number()),
    averageOrderValue: v.optional(v.number()),
    totalRefundAmount: v.optional(v.number()),
    totalCreditIssued: v.optional(v.number()),
    totalCreditRedeemed: v.optional(v.number()),
    totalDebtCreated: v.optional(v.number()),
    totalDebtRecovered: v.optional(v.number()),
    totalExpenses: v.optional(v.number()),
    totalExpensesPaid: v.optional(v.number()),
  }).index("by_counter_id", ["id"]),

  inventoryCounters: defineTable({
    id: v.string(), // "main"
    totalProducts: v.number(),
    totalUnitsInStock: v.number(),
    inventoryValue: v.number(),
    lowStockItems: v.number(),
    outOfStockItems: v.number(),
    deadStockItems: v.number(),
    reservedStock: v.number(),
  }).index("by_counter_id", ["id"]),

  customerCounters: defineTable({
    id: v.string(), // "main"
    totalCustomers: v.number(),
    activeCustomers: v.number(),
    inactiveCustomers: v.number(),
    newClients: v.optional(v.number()),
    atRiskClients: v.optional(v.number()),
    growingClients: v.optional(v.number()),
    valuableClients: v.optional(v.number()),
    eliteClients: v.optional(v.number()),
    customersWithCredit: v.number(),
    customersWithDebt: v.number(),
    overdueCustomers: v.number(),
  }).index("by_counter_id", ["id"]),

  customerCounterHistory: defineTable({
    date: v.string(), // "YYYY-MM-DD" (UTC), one row per day
    totalCustomers: v.number(),
    eliteValuableCount: v.number(),
    frequentBuyerCount: v.number(),
    totalDebt: v.number(),
    avgLTV: v.number(),
  }).index("by_date", ["date"]),

  financialCounters: defineTable({
    id: v.string(), // "main" or "YYYY-MM"
    totalCustomerCredit: v.number(),
    totalCustomerDebt: v.number(),
    overdueDebtAmount: v.number(),
    overdueAccounts: v.number(),
    debtRecoveredThisMonth: v.optional(v.number()),
    creditUsedThisMonth: v.optional(v.number()),
  }).index("by_counter_id", ["id"]),

  productCounters: defineTable({
    productId: v.id("products"),
    productName: v.string(),
    totalSold: v.number(),
    totalRevenue: v.number(),
    totalProfit: v.number(),
    lastSoldAt: v.optional(v.number()),
  }).index("by_productId", ["productId"]),

  cashierCounters: defineTable({
    userId: v.string(),
    salesCount: v.number(),
    totalRevenue: v.number(),
    totalProfit: v.number(),
    averageOrderValue: v.number(),
    refundsProcessed: v.number(),
    lastSaleAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  users: defineTable({
    clerkId: v.optional(v.string()),
    username: v.string(),
    passwordHash: v.optional(v.string()),
    role: v.string(), // "admin", "manager", "POS"
    blocked: v.optional(v.boolean()),
  }).index("by_username", ["username"])
    .index("by_clerkId", ["clerkId"]),

  expenseTemplates: defineTable({
    name: v.string(),
    category: v.string(),
    amount: v.number(),
    frequency: v.string(), // "Daily" | "Weekly" | "Monthly"
    dueDay: v.optional(v.number()), // 1-31; used when frequency === "Monthly", clamped to the last day of the month when shorter
    dayOfWeek: v.optional(v.number()), // 0 (Sunday) - 6 (Saturday); used when frequency === "Weekly"
    startDate: v.number(), // timestamp; no generation before this date
    endDate: v.optional(v.number()), // timestamp; no generation after this date if set
    active: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_active", ["active"])
    .index("by_category", ["category"]),

  expenses: defineTable({
    templateId: v.optional(v.id("expenseTemplates")), // set only for Recurring-origin rows; never mutated after insert
    title: v.string(),
    category: v.string(),
    amount: v.number(),
    dueDate: v.number(), // timestamp
    paymentDate: v.optional(v.number()), // set exactly once at payExpense() time
    status: v.string(), // "Pending" | "Paid" | "Cancelled" | "Overdue"
    paymentMethod: v.optional(v.string()), // set at payExpense() time only
    origin: v.string(), // "Manual" | "Recurring" — denormalized at insert, immutable
    notes: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_status_and_dueDate", ["status", "dueDate"])
    .index("by_dueDate", ["dueDate"])
    .index("by_category", ["category"])
    .index("by_templateId_and_dueDate", ["templateId", "dueDate"])
    .index("by_paymentDate", ["paymentDate"])
    .index("by_origin", ["origin"]),

  expenseCounters: defineTable({
    id: v.string(), // "main" (all-time) | "YYYY-MM" (per calendar month, bucketed by expense.dueDate's month)
    totalCount: v.optional(v.number()),
    paidCount: v.optional(v.number()),
    pendingCount: v.optional(v.number()),
    overdueCount: v.optional(v.number()),
    cancelledCount: v.optional(v.number()),
    paidAmount: v.optional(v.number()), // the only figure that counts as "spent" per the financial rules
    pendingAmount: v.optional(v.number()),
    overdueAmount: v.optional(v.number()),
    expensesByCategory: v.optional(v.any()), // Record<category, paidAmount> — Paid-only
    recurringCount: v.optional(v.number()),
    manualCount: v.optional(v.number()),
  }).index("by_counter_id", ["id"]),
});
