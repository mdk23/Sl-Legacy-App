'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  MoreVertical,
  Bell,
  Calendar,
  Star,
  Zap,
  ShieldCheck,
  ChevronRight,
  Plus,
  Package,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { CHART_COLORS } from '@/lib/chartColors';
import { motion } from 'framer-motion';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';

// --- Sub-components ---

const ExecutiveKPI = ({ title, value, trend, icon: Icon, color, subText }: any) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="glass-panel p-6 rounded-3xl border border-white/12 relative overflow-hidden group hover:shadow-2xl transition-all"
  >
    <div className="flex justify-between items-start mb-6">
      <div className={`p-3 rounded-2xl bg-${color}/10 text-${color} shadow-sm`}>
        <Icon size={24} />
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${trend > 0 ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-error-container text-on-error-container'}`}>
        {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(trend)}%
      </div>
    </div>
    <p className="font-label-caps text-[11px] text-on-surface-variant mb-1 tracking-widest uppercase">{title}</p>
    <h3 className="font-headline-md text-3xl text-primary mb-2">{value}</h3>
    <p className="font-body-md text-xs text-on-surface-variant opacity-70">{subText}</p>

    <div className={`absolute bottom-0 left-0 h-1 w-full bg-${color}/20 group-hover:bg-${color}/40 transition-colors`}></div>
  </motion.div>
);

// --- Main Component ---

