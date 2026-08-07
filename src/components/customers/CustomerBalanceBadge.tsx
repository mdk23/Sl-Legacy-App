import React from "react";
import { AlertTriangle, Wallet, CheckCircle2 } from "lucide-react";

interface CustomerBalanceBadgeProps {
  creditBalance?: number;
  debitBalance?: number;
  formatCurrency: (v: number) => string;
  className?: string;
}

export const CustomerBalanceBadge = ({ creditBalance, debitBalance, formatCurrency, className }: CustomerBalanceBadgeProps) => {
  if ((debitBalance || 0) > 0) {
    return (
      <div
        title="Customer owes this amount to the boutique"
        className={`inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 ${className || ""}`}
      >
        <AlertTriangle size={13} className="text-rose-400 flex-shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-data-tabular text-sm font-bold text-rose-400">{formatCurrency(debitBalance || 0)}</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-rose-400/80">Customer Owes</span>
        </div>
      </div>
    );
  }

  if ((creditBalance || 0) > 0) {
    return (
      <div
        title="Boutique owes this store credit to the customer"
        className={`inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 ${className || ""}`}
      >
        <Wallet size={13} className="text-emerald-400 flex-shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-data-tabular text-sm font-bold text-emerald-400">{formatCurrency(creditBalance || 0)}</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400/80">Store Credit Owed</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 ${className || ""}`}>
      <CheckCircle2 size={13} className="text-outline" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-outline">Good Standing</span>
    </div>
  );
};
