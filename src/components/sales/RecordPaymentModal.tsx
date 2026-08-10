import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  creditBalance?: number;
  debitBalance?: number;
}

interface Transaction {
  _id: string;
  receiptNumber?: string;
  total: number;
  amountReceived?: number;
  debtAddedToAccount?: boolean;
  customerId?: string;
}

interface RecordPaymentModalProps {
  transaction: Transaction;
  customer: Customer;
  onClose: () => void;
  formatCurrency: (v: number) => string;
}

const REAL_METHODS = ["Cash", "BCI", "BIM", "M-Pesa", "e-Mola", "Conta Movel", "Bank Transfer"];

export const RecordPaymentModal = ({ transaction, customer, onClose, formatCurrency }: RecordPaymentModalProps) => {
  const addPayment = useMutation(api.payments.addPayment);
  const recordSalePayment = useMutation(api.payments.recordSalePayment);

  const mode: "account" | "sale" = transaction.debtAddedToAccount ? "account" : "sale";

  const outstandingOnSale = Math.max(0, transaction.total - (transaction.amountReceived ?? 0));
  const remaining =
    mode === "account" ? Math.min(outstandingOnSale, customer.debitBalance || 0) : outstandingOnSale;

  const methods = REAL_METHODS.concat((customer.creditBalance || 0) > 0 ? ["Store Credit"] : []);

  const [method, setMethod] = useState(methods[0]);
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const isStoreCredit = method === "Store Credit";

  const storeCreditCap = Math.min(remaining, customer.creditBalance || 0);
  const overpay = !isStoreCredit && parsedAmount > remaining ? parsedAmount - remaining : 0;

  const errorHint = useMemo(() => {
    if (parsedAmount <= 0) return null;
    if (isStoreCredit && parsedAmount > storeCreditCap + 0.01) {
      return `Only ${formatCurrency(storeCreditCap)} of store credit can be applied here.`;
    }
    return null;
  }, [isStoreCredit, parsedAmount, storeCreditCap, formatCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction.customerId) return;
    if (parsedAmount <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }
    if (errorHint) {
      toast.error(errorHint);
      return;
    }

    setIsSubmitting(true);
    try {
      const mutate = mode === "account" ? addPayment : recordSalePayment;
      await mutate({
        customerId: transaction.customerId as Id<"customers">,
        transactionId: transaction._id as Id<"transactions">,
        amount: parsedAmount,
        paymentMethod: method,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success("Payment recorded.");
      onClose();
    } catch (error: any) {
      const message = error?.data || error?.message || "Failed to record payment.";
      toast.error(typeof message === "string" ? message.replace(/Uncaught Error: |\[ConvexError\] /g, "") : "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-primary/10"
      >
        <h3 className="text-2xl font-headline-md text-primary mb-2">Record Payment</h3>
        <p className="text-sm text-outline mb-6">
          {mode === "account"
            ? `Recovering account debt for ${customer.firstName} ${customer.lastName}.`
            : `Settling ${transaction.receiptNumber || "this sale"} directly.`}{" "}
          Outstanding: <span className="font-bold">{formatCurrency(remaining)}</span>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-label-caps text-outline mb-1 block">METHOD</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl text-sm font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
            >
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m === "Store Credit" ? `Store Credit (${formatCurrency(customer.creditBalance || 0)})` : m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-label-caps text-outline mb-1 block">AMOUNT (MT)</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl font-data-tabular text-lg outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="0.00"
            />
            {errorHint && <p className="text-[11px] text-error mt-1">{errorHint}</p>}
            {!errorHint && overpay > 0 && (
              <p className="text-[11px] text-emerald-600 mt-1">
                {formatCurrency(overpay)} more than the outstanding balance — it will be saved as store credit.
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-label-caps text-outline mb-1 block">REFERENCE (OPTIONAL)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Provider transaction reference"
            />
          </div>

          <div>
            <label className="text-[10px] font-label-caps text-outline mb-1 block">NOTES (OPTIONAL)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g., Paid in person at the boutique"
            />
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-surface border border-primary/10 rounded-xl text-primary font-label-caps text-xs"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-label-caps text-xs shadow-xl disabled:opacity-50"
            >
              {isSubmitting ? "RECORDING..." : "RECORD PAYMENT"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
