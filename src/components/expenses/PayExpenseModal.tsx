'use client';

import React, { useState } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'e-Mola', 'BCI', 'BIM Cash', 'Card', 'Bank Transfer'];

interface PayExpenseModalProps {
  expense: any | null;
  onClose: () => void;
  formatCurrency: (v: number) => string;
}

export function PayExpenseModal({ expense, onClose, formatCurrency }: PayExpenseModalProps) {
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const payExpense = useMutation(api.expenses.payExpense);

  const handlePay = async () => {
    if (!expense) return;
    setIsSubmitting(true);
    try {
      await payExpense({
        id: expense._id,
        paymentMethod,
        paymentDate: new Date(paymentDate + 'T00:00:00Z').getTime(),
      });
      toast.success(`${expense.title} marked as paid`);
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {expense && (
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
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="relative w-full max-w-md bg-surface-container rounded-3xl shadow-2xl border border-white/10 p-8"
          >
            <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-primary/10 rounded-full text-outline transition-colors">
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-secondary/10 text-secondary">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-headline-md text-lg text-primary">Record Payment</h3>
                <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">{expense.title}</p>
              </div>
            </div>

            <p className="font-headline-md text-3xl text-primary mb-6">{formatCurrency(expense.amount)}</p>

            <div className="space-y-4">
              <div>
                <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">PAYMENT METHOD</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none font-bold text-primary cursor-pointer"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">PAYMENT DATE</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                />
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={isSubmitting}
              className="w-full mt-8 py-3.5 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              CONFIRM PAYMENT
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
