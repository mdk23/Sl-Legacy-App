import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Trash2, Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CustomerBalanceBadge } from "../customers/CustomerBalanceBadge";

interface Product {
  _id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  imageUrl?: string;
  category?: string;
}

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  customerHealth?: string;
  creditBalance?: number;
  debitBalance?: number;
}

interface NewSaleDrawerProps {
  isAddingSale: boolean;
  setIsAddingSale: (v: boolean) => void;
  isSuccess: boolean;
  setIsSuccess: (v: boolean) => void;
  lastReceipt: string;
  saleForm: {
    customerId: string | undefined;
    items: { productId: string; quantity: number; price: number; name: string }[];
    paymentBreakdown: { method: string; amount: number }[];
    discount: number;
    notes: string;
    changeHandling: string;
    addRemainingToAccount?: boolean;
  };
  setSaleForm: React.Dispatch<React.SetStateAction<any>>;
  saleTotals: { subtotal: number; total: number };
  handleRegisterSale: () => void;
  formatCurrency: (v: number) => string;
}

export const NewSaleDrawer = ({
  isAddingSale,
  setIsAddingSale,
  isSuccess,
  setIsSuccess,
  lastReceipt,
  saleForm,
  setSaleForm,
  saleTotals,
  handleRegisterSale,
  formatCurrency,
}: NewSaleDrawerProps) => {
  const customers = (useQuery(api.customers.list) || []) as Customer[];
  const products = (useQuery(api.products.list, { archived: false }) || []) as Product[];
  const selectedCustomer = customers.find((c) => c._id === saleForm.customerId);
  const totalPaid = saleForm.paymentBreakdown.reduce((acc, p) => acc + p.amount, 0);
  const remaining = saleTotals.total - totalPaid;
  const changeGiven = remaining < 0 ? Math.abs(remaining) : 0;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setIsAddingSale(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        className="relative w-full max-w-2xl h-full bg-surface-container shadow-2xl flex flex-col border-l border-white/10"
      >
        {/* POS Header */}
        <div className="p-8 bg-atelier-gradient border-b border-primary/10">
          <div className="flex justify-between items-center">
            <h2 className="font-headline-md text-3xl text-primary">New Sale Ticket</h2>
            <button onClick={() => setIsAddingSale(false)} className="p-2 hover:bg-white/6 rounded-full text-primary">
              <X size={24} />
            </button>
          </div>
          <p className="font-label-caps text-[10px] text-primary/70 mt-2 tracking-widest">BOUTIQUE POS INTERFACE</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="w-24 h-24 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-6">
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="font-headline-md text-3xl text-primary mb-2">Transaction Finalized</h3>
                <p className="font-body-md text-on-surface-variant mb-8">
                  The sale has been successfully recorded in the vault.
                </p>

                <div className="w-full bg-white/6 border border-white/12 rounded-3xl p-6 mb-10">
                  <p className="font-label-caps text-[10px] text-on-surface-variant mb-2">RECEIPT NUMBER</p>
                  <p className="font-data-tabular text-2xl font-bold text-primary">{lastReceipt}</p>
                </div>

                <button
                  onClick={() => {
                    setIsAddingSale(false);
                    setIsSuccess(false);
                  }}
                  className="w-full py-5 bg-primary text-on-primary rounded-2xl font-label-caps text-sm shadow-xl shadow-primary/20"
                >
                  CLOSE TICKET
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="pos-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 space-y-10"
              >
                {/* Customer Selection */}
                <section>
                  <label className="font-label-caps text-[11px] text-on-surface-variant mb-4 block">1. LINK CLIENT ACCOUNT</label>
                  <select
                    className="w-full p-4 bg-white/6 border border-white/12 rounded-2xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    value={saleForm.customerId || ""}
                    onChange={(e) => setSaleForm({ ...saleForm, customerId: e.target.value || undefined })}
                  >
                    <option value="">WALK-IN CUSTOMER (NO ACCOUNT)</option>
                    {customers.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.firstName} {c.lastName} ({c.customerHealth || "New Client"})
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="mt-3">
                      <CustomerBalanceBadge
                        creditBalance={selectedCustomer.creditBalance}
                        debitBalance={selectedCustomer.debitBalance}
                        formatCurrency={formatCurrency}
                      />
                    </div>
                  )}
                </section>

                {/* Items Selection */}
                <section className="space-y-6">
                  <label className="font-label-caps text-[11px] text-on-surface-variant block">2. SELECT BOUTIQUE PIECES</label>
                  <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
                    {products
                      .filter((p) => p.stock > 0)
                      .map((p) => (
                        <button
                          type="button"
                          key={p._id}
                          onClick={() => {
                            const existing = saleForm.items.find((i) => i.productId === p._id);
                            if (existing) {
                              setSaleForm({
                                ...saleForm,
                                items: saleForm.items.map((i) =>
                                  i.productId === p._id ? { ...i, quantity: i.quantity + 1 } : i
                                ),
                              });
                            } else {
                              setSaleForm({
                                ...saleForm,
                                items: [
                                  ...saleForm.items,
                                  { productId: p._id, name: p.name, quantity: 1, price: p.sellingPrice },
                                ],
                              });
                            }
                          }}
                          className="p-4 bg-white/8 border border-white/16 rounded-2xl flex flex-col items-start gap-2 hover:bg-white transition-all text-left group"
                        >
                          <div className="w-full aspect-square rounded-xl overflow-hidden mb-2">
                            <img
                              src={p.imageUrl || undefined}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            />
                          </div>
                          <p className="font-bold text-xs text-primary">{p.name}</p>
                          <div className="flex justify-between w-full items-center">
                            <span className="font-data-tabular text-[10px] text-outline">
                              {formatCurrency(p.sellingPrice)}
                            </span>
                            <span className="text-[9px] font-bold text-secondary">{p.stock} IN STOCK</span>
                          </div>
                        </button>
                      ))}
                  </div>

                  {/* Cart Items */}
                  <div className="space-y-3">
                    {saleForm.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10"
                      >
                        <div>
                          <p className="font-bold text-sm text-primary">{item.name}</p>
                          <div className="flex gap-4 mt-1">
                            <span className="font-data-tabular text-[10px] text-outline">QTY: {item.quantity}</span>
                            <span className="font-data-tabular text-[10px] text-outline">
                              UNIT: {formatCurrency(item.price)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSaleForm({ ...saleForm, items: saleForm.items.filter((_, i) => i !== idx) })}
                          className="p-2 text-error hover:bg-error/10 rounded-full"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Financial Summary */}
                <section className="bg-white/6 p-6 rounded-3xl border border-white space-y-4">
                  <h4 className="font-label-caps text-[11px] text-on-surface-variant">3. FINANCIAL RECONCILIATION</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-outline">SUBTOTAL</span>
                      <span className="font-data-tabular font-bold">{formatCurrency(saleTotals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-outline">DISCOUNT (Mt)</span>
                      <input
                        type="number"
                        value={saleForm.discount}
                        onChange={(e) => setSaleForm({ ...saleForm, discount: parseFloat(e.target.value) || 0 })}
                        className="w-24 text-right bg-transparent border-b border-primary/20 font-data-tabular font-bold focus:border-primary outline-none"
                      />
                    </div>
                    <div className="pt-4 border-t border-primary/20 flex justify-between">
                      <span className="font-headline-sm text-primary text-xl">GRANDE TOTAL</span>
                      <span className="font-headline-sm text-primary text-2xl">{formatCurrency(saleTotals.total)}</span>
                    </div>
                  </div>
                </section>

                {/* Payment Breakdown */}
                <section>
                  <label className="font-label-caps text-[11px] text-on-surface-variant mb-4 block">
                    4. PAYMENT METHODS & SPLITS
                  </label>

                  <div className="space-y-4">
                    {saleForm.paymentBreakdown.map((pay, idx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={idx}
                        className="flex gap-4 items-center"
                      >
                        <select
                          className="flex-1 p-4 bg-white/6 border border-white/12 rounded-2xl text-xs font-bold"
                          value={pay.method}
                          onChange={(e) => {
                            const newMethod = e.target.value;
                            const isBlank = !pay.amount || pay.amount === 0;
                            let newAmount = pay.amount;
                            if (isBlank) {
                              // Auto-fill so picking a method never silently submits with no amount.
                              const othersTotal = saleForm.paymentBreakdown
                                .filter((_: any, i: number) => i !== idx)
                                .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
                              const remainingForRow = Math.max(0, saleTotals.total - othersTotal);
                              newAmount =
                                newMethod === "Store Credit" && selectedCustomer?.creditBalance
                                  ? Math.min(remainingForRow, selectedCustomer.creditBalance)
                                  : remainingForRow;
                            } else if (newMethod === "Store Credit" && selectedCustomer?.creditBalance) {
                              newAmount = Math.min(pay.amount, selectedCustomer.creditBalance);
                            }
                            setSaleForm({
                              ...saleForm,
                              paymentBreakdown: saleForm.paymentBreakdown.map((p, i) =>
                                i === idx ? { ...p, method: newMethod, amount: newAmount } : p
                              ),
                            });
                          }}
                        >
                          {["Cash", "M-Pesa", "e-Mola", "BCI", "BIM", "Bank Transfer", "Card"]
                            .concat(selectedCustomer?.creditBalance && selectedCustomer.creditBalance > 0 ? ["Store Credit"] : [])
                            .filter(
                              (m) =>
                                m === pay.method ||
                                !saleForm.paymentBreakdown.some((other, i) => i !== idx && other.method === m),
                            )
                            .map((m) => (
                              <option key={m}>
                                {m === "Store Credit" ? `Store Credit (Mt ${selectedCustomer!.creditBalance})` : m}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          placeholder="Amount"
                          value={pay.amount}
                          onChange={(e) => {
                            let newAmount = parseFloat(e.target.value) || 0;
                            if (pay.method === "Store Credit" && selectedCustomer?.creditBalance) {
                              newAmount = Math.min(newAmount, selectedCustomer.creditBalance);
                            }
                            setSaleForm({
                              ...saleForm,
                              paymentBreakdown: saleForm.paymentBreakdown.map((p, i) =>
                                i === idx ? { ...p, amount: newAmount } : p
                              ),
                            });
                          }}
                          className="flex-1 p-4 bg-white/6 border border-white/12 rounded-2xl font-data-tabular text-sm"
                        />
                        {saleForm.paymentBreakdown.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSaleForm({
                                ...saleForm,
                                paymentBreakdown: saleForm.paymentBreakdown.filter((_, i) => i !== idx),
                              })
                            }
                            className="p-2 text-outline/40 hover:text-error transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </motion.div>
                    ))}

                    <div className="flex justify-between items-center px-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSaleForm({
                            ...saleForm,
                            paymentBreakdown: [...saleForm.paymentBreakdown, { method: "BCI", amount: 0 }],
                          })
                        }
                        className="text-xs font-label-caps text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus size={14} /> ADD PAYMENT METHOD
                      </button>

                      <div className="text-right">
                        <p className="font-label-caps text-[9px] text-on-surface-variant">REMAINING</p>
                        <p
                          className={`font-data-tabular font-bold ${
                            saleTotals.total - saleForm.paymentBreakdown.reduce((acc, p) => acc + p.amount, 0) > 0
                              ? "text-error"
                              : "text-secondary"
                          }`}
                        >
                          {formatCurrency(saleTotals.total - saleForm.paymentBreakdown.reduce((acc, p) => acc + p.amount, 0))}
                        </p>
                      </div>
                    </div>

                    {remaining > 0 && saleForm.customerId && (
                      <label className="flex items-start gap-2.5 px-2 pt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!saleForm.addRemainingToAccount}
                          onChange={(e) => setSaleForm({ ...saleForm, addRemainingToAccount: e.target.checked })}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="leading-snug">
                          <span className="block text-xs font-bold text-on-surface">Add Remaining Balance to Customer Account</span>
                          <span className="block text-[11px] text-on-surface-variant mt-0.5">
                            Otherwise this sale stays pending — the customer&rsquo;s account balance won&rsquo;t change.
                          </span>
                        </span>
                      </label>
                    )}

                    {changeGiven > 0 && (
                      <div className="flex justify-between items-center px-2 pt-2">
                        <span className="text-xs text-outline">Change Handling</span>
                        <select
                          value={saleForm.changeHandling}
                          onChange={(e) => setSaleForm({ ...saleForm, changeHandling: e.target.value })}
                          className="bg-transparent border border-outline-variant/30 rounded px-2 py-1 text-[11px] font-bold text-primary outline-none cursor-pointer"
                        >
                          {["Cash", "BCI", "BIM", "M-Pesa", "e-Mola", "Conta Movel", "Bank Transfer"]
                            .concat(saleForm.customerId ? ["Store Credit"] : [])
                            .map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* POS Footer */}
        {!isSuccess && (
          <div className="p-8 border-t border-outline-variant/30 bg-white/8 sticky bottom-0">
            <button
              type="button"
              onClick={handleRegisterSale}
              disabled={saleForm.items.length === 0}
              className="w-full py-5 bg-primary text-on-primary rounded-2xl font-label-caps text-sm shadow-2xl shadow-primary/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
            >
              <CheckCircle2 size={24} /> FINALIZE TRANSACTION
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
