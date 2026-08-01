import React, { useState, useMemo } from "react";
import { Calendar, Users, DollarSign, X } from "lucide-react";
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

// Color palettes — an 8-color order validated against the #171717 chart
// surface (dataviz skill's categorical checks) so Financial and Loyalty
// tiers stay distinguishable from each other in "combined" view. Loyalty's
// "Gold" tier intentionally lands on the brand gold.
export const FINANCIAL_COLORS: Record<string, { bar: string; light: string; glow: string }> = {
  Regular: { bar: "#3987e5", light: "rgba(57,135,229,0.12)", glow: "rgba(57,135,229,0.35)" },
  Premium: { bar: "#d95926", light: "rgba(217,89,38,0.12)", glow: "rgba(217,89,38,0.35)" },
  VIP: { bar: "#199e70", light: "rgba(25,158,112,0.12)", glow: "rgba(25,158,112,0.35)" },
  Platinum: { bar: "#e66767", light: "rgba(230,103,103,0.12)", glow: "rgba(230,103,103,0.35)" },
};

export const LOYALTY_COLORS: Record<string, { bar: string; light: string; glow: string }> = {
  Bronze: { bar: "#008300", light: "rgba(0,131,0,0.12)", glow: "rgba(0,131,0,0.35)" },
  Silver: { bar: "#9085e9", light: "rgba(144,133,233,0.12)", glow: "rgba(144,133,233,0.35)" },
  Gold: { bar: "#B4832B", light: "rgba(180,131,43,0.14)", glow: "rgba(180,131,43,0.4)" },
  Diamond: { bar: "#d55181", light: "rgba(213,81,129,0.12)", glow: "rgba(213,81,129,0.35)" },
};

export interface SegmentData {
  name: string;
  count: number;
  totalSpent: number;
  avgSpent: number;
  color: string;
}

type ViewMode = "financial" | "loyalty" | "combined";
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
      <p className="font-label-caps text-[9px] text-outline mb-2 tracking-widest">{label} SEGMENT</p>
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
  financialData: SegmentData[];
  loyaltyData: SegmentData[];
  formatCurrency: (v: number) => string;
}

