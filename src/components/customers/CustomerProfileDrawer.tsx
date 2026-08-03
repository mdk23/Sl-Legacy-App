import React from "react";
import { motion } from "framer-motion";
import { X, ShoppingBag, Users, Repeat } from "lucide-react";

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  customerType?: string;
  creditStatus?: string;
  customerHealth?: string;
  totalSpent: number;
  creditBalance?: number;
  debitBalance?: number;
  orderCount: number;
  lastPurchaseDate?: number;
  notes?: string;
}

const HEALTH_STYLES: Record<string, { text: string; ring: string; description: string }> = {
  "Elite Client": {
    text: "text-purple-600",
    ring: "stroke-purple-500",
    description: "Frequent, high-spending buyer in good credit standing.",
  },
  "Valuable Client": {
    text: "text-emerald-600",
    ring: "stroke-emerald-500",
    description: "Strong purchase frequency or spend, in good credit standing.",
  },
  "Growing Client": {
    text: "text-blue-600",
    ring: "stroke-blue-500",
    description: "Building purchase history — some frequency or spend, active recently.",
  },
  "At Risk": {
    text: "text-rose-600",
    ring: "stroke-rose-500",
    description: "Overdue debt or no purchases in 90+ days.",
  },
  "New Client": {
    text: "text-slate-500",
    ring: "stroke-slate-400",
    description: "No purchase history yet.",
  },
};

function frequencyLabel(orderCount: number) {
  if (orderCount >= 20) return "Frequent Buyer";
  if (orderCount >= 5) return "Regular Buyer";
  if (orderCount >= 1) return "Occasional Buyer";
  return "No Purchases Yet";
}

interface CustomerProfileDrawerProps {
  selectedCustomer: Customer;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (id: string) => void;
  formatCurrency: (v: number) => string;
}

