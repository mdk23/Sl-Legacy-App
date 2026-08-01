'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Repeat, Wallet, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../AuthProvider';
import { ExpenseCharts } from './ExpenseCharts';
import { ExpenseFilters } from './ExpenseFilters';
import { ExpenseTable } from './ExpenseTable';
import { ExpenseDetailDrawer } from './ExpenseDetailDrawer';
import { ExpenseFormDrawer } from './ExpenseFormDrawer';
import { PayExpenseModal } from './PayExpenseModal';
import { ExpenseTemplateManager } from './ExpenseTemplateManager';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' }).format(v).replace('MZN', 'Mt');

const StatCard = ({ title, value, subValue, icon: Icon, color }: any) => (
  <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:shadow-xl transition-all duration-300">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-${color}/10 text-${color}`}>
        <Icon size={20} />
      </div>
    </div>
    <p className="font-label-caps text-[10px] text-outline mb-1">{title}</p>
    <h3 className="font-headline-md text-2xl text-primary mb-1">{value}</h3>
    <p className="font-body-md text-xs text-on-surface-variant opacity-70">{subValue}</p>
  </div>
);

export default function Expenses() {
  const { user } = useAuth();
  const dashboard = useQuery(api.expenses.getDashboard, {});
  const allExpenses = useQuery(api.expenses.list, {}) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [originFilter, setOriginFilter] = useState('All Origins');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [payingExpense, setPayingExpense] = useState<any | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    allExpenses.forEach((e: any) => set.add(e.category));
    return Array.from(set).sort();
  }, [allExpenses]);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((e: any) => {
      if (statusFilter !== 'All Status' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'All Categories' && e.category !== categoryFilter) return false;
      if (originFilter !== 'All Origins' && e.origin !== originFilter) return false;
      if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase()) && !e.category.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (startDate && e.dueDate < new Date(startDate + 'T00:00:00Z').getTime()) return false;
      if (endDate && e.dueDate > new Date(endDate + 'T23:59:59Z').getTime()) return false;
      if (minAmount && e.amount < Number(minAmount)) return false;
      if (maxAmount && e.amount > Number(maxAmount)) return false;
      return true;
    });
  }, [allExpenses, statusFilter, categoryFilter, originFilter, searchQuery, startDate, endDate, minAmount, maxAmount]);

  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const now = new Date();
  const currentMonthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Expenses</h1>
          <p className="font-label-caps text-[10px] text-outline tracking-widest mt-1">{currentMonthLabel.toUpperCase()}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTemplateManagerOpen(true)}
              className="px-4 py-2.5 bg-white/8 border border-primary/20 text-primary rounded-xl font-label-caps text-[10px] hover:bg-white/12 transition-colors flex items-center gap-1.5"
            >
              <Repeat size={14} /> RECURRING TEMPLATES
            </button>
            <button
              onClick={() => {
                setEditingExpense(null);
                setFormDrawerOpen(true);
              }}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <Plus size={16} /> NEW EXPENSE
            </button>
          </div>
        )}
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="TOTAL THIS MONTH"
          value={dashboard ? formatCurrency(dashboard.totalThisMonth) : '...'}
          subValue="Paid + Pending + Overdue"
          icon={Wallet}
          color="primary"
        />
        <StatCard
          title="PAID"
          value={dashboard ? formatCurrency(dashboard.paid) : '...'}
          subValue="Settled this month"
          icon={CheckCircle2}
          color="secondary"
        />
        <StatCard
          title="PENDING"
          value={dashboard ? formatCurrency(dashboard.pending) : '...'}
          subValue="Awaiting payment"
          icon={Clock}
          color="primary"
        />
        <StatCard
          title="OVERDUE"
          value={dashboard ? formatCurrency(dashboard.overdue) : '...'}
          subValue="Past due date"
          icon={AlertTriangle}
          color="error"
        />
      </div>

      {/* Charts */}
      {dashboard && (
        <ExpenseCharts
          byCategory={dashboard.byCategory}
          monthlyTrend={dashboard.monthlyTrend}
          statusBreakdown={dashboard.statusBreakdown}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Filters */}
      <ExpenseFilters
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        originFilter={originFilter}
        setOriginFilter={setOriginFilter}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        minAmount={minAmount}
        setMinAmount={setMinAmount}
        maxAmount={maxAmount}
        setMaxAmount={setMaxAmount}
        categories={categories}
        isFiltersExpanded={isFiltersExpanded}
        setIsFiltersExpanded={setIsFiltersExpanded}
      />

      {/* Table */}
      <ExpenseTable
        expenses={filteredExpenses}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isFiltersExpanded={isFiltersExpanded}
        setIsFiltersExpanded={setIsFiltersExpanded}
        onSelectExpense={(expense) => setSelectedExpenseId(expense._id)}
        formatCurrency={formatCurrency}
      />

      {/* Detail Drawer */}
      <ExpenseDetailDrawer
        expenseId={selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        onEdit={(expense) => {
          setEditingExpense(expense);
          setFormDrawerOpen(true);
          setSelectedExpenseId(null);
        }}
        onPay={(expense) => {
          setPayingExpense(expense);
          setSelectedExpenseId(null);
        }}
        formatCurrency={formatCurrency}
      />

      {/* Create/Edit Drawer */}
      <ExpenseFormDrawer
        open={formDrawerOpen}
        onClose={() => setFormDrawerOpen(false)}
        editingExpense={editingExpense}
        categories={categories}
      />

      {/* Pay Modal */}
      <PayExpenseModal expense={payingExpense} onClose={() => setPayingExpense(null)} formatCurrency={formatCurrency} />

      {/* Template Manager */}
      <ExpenseTemplateManager open={templateManagerOpen} onClose={() => setTemplateManagerOpen(false)} formatCurrency={formatCurrency} />
    </div>
  );
}
