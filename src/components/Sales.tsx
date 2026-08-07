"use client";

import React, { useState, useMemo } from "react";
import { Download, Plus } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

import { SalesFilters } from "./sales/SalesFilters";
import { SalesKPIs } from "./sales/SalesKPIs";
import { SalesCharts } from "./sales/SalesCharts";
import { SalesTable } from "./sales/SalesTable";
import { SaleDetailDrawer } from "./sales/SaleDetailDrawer";
import { NewSaleDrawer } from "./sales/NewSaleDrawer";

export default function Sales() {
  const createTransaction = useMutation(api.transactions.create);
  const removeTransaction = useMutation(api.transactions.remove);

  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [isAddingSale, setIsAddingSale] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All Methods");
  const [tierFilter, setTierFilter] = useState("All Tiers");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lastReceipt, setLastReceipt] = useState("");

  // New Sale Form State
  const [saleForm, setSaleForm] = useState({
    customerId: undefined as string | undefined,
    items: [] as { productId: string; quantity: number; price: number; name: string }[],
    paymentBreakdown: [{ method: "BCI", amount: 0 }],
    discount: 0,
    notes: "",
    changeHandling: "Cash",
  });

  const saleTotals = useMemo(() => {
    const subtotal = saleForm.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const total = subtotal - saleForm.discount;
    return { subtotal, total };
  }, [saleForm.items, saleForm.discount]);

  // 1. Fetch Server-side Metrics consolidated payload
  const metrics = useQuery(api.transactions.getSalesMetrics, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    paymentFilter: paymentFilter || undefined,
    tierFilter: tierFilter || undefined,
    statusFilter: statusFilter || undefined,
    minAmount: minAmount || undefined,
    maxAmount: maxAmount || undefined,
  });

  // Default fallbacks while metrics load
  const dynamicKPIs = metrics?.dynamicKPIs || {
    totalRevenue: 0,
    totalProfit: 0,
    totalPending: 0,
    avgTransaction: 0,
  };
  const trends = metrics?.trends || {
    revenue: 0,
    profit: 0,
    totalPending: 0,
    avgTransaction: 0,
  };
  const sparklines = metrics?.sparklines || {
    total: Array(6).fill(0).map(() => ({ value: 0 })),
    profit: Array(6).fill(0).map(() => ({ value: 0 })),
    count: Array(6).fill(0).map(() => ({ value: 0 })),
  };
  const dynamicRevenueHistory = metrics?.dynamicRevenueHistory || [];
  const dynamicCategoryDistribution = metrics?.dynamicCategoryDistribution || [];
  const dynamicPayoutDistribution = metrics?.dynamicPayoutDistribution || [];
  const topSellingItems = metrics?.topSellingItems || [];

  const getSparklineData = (metric: "total" | "profit" | "count") => {
    return sparklines[metric];
  };

  // 2. Fetch Server-side Filtered and Paginated Transactions
  const {
    results: filteredSales,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.transactions.listFiltered,
    {
      searchQuery: searchQuery || undefined,
      statusFilter: statusFilter || undefined,
      paymentFilter: paymentFilter || undefined,
      tierFilter: tierFilter || undefined,
      minAmount: minAmount || undefined,
      maxAmount: maxAmount || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    { initialNumItems: 15 }
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-MZ", { style: "currency", currency: "MZN" })
      .format(val)
      .replace("MZN", "Mt");

  const handleRegisterSale = async () => {
    // Note: Items creation handles cost price lookup & updates on the server mutator side inside `api.transactions.create`
    try {
      if (saleForm.items.length === 0) {
        toast.error("Cart is empty. Please add boutique pieces.");
        return;
      }

      const totalPaid = saleForm.paymentBreakdown.reduce((acc, p) => acc + p.amount, 0);
      const remainingBalance = saleTotals.total - totalPaid;
      const isCompleted = remainingBalance <= 0;
      const changeGiven = totalPaid > saleTotals.total ? totalPaid - saleTotals.total : 0;

      if (!saleForm.customerId && !isCompleted) {
        toast.error("Walk-in transactions must be fully paid at checkout.");
        return;
      }

      if (!saleForm.customerId && changeGiven > 0 && saleForm.changeHandling === "Store Credit") {
        toast.error("Walk-in customers cannot receive Store Credit. Please select a different change handling method.");
        return;
      }

      const result = await createTransaction({
        customerId: (saleForm.customerId ?? undefined) as any,
        subtotal: saleTotals.subtotal,
        discount: saleForm.discount,
        taxes: 0,
        total: saleTotals.total,
        profit: 0, // Server will resolve costPrice and profit calculation
        cashierName: "System Admin",
        amountReceived: totalPaid,
        changeGiven,
        changeHandling: changeGiven > 0 ? saleForm.changeHandling : undefined,
        deliveryStatus: "Pending",
        paymentBreakdown: saleForm.paymentBreakdown,
        items: saleForm.items.map((it) => ({
          productId: it.productId as any,
          quantity: it.quantity,
          price: it.price,
        })),
        notes: saleForm.notes,
      });

      const receiptNumber = result.receiptNumber;
      setLastReceipt(receiptNumber);
      setIsSuccess(true);

      setSaleForm({
        customerId: undefined,
        items: [],
        paymentBreakdown: [{ method: "BCI", amount: 0 }],
        discount: 0,
        notes: "",
        changeHandling: "Cash",
      });
      toast.success(`Transaction Complete: ${receiptNumber}`);
    } catch (error: any) {
      const errorMessage = error.data || error.message || "Failed to process sale";
      toast.error(typeof errorMessage === "string" ? errorMessage : "Failed to process sale");
    }
  };

  const handleRemoveSale = async (id: string) => {
    toast.warning("Confirm Deletion", {
      description: "This will restore inventory stock for all items in this sale. Proceed?",
      action: {
        label: "Confirm Purge",
        onClick: async () => {
          try {
            await removeTransaction({ id: id as any });
            setSelectedSale(null);
            toast.success("Transaction purged and stock restored");
          } catch (error) {
            toast.error("Failed to remove transaction");
            console.error(error);
          }
        },
      },
    });
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header & Actions */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="font-headline-lg text-4xl text-primary mb-2">Sales Analytics</h1>
          <p className="font-body-md text-on-surface-variant max-w-xl">
            Real-time revenue tracking, transaction management, and boutique performance metrics.
          </p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button className="flex-1 md:flex-none px-6 py-3 bg-white/6 backdrop-blur-md border border-primary/20 text-primary rounded-2xl font-label-caps text-[11px] hover:bg-primary/5 transition-all shadow-sm flex items-center justify-center gap-2">
            <Download size={16} /> EXPORT REPORT
          </button>
          <button
            onClick={() => setIsAddingSale(true)}
            className="flex-1 md:flex-none px-6 py-3 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> NEW SALE
          </button>
        </div>
      </div>

      {/* Advanced Collapsible Filters */}
      <SalesFilters
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        tierFilter={tierFilter}
        setTierFilter={setTierFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        minAmount={minAmount}
        setMinAmount={setMinAmount}
        maxAmount={maxAmount}
        setMaxAmount={setMaxAmount}
        isFiltersExpanded={isFiltersExpanded}
        setIsFiltersExpanded={setIsFiltersExpanded}
      />

      {/* KPI Cards Grid */}
      <SalesKPIs
        dynamicKPIs={dynamicKPIs}
        trends={trends}
        formatCurrency={formatCurrency}
        getSparklineData={getSparklineData}
      />

      {/* Analytical Charts */}
      <SalesCharts
        dynamicRevenueHistory={dynamicRevenueHistory}
        dynamicCategoryDistribution={dynamicCategoryDistribution}
        dynamicPayoutDistribution={dynamicPayoutDistribution}
        topSellingItems={topSellingItems}
        formatCurrency={formatCurrency}
      />

      {/* Transactions Directory Table */}
      <SalesTable
        filteredSales={filteredSales}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isFiltersExpanded={isFiltersExpanded}
        setIsFiltersExpanded={setIsFiltersExpanded}
        onSelectSale={setSelectedSale}
        formatCurrency={formatCurrency}
        paginationStatus={paginationStatus}
        loadMore={loadMore}
      />

      {/* Transaction Details Side Drawer */}
      <AnimatePresence>
        {selectedSale && (
          <SaleDetailDrawer
            selectedSale={selectedSale}
            onClose={() => setSelectedSale(null)}
            onRemoveSale={handleRemoveSale}
            formatCurrency={formatCurrency}
          />
        )}
      </AnimatePresence>

      {/* POS New Sale Side Drawer */}
      <AnimatePresence>
        {isAddingSale && (
          <NewSaleDrawer
            isAddingSale={isAddingSale}
            setIsAddingSale={setIsAddingSale}
            isSuccess={isSuccess}
            setIsSuccess={setIsSuccess}
            lastReceipt={lastReceipt}
            saleForm={saleForm}
            setSaleForm={setSaleForm}
            saleTotals={saleTotals}
            handleRegisterSale={handleRegisterSale}
            formatCurrency={formatCurrency}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
