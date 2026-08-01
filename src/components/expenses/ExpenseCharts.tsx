'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { CHART_COLORS, CHART_CHROME } from '@/lib/chartColors';

const tooltipContentStyle = {
  borderRadius: '16px',
  border: `1px solid ${CHART_CHROME.tooltipBorder}`,
  boxShadow: CHART_CHROME.tooltipShadow,
  backgroundColor: CHART_CHROME.tooltipBg,
  color: CHART_CHROME.tooltipText,
};

interface ExpenseChartsProps {
  byCategory: Record<string, number>;
  monthlyTrend: { month: string; paid: number; pending: number; overdue: number }[];
  statusBreakdown: Record<string, number>;
  formatCurrency: (v: number) => string;
}

export function ExpenseCharts({ byCategory, monthlyTrend, statusBreakdown, formatCurrency }: ExpenseChartsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const categoryData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(statusBreakdown)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  if (!mounted) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <div className="lg:col-span-2 glass-panel p-8 rounded-3xl border border-white/12 h-96 bg-white/5 animate-pulse" />
        <div className="glass-panel p-8 rounded-3xl border border-white/12 h-96 bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
      <div className="lg:col-span-2 glass-panel p-8 rounded-3xl border border-white/12">
        <div className="mb-10">
          <h3 className="font-headline-md text-xl text-primary">Monthly Expense Trend</h3>
          <p className="font-label-caps text-[9px] text-outline tracking-widest">LAST 6 MONTHS — PAID VS PENDING</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="expensePaidGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expensePendingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_CHROME.grid} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: CHART_CHROME.axisText }} dy={10} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: CHART_CHROME.axisText }}
                dx={-10}
                tickFormatter={(val) => `${val / 1000}k`}
              />
              <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              <Area type="monotone" dataKey="paid" name="Paid" stroke={CHART_COLORS[0]} strokeWidth={3} fillOpacity={1} fill="url(#expensePaidGradient)" />
              <Area type="monotone" dataKey="pending" name="Pending" stroke={CHART_COLORS[1]} strokeWidth={2} fillOpacity={1} fill="url(#expensePendingGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel p-8 rounded-3xl border border-white/12 flex flex-col">
        <h3 className="font-headline-md text-xl text-primary mb-2">Expenses by Category</h3>
        <p className="font-label-caps text-[9px] text-outline tracking-widest mb-10">PAID THIS MONTH</p>
        <div className="flex-1 flex flex-col justify-center items-center relative">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={6} dataKey="value">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} contentStyle={tooltipContentStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-outline/50 flex flex-col items-center justify-center h-[200px]">
              <span className="material-symbols-outlined text-4xl mb-2">pie_chart</span>
              <p className="text-sm font-label-caps">No paid expenses yet</p>
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {categoryData.map((entry, i) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="font-label-caps text-[10px] text-on-surface-variant truncate">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 glass-panel p-8 rounded-3xl border border-white/12 flex flex-col">
        <h3 className="font-headline-md text-xl text-primary mb-2">Payment Status</h3>
        <p className="font-label-caps text-[9px] text-outline tracking-widest mb-8">THIS MONTH'S EXPENSE RECORDS BY STATUS</p>
        {statusData.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {statusData.map((entry, i) => (
              <div key={entry.name} className="flex-1 min-w-[140px] p-4 rounded-2xl bg-white/6 border border-white/10 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <div>
                  <p className="font-headline-md text-lg text-primary">{entry.value}</p>
                  <p className="font-label-caps text-[9px] text-outline tracking-widest">{entry.name.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-label-caps text-[10px] text-outline">No expense records this month</p>
        )}
      </div>
    </div>
  );
}