export const AdvancedSegmentChart = ({
  financialData,
  loyaltyData,
  formatCurrency,
}: AdvancedSegmentChartProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("combined");
  const [metricMode, setMetricMode] = useState<MetricMode>("customers");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Build combined dataset with prefixed keys so both groups render side by side
  const combinedData = useMemo(() => {
    const fin = financialData.map((d) => ({ ...d, group: "Financial", label: d.name }));
    const loy = loyaltyData.map((d) => ({ ...d, group: "Loyalty", label: d.name }));
    return [...fin, ...loy];
  }, [financialData, loyaltyData]);

  const displayData = useMemo(() => {
    if (viewMode === "financial")
      return financialData.map((d) => ({ ...d, label: d.name, group: "Financial" }));
    if (viewMode === "loyalty")
      return loyaltyData.map((d) => ({ ...d, label: d.name, group: "Loyalty" }));
    return combinedData;
  }, [viewMode, financialData, loyaltyData, combinedData]);

  const yKey = metricMode === "customers" ? "count" : "totalSpent";

  const getBarColor = (entry: any) => {
    if (!entry) return "#B4832B";
    if (entry.group === "Financial") return FINANCIAL_COLORS[entry.label]?.bar || "#3987e5";
    return LOYALTY_COLORS[entry.label]?.bar || "#9085e9";
  };

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
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={6}
          ry={6}
          fill={`url(#bar-grad-${index})`}
        />
      </g>
    );
  };

  const CustomXTick = (props: any) => {
    const { x, y, payload, index } = props;
    const d = displayData[index];
    const isFinancial = d?.group === "Financial";
    const color = isFinancial
      ? FINANCIAL_COLORS[payload.value]?.bar || "#3987e5"
      : LOYALTY_COLORS[payload.value]?.bar || "#9085e9";
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={14} textAnchor="middle" fill={color} fontSize={10} fontWeight="700">
          {payload.value}
        </text>
        {viewMode === "combined" && (
          <text x={0} y={0} dy={26} textAnchor="middle" fill={CHART_CHROME.axisText} fontSize={8}>
            {isFinancial ? "FIN" : "LOY"}
          </text>
        )}
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
          <h3 className="font-headline-md text-xl text-primary">Customer Segment Analytics</h3>
          <p className="font-label-caps text-[9px] text-outline tracking-widest mt-0.5">
            COMBINED FINANCIAL & LOYALTY INTELLIGENCE · LIVE DATA
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-white/8 border border-white/16 rounded-xl p-1 gap-0.5">
            {(["financial", "loyalty", "combined"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg font-label-caps text-[9px] tracking-widest transition-all ${
                  viewMode === m
                    ? "bg-primary text-white shadow-md"
                    : "text-outline hover:text-primary hover:bg-white/8"
                }`}
              >
                {m === "financial" ? "FIN" : m === "loyalty" ? "LOY" : "BOTH"}
              </button>
            ))}
          </div>

          {/* Metric Toggle */}
          <button
            onClick={() => setMetricMode((m) => (m === "customers" ? "revenue" : "customers"))}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/16 rounded-xl text-[9px] font-label-caps text-primary hover:bg-primary/5 transition-all"
          >
            {metricMode === "customers" ? <Users size={12} /> : <DollarSign size={12} />}
            {metricMode === "customers" ? "CLIENTS" : "REVENUE"}
          </button>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/16 rounded-xl">
            <Calendar size={11} className="text-outline flex-shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[9px] text-on-surface outline-none w-20 font-data-tabular"
              placeholder="From"
            />
            <span className="text-outline text-[9px]">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[9px] text-on-surface outline-none w-20 font-data-tabular"
              placeholder="To"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-outline hover:text-error transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {viewMode !== "loyalty" &&
          Object.entries(FINANCIAL_COLORS).map(([name, c]) => (
            <span key={name} className="flex items-center gap-1.5 text-[9px] font-bold text-on-surface-variant">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.bar }}></span>
              {name}
            </span>
          ))}
        {viewMode !== "financial" &&
          Object.entries(LOYALTY_COLORS).map(([name, c]) => (
            <span key={name} className="flex items-center gap-1.5 text-[9px] font-bold text-on-surface-variant">
              <span
                className="w-3 h-3 rounded-sm border border-dashed border-white/12"
                style={{ backgroundColor: c.bar }}
              ></span>
              {name}
            </span>
          ))}
        {viewMode === "combined" && (
          <>
            <span className="ml-2 text-[9px] text-outline border-l border-outline/20 pl-2">
              FIN = Financial Tier
            </span>
            <span className="text-[9px] text-outline">LOY = Loyalty Level</span>
          </>
        )}
      </div>

      {/* Main Chart */}
      <div className="h-72 relative">
        {viewMode === "combined" && (
          <div
            className="absolute top-0 bottom-0 border-r border-dashed border-primary/20 pointer-events-none z-10"
            style={{
              left: `calc(${(financialData.length / (financialData.length + loyaltyData.length)) * 100}% - 1px)`,
            }}
          >
            <span className="absolute -top-1 left-2 text-[8px] font-bold text-primary/40 tracking-widest">
              FIN │ LOY
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="spendLine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B4832B" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#B4832B" stopOpacity={0.1} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />

            <XAxis dataKey="label" tick={<CustomXTick />} axisLine={false} tickLine={false} height={36} />

            <YAxis
              yAxisId="left"
              orientation="left"
              stroke={CHART_CHROME.axis}
              fontSize={10}
              tickFormatter={formatYAxis}
              axisLine={false}
              tickLine={false}
            />

            {/* Right Y axis – always spend, for trend line */}
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

            <Tooltip
              content={<SegmentTooltip />}
              cursor={{ fill: "rgba(180, 131, 43, 0.08)", radius: 6 }}
            />

            {/* Custom-colored bars using shape prop */}
            <Bar yAxisId="left" dataKey={yKey} shape={<CustomBar />} maxBarSize={52} radius={[6, 6, 0, 0]} />

            {/* Gold spend trend line (always visible) */}
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

      {/* Axis labels */}
      <div className="flex justify-between mt-2 px-2">
        {viewMode !== "loyalty" && (
          <p className="text-[8px] font-bold text-primary/50 tracking-widest uppercase">
            ← Financial Tiers
          </p>
        )}
        {viewMode !== "financial" && (
          <p className="text-[8px] font-bold text-secondary/80 tracking-widest uppercase ml-auto">
            Loyalty Levels →
          </p>
        )}
      </div>

      {/* Micro-stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-primary/8">
        {displayData.slice(0, 4).map((d, i) => (
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
