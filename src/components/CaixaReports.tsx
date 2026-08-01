'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Calendar, BarChart, TrendingUp, AlertCircle, Search,
  X, Lock, Unlock, ArrowDownLeft, ArrowUpRight, Wallet, Clock, User
} from 'lucide-react';
import * as XLSX from 'xlsx';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' })
    .format(val)
    .replace('MZN', 'Mt');

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CaixaReports() {
  const [dateRange, setDateRange] = useState('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedSession, setSelectedSession] = useState<any>(null);

  const sessionDetails = useQuery(
    api.caixa.getSessionReportDetails,
    selectedSession ? { sessionId: selectedSession._id as Id<"caixaSessions"> } : "skip"
  );

  const selectedSessionMovements = sessionDetails?.movements || [];

  const handleExportExcel = () => {
    if (!sessionDetails) return;

    const { session: sess, transactions: txs, payments: pmts, ledgerEntries: ledger, stockMovements: stocks, summary: s } = sessionDetails;

    const formatFullDate = (ts: number) => new Date(ts).toLocaleString('pt-PT');

    // Section 1: Session Metadata
    const metadata: any[][] = [
      ["FECHO DO DIA - RELATÓRIO DE CAIXA"],
      [],
      ["INFORMAÇÃO DA SESSÃO"],
      ["Operador", sess.openedBy],
      ["Estado", sess.status],
      ["Data/Hora Abertura", formatFullDate(sess.openedAt)],
      ["Data/Hora Fecho", sess.closedAt ? formatFullDate(sess.closedAt) : "Sessão Activa (Aberto)"],
      ["Nota de Fecho", sess.closingNote || "Nenhum"],
    ];

    // Section 2: Financial Balances
    const financialBalances: any[][] = [
      [],
      ["RESUMO  DO CAIXA"],
      ["Fundo de Caixa (Abertura)", s.openingAmount],
      ["Dinheiro Recebido em Vendas", s.totalCashReceived],
      ["Entradas de Caixa (Cash In)", s.totalCashIn],
      ["Saídas de Caixa (Cash Out)", s.totalCashOut],
      ["Saldo de Caixa Esperado", s.expectedCash],
      ["Dinheiro Contado no Fecho", sess.countedCash !== undefined ? sess.countedCash : "N/A"],
      ["Diferença (Desvio/Variance)", sess.variance !== undefined ? sess.variance : "N/A"],
    ];

    // Section 3: Revenue & Profits
    const revenueProfit: any[][] = [
      [],
      ["RECEITA E RENDIMENTOS DA SESSÃO"],
      ["Receita Total da Sessão (Todos os Meios)", s.totalSessionRevenue],
      ["Custo Total dos Artigos Vendidos", s.totalCost],
      ["Lucro Total Estimado", s.totalProfit],
      ["Total de Descontos Concedidos", s.totalDiscounts],
      ["Total Saldo Pendente (Contas a Receber)", s.totalPendingBalance],
    ];

    // Section 4: Commercial Activity
    const commercialActivity: any[][] = [
      [],
      ["ACTIVIDADE COMERCIAL"],
      ["Total de Transacções", s.totalTransactions],
      ["Total de Artigos Vendidos", s.totalItemsSold],
    ];

    // Section 5: Client Credit & Debt
    const clientCreditDebt: any[][] = [
      [],
      ["FLUXO DE CRÉDITO E DÍVIDA"],
      ["Crédito de Cliente Emitido", s.totalCustomerCreditIssued],
      ["Crédito de Cliente Utilizado", s.totalCustomerCreditUsed],
      ["Dívida de Cliente Criada", s.totalCustomerDebtCreated],
      ["Dívida de Cliente Recuperada (Pagamentos)", s.totalCustomerDebtRecovered],
    ];

    // Section 6: Payment Method Breakdown
    const paymentBreakdownMap: Record<string, number> = {};
    pmts.forEach((p: any) => {
      const method = p.paymentMethod || "Desconhecido";
      paymentBreakdownMap[method] = (paymentBreakdownMap[method] || 0) + p.amount;
    });

    const paymentBreakdownRows: any[][] = [
      [],
      ["DESDOBRAMENTO DE PAGAMENTOS (POR MÉTODO)"],
      ["Método de Pagamento", "Total Recebido"]
    ];

    Object.entries(paymentBreakdownMap).forEach(([method, amount]) => {
      paymentBreakdownRows.push([method, amount]);
    });

    // Combine into AOA (Array of Arrays) for Sheet 1
    const sheet1Data: any[][] = [
      ...metadata,
      ...financialBalances,
      ...revenueProfit,
      ...commercialActivity,
      ...clientCreditDebt,
      ...paymentBreakdownRows
    ];

    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumo
    const wsSummary = XLSX.utils.aoa_to_sheet(sheet1Data);
    wsSummary['!cols'] = [
      { wch: 45 }, // Column A (Descriptions)
      { wch: 30 }, // Column B (Values)
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

    // Sheet 2: Itens Vendidos
    const sheet2Data: any[][] = [
      ["Recibo", "Data/Hora", "Produto", "Quantidade", "Preço Unitário", "Total do Item", "Desconto do Recibo", "Pago?", "Método de Pagamento"]
    ];

    txs.forEach((t: any) => {
      const receipt = t.receiptNumber || t._id;
      const dateStr = formatFullDate(t.createdAt);
      const isPaid = t.status === "Completed" ? "Sim" : t.status === "Partially Paid" ? "Parcial" : "Não";
      const paymentMethods = t.paymentBreakdown && t.paymentBreakdown.length > 0
        ? t.paymentBreakdown.map((p: any) => p.method).join(", ")
        : "N/A";

      t.items.forEach((item: any) => {
        const itemTotal = item.quantity * item.price;
        sheet2Data.push([
          receipt,
          dateStr,
          item.name || "N/A",
          item.quantity,
          item.price,
          itemTotal,
          t.discount || 0,
          isPaid,
          paymentMethods
        ]);
      });
    });

    const wsItems = XLSX.utils.aoa_to_sheet(sheet2Data);
    wsItems['!cols'] = [
      { wch: 18 }, // Recibo
      { wch: 22 }, // Data/Hora
      { wch: 35 }, // Produto
      { wch: 12 }, // Quantidade
      { wch: 15 }, // Preço Unitário
      { wch: 15 }, // Total do Item
      { wch: 18 }, // Desconto do Recibo
      { wch: 10 }, // Pago?
      { wch: 20 }, // Método de Pagamento
    ];
    XLSX.utils.book_append_sheet(wb, wsItems, "Itens Vendidos");

    // Sheet 3: Movimentos de Stock
    const sheet3Data: any[][] = [
      ["Produto", "Código/SKU", "Tipo de Movimento", "Quantidade", "Stock Anterior", "Novo Stock", "Data/Hora", "Motivo/Descrição", "Operador"]
    ];

    stocks.forEach((m: any) => {
      sheet3Data.push([
        m.productName,
        m.productCode,
        m.movementType,
        m.quantity,
        m.previousStock,
        m.newStock,
        formatFullDate(m.createdAt),
        m.reason,
        m.userId || "Sistema"
      ]);
    });

    const wsStock = XLSX.utils.aoa_to_sheet(sheet3Data);
    wsStock['!cols'] = [
      { wch: 30 }, // Produto
      { wch: 15 }, // Código/SKU
      { wch: 18 }, // Tipo de Movimento
      { wch: 12 }, // Quantidade
      { wch: 15 }, // Stock Anterior
      { wch: 15 }, // Novo Stock
      { wch: 22 }, // Data/Hora
      { wch: 35 }, // Motivo/Descrição
      { wch: 15 }, // Operador
    ];
    XLSX.utils.book_append_sheet(wb, wsStock, "Movimentos de Stock");

    // Export Workbook
    const dateFileStr = new Date(sess.openedAt).toISOString().split('T')[0];
    XLSX.writeFile(wb, `Fecho_do_Dia_${sess.openedBy}_${dateFileStr}.xlsx`);
  };

  const filterParams = useMemo(() => {
    const now = new Date();
    if (dateRange === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return { startDate: start };
    }
    if (dateRange === 'YESTERDAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
      return { startDate: start, endDate: end };
    }
    if (dateRange === 'CUSTOM' && customStart && customEnd) {
      const start = new Date(customStart).getTime();
      const end = new Date(customEnd).getTime() + 86399999;
      return { startDate: start, endDate: end };
    }
    return {};
  }, [dateRange, customStart, customEnd]);

  const reports = useQuery(api.caixa.getCaixaReports, filterParams) || [];

  const kpis = useMemo(() => {
    let totalCashSales = 0;
    let totalCashIn = 0;
    let totalCashOut = 0;
    let totalVariances = 0;

    reports.forEach(r => {
      totalCashSales += r.totalCashSales;
      totalCashIn += r.totalCashIn;
      totalCashOut += r.totalCashOut;
      if (r.variance) totalVariances += Math.abs(r.variance);
    });

    return {
      totalCashSales,
      totalCashIn,
      totalCashOut,
      totalVariances,
      numberOfSessions: reports.length,
      averageSessionValue: reports.length > 0 ? totalCashSales / reports.length : 0,
    };
  }, [reports]);

  const KPICard = ({ title, value, colorClass, icon: Icon }: any) => (
    <div className={`p-6 rounded-3xl border border-white/12 bg-white/6 backdrop-blur-md shadow-sm relative overflow-hidden group hover:shadow-xl transition-all`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${colorClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] font-label-caps text-outline uppercase tracking-widest">{title}</p>
      <h3 className="text-2xl font-headline-md text-primary mt-1">{value}</h3>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
        <div>
          <h1 className="font-headline-lg text-4xl text-primary mb-2 flex items-center gap-3">
            <BarChart className="text-primary" size={32} />
            Caixa Reports
          </h1>
          <p className="font-body-md text-on-surface-variant max-w-xl">
            Audit logs and summaries of cash register sessions.
          </p>
        </div>

        <div className="flex gap-4 items-center">
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="px-4 py-3 rounded-2xl text-xs bg-white/8 border border-primary/10 focus:ring-2 focus:ring-primary/20 outline-none font-label-caps cursor-pointer shadow-sm"
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="CUSTOM">Custom Range</option>
          </select>
          {dateRange === 'CUSTOM' && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-4 py-3 rounded-2xl text-xs bg-white/8 border border-primary/10 outline-none shadow-sm" />
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-4 py-3 rounded-2xl text-xs bg-white/8 border border-primary/10 outline-none shadow-sm" />
            </>
          )}
          <button className="px-6 py-3 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl hover:bg-primary/90 transition-all flex items-center gap-2">
            <Download size={16} /> EXPORT CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
        <KPICard title="Total Cash Sales" value={formatCurrency(kpis.totalCashSales)} icon={TrendingUp} colorClass="bg-emerald-100 text-emerald-700" />
        <KPICard title="Total Cash In" value={formatCurrency(kpis.totalCashIn)} icon={TrendingUp} colorClass="bg-blue-100 text-blue-700" />
        <KPICard title="Total Cash Out" value={formatCurrency(kpis.totalCashOut)} icon={TrendingUp} colorClass="bg-amber-100 text-amber-700" />
        <KPICard title="Total Variances" value={formatCurrency(kpis.totalVariances)} icon={AlertCircle} colorClass="bg-rose-100 text-rose-700" />
        <KPICard title="Total Sessions" value={kpis.numberOfSessions} icon={Calendar} colorClass="bg-purple-100 text-purple-700" />
        <KPICard title="Avg Session Value" value={formatCurrency(kpis.averageSessionValue)} icon={BarChart} colorClass="bg-primary/10 text-primary" />
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/12 shadow-sm flex flex-col">
        <div className="p-6 border-b border-primary/10 bg-white/6">
          <h3 className="font-headline-md text-lg text-primary">Session History</h3>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-white/10 text-[10px] font-label-caps text-outline uppercase">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Opening</th>
                <th className="px-6 py-4 text-right">Cash Sales</th>
                <th className="px-6 py-4 text-right">Expected</th>
                <th className="px-6 py-4 text-right">Counted</th>
                <th className="px-6 py-4 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {reports.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-outline">No sessions found for this period.</td></tr>
              ) : reports.map((r) => (
                <tr
                  key={r._id}
                  onClick={() => setSelectedSession(r)}
                  className="hover:bg-primary/5 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 font-data-tabular text-xs text-primary font-bold">{formatDate(r.openedAt)}</td>
                  <td className="px-6 py-4 text-xs text-outline">{r.openedBy}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider ${r.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-surface border border-primary/10 text-outline'
                      }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-data-tabular">{formatCurrency(r.openingAmount)}</td>
                  <td className="px-6 py-4 text-right font-data-tabular text-emerald-600 font-bold">{formatCurrency(r.totalCashSales)}</td>
                  <td className="px-6 py-4 text-right font-data-tabular">{formatCurrency(r.expectedCash)}</td>
                  <td className="px-6 py-4 text-right font-data-tabular">{r.countedCash !== undefined ? formatCurrency(r.countedCash) : '-'}</td>
                  <td className="px-6 py-4 text-right font-data-tabular font-bold">
                    {r.variance !== undefined ? (
                      <span className={Math.abs(r.variance) > 5 ? 'text-error' : 'text-emerald-600'}>
                        {formatCurrency(r.variance)}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedSession && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSession(null)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl h-full bg-surface-container shadow-2xl flex flex-col border-l border-white/10 overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-8 border-b border-primary/10 flex justify-between items-start bg-white/6 backdrop-blur-md">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${selectedSession.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-surface border border-primary/10 text-outline'
                      }`}>
                      {selectedSession.status}
                    </span>
                    <span className="text-[10px] text-outline font-data-tabular">
                      Session ID: {selectedSession._id}
                    </span>
                  </div>
                  <h2 className="font-headline-md text-2xl text-primary">
                    Session: {formatDate(selectedSession.openedAt)}
                  </h2>
                  <p className="text-xs text-outline flex items-center gap-2 mt-1">
                    <User size={12} /> Opened by: <span className="font-bold text-primary">{selectedSession.openedBy}</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {sessionDetails && (
                    <button
                      onClick={handleExportExcel}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-label-caps text-[10px] shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 font-bold"
                    >
                      <Download size={12} /> Exportar Excel
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedSession(null)}
                    className="p-2 hover:bg-primary/5 rounded-full text-outline hover:text-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Financial Summary */}
                <div>
                  <h4 className="text-[10px] font-label-caps text-outline uppercase tracking-wider mb-3">Financial Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Opening Float</p>
                      <p className="text-lg font-data-tabular font-bold text-primary mt-1">
                        {formatCurrency(sessionDetails?.summary?.openingAmount ?? selectedSession.openingAmount)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Cash Received</p>
                      <p className="text-lg font-data-tabular font-bold text-emerald-600 mt-1">
                        {formatCurrency(sessionDetails?.summary?.totalCashReceived ?? 0)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Electronic Payments</p>
                      <p className="text-lg font-data-tabular font-bold text-primary mt-1">
                        {formatCurrency(sessionDetails?.summary?.totalElectronicReceived ?? 0)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Expected Balance</p>
                      <p className="text-lg font-data-tabular font-bold text-primary mt-1">
                        {formatCurrency(sessionDetails?.summary?.expectedCash ?? selectedSession.expectedCash)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Counted Cash</p>
                      <p className="text-lg font-data-tabular font-bold text-primary mt-1">
                        {selectedSession.countedCash !== undefined ? formatCurrency(selectedSession.countedCash) : '-'}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Variance</p>
                      <p className={`text-lg font-data-tabular font-bold mt-1 ${selectedSession.variance !== undefined && Math.abs(selectedSession.variance) > 5 ? 'text-error' : 'text-emerald-600'
                        }`}>
                        {selectedSession.variance !== undefined ? formatCurrency(selectedSession.variance) : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <ArrowDownLeft size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Cash In</p>
                      <p className="text-sm font-data-tabular font-bold text-primary mt-0.5">
                        {formatCurrency(sessionDetails?.summary?.totalCashIn ?? selectedSession.totalCashIn)}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                      <ArrowUpRight size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Cash Out</p>
                      <p className="text-sm font-data-tabular font-bold text-primary mt-0.5">
                        {formatCurrency(sessionDetails?.summary?.totalCashOut ?? selectedSession.totalCashOut)}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Debt Recoveries</p>
                      <p className="text-sm font-data-tabular font-bold text-primary mt-0.5">
                        {formatCurrency(sessionDetails?.summary?.totalDebtRecoveries ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-primary/5 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Wallet size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-label-caps text-outline uppercase tracking-wider">Credit Redeemed</p>
                      <p className="text-sm font-data-tabular font-bold text-primary mt-0.5">
                        {formatCurrency(sessionDetails?.summary?.totalCreditRedemptions ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedSession.closingNote && (
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="text-[10px] font-label-caps text-outline uppercase tracking-wider mb-1">Closing Note</p>
                    <p className="text-sm text-primary italic">"{selectedSession.closingNote}"</p>
                  </div>
                )}

                {/* Transaction Ledger */}
                <div>
                  <h4 className="text-[10px] font-label-caps text-outline uppercase tracking-wider mb-3">Transaction & Movement Ledger</h4>

                  {selectedSessionMovements.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-2xl border border-primary/5 text-outline text-sm">
                      No movements recorded in this session.
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-primary/5 overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-primary/5 text-[9px] font-label-caps text-outline uppercase">
                          <tr>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-primary/5">
                          {selectedSessionMovements.map((m: any) => (
                            <tr key={m._id} className="hover:bg-primary/5 transition-colors">
                              <td className="px-4 py-3 font-data-tabular text-outline">
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${m.type === 'SALE' || m.type === 'CASH_IN' ? 'bg-emerald-100 text-emerald-700' :
                                    m.type === 'OPENING' ? 'bg-blue-100 text-blue-700' :
                                      m.type === 'CLOSING' ? 'bg-purple-100 text-purple-700' :
                                        'bg-rose-100 text-rose-700'
                                  }`}>
                                  {m.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[180px] truncate text-primary font-medium" title={m.description}>
                                {m.description}
                              </td>
                              <td className={`px-4 py-3 text-right font-data-tabular font-bold ${m.type === 'SALE' || m.type === 'CASH_IN' || m.type === 'OPENING' ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                {m.type === 'SALE' || m.type === 'CASH_IN' || m.type === 'OPENING' ? '+' : '-'}{formatCurrency(m.amount)}
                              </td>
                              <td className="px-4 py-3 text-right font-data-tabular text-primary">
                                {formatCurrency(m.runningBalance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
