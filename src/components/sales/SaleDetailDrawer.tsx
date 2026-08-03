import React from "react";
import { motion } from "framer-motion";
import { X, Printer, Trash2, AlertCircle } from "lucide-react";

interface SaleDetailDrawerProps {
  selectedSale: any;
  onClose: () => void;
  onRemoveSale: (id: string) => void;
  formatCurrency: (v: number) => string;
}

export const SaleDetailDrawer = ({
  selectedSale,
  onClose,
  onRemoveSale,
  formatCurrency,
}: SaleDetailDrawerProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-xl h-full bg-surface-container shadow-2xl flex flex-col border-l border-white/10"
      >
        {/* Drawer Header */}
        <div className="p-8 border-b border-outline-variant/30 flex justify-between items-start bg-white/6 backdrop-blur-md">
          <div>
            <h2 className="font-headline-md text-2xl text-primary">
              {selectedSale.receiptNumber?.replace("INV-", "ORD-")}
            </h2>
            <p className="font-label-caps text-[10px] text-on-surface-variant tracking-widest mt-1">
              TRANSACTION COMPLETED ON {new Date(selectedSale._creationTime).toLocaleDateString()} AT{" "}
              {new Date(selectedSale._creationTime).toLocaleTimeString()} BY{" "}
              {selectedSale.cashierName?.toUpperCase() || "SYSTEM"}
            </p>
            <div className="mt-3 flex gap-2">
              <span
                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${
                  selectedSale.status === "Paid" ? "bg-secondary-container/20 text-secondary" : "bg-primary/10 text-primary"
                }`}
              >
                {selectedSale.status.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-surface-container-highest text-outline text-[9px] font-bold">
                {selectedSale.paymentMethod?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary/5 rounded-full text-outline transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          {/* Customer Section */}
          <section>
            <h4 className="font-label-caps text-[11px] text-on-surface-variant mb-4">CUSTOMER INSIGHT</h4>
            <div className="bg-atelier-gradient p-6 rounded-3xl border border-primary/10 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center text-primary font-bold text-xl">
                {(selectedSale.customerName || "Walk-in")[0]}
              </div>
              <div>
                <p className="font-headline-md text-lg text-primary">{selectedSale.customerName || "Walk-in"}</p>
                <p className="font-label-caps text-[10px] text-primary/70">
                  {selectedSale.customerTier || "Regular"} CLIENT • PREVIOUS PURCHASES: 12
                </p>
              </div>
            </div>
          </section>

          {/* Line Items */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-label-caps text-[11px] text-on-surface-variant">LINE ITEMS</h4>
              <span className="font-label-caps text-[11px] text-primary">
                {(selectedSale.items || []).length} ITEMS
              </span>
            </div>
            <div className="space-y-4">
              {(selectedSale.items || []).map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-white/6 rounded-2xl border border-white/12">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shadow-md">
                    <img src={item.photo || undefined} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="font-body-md text-sm font-bold text-on-surface">{item.name}</p>
                    <p className="font-data-tabular text-xs text-outline">
                      {formatCurrency(item.price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-data-tabular text-sm font-bold text-primary">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Financial Breakdown */}
          <section>
            <h4 className="font-label-caps text-[11px] text-on-surface-variant mb-4">PAYMENT BREAKDOWN</h4>
            <div className="bg-surface-container-highest p-6 rounded-3xl space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant font-body-md">Subtotal</span>
                <span className="font-data-tabular font-bold">{formatCurrency(selectedSale.subtotal)}</span>
              </div>
              {selectedSale.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant font-body-md">Discount</span>
                  <span className="font-data-tabular font-bold text-error">
                    -{formatCurrency(selectedSale.discount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-outline-variant/30 pt-3">
                <span className="text-on-surface font-bold font-headline-md">Invoice Total</span>
                <span className="font-data-tabular font-bold text-xl text-primary">
                  {formatCurrency(selectedSale.total)}
                </span>
              </div>

              {/* Tenders Received */}
              {selectedSale.paymentBreakdown?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-outline-variant/30 space-y-2">
                  <span className="font-label-caps text-[9px] text-on-surface-variant mb-1 block">TENDERS RECEIVED</span>
                  {selectedSale.paymentBreakdown.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-on-surface-variant font-body-md">{p.method}</span>
                      <span className="font-data-tabular font-bold text-emerald-600">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Change Given */}
              {(selectedSale.changeGiven || 0) > 0 && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-on-surface-variant font-body-md">
                    Change Given {selectedSale.changeHandling ? `(${selectedSale.changeHandling})` : ""}
                  </span>
                  <span className="font-data-tabular font-bold text-amber-600">
                    {formatCurrency(selectedSale.changeGiven || 0)}
                  </span>
                </div>
              )}

              {selectedSale.balance > 0 && (
                <div className="flex justify-between text-sm bg-error/5 p-3 rounded-xl mt-4 border border-error/10">
                  <span className="text-error font-bold flex items-center gap-1">
                    <AlertCircle size={14} /> Outstanding Balance
                  </span>
                  <span className="font-data-tabular font-bold text-error">
                    {formatCurrency(selectedSale.balance)}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-8 border-t border-outline-variant/30 bg-white/6 backdrop-blur-md sticky bottom-0">
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center gap-2 p-3 bg-white border border-outline-variant/30 rounded-2xl text-primary hover:bg-primary/5 transition-all">
              <Printer size={18} />
              <span className="font-label-caps text-[8px]">PRINT</span>
            </button>
            <button
              onClick={() => onRemoveSale(selectedSale._id)}
              className="flex flex-col items-center gap-2 p-3 bg-white border border-error/20 rounded-2xl text-error hover:bg-error/5 transition-all"
            >
              <Trash2 size={18} />
              <span className="font-label-caps text-[8px]">PURGE</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
