import React from "react";
import { Filter, ChevronDown, ChevronUp, Calendar, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SalesFiltersProps {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  paymentFilter: string;
  setPaymentFilter: (v: string) => void;
  tierFilter: string;
  setTierFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  minAmount: string;
  setMinAmount: (v: string) => void;
  maxAmount: string;
  setMaxAmount: (v: string) => void;
  isFiltersExpanded: boolean;
  setIsFiltersExpanded: (v: boolean) => void;
}

export const SalesFilters = ({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  paymentFilter,
  setPaymentFilter,
  tierFilter,
  setTierFilter,
  statusFilter,
  setStatusFilter,
  minAmount,
  setMinAmount,
  maxAmount,
  setMaxAmount,
  isFiltersExpanded,
  setIsFiltersExpanded,
}: SalesFiltersProps) => {
  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setPaymentFilter("All Methods");
    setTierFilter("All Tiers");
    setStatusFilter("All Status");
    setMinAmount("");
    setMaxAmount("");
  };

  return (
    <div className="glass-panel p-6 rounded-3xl border border-white/12 bg-white/4 mb-8 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <Filter size={18} />
          </div>
          <div>
            <h3 className="font-headline-md text-lg text-primary">Dashboard Filters</h3>
            <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest uppercase">
              {startDate || endDate
                ? `Active range: ${startDate || "All Time"} to ${endDate || "All Time"}`
                : "Active range: All Time"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="px-4 py-2 font-label-caps text-[10px] rounded-xl bg-white/6 hover:bg-white/8 text-primary border border-primary/10 flex items-center gap-1.5 ml-auto"
          >
            {isFiltersExpanded ? "HIDE OPTIONS" : "SHOW OPTIONS"}
            {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isFiltersExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 24 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            className="overflow-hidden border-t border-primary/10 pt-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Custom Date Pickers */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <div>
                  <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">BEGIN DATE</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">END DATE</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">PAYMENT METHOD</label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-bold text-primary cursor-pointer"
                >
                  <option value="All Methods">All Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="e-Mola">e-Mola</option>
                  <option value="BCI">BCI</option>
                  <option value="BIM">BIM</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              {/* Client Loyalty Tier */}
              <div>
                <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">LOYALTY TIER</label>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-bold text-primary cursor-pointer"
                >
                  <option value="All Tiers">All Tiers</option>
                  <option value="VIP / Platinum">VIP / Platinum</option>
                  <option value="Gold / Premium">Gold / Premium</option>
                  <option value="Standard / Regular">Standard / Regular</option>
                  <option value="Walk-in">Walk-in Customer</option>
                </select>
              </div>

              {/* Settlement Status */}
              <div>
                <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">SETTLEMENT STATUS</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-bold text-primary cursor-pointer"
                >
                  <option value="All Status">All Status</option>
                  <option value="Completed">Completed / Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>

              {/* Amount Filter Range */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">MIN AMOUNT (Mt)</label>
                  <input
                    type="number"
                    placeholder="Min limit"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-[9px] text-on-surface-variant block mb-1.5">MAX AMOUNT (Mt)</label>
                  <input
                    type="number"
                    placeholder="Max limit"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                  />
                </div>
              </div>

              {/* Reset Buttons */}
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                <button
                  onClick={handleReset}
                  className="w-full py-2.5 px-4 bg-white hover:bg-primary/5 text-primary border border-primary/20 rounded-xl font-label-caps text-[10px] transition-all flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} /> RESET ALL FILTERS
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
