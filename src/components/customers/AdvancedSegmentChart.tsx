import React, { useMemo, useState } from "react";
import { Users, DollarSign } from "lucide-react";
import {
  ResponsiveContainer,
  Tooltip,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  Line,
} from "recharts";
import { CHART_CHROME } from "@/lib/chartColors";

// Health segment colors — validated categorical palette (dataviz skill checks)
// against the #171717 chart surface. Ordered worst → best.
export const HEALTH_COLORS: Record<string, { bar: string; light: string; glow: string }> = {
  "New Client": { bar: "#3987e5", light: "rgba(57,135,229,0.12)", glow: "rgba(57,135,229,0.35)" },
  "At Risk": { bar: "#e66767", light: "rgba(230,103,103,0.12)", glow: "rgba(230,103,103,0.35)" },
  "Growing Client": { bar: "#9085e9", light: "rgba(144,133,233,0.12)", glow: "rgba(144,133,233,0.35)" },
  "Valuable Client": { bar: "#199e70", light: "rgba(25,158,112,0.12)", glow: "rgba(25,158,112,0.35)" },
  "Elite Client": { bar: "#B4832B", light: "rgba(180,131,43,0.14)", glow: "rgba(180,131,43,0.4)" },
};

export interface SegmentData {
  name: string;
  count: number;
  totalSpent: number;
  avgSpent: number;
  color: string;
}

type MetricMode = "customers" | "revenue";

const formatMt = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" })
    .format(v)
    .replace("MZN", "Mt");

const SegmentTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/16 shadow-2xl rounded-2xl p-4 min-w-[200px]">
      <p className="font-label-caps text-[9px] text-outline mb-2 tracking-widest">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-on-surface-variant">Customers</span>
          <span className="text-xs font-extrabold text-on-surface font-data-tabular">{d.count}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-on-surface-variant">Total Spend</span>
          <span className="text-xs font-extrabold text-primary font-data-tabular">
            {formatMt(d.totalSpent)}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-outline-variant/20 pt-1.5 mt-1.5">
          <span className="text-xs text-on-surface-variant">Avg. per Client</span>
          <span className="text-xs font-extrabold text-secondary font-data-tabular">
            {formatMt(d.avgSpent)}
          </span>
        </div>
      </div>
    </div>
  );
};

interface AdvancedSegmentChartProps {
  healthData: SegmentData[];
  formatCurrency: (v: number) => string;
}

export const AdvancedSegmentChart = ({ healthData, formatCurrency }: AdvancedSegmentChartProps) => {
  const [metricMode, setMetricMode] = useState<MetricMode>("customers");

  const displayData = useMemo(() => healthData.map((d) => ({ ...d, label: d.name })), [healthData]);
  const yKey = metricMode === "customers" ? "count" : "totalSpent";

  const getBarColor = (entry: any) => (entry ? HEALTH_COLORS[entry.label]?.bar || "#B4832B" : "#B4832B");

  const CustomBar = (props: any) => {
    const { x, y, width, height, index } = props;
    const d = displayData[index];
    if (!d) return null;
    const color = getBarColor(d);
    return (
      <g>
        <defs>
          <linearGradient id={`bar-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <rect x={x} y={y} width={width} height={height} rx={6} ry={6} fill={`url(#bar-grad-${index})`} />
      </g>
    );
  };

  const CustomXTick = (props: any) => {
    const { x, y, payload, index } = props;
    const d = displayData[index];
    const color = HEALTH_COLORS[d?.label]?.bar || "#B4832B";
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={14} textAnchor="middle" fill={color} fontSize={9} fontWeight="700">
          {payload.value}
        </text>
      </g>
    );
  };

  const formatYAxis = (v: number) => {
    if (metricMode === "revenue") {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
      return v.toString();
    }
    return v.toString();
  };

  return (
    <div className="bg-white/4 backdrop-blur-xl border border-white/12 rounded-3xl p-6 shadow-xl">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="font-headline-md text-xl text-primary">Customer Health Segments</h3>
          <p className="font-label-caps text-[9px] text-outline tracking-widest mt-0.5">
            BASED ON BUYING FREQUENCY, TOTAL SPEND &amp; CREDIT STANDING
          </p>
        </div>

        <button
          onClick={() => setMetricMode((m) => (m === "customers" ? "revenue" : "customers"))}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/16 rounded-xl text-[9px] font-label-caps text-primary hover:bg-primary/5 transition-all"
        >
          {metricMode === "customers" ? <Users size={12} /> : <DollarSign size={12} />}
          {metricMode === "customers" ? "CLIENTS" : "REVENUE"}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(HEALTH_COLORS).map(([name, c]) => (
          <span key={name} className="flex items-center gap-1.5 text-[9px] font-bold text-on-surface-variant">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.bar }}></span>
            {name}
          </span>
        ))}
      </div>

      {/* Main Chart */}
      <div className="h-72 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />

            <XAxis dataKey="label" tick={<CustomXTick />} axisLine={false} tickLine={false} height={30} />

            <YAxis
              yAxisId="left"
              orientation="left"
              stroke={CHART_CHROME.axis}
              fontSize={10}
              tickFormatter={formatYAxis}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="rgba(180, 131, 43, 0.5)"
              fontSize={10}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                return v.toString();
              }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip content={<SegmentTooltip />} cursor={{ fill: "rgba(180, 131, 43, 0.08)", radius: 6 }} />

            <Bar yAxisId="left" dataKey={yKey} shape={<CustomBar />} maxBarSize={64} radius={[6, 6, 0, 0]} />

            <Line
              yAxisId="right"
              type="monotone"
              dataKey="totalSpent"
              stroke="#B4832B"
              strokeWidth={2.5}
              dot={{ fill: "#B4832B", strokeWidth: 2, r: 4, stroke: CHART_CHROME.surface }}
              activeDot={{ r: 6, fill: "#B4832B", stroke: CHART_CHROME.surface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Micro-stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-primary/8">
        {displayData.map((d, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-white/6 border border-white/12">
            <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: getBarColor(d) }}></div>
            <div>
              <p className="text-[9px] font-bold text-on-surface">{d.label}</p>
              <p className="text-[9px] text-outline">{d.count} clients</p>
              <p className="text-[9px] font-bold text-primary font-data-tabular">
                {formatCurrency(d.totalSpent)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
