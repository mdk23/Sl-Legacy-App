'use client';

import React from 'react';
import { Filter, ChevronDown, ChevronUp, Calendar, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExpenseFiltersProps {
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  originFilter: string;
  setOriginFilter: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  minAmount: string;
  setMinAmount: (v: string) => void;
  maxAmount: string;
  setMaxAmount: (v: string) => void;
  categories: string[];
  isFiltersExpanded: boolean;
  setIsFiltersExpanded: (v: boolean) => void;
}

export function ExpenseFilters({
  categoryFilter,
  setCategoryFilter,
  originFilter,
  setOriginFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  minAmount,
  setMinAmount,
  maxAmount,
  setMaxAmount,
  categories,
  isFiltersExpanded,
  setIsFiltersExpanded,
}: ExpenseFiltersProps) {
  const handleReset = () => {
    setCategoryFilter('All Categories');
    setOriginFilter('All Origins');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  };

  return (
    <div className="glass-panel p-6 rounded-3xl border border-white/12 bg-white/4 mb-8 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <Filter size={18} />
          </div>
          <div>
            <h3 className="font-headline-md text-lg text-primary">Expense Filters</h3>
            <p className="font-label-caps text-[9px] text-outline tracking-widest uppercase">
              {startDate || endDate ? `Range: ${startDate || 'All Time'} to ${endDate || 'All Time'}` : 'Range: All Time'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
          className="px-4 py-2 font-label-caps text-[10px] rounded-xl bg-white/6 hover:bg-white/8 text-primary border border-primary/10 flex items-center gap-1.5 ml-auto"
        >
          {isFiltersExpanded ? 'HIDE OPTIONS' : 'SHOW OPTIONS'}
          {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <AnimatePresence>
        {isFiltersExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 24 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            className="overflow-hidden border-t border-primary/10 pt-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <div>
                  <label className="font-label-caps text-[9px] text-outline block mb-1.5">DUE FROM</label>
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
                  <label className="font-label-caps text-[9px] text-outline block mb-1.5">DUE TO</label>
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

              <div>
                <label className="font-label-caps text-[9px] text-outline block mb-1.5">CATEGORY</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-bold text-primary cursor-pointer"
                >
                  <option value="All Categories">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-label-caps text-[9px] text-outline block mb-1.5">ORIGIN</label>
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-bold text-primary cursor-pointer"
                >
                  <option value="All Origins">All Origins</option>
                  <option value="Manual">Manual</option>
                  <option value="Recurring">Recurring</option>
                </select>
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <label className="font-label-caps text-[9px] text-outline block mb-1.5">MIN AMOUNT (Mt)</label>
                  <input
                    type="number"
                    placeholder="Min limit"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-[9px] text-outline block mb-1.5">MAX AMOUNT (Mt)</label>
                  <input
                    type="number"
                    placeholder="Max limit"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-data-tabular"
                  />
                </div>
              </div>

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
}
