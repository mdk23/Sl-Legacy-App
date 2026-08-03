'use client';

import React from 'react';
import { Search, Filter, Calendar, CreditCard, Repeat, User } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  Paid: 'bg-secondary-container/20 text-secondary',
  Pending: 'bg-primary-fixed/30 text-primary',
  Overdue: 'bg-error-container/30 text-error',
  Cancelled: 'bg-outline-variant/20 text-outline',
};

interface ExpenseTableProps {
  expenses: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  isFiltersExpanded: boolean;
  setIsFiltersExpanded: (v: boolean) => void;
  onSelectExpense: (expense: any) => void;
  formatCurrency: (v: number) => string;
}

export function ExpenseTable({
  expenses,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  isFiltersExpanded,
  setIsFiltersExpanded,
  onSelectExpense,
  formatCurrency,
}: ExpenseTableProps) {
  return (
    <section className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/12 bg-white/4">
      <div className="px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-primary/10 bg-white/6">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <h4 className="font-headline-md text-xl text-primary">Expenses</h4>
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
            <input
              type="text"
              placeholder="Search title or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/6 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={14} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[11px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="All Status">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className={`p-2 border border-outline-variant/30 rounded-xl hover:bg-white transition-all text-outline ${
              isFiltersExpanded ? 'bg-primary/10 text-primary border-primary/20 shadow-sm' : ''
            }`}
            title="Toggle Advanced Filters"
          >
            <Calendar size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-primary/5 border-b border-primary/10 font-label-caps text-[11px] text-primary">
              <th className="px-8 py-5">TITLE</th>
              <th className="px-6 py-5">CATEGORY</th>
              <th className="px-6 py-5">AMOUNT</th>
              <th className="px-6 py-5">DUE DATE</th>
              <th className="px-6 py-5">PAYMENT DATE</th>
              <th className="px-6 py-5">STATUS</th>
              <th className="px-6 py-5">METHOD</th>
              <th className="px-8 py-5">ORIGIN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5">
            {expenses.map((expense) => (
              <tr
                key={expense._id}
                className="hover:bg-white/6 transition-colors group cursor-pointer"
                onClick={() => onSelectExpense(expense)}
              >
                <td className="px-8 py-5 font-body-md text-sm font-bold text-on-surface">{expense.title}</td>
                <td className="px-6 py-5 font-label-caps text-[10px] text-on-surface-variant">{expense.category}</td>
                <td className="px-6 py-5 font-data-tabular text-sm font-bold">{formatCurrency(expense.amount)}</td>
                <td className="px-6 py-5 font-data-tabular text-xs text-on-surface-variant">
                  {new Date(expense.dueDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-5 font-data-tabular text-xs text-on-surface-variant">
                  {expense.paymentDate ? new Date(expense.paymentDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_BADGE[expense.status] || 'bg-outline-variant/20 text-outline'}`}
                  >
                    {expense.status}
                  </span>
                </td>
                <td className="px-6 py-5">
                  {expense.paymentMethod ? (
                    <div className="flex items-center gap-2 font-label-caps text-[10px] text-on-surface-variant">
                      <CreditCard size={12} className="text-outline" /> {expense.paymentMethod}
                    </div>
                  ) : (
                    <span className="text-outline/40 text-xs">—</span>
                  )}
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-1.5 font-label-caps text-[10px] text-on-surface-variant">
                    {expense.origin === 'Recurring' ? <Repeat size={12} className="text-outline" /> : <User size={12} className="text-outline" />}
                    {expense.origin}
                  </div>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={8} className="px-8 py-16 text-center text-on-surface-variant/50 font-label-caps text-xs">
                  No expenses match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-8 py-5 bg-white/6 flex justify-between items-center border-t border-primary/5">
        <p className="font-label-caps text-[10px] text-primary">Showing {expenses.length} records</p>
      </div>
    </section>
  );
}
