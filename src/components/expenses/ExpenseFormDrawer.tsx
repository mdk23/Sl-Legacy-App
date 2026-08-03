'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';

interface ExpenseFormDrawerProps {
  open: boolean;
  onClose: () => void;
  editingExpense: any | null; // null = create mode
  categories: string[];
}

const EMPTY_FORM = { title: '', category: '', amount: '', dueDate: '', notes: '' };

export function ExpenseFormDrawer({ open, onClose, editingExpense, categories }: ExpenseFormDrawerProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createExpense = useMutation(api.expenses.createExpense);
  const updateExpense = useMutation(api.expenses.updateExpense);

  useEffect(() => {
    if (editingExpense) {
      setForm({
        title: editingExpense.title,
        category: editingExpense.category,
        amount: String(editingExpense.amount),
        dueDate: new Date(editingExpense.dueDate).toISOString().split('T')[0],
        notes: editingExpense.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingExpense, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.category.trim() || !form.dueDate) {
      toast.error('Title, category, and due date are required.');
      return;
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error('Amount must be greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const dueDate = new Date(form.dueDate + 'T00:00:00Z').getTime();
      if (editingExpense) {
        await updateExpense({
          id: editingExpense._id,
          title: form.title,
          category: form.category,
          amount,
          dueDate,
          notes: form.notes || undefined,
        });
        toast.success('Expense updated');
      } else {
        await createExpense({
          title: form.title,
          category: form.category,
          amount,
          dueDate,
          notes: form.notes || undefined,
        });
        toast.success('Expense created');
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-xl h-full bg-surface-container overflow-y-auto shadow-2xl rounded-l-3xl md:rounded-3xl border-l border-white/10"
          >
            <div className="sticky top-0 z-10 bg-surface-container/80 backdrop-blur-md p-8 flex justify-between items-start border-b border-outline-variant/30">
              <div>
                <h3 className="font-headline-md text-xl text-primary">{editingExpense ? 'Edit Expense' : 'New Expense'}</h3>
                <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest mt-1">ONE-TIME EXPENSE</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-primary/10 rounded-full text-outline transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div>
                <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">TITLE</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Office supplies"
                  className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">CATEGORY</label>
                <input
                  type="text"
                  list="expense-categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Supplies, Fuel, Marketing"
                  className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
                <datalist id="expense-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">AMOUNT (Mt)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">DUE DATE</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-label-caps text-[10px] text-on-surface-variant block mb-2">NOTES (OPTIONAL)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {editingExpense ? 'SAVE CHANGES' : 'CREATE EXPENSE'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
