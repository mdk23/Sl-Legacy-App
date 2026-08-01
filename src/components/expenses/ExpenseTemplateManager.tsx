'use client';

import React, { useState } from 'react';
import { Plus, X, Repeat, Power, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';
import { useAuth } from '../AuthProvider';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EMPTY_FORM = {
  name: '',
  category: '',
  amount: '',
  frequency: 'Monthly',
  dueDay: '1',
  dayOfWeek: '1',
  startDate: new Date().toISOString().split('T')[0],
  notes: '',
};

function frequencySummary(template: any) {
  if (template.frequency === 'Daily') return 'DAILY';
  if (template.frequency === 'Weekly') return `WEEKLY · ${DAY_NAMES[template.dayOfWeek ?? 0].toUpperCase()}`;
  return `MONTHLY · DAY ${template.dueDay ?? 1}`;
}

interface ExpenseTemplateManagerProps {
  open: boolean;
  onClose: () => void;
  formatCurrency: (v: number) => string;
}

export function ExpenseTemplateManager({ open, onClose, formatCurrency }: ExpenseTemplateManagerProps) {
  const { user } = useAuth();
  const templates = useQuery(api.expenseTemplates.list, {}) || [];
  const createRecurringTemplate = useMutation(api.expenseTemplates.createRecurringTemplate);
  const setTemplateActive = useMutation(api.expenseTemplates.setTemplateActive);
  const deleteTemplate = useMutation(api.expenseTemplates.deleteTemplate);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !form.category.trim() || !amount || amount <= 0) {
      toast.error('Name, category, and a positive amount are required.');
      return;
    }
    if (form.frequency === 'Monthly') {
      const dueDay = Number(form.dueDay);
      if (dueDay < 1 || dueDay > 31) {
        toast.error('Due day must be between 1 and 31.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await createRecurringTemplate({
        name: form.name,
        category: form.category,
        amount,
        frequency: form.frequency,
        dueDay: form.frequency === 'Monthly' ? Number(form.dueDay) : undefined,
        dayOfWeek: form.frequency === 'Weekly' ? Number(form.dayOfWeek) : undefined,
        startDate: new Date(form.startDate + 'T00:00:00Z').getTime(),
        notes: form.notes || undefined,
      });
      toast.success('Recurring expense template created');
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (template: any) => {
    try {
      await setTemplateActive({ id: template._id, active: !template.active });
      toast.success(template.active ? 'Template disabled' : 'Template enabled');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update template');
    }
  };

  const handleDelete = (template: any) => {
    toast.warning('Confirm Deletion', {
      description: `Delete the "${template.name}" recurring template? Expenses it already generated are kept, but no new ones will be created.`,
      action: {
        label: 'Delete Permanently',
        onClick: async () => {
          try {
            await deleteTemplate({ id: template._id });
            toast.success('Template deleted');
          } catch (error: any) {
            toast.error(error.message || 'Failed to delete template');
          }
        },
      },
    });
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
                <h3 className="font-headline-md text-xl text-primary">Recurring Templates</h3>
                <p className="font-label-caps text-[9px] text-outline tracking-widest mt-1">RENT, SALARIES, UTILITIES...</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-primary/10 rounded-full text-outline transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <button
                onClick={() => setShowForm(!showForm)}
                className="w-full py-3 bg-primary/10 border border-primary/20 text-primary rounded-2xl font-label-caps text-[10px] hover:bg-primary/15 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {showForm ? 'CLOSE FORM' : 'NEW RECURRING TEMPLATE'}
              </button>

              <AnimatePresence>
                {showForm && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleCreate}
                    className="overflow-hidden space-y-4 p-5 bg-white/6 border border-primary/10 rounded-2xl"
                  >
                    <input
                      type="text"
                      placeholder="Name (e.g. Rent)"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      type="text"
                      placeholder="Category (e.g. Rent)"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount (Mt)"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                    />

                    <div>
                      <label className="font-label-caps text-[9px] text-outline block mb-1.5">REPEATS</label>
                      <select
                        value={form.frequency}
                        onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none font-bold text-primary cursor-pointer"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>

                    {form.frequency === 'Monthly' && (
                      <div>
                        <label className="font-label-caps text-[9px] text-outline block mb-1.5">DUE DAY (1-31)</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={form.dueDay}
                          onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                          className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                        />
                      </div>
                    )}

                    {form.frequency === 'Weekly' && (
                      <div>
                        <label className="font-label-caps text-[9px] text-outline block mb-1.5">DAY OF WEEK</label>
                        <select
                          value={form.dayOfWeek}
                          onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                          className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none font-bold text-primary cursor-pointer"
                        >
                          {DAY_NAMES.map((name, i) => (
                            <option key={name} value={i}>{name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="font-label-caps text-[9px] text-outline block mb-1.5">STARTS ON</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-primary text-on-primary rounded-xl font-label-caps text-[10px] shadow-md hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                      CREATE TEMPLATE
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {templates.length === 0 && (
                  <p className="font-body-md text-sm text-on-surface-variant opacity-60 text-center py-8">
                    No recurring templates yet.
                  </p>
                )}
                {templates.map((template: any) => (
                  <div
                    key={template._id}
                    className={`p-5 rounded-2xl border flex items-center justify-between gap-4 ${
                      template.active ? 'bg-white/6 border-primary/10' : 'bg-white/2 border-outline-variant/20 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                        <Repeat size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-body-md text-sm font-bold text-on-surface truncate">{template.name}</p>
                        <p className="font-label-caps text-[9px] text-outline tracking-widest">
                          {formatCurrency(template.amount)} · {frequencySummary(template)} · {template.category}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(template)}
                        title={template.active ? 'Disable template' : 'Enable template'}
                        className={`p-2.5 rounded-xl transition-colors ${
                          template.active ? 'bg-secondary/10 text-secondary hover:bg-secondary/15' : 'bg-outline-variant/20 text-outline hover:bg-outline-variant/30'
                        }`}
                      >
                        <Power size={16} />
                      </button>
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => handleDelete(template)}
                          title="Delete template"
                          className="p-2.5 rounded-xl bg-error/10 text-error hover:bg-error/15 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
