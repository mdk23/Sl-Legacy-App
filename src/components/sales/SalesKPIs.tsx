import React from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  TrendingUp,
  AlertCircle,
  ShoppingBag,
  LucideIcon,
} from "lucide-react";

const SPARKLINE_COLORS: Record<string, string> = {
  primary: "#B4832B",
  secondary: "#8C7853",
  tertiary: "#6B6560",
  error: "#e66767",
};

interface KPIStatsProps {
  title: string;
  value: string;
  trend: number;
  icon: LucideIcon;
  color: string;
  sparklineData: { value: number }[];
}

export const KPIStats = ({
  title,
  value,
  trend,
  icon: Icon,
  color,
  sparklineData,
}: KPIStatsProps) => (
  <motion.div
    whileHover={{ y: -5 }}
    className="glass-panel p-6 rounded-2xl border border-white/12 relative overflow-hidden group hover:shadow-2xl transition-all"
  >
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-${color}/10 text-${color}`}>
        <Icon size={20} />
      </div>
      <div
        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
          trend > 0
            ? "bg-secondary-fixed text-on-secondary-fixed"
            : "bg-error-container text-on-error-container"
        }`}
      >
        {trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
        {Math.abs(trend)}%
      </div>
    </div>
    <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">{title}</p>
    <h3 className="font-headline-md text-2xl text-primary">{value}</h3>

    <div className="mt-4 h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparklineData}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={SPARKLINE_COLORS[color] ?? SPARKLINE_COLORS.primary}
            fill="transparent"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </motion.div>
);

interface SalesKPIGridProps {
  dynamicKPIs: {
    totalRevenue: number;
    totalProfit: number;
    totalPending: number;
    avgTransaction: number;
  };
  trends: {
    revenue: number;
    profit: number;
    totalPending: number;
    avgTransaction: number;
  };
  formatCurrency: (v: number) => string;
  getSparklineData: (metric: "total" | "profit" | "count") => { value: number }[];
}

export const SalesKPIs = ({
  dynamicKPIs,
  trends,
  formatCurrency,
  getSparklineData,
}: SalesKPIGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      <KPIStats
        title="TOTAL REVENUE"
        value={formatCurrency(dynamicKPIs.totalRevenue)}
        trend={trends.revenue}
        icon={DollarSign}
        color="primary"
        sparklineData={getSparklineData("total")}
      />
      <KPIStats
        title="TOTAL PROFIT"
        value={formatCurrency(dynamicKPIs.totalProfit)}
        trend={trends.profit}
        icon={TrendingUp}
        color="secondary"
        sparklineData={getSparklineData("profit")}
      />
      <KPIStats
        title="TOTAL PENDING"
        value={formatCurrency(dynamicKPIs.totalPending)}
        trend={trends.totalPending}
        icon={AlertCircle}
        color="error"
        sparklineData={getSparklineData("total")}
      />
      <KPIStats
        title="AVG TRANSACTION"
        value={formatCurrency(dynamicKPIs.avgTransaction)}
        trend={trends.avgTransaction}
        icon={ShoppingBag}
        color="primary"
        sparklineData={getSparklineData("total")}
      />
    </div>
  );
};
