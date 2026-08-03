import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, AlertTriangle, TrendingUp, DollarSign, Crown } from "lucide-react";
import { HEALTH_COLORS } from "./AdvancedSegmentChart";

const HEALTH_GUIDE = [
  {
    name: "New Client",
    icon: Users,
    criteria: "No purchases yet — 0 orders recorded.",
  },
  {
    name: "At Risk",
    icon: AlertTriangle,
    criteria: "Overdue debt on their account, or no purchase in the last 90+ days.",
  },
  {
    name: "Growing Client",
    icon: TrendingUp,
    criteria: "Purchased within the last 90 days, with either 5+ orders or 100,000+ Mt total spent.",
  },
  {
    name: "Valuable Client",
    icon: DollarSign,
    criteria: "Purchased within the last 90 days, with either 20+ orders or 500,000+ Mt spent, and no outstanding debt.",
  },
  {
    name: "Elite Client",
    icon: Crown,
    criteria: "Purchased within the last 90 days, with both 20+ orders and 500,000+ Mt spent, and no outstanding debt.",
  },
];

interface ClientHealthGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export const ClientHealthGuideModal = ({ open, onClose }: ClientHealthGuideModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="relative w-full max-w-lg bg-surface-container rounded-3xl shadow-2xl border border-white/10 p-8"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 hover:bg-primary/10 rounded-full text-outline transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="font-headline-md text-lg text-primary mb-1">Client Health Guide</h3>
            <p className="font-body-md text-xs text-on-surface-variant leading-relaxed mb-6">
              How each client is classified, based on purchase frequency, total spent, and debt/credit standing.
            </p>

            <div className="space-y-3">
              {HEALTH_GUIDE.map(({ name, icon: Icon, criteria }) => {
                const palette = HEALTH_COLORS[name];
                return (
                  <div
                    key={name}
                    className="flex items-start gap-3 p-4 rounded-2xl border border-white/10 bg-white/6"
                  >
                    <div
                      className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: palette.light }}
                    >
                      <Icon size={16} style={{ color: palette.bar }} />
                    </div>
                    <div>
                      <p className="font-label-caps text-[11px] font-bold" style={{ color: palette.bar }}>
                        {name}
                      </p>
                      <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{criteria}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