export const CustomerProfileDrawer = ({
  selectedCustomer,
  onClose,
  onEdit,
  onDelete,
  formatCurrency,
}: CustomerProfileDrawerProps) => {
  const health = selectedCustomer.customerHealth || "New Client";
  const healthStyle = HEALTH_STYLES[health] || HEALTH_STYLES["New Client"];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-md"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-xl h-full bg-surface-container shadow-2xl overflow-y-auto border-l border-white/10 flex flex-col"
      >
        <div className="p-8 pb-12 bg-atelier-gradient relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/6 backdrop-blur-md rounded-full text-primary hover:bg-white transition-all shadow-sm"
          >
            <X size={20} />
          </button>
          <div className="flex flex-col items-center text-center mt-4">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-white shadow-2xl mb-4 text-primary font-bold text-3xl">
              {selectedCustomer.firstName.charAt(0)}
              {selectedCustomer.lastName.charAt(0)}
            </div>
            <h2 className="font-headline-md text-3xl text-primary">
              {selectedCustomer.firstName} {selectedCustomer.lastName}
            </h2>
            <p className={`font-label-caps text-xs mb-4 ${healthStyle.text}`}>
              {selectedCustomer._id} • {health.toUpperCase()}
            </p>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-6 py-2 bg-primary text-on-primary rounded-xl font-label-caps text-[10px] shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
                <ShoppingBag size={14} /> NEW ORDER
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 space-y-10">
          {/* Health status */}
          <section className="flex flex-col items-center justify-center p-6 bg-white/6 rounded-3xl border border-white/12 shadow-inner relative overflow-hidden">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 border-white/40 shadow-lg ${healthStyle.text} bg-current/10`}>
              <Repeat size={28} className={healthStyle.text} />
            </div>
            <div className="text-center mt-4">
              <h5 className={`font-headline-sm text-lg font-bold ${healthStyle.text}`}>{health}</h5>
              <p className="text-[10px] text-outline max-w-[270px] mt-1 leading-normal">
                {healthStyle.description}
              </p>
              <p className="text-[9px] font-label-caps text-outline/70 tracking-wider mt-2">
                {frequencyLabel(selectedCustomer.orderCount)} · {selectedCustomer.orderCount} orders
              </p>
            </div>
          </section>

          {/* Contact info */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-primary" />
              <h4 className="font-label-caps text-[11px] text-primary tracking-widest">BASIC INFORMATION</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-white/6 p-5 rounded-3xl border border-white/12">
              <div>
                <p className="font-label-caps text-[9px] text-outline mb-1">PRIMARY PHONE</p>
                <p className="font-data-tabular text-sm font-bold">{selectedCustomer.phone1}</p>
              </div>
              <div>
                <p className="font-label-caps text-[9px] text-outline mb-1">EMAIL</p>
                <p className="font-data-tabular text-sm font-bold text-primary truncate">
                  {selectedCustomer.email || "—"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="font-label-caps text-[9px] text-outline mb-1">PURCHASE FREQUENCY</p>
                <p className="text-sm font-bold">
                  {frequencyLabel(selectedCustomer.orderCount)} · {selectedCustomer.orderCount} lifetime orders
                </p>
              </div>
            </div>
          </section>

          {/* Purchase analytics */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag size={18} className="text-primary" />
              <h4 className="font-label-caps text-[11px] text-primary tracking-widest">
                PURCHASE & CREDIT ANALYTICS
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <p className="font-label-caps text-[9px] text-primary mb-1">LIFETIME VALUE</p>
                <p className="font-headline-md text-xl text-primary font-bold">
                  {formatCurrency(selectedCustomer.totalSpent)}
                </p>
              </div>
              <div className="bg-secondary/5 p-4 rounded-2xl border border-secondary/10">
                <p className="font-label-caps text-[9px] text-secondary mb-1">TOTAL ORDERS</p>
                <p className="font-headline-md text-xl text-secondary font-bold">
                  {selectedCustomer.orderCount} orders
                </p>
              </div>
              <div className="bg-tertiary/5 p-4 rounded-2xl border border-tertiary/10">
                <p className="font-label-caps text-[9px] text-tertiary mb-1">AVG ORDER VALUE</p>
                <p className="font-headline-md text-xl text-tertiary font-bold">
                  {formatCurrency(
                    selectedCustomer.orderCount > 0 ? selectedCustomer.totalSpent / selectedCustomer.orderCount : 0
                  )}
                </p>
              </div>
              <div className="bg-outline/5 p-4 rounded-2xl border border-outline/10">
                <p className="font-label-caps text-[9px] text-outline mb-1">LAST PURCHASE</p>
                <p className="text-lg font-bold mt-1">
                  {selectedCustomer.lastPurchaseDate
                    ? new Date(selectedCustomer.lastPurchaseDate).toLocaleDateString()
                    : "No Purchases"}
                </p>
              </div>
              <div
                className={`col-span-2 p-4 rounded-2xl border flex justify-between items-center ${
                  (selectedCustomer.debitBalance || 0) > 0
                    ? "bg-error/5 border-error/10"
                    : (selectedCustomer.creditBalance || 0) > 0
                      ? "bg-primary/5 border-primary/10"
                      : "bg-emerald-50 border-emerald-100"
                }`}
              >
                <div>
                  <p
                    className={`font-label-caps text-[9px] mb-1 ${
                      (selectedCustomer.debitBalance || 0) > 0
                        ? "text-error"
                        : (selectedCustomer.creditBalance || 0) > 0
                          ? "text-primary"
                          : "text-emerald-700"
                    }`}
                  >
                    CREDIT STATUS
                  </p>
                  <p
                    className={`font-headline-md text-xl font-bold ${
                      (selectedCustomer.debitBalance || 0) > 0
                        ? "text-error"
                        : (selectedCustomer.creditBalance || 0) > 0
                          ? "text-primary"
                          : "text-emerald-700"
                    }`}
                  >
                    {(selectedCustomer.debitBalance || 0) > 0
                      ? formatCurrency(selectedCustomer.debitBalance!)
                      : (selectedCustomer.creditBalance || 0) > 0
                        ? formatCurrency(selectedCustomer.creditBalance!)
                        : formatCurrency(0)}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      (selectedCustomer.debitBalance || 0) > 0
                        ? "bg-rose-100 text-rose-700"
                        : (selectedCustomer.creditBalance || 0) > 0
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {(selectedCustomer.debitBalance || 0) > 0
                      ? "OUTSTANDING DEBT"
                      : (selectedCustomer.creditBalance || 0) > 0
                        ? "STORE CREDIT"
                        : "GOOD STANDING"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <h4 className="font-label-caps text-[11px] text-outline mb-4">CLIENT NOTES</h4>
            <div className="bg-secondary-fixed/10 p-5 rounded-3xl border border-secondary-fixed-dim/30">
              <p className="font-body-md text-sm italic text-on-surface-variant leading-relaxed">
                "{selectedCustomer.notes || "No boutique preferences recorded."}"
              </p>
            </div>
          </section>
        </div>

        <div className="p-8 border-t border-outline-variant/30 bg-white/4 sticky bottom-0">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onEdit(selectedCustomer)}
              className="py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-xs shadow-xl shadow-primary/20 hover:opacity-90 transition-all"
            >
              EDIT PROFILE
            </button>
            <button
              onClick={() => onDelete(selectedCustomer._id)}
              className="py-4 bg-white border border-error/30 text-error rounded-2xl font-label-caps text-xs hover:bg-error/5 transition-all"
            >
              DELETE CUSTOMER
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
