'use client';

import React, { useState } from 'react';
import { X, CreditCard, Repeat, User, FileText, History, CheckCircle2, Ban, Pencil, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';
import { useAuth } from '../AuthProvider';

const STATUS_BADGE: Record<string, string> = {
  Paid: 'bg-secondary-container/20 text-secondary',
  Pending: 'bg-primary-fixed/30 text-primary',
  Overdue: 'bg-error-container/30 text-error',
  Cancelled: 'bg-outline-variant/20 text-outline',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function templateScheduleLabel(template: any) {
  if (template.frequency === 'Daily') return 'Every day';
  if (template.frequency === 'Weekly') return `Every ${DAY_NAMES[template.dayOfWeek ?? 0]}`;
  return `Day ${template.dueDay ?? 1} of each month`;
}

interface ExpenseDetailDrawerProps {
  expenseId: string | null;
  onClose: () => void;
  onEdit: (expense: any) => void;
  onPay: (expense: any) => void;
  formatCurrency: (v: number) => string;
}

export function ExpenseDetailDrawer({ expenseId, onClose, onEdit, onPay, formatCurrency }: ExpenseDetailDrawerProps) {
  const { user } = useAuth();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  const data = useQuery(api.expenses.get, expenseId ? { id: expenseId as any } : 'skip');
  const auditTrail = useQuery(api.expenses.getAuditTrail, expenseId ? { referenceId: expenseId } : 'skip') || [];
  const cancelExpense = useMutation(api.expenses.cancelExpense);
  const deleteExpense = useMutation(api.expenses.deleteExpense);

  const expense = data?.expense;
  const template = data?.template;

  const handleCancel = async () => {
    if (!expense) return;
    if (!cancelReason.trim()) {
      toast.error('A reason is required to cancel this expense.');
      return;
    }
    try {
      await cancelExpense({ id: expense._id, reason: cancelReason });
      toast.success('Expense cancelled');
      setShowCancelForm(false);
      setCancelReason('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel expense');
    }
  };

  const handleDelete = () => {
    if (!expense) return;
    const description = expense.templateId
      ? 'This is a recurring-generated expense. Deleting it is permanent, and the next generation run will recreate it for this period unless you also disable or delete its template.'
      : 'Are you sure you want to permanently delete this expense? This action cannot be undone.';
    toast.warning('Confirm Deletion', {
      description,
      action: {
        label: 'Delete Permanently',
        onClick: async () => {
          try {
            await deleteExpense({ id: expense._id });
            toast.success('Expense deleted');
            onClose();
          } catch (error: any) {
            toast.error(error.message || 'Failed to delete expense');
          }
        },
      },
    });
  };

  const canEdit = expense && (expense.status === 'Pending' || expense.status === 'Overdue');
  const canPay = expense && (expense.status === 'Pending' || expense.status === 'Overdue');
  const canCancel = expense && expense.status !== 'Cancelled' && (expense.status !== 'Paid' || user?.role === 'admin');
  const canDelete = expense && expense.status !== 'Paid' && user?.role === 'admin';

  return (
    <AnimatePresence>
      {expenseId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-end p-0 md:p-6">
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
            className="relative w-full max-w-2xl h-full bg-surface-container overflow-y-auto shadow-2xl rounded-l-3xl md:rounded-3xl border-l border-white/10"
          >
            {!expense ? (
              <div className="p-8 text-center text-outline/50">Loading...</div>
            ) : (
              <>
                <div className="sticky top-0 z-10 bg-surface-container/80 backdrop-blur-md p-8 flex justify-between items-start border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-headline-md text-xl text-primary">{expense.title}</h3>
                    <span
                      className={`inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_BADGE[expense.status] || 'bg-outline-variant/20 text-outline'}`}
                    >
                      {expense.status}
                    </span>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-primary/10 rounded-full text-outline transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-8">
                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    {canPay && (
                      <button
                        onClick={() => onPay(expense)}
                        className="px-4 py-2.5 bg-primary text-on-primary rounded-xl font-label-caps text-[10px] shadow-md hover:opacity-90 transition-opacity flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} /> RECORD PAYMENT
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => onEdit(expense)}
                        className="px-4 py-2.5 bg-white/8 border border-primary/20 text-primary rounded-xl font-label-caps text-[10px] hover:bg-white/12 transition-colors flex items-center gap-1.5"
                      >
                        <Pencil size={14} /> EDIT
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => setShowCancelForm(!showCancelForm)}
                        className="px-4 py-2.5 bg-error/10 border border-error/20 text-error rounded-xl font-label-caps text-[10px] hover:bg-error/15 transition-colors flex items-center gap-1.5"
                      >
                        <Ban size={14} /> CANCEL
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2.5 bg-white/8 border border-error/20 text-error rounded-xl font-label-caps text-[10px] hover:bg-error/10 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 size={14} /> DELETE
                      </button>
                    )}
                  </div>

                  {showCancelForm && (
                    <div className="p-4 bg-error/5 border border-error/20 rounded-2xl space-y-3">
                      <label className="font-label-caps text-[10px] text-error block">REASON FOR CANCELLATION</label>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={2}
                        className="w-full px-4 py-3 bg-white/8 border border-error/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-error/20 resize-none"
                        placeholder="Explain why this expense is being cancelled..."
                      />
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-error text-white rounded-xl font-label-caps text-[10px] hover:opacity-90 transition-opacity"
                      >
                        CONFIRM CANCELLATION
                      </button>
                    </div>
                  )}

                  {/* General Information */}
                  <div>
                    <h4 className="font-label-caps text-[10px] text-outline tracking-widest mb-4 flex items-center gap-2">
                      <FileText size={14} /> GENERAL INFORMATION
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoField label="Amount" value={formatCurrency(expense.amount)} />
                      <InfoField label="Category" value={expense.category} />
                      <InfoField label="Due Date" value={new Date(expense.dueDate).toLocaleDateString()} />
                      <InfoField
                        label="Origin"
                        value={
                          <span className="flex items-center gap-1.5">
                            {expense.origin === 'Recurring' ? <Repeat size={12} /> : <User size={12} />}
                            {expense.origin}
                          </span>
                        }
                      />
                    </div>
                  </div>

                  {/* Payment History */}
                  <div>
                    <h4 className="font-label-caps text-[10px] text-outline tracking-widest mb-4 flex items-center gap-2">
                      <CreditCard size={14} /> PAYMENT HISTORY
                    </h4>
                    {expense.status === 'Paid' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <InfoField label="Payment Date" value={expense.paymentDate ? new Date(expense.paymentDate).toLocaleDateString() : '—'} />
                        <InfoField label="Payment Method" value={expense.paymentMethod || '—'} />
                      </div>
                    ) : (
                      <p className="font-body-md text-sm text-on-surface-variant opacity-60">No payment recorded yet.</p>
                    )}
                  </div>

                  {/* Template Information */}
                  {template && (
                    <div>
                      <h4 className="font-label-caps text-[10px] text-outline tracking-widest mb-4 flex items-center gap-2">
                        <Repeat size={14} /> TEMPLATE INFORMATION
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoField label="Template Name" value={template.name} />
                        <InfoField label="Frequency" value={template.frequency} />
                        <InfoField label="Schedule" value={templateScheduleLabel(template)} />
                        <InfoField label="Template Status" value={template.active ? 'Active' : 'Disabled'} />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <h4 className="font-label-caps text-[10px] text-outline tracking-widest mb-4">NOTES</h4>
                    <p className="font-body-md text-sm text-on-surface-variant whitespace-pre-line">
                      {expense.notes || 'No notes.'}
                    </p>
                  </div>

                  {/* Audit Timeline */}
                  <div>
                    <h4 className="font-label-caps text-[10px] text-outline tracking-widest mb-4 flex items-center gap-2">
                      <History size={14} /> AUDIT TIMELINE
                    </h4>
                    <div className="space-y-3">
                      {auditTrail.length === 0 && (
                        <p className="font-body-md text-sm text-on-surface-variant opacity-60">No audit entries yet.</p>
                      )}
                      {auditTrail.map((entry: any) => (
                        <div key={entry._id} className="flex items-start gap-3 pb-3 border-b border-outline-variant/20 last:border-0">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div>
                            <p className="font-label-caps text-[10px] text-primary tracking-wide">{entry.action.replace(/_/g, ' ')}</p>
                            <p className="font-body-md text-xs text-on-surface-variant opacity-70">
                              {new Date(entry.timestamp).toLocaleString()} — {entry.userId}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-label-caps text-[9px] text-outline tracking-widest mb-1">{label.toUpperCase()}</p>
      <p className="font-body-md text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}
