import React from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  subValue: string;
  trend?: number;
  icon: LucideIcon;
  color: string;
}

export const KPICard = ({ title, value, subValue, trend, icon: Icon, color }: KPICardProps) => {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="glass-panel p-6 rounded-2xl border border-white/12 hover:shadow-2xl hover:shadow-primary/5 transition-all relative overflow-hidden"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl bg-${color}/10 text-${color}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && (
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              trend > 0
                ? "bg-secondary-fixed text-on-secondary-fixed"
                : "bg-error-container text-on-error-container"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <p className="font-label-caps text-[10px] text-outline mb-1">{title}</p>
      <h3 className="font-headline-md text-2xl text-primary mb-1">{value}</h3>
      <p className="font-body-md text-xs text-on-surface-variant opacity-70">{subValue}</p>
    </motion.div>
  );
};
