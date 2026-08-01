import React from "react";
import { motion } from "framer-motion";

interface InsightItem {
  icon: React.ReactNode;
  text: string;
  color: string;
}

interface InsightsPanelProps {
  insights: InsightItem[];
}

export const InsightsPanel = ({ insights }: InsightsPanelProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
      {insights.map((ins, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className={`flex items-start gap-3 p-3 rounded-xl border ${ins.color} bg-white/8`}
        >
          <div className="mt-0.5 flex-shrink-0">{ins.icon}</div>
          <p className="text-xs font-medium text-on-surface leading-relaxed">{ins.text}</p>
        </motion.div>
      ))}
    </div>
  );
};