export default function Dashboard() {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'this_week'>('today');
  const brief = useQuery(api.analytics.getExecutiveBrief, { period });
  const revenueHistory = useQuery(api.analytics.getRevenueByPeriod, { period: 'weekly' });
  const queryParams = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayTimestamp = startOfToday.getTime();

    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    const yesterdayTimestamp = startOfYesterday.getTime();

    const startOfThisWeek = new Date(now);
    const day = startOfThisWeek.getDay();
    const diff = startOfThisWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfThisWeek.setDate(diff);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const thisWeekTimestamp = startOfThisWeek.getTime();

    if (period === 'today') {
      return { startDate: todayTimestamp };
    }
    if (period === 'yesterday') {
      return { startDate: yesterdayTimestamp, endDate: todayTimestamp - 1 };
    }
    if (period === 'this_week') {
      return { startDate: thisWeekTimestamp };
    }
    return {};
  }, [period]);

  const recentTransactions = useQuery(api.transactions.getRecent, { limit: 10, ...queryParams });
  const lowStock = useQuery(api.products.getLowStock);

  const filteredRecentTransactions = recentTransactions || [];

  // Formatting helpers
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' })
      .format(val)
      .replace('MZN', 'Mt');

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Morning Greeting Section */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h1 className="font-headline-lg text-4xl text-primary mb-2">Morning, Sl Legacy</h1>
          <p className="font-body-lg text-on-surface-variant opacity-80 max-w-xl">
            The <span className="text-primary font-bold">Summer Haute Couture</span> collection is performing 24% above projections. Here is your boutique's daily brief.
          </p>
        </motion.div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-white/6 backdrop-blur-md p-1.5 rounded-2xl border border-white/12 shadow-sm mr-2">
            {[
              { label: 'TODAY', value: 'today' },
              { label: 'YESTERDAY', value: 'yesterday' },
              { label: 'THIS WEEK', value: 'this_week' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value as any)}
                className={`px-4 py-2 font-label-caps text-[10px] rounded-xl transition-all ${period === opt.value
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-primary hover:bg-primary/5'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>


        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <ExecutiveKPI
          title="TOTAL REVENUE"
          value={brief ? formatCurrency(brief.totalRevenue) : '...'}
          trend={brief?.trends?.revenue || 0}
          icon={ShoppingBag}
          color="primary"
          subText="Gross revenue across all pieces"
        />
        <ExecutiveKPI
          title="TOTAL PROFIT"
          value={brief ? formatCurrency(brief.totalProfit) : '...'}
          trend={brief?.trends?.profit || 0}
          icon={TrendingUp}
          color="secondary"
          subText="Net earnings after costs"
        />
        <ExecutiveKPI
          title="TOTAL PENDING"
          value={brief ? formatCurrency(brief.totalPending) : '...'}
          trend={brief?.trends?.pending || 0}
          icon={CreditCard}
          color="tertiary"
          subText="Outstanding client balances"
        />
        <ExecutiveKPI
          title="AVERAGE SALES"
          value={brief ? formatCurrency(brief.avgSales) : '...'}
          trend={brief?.trends?.avgSales || 0}
          icon={Zap}
          color="primary"
          subText="Average transaction value"
        />
      </div>

      {/* Central Revenue Command & Category Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h3 className="font-headline-md text-2xl text-primary">Payment Channels</h3>
            <p className="font-label-caps text-[10px] text-on-surface-variant tracking-widest">TRANSACTION VOLUME BY PAYMENT METHOD</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { name: 'M-Pesa', key: 'M-Pesa', color: 'primary', icon: CreditCard },
              { name: 'e-Mola', key: 'e-Mola', color: 'secondary', icon: CreditCard },
              { name: 'BCI', key: 'BCI', color: 'tertiary', icon: CreditCard },
              { name: 'BIM Cash', key: 'BIM Cash', color: 'primary', icon: CreditCard },
              { name: 'Card', key: 'Card', color: 'secondary', icon: CreditCard },
              { name: 'Cash', key: 'Cash', color: 'tertiary', icon: CreditCard },
            ].map((pm) => {
              const methodData = (brief?.paymentMethods as any)?.[pm.key] || { amount: 0, count: 0, percentage: 0 };
              return (
                <motion.div
                  key={pm.name}
                  whileHover={{ scale: 1.02 }}
                  className="glass-panel p-6 rounded-3xl border border-white/12 relative overflow-hidden group hover:shadow-xl transition-all flex flex-col justify-between min-h-[160px]"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl bg-${pm.color}/10 text-${pm.color} shadow-sm w-fit`}>
                      <pm.icon size={20} />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/10">
                      {methodData.percentage}% share
                    </span>
                  </div>
                  <div>
                    <p className="font-label-caps text-[10px] text-on-surface-variant tracking-widest uppercase mb-1">{pm.name}</p>
                    <h4 className="font-headline-md text-lg text-primary mb-1">{formatCurrency(methodData.amount)}</h4>
                    <p className="font-body-md text-[10px] text-on-surface-variant opacity-75">{methodData.count} transactions</p>
                  </div>
                  <div className={`absolute bottom-0 left-0 h-1 w-full bg-${pm.color}/20 group-hover:bg-${pm.color}/40 transition-colors`}></div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] border border-white/12 flex flex-col items-center text-center">
          <h3 className="font-headline-md text-xl text-primary mb-2">Boutique Inventory</h3>
          <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest mb-10">SOLD CATEGORY DISTRIBUTION</p>

          <div className="flex-1 w-full flex flex-col justify-center items-center relative">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={brief?.categoryDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(brief?.categoryDistribution || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-6">
            {(brief?.categoryDistribution || []).slice(0, 4).map((stat: any) => (
              <div key={stat.name} className="flex flex-col items-center p-3 bg-white/6 rounded-2xl border border-white/12">
                <span className="font-data-tabular text-sm font-bold text-primary">{stat.value}%</span>
                <span className="font-label-caps text-[8px] text-on-surface-variant truncate">{stat.name.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bento Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Recent Activity Table */}
        <div className="lg:col-span-2 glass-panel rounded-[2rem] border border-white/12 bg-white/4">
          <div className="p-8 border-b border-primary/10 flex justify-between items-center bg-white/6 rounded-t-[2rem]">
            <div>
              <h3 className="font-headline-md text-xl text-primary">Sales Activity</h3>
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">REAL-TIME TRANSACTION  </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-primary/5 font-label-caps text-[10px] text-primary">
                  <th className="px-8 py-4">RECEIPT</th>
                  <th className="px-6 py-4">CASHIER</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-8 py-4 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {(filteredRecentTransactions || []).slice(0, 5).map((tx) => (
                  <tr key={tx._id} className="hover:bg-white/6 transition-colors group cursor-pointer">
                    <td className="px-8 py-5 font-data-tabular text-xs font-bold text-primary">{tx.receiptNumber}</td>
                    <td className="px-6 py-5 font-body-md text-sm text-on-surface">{tx.cashierName}</td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${tx.status === 'Completed' ? 'bg-secondary-container/20 text-secondary' :
                        tx.status === 'Partially Paid' ? 'bg-primary/10 text-primary' :
                          'bg-error-container/20 text-error'
                        }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 font-data-tabular text-sm font-bold text-right text-primary">{formatCurrency(tx.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-6 bg-white/6 text-center">
            <button className="font-label-caps text-[10px] text-primary flex items-center gap-2 mx-auto hover:opacity-70 transition-opacity">
              VIEW COMPREHENSIVE HISTORY <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Critical Alerts & Highlights */}
        <div className="space-y-8">
          <div className="glass-panel p-8 rounded-[2rem] border border-error/20 bg-error-container/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-error/10 text-error rounded-xl">
                <AlertCircle size={20} />
              </div>
              <h4 className="font-headline-md text-lg text-primary">Attention Required</h4>
            </div>
            <div className="space-y-4">
              {(lowStock || []).length > 0 ? (
                lowStock!.slice(0, 5).map((item) => (
                  <div key={item._id} className="p-4 bg-white/8 rounded-2xl border border-white shadow-sm flex items-start gap-4">
                    <Package className="text-error mt-1" size={18} />
                    <div>
                      <p className="font-label-caps text-[10px] text-on-surface font-bold uppercase">CRITICAL STOCK: {item.name}</p>
                      <p className="font-body-md text-xs text-error">Only {item.stock} units remaining in inventory.</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-white/8 rounded-2xl border border-white shadow-sm flex items-start gap-4 opacity-60">
                  <ShieldCheck className="text-secondary mt-1" size={18} />
                  <div>
                    <p className="font-label-caps text-[10px] text-on-surface font-bold">ALL SYSTEMS CLEAR</p>
                    <p className="font-body-md text-xs text-on-surface-variant">Inventory levels healthy across all ateliers.</p>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

