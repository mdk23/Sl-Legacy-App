"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Bell,
  Download,
  UserPlus,
  Users,
  CreditCard,
  DollarSign,
  Repeat,
  Crown,
  AlertTriangle,
  TrendingUp,
  Info,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

import { KPICard } from "./ui/KPICard";
import { InsightsPanel } from "./customers/InsightsPanel";
import { AdvancedSegmentChart, HEALTH_COLORS, SegmentData } from "./customers/AdvancedSegmentChart";
import { CustomerTable } from "./customers/CustomerTable";
import { CustomerProfileDrawer } from "./customers/CustomerProfileDrawer";
import { CustomerFormDrawer } from "./customers/CustomerFormDrawer";
import { ClientHealthGuideModal } from "./customers/ClientHealthGuideModal";

const HEALTH_LEVELS = ["New Client", "At Risk", "Growing Client", "Valuable Client", "Elite Client"];

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  customerType?: string;
  creditStatus?: string;
  customerHealth?: string;
  totalSpent: number;
  creditBalance?: number;
  debitBalance?: number;
  orderCount: number;
  lastPurchaseDate?: number;
  notes?: string;
}

export default function Customers() {
  const customers = (useQuery(api.customers.list) || []) as Customer[];
  const trendBaseline = useQuery(api.customerCounterHistory.getBaseline);
  const upsertCustomer = useMutation(api.customers.upsert);
  const deleteCustomer = useMutation(api.customers.remove);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [healthFilter, setHealthFilter] = useState("All Health");
  const [creditFilter, setCreditFilter] = useState("All Credits");
  const [showHealthGuide, setShowHealthGuide] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone1: "",
    phone2: "",
    phone3: "",
    email: "",
    notes: "",
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-MZ", { style: "currency", currency: "MZN" })
      .format(val)
      .replace("MZN", "Mt");

  // ── Filtered list ──────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const matchSearch =
        name.includes(searchQuery.toLowerCase()) ||
        c.phone1.includes(searchQuery) ||
        (c.email || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchHealth =
        healthFilter === "All Health" ||
        (c.customerHealth || "New Client").toLowerCase() === healthFilter.toLowerCase();
      const matchCrd =
        creditFilter === "All Credits" ||
        (c.creditStatus || "Good Standing").toLowerCase() === creditFilter.toLowerCase();
      return matchSearch && matchHealth && matchCrd;
    });
  }, [customers, searchQuery, healthFilter, creditFilter]);

  // ── KPIs ───────────────────────────────────────────────
  const pctChange = (current: number, past: number | undefined): number | undefined => {
    if (past === undefined || past <= 0) return undefined;
    return Math.round(((current - past) / past) * 1000) / 10;
  };

  const kpis = useMemo(() => {
    const total = customers.length;
    if (!total)
      return {
        totalCustomers: 0,
        topTierCount: 0,
        topTierPercent: 0,
        frequentBuyerCount: 0,
        totalDebt: 0,
        averageLTV: 0,
        totalCustomersTrend: undefined as number | undefined,
        topTierTrend: undefined as number | undefined,
        frequentBuyerTrend: undefined as number | undefined,
        totalDebtTrend: undefined as number | undefined,
        averageLTVTrend: undefined as number | undefined,
      };
    const topTierCount = customers.filter((c) =>
      ["Elite Client", "Valuable Client"].includes(c.customerHealth || "New Client")
    ).length;
    const frequentBuyerCount = customers.filter((c) => (c.orderCount || 0) >= 20).length;
    const totalDebt = customers.reduce((s, c) => s + (c.debitBalance || 0), 0);
    const averageLTV = Math.round(customers.reduce((s, c) => s + (c.totalSpent || 0), 0) / total);
    return {
      totalCustomers: total,
      topTierCount,
      topTierPercent: Math.round((topTierCount / total) * 100),
      frequentBuyerCount,
      totalDebt,
      averageLTV,
      totalCustomersTrend: pctChange(total, trendBaseline?.totalCustomers),
      topTierTrend: pctChange(topTierCount, trendBaseline?.eliteValuableCount),
      frequentBuyerTrend: pctChange(frequentBuyerCount, trendBaseline?.frequentBuyerCount),
      totalDebtTrend: pctChange(totalDebt, trendBaseline?.totalDebt),
      averageLTVTrend: pctChange(averageLTV, trendBaseline?.avgLTV),
    };
  }, [customers, trendBaseline]);

  // ── Segment aggregations ───────────────────────────────
  const segmentData = useMemo(() => {
    const healthData = HEALTH_LEVELS.map((level) => {
      const group = customers.filter((c) => (c.customerHealth || "New Client") === level);
      const count = group.length;
      const totalSpent = group.reduce((s, c) => s + c.totalSpent, 0);
      return {
        name: level,
        label: level,
        count,
        totalSpent,
        avgSpent: count > 0 ? Math.round(totalSpent / count) : 0,
        color: HEALTH_COLORS[level]?.bar || "#B4832B",
      } as SegmentData;
    });

    return { healthData };
  }, [customers]);

  // ── Auto insights ──────────────────────────────────────
  const insights = useMemo(() => {
    const total = customers.length;
    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0) || 1;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    const newGroup = customers.filter((c) => (c.customerHealth || "New Client") === "New Client");
    const atRiskGroup = customers.filter((c) => c.customerHealth === "At Risk");
    const growingGroup = customers.filter((c) => c.customerHealth === "Growing Client");
    const valuableGroup = customers.filter((c) => c.customerHealth === "Valuable Client");
    const eliteGroup = customers.filter((c) => c.customerHealth === "Elite Client");

    const overdueCount = atRiskGroup.filter((c) => c.creditStatus === "Overdue").length;
    const inactiveOnlyCount = atRiskGroup.length - overdueCount;

    const growingAvgOrders = growingGroup.reduce((s, c) => s + c.orderCount, 0) / (growingGroup.length || 1);
    const growingAvgSpent = growingGroup.reduce((s, c) => s + c.totalSpent, 0) / (growingGroup.length || 1);

    const valuableRev = valuableGroup.reduce((s, c) => s + c.totalSpent, 0);
    const valuableRevPct = Math.round((valuableRev / totalRevenue) * 100);

    const eliteAvgOrders = eliteGroup.reduce((s, c) => s + c.orderCount, 0) / (eliteGroup.length || 1);
    const eliteAvgLTV = eliteGroup.reduce((s, c) => s + c.totalSpent, 0) / (eliteGroup.length || 1);
    const freqMultiplier =
      growingAvgOrders > 0 ? Math.round((eliteAvgOrders / growingAvgOrders) * 10) / 10 : eliteGroup.length > 0 ? 3 : 0;

    const creditGroup = customers.filter((c) => (c.creditBalance || 0) > 0);
    const totalStoreCredit = creditGroup.reduce((s, c) => s + (c.creditBalance || 0), 0);

    return [
      {
        icon: <Users size={14} className="text-slate-500" />,
        text:
          newGroup.length > 0
            ? `${newGroup.length} client${newGroup.length === 1 ? "" : "s"} (${pct(newGroup.length)}%) are New Clients with no purchase history yet — prioritize onboarding to their first sale`
            : `No New Clients right now — every client has at least one purchase on record`,
        color: "border-slate-200/60 bg-slate-50/40",
      },
      {
        icon: <AlertTriangle size={14} className="text-rose-500" />,
        text:
          atRiskGroup.length > 0
            ? `${atRiskGroup.length} client${atRiskGroup.length === 1 ? "" : "s"} (${pct(atRiskGroup.length)}%) are At Risk — ${overdueCount} from overdue debt, ${inactiveOnlyCount} from 90+ days of inactivity`
            : `No clients are At Risk — no overdue debt or prolonged inactivity detected`,
        color: "border-rose-200/60 bg-rose-50/40",
      },
      {
        icon: <TrendingUp size={14} className="text-blue-600" />,
        text:
          growingGroup.length > 0
            ? `${growingGroup.length} Growing clients average ${growingAvgOrders.toFixed(1)} orders and ${formatCurrency(growingAvgSpent)} spent — nurture them toward Valuable status`
            : `No Growing clients yet — clients building purchase frequency or spend will appear here`,
        color: "border-blue-200/60 bg-blue-50/40",
      },
      {
        icon: <DollarSign size={14} className="text-emerald-600" />,
        text:
          valuableGroup.length > 0
            ? `${valuableGroup.length} Valuable clients contribute ${valuableRevPct}% of total revenue through strong purchase frequency or spend`
            : `No Valuable clients yet — strong, debt-free buyers will appear here`,
        color: "border-emerald-200/60 bg-emerald-50/40",
      },
      {
        icon: <Crown size={14} className="text-purple-600" />,
        text:
          eliteGroup.length > 0
            ? `${eliteGroup.length} Elite clients average ${formatCurrency(eliteAvgLTV)} LTV and purchase ${freqMultiplier}× more often than Growing clients`
            : `No Elite clients yet — frequent, high-spending, debt-free buyers will appear here`,
        color: "border-purple-200/60 bg-purple-50/40",
      },
      {
        icon: <CreditCard size={14} className="text-indigo-600" />,
        text:
          creditGroup.length > 0
            ? `${creditGroup.length} client${creditGroup.length === 1 ? "" : "s"} hold ${formatCurrency(totalStoreCredit)} in store credit — a redeemable liability against future purchases`
            : `No store credit currently issued to clients`,
        color: "border-indigo-200/60 bg-indigo-50/40",
      },
    ];
  }, [customers]);

  // ── Handlers ───────────────────────────────────────────
  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ firstName: "", lastName: "", phone1: "", phone2: "", phone3: "", email: "", notes: "" });
    setIsAddingCustomer(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingId(customer._id);
    setFormData({
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone1: customer.phone1,
      phone2: customer.phone2 || "",
      phone3: customer.phone3 || "",
      email: customer.email || "",
      notes: customer.notes || "",
    });
    setIsAddingCustomer(true);
    setSelectedCustomer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertCustomer({
        id: (editingId ?? undefined) as any,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone1: formData.phone1,
        phone2: formData.phone2 || undefined,
        phone3: formData.phone3 || undefined,
        email: formData.email || undefined,
        notes: formData.notes || undefined,
      });
      setIsAddingCustomer(false);
      setEditingId(null);
      toast.success(editingId ? "Client profile updated successfully" : "New client enrolled successfully");
    } catch {
      toast.error("Failed to save customer profile");
    }
  };

  const handleDelete = async (id: string) => {
    toast.warning("Are you sure you want to delete this customer?", {
      description: "This action cannot be undone.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await deleteCustomer({ id: id as any });
            setSelectedCustomer(null);
            toast.success("Customer record purged from boutique database");
          } catch {
            toast.error("Failed to delete customer");
          }
        },
      },
    });
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
        <div className="flex items-center gap-6 w-full md:w-auto">
          <div className="relative group flex-1 md:w-80">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors"
              size={18}
            />
            <input
              type="text"
              placeholder="Search clients, phones, emails…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/6 backdrop-blur-md border border-white/12 rounded-2xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
            />
          </div>
          <button className="p-3 bg-white/6 backdrop-blur-md border border-white/12 rounded-2xl text-primary hover:bg-primary/5 transition-all shadow-sm relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-white" />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap"
          >
            <UserPlus size={16} /> ADD CLIENT
          </button>
          <button className="p-3 bg-white/6 backdrop-blur-md border border-white/12 rounded-2xl text-primary hover:bg-primary/5 transition-all shadow-sm">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* ── KPI Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
        <KPICard
          title="TOTAL CLIENTS"
          value={kpis.totalCustomers.toString()}
          subValue="Active boutique database"
          trend={kpis.totalCustomersTrend}
          icon={Users}
          color="primary"
        />
        <KPICard
          title="ELITE / VALUABLE"
          value={kpis.topTierCount.toString()}
          subValue={`${kpis.topTierPercent}% of customer base`}
          trend={kpis.topTierTrend}
          icon={Crown}
          color="secondary"
        />
        <KPICard
          title="FREQUENT BUYERS"
          value={kpis.frequentBuyerCount.toString()}
          subValue="20+ lifetime orders"
          trend={kpis.frequentBuyerTrend}
          icon={Repeat}
          color="tertiary"
        />
        <KPICard
          title="OUTSTANDING DEBT"
          value={formatCurrency(kpis.totalDebt)}
          subValue="Credits pending payment"
          trend={kpis.totalDebtTrend}
          invertTrendColor
          icon={CreditCard}
          color="error"
        />
        <KPICard
          title="AVG CLIENT LTV"
          value={formatCurrency(kpis.averageLTV)}
          subValue="Lifetime spend average"
          trend={kpis.averageLTVTrend}
          icon={DollarSign}
          color="primary"
        />
      </div>

      {/* ── Analytics & Charts ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2">
          <AdvancedSegmentChart
            healthData={segmentData.healthData}
            formatCurrency={formatCurrency}
          />
        </div>
        <div className="flex flex-col justify-between">
          <div className="bg-white/4 backdrop-blur-xl border border-white/12 rounded-3xl p-6 shadow-xl h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-headline-md text-xl text-primary">Automated Insights</h3>
                <button
                  onClick={() => setShowHealthGuide(true)}
                  className="p-1 rounded-full text-outline hover:text-primary hover:bg-primary/10 transition-colors"
                  title="What do New, At Risk, Growing, Valuable & Elite mean?"
                >
                  <Info size={16} />
                </button>
              </div>
              <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                Boutique intelligence insights generated from real-time sales and customer loyalty profiles.
              </p>
              <InsightsPanel insights={insights} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters & Table ───────────────────────────── */}
      <CustomerTable
        filteredCustomers={filteredCustomers}
        healthFilter={healthFilter}
        setHealthFilter={setHealthFilter}
        creditFilter={creditFilter}
        setCreditFilter={setCreditFilter}
        formatCurrency={formatCurrency}
        onSelectCustomer={setSelectedCustomer}
      />

      {/* ── Customer Profile Drawer ───────────────────── */}
      <AnimatePresence>
        {selectedCustomer && (
          <CustomerProfileDrawer
            selectedCustomer={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            formatCurrency={formatCurrency}
          />
        )}
      </AnimatePresence>

      {/* ── Add / Edit Drawer ────────────────────────── */}
      <AnimatePresence>
        {isAddingCustomer && (
          <CustomerFormDrawer
            editingId={editingId}
            formData={formData}
            setFormData={setFormData}
            onClose={() => setIsAddingCustomer(false)}
            onSubmit={handleSubmit}
          />
        )}
      </AnimatePresence>

      {/* ── Client Health Guide Modal ─────────────────── */}
      <ClientHealthGuideModal open={showHealthGuide} onClose={() => setShowHealthGuide(false)} />
    </div>
  );
}
