'use client';

import React, { useState } from 'react';
import { Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import * as XLSX from 'xlsx';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' }).format(v).replace('MZN', 'Mt');

const STATUS_BADGE: Record<string, string> = {
  Paid: 'bg-secondary-container/20 text-secondary',
  Pending: 'bg-primary-fixed/30 text-primary',
  Overdue: 'bg-error-container/30 text-error',
  Cancelled: 'bg-outline-variant/20 text-outline',
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function ExpenseReports() {
  const [month, setMonth] = useState(currentMonthValue());
  const report = useQuery(api.expenses.getMonthlyReport, { month });

  const buildSheets = () => {
    if (!report) return null;
    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Monthly Expense Report', month],
      [],
      ['Total Records', report.summary.totalCount],
      ['Paid Amount', report.summary.paidAmount],
      ['Pending Amount', report.summary.pendingAmount],
      ['Overdue Amount', report.summary.overdueAmount],
      ['Cancelled Records', report.summary.cancelledCount],
      [],
      ['Paid vs Pending'],
      ['Paid', report.paidVsPending.paid],
      ['Pending (incl. Overdue)', report.paidVsPending.pending],
      [],
      ['Recurring vs Manual'],
      ['Recurring', report.recurringVsManual.recurring],
      ['Manual', report.recurringVsManual.manual],
      [],
      ['Cash Flow (by payment date)'],
      ['Total Paid Out', report.cashFlow.totalPaidOut],
      ['Payment Count', report.cashFlow.paymentCount],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const categoryData = [['Category', 'Paid Amount'], ...Object.entries(report.byCategory)];
    const wsCategory = XLSX.utils.aoa_to_sheet(categoryData);
    wsCategory['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsCategory, 'By Category');

    const rowsData = [
      ['Title', 'Category', 'Amount', 'Due Date', 'Payment Date', 'Status', 'Payment Method', 'Origin'],
      ...report.rows.map((r: any) => [
        r.title,
        r.category,
        r.amount,
        new Date(r.dueDate).toLocaleDateString(),
        r.paymentDate ? new Date(r.paymentDate).toLocaleDateString() : '',
        r.status,
        r.paymentMethod || '',
        r.origin,
      ]),
    ];
    const wsRows = XLSX.utils.aoa_to_sheet(rowsData);
    wsRows['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsRows, 'Expenses');

    return { wb, wsRows };
  };

  const handleExportExcel = () => {
    const sheets = buildSheets();
    if (!sheets) return;
    XLSX.writeFile(sheets.wb, `Expense_Report_${month}.xlsx`);
  };

  const handleExportCsv = () => {
    const sheets = buildSheets();
    if (!sheets || !report) return;
    const csv = XLSX.utils.sheet_to_csv(sheets.wsRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Expense_Report_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Expense Reports</h1>
          <p className="font-label-caps text-[10px] text-on-surface-variant tracking-widest mt-1">
            MONTHLY EXPENSES · BY CATEGORY · PAID VS PENDING · RECURRING · CASH FLOW
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="pl-9 pr-3 py-2.5 bg-white/8 border border-primary/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 font-data-tabular"
            />
          </div>
          <button
            onClick={handleExportCsv}
            disabled={!report}
            className="px-4 py-2.5 bg-white/8 border border-primary/20 text-primary rounded-xl font-label-caps text-[10px] hover:bg-white/12 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!report}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-label-caps text-[10px] shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> EXCEL
          </button>
        </div>
      </div>

      {!report ? (
        <div className="glass-panel p-16 rounded-3xl text-center text-on-surface-variant/50 font-label-caps text-xs">Loading report...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div className="glass-panel p-6 rounded-2xl">
              <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">TOTAL RECORDS</p>
              <h3 className="font-headline-md text-2xl text-primary">{report.summary.totalCount}</h3>
            </div>
            <div className="glass-panel p-6 rounded-2xl">
              <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">PAID</p>
              <h3 className="font-headline-md text-2xl text-secondary">{formatCurrency(report.summary.paidAmount)}</h3>
            </div>
            <div className="glass-panel p-6 rounded-2xl">
              <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">PENDING</p>
              <h3 className="font-headline-md text-2xl text-primary">{formatCurrency(report.summary.pendingAmount)}</h3>
            </div>
            <div className="glass-panel p-6 rounded-2xl">
              <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">OVERDUE</p>
              <h3 className="font-headline-md text-2xl text-error">{formatCurrency(report.summary.overdueAmount)}</h3>
            </div>
          </div>

          {/* Breakdown panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
            <div className="glass-panel p-8 rounded-3xl border border-white/12">
              <h3 className="font-headline-md text-lg text-primary mb-4">Expenses by Category</h3>
              <div className="space-y-2">
                {Object.entries(report.byCategory).length === 0 && (
                  <p className="font-body-md text-sm text-on-surface-variant opacity-60">No paid expenses this month.</p>
                )}
                {Object.entries(report.byCategory).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center py-2 border-b border-outline-variant/10 last:border-0">
                    <span className="font-label-caps text-[10px] text-on-surface-variant">{cat}</span>
                    <span className="font-data-tabular text-sm font-bold text-primary">{formatCurrency(amount as number)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-white/12">
              <h3 className="font-headline-md text-lg text-primary mb-4">Paid vs Pending</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="font-label-caps text-[10px] text-on-surface-variant">PAID</span><span className="font-data-tabular text-sm font-bold text-secondary">{formatCurrency(report.paidVsPending.paid)}</span></div>
                <div className="flex justify-between"><span className="font-label-caps text-[10px] text-on-surface-variant">PENDING + OVERDUE</span><span className="font-data-tabular text-sm font-bold text-primary">{formatCurrency(report.paidVsPending.pending)}</span></div>
              </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-white/12">
              <h3 className="font-headline-md text-lg text-primary mb-4">Recurring vs Manual</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="font-label-caps text-[10px] text-on-surface-variant">RECURRING</span><span className="font-data-tabular text-sm font-bold text-primary">{formatCurrency(report.recurringVsManual.recurring)}</span></div>
                <div className="flex justify-between"><span className="font-label-caps text-[10px] text-on-surface-variant">MANUAL</span><span className="font-data-tabular text-sm font-bold text-primary">{formatCurrency(report.recurringVsManual.manual)}</span></div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/12 mb-10">
            <h3 className="font-headline-md text-lg text-primary mb-2">Cash Flow</h3>
            <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest mb-4">BASED ON PAYMENT DATE, NOT DUE DATE</p>
            <div className="flex gap-8">
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">TOTAL PAID OUT</p>
                <p className="font-headline-md text-2xl text-secondary">{formatCurrency(report.cashFlow.totalPaidOut)}</p>
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">PAYMENTS MADE</p>
                <p className="font-headline-md text-2xl text-primary">{report.cashFlow.paymentCount}</p>
              </div>
            </div>
          </div>

          {/* Detail table */}
          <section className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/12 bg-white/4">
            <div className="px-8 py-6 border-b border-primary/10 bg-white/6">
              <h4 className="font-headline-md text-xl text-primary">Expense Records</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10 font-label-caps text-[11px] text-primary">
                    <th className="px-8 py-5">TITLE</th>
                    <th className="px-6 py-5">CATEGORY</th>
                    <th className="px-6 py-5">AMOUNT</th>
                    <th className="px-6 py-5">DUE DATE</th>
                    <th className="px-6 py-5">STATUS</th>
                    <th className="px-8 py-5">ORIGIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {report.rows.map((r: any) => (
                    <tr key={r._id} className="hover:bg-white/6 transition-colors">
                      <td className="px-8 py-4 font-body-md text-sm font-bold text-on-surface">{r.title}</td>
                      <td className="px-6 py-4 font-label-caps text-[10px] text-on-surface-variant">{r.category}</td>
                      <td className="px-6 py-4 font-data-tabular text-sm font-bold">{formatCurrency(r.amount)}</td>
                      <td className="px-6 py-4 font-data-tabular text-xs text-on-surface-variant">{new Date(r.dueDate).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_BADGE[r.status] || 'bg-outline-variant/20 text-outline'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-8 py-4 font-label-caps text-[10px] text-on-surface-variant">{r.origin}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-16 text-center text-on-surface-variant/50 font-label-caps text-xs">
                        No expenses due in this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
