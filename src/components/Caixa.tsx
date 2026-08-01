'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { useAuth } from './AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, Unlock, Wallet, ArrowDownLeft, ArrowUpRight, 
  RotateCcw, History, AlertTriangle, CheckCircle2, 
  Search, Filter, ShieldCheck, ChevronRight, Calculator,
  Clock
} from 'lucide-react';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' })
    .format(val)
    .replace('MZN', 'Mt');

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Caixa() {
  const { user } = useAuth();
  const activeSession = useQuery(api.caixa.getActiveSession);
  const recentSessions = useQuery(api.caixa.getRecentSessions) || [];
  
  const movements = useQuery(
    api.caixa.getSessionMovements, 
    activeSession ? { sessionId: activeSession._id as Id<"caixaSessions"> } : "skip"
  ) || [];

  const openSessionMutation = useMutation(api.caixa.openSession);
  const closeSessionMutation = useMutation(api.caixa.closeSession);
  const addMovementMutation = useMutation(api.caixa.addMovement);

  const [isOpening, setIsOpening] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');

  const [isClosing, setIsClosing] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');

  const [isAddingMovement, setIsAddingMovement] = useState(false);
  const [movementType, setMovementType] = useState('CASH_IN');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingAmount || isNaN(Number(openingAmount))) return toast.error("Invalid amount");
    
    try {
      await openSessionMutation({
        openingAmount: Number(openingAmount),
      });
      toast.success("Caixa session successfully opened.");
      setIsOpening(false);
      setOpeningAmount('');
    } catch (error: any) {
      toast.error(error.message || "Failed to open session.");
    }
  };

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    if (!countedCash || isNaN(Number(countedCash))) return toast.error("Invalid counted amount");

    const variance = Number(countedCash) - activeSession.expectedCash;
    if (Math.abs(variance) > 5 && !closingNote) {
      return toast.error("Variance exceeds ±5 MT. An explanation note is required.");
    }

    try {
      await closeSessionMutation({
        sessionId: activeSession._id as Id<"caixaSessions">,
        countedCash: Number(countedCash),
        closingNote,
      });
      toast.success("Caixa session closed successfully.");
      setIsClosing(false);
      setCountedCash('');
      setClosingNote('');
    } catch (error: any) {
      toast.error(error.message || "Failed to close session.");
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    if (!movementAmount || isNaN(Number(movementAmount)) || Number(movementAmount) <= 0) return toast.error("Invalid amount");
    if (!movementNote) return toast.error("Description is required");

    try {
      await addMovementMutation({
        sessionId: activeSession._id as Id<"caixaSessions">,
        type: movementType,
        amount: Number(movementAmount),
        description: movementNote,
      });
      toast.success("Movement recorded successfully.");
      setIsAddingMovement(false);
      setMovementAmount('');
      setMovementNote('');
    } catch (error: any) {
      toast.error(error.message || "Failed to record movement.");
    }
  };

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchType = typeFilter === 'ALL' || m.type === typeFilter;
      const matchSearch = m.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.userId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchType && matchSearch;
    });
  }, [movements, typeFilter, searchQuery]);

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
            <ShieldCheck className="text-emerald-600" size={32} />
            Caixa Register
          </h1>
          <p className="font-body-md text-on-surface-variant max-w-xl">
            Secure, real-time ledger management. Enforces single cash sessions and strict audit trails.
          </p>
        </div>
        
        {activeSession && (
          <div className="flex gap-4">
            <button 
              onClick={() => setIsAddingMovement(true)}
              className="px-6 py-3 bg-white border border-primary/20 text-primary rounded-2xl font-label-caps text-[11px] shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2"
            >
              <Wallet size={16} /> ADD MOVEMENT
            </button>
            <button 
              onClick={() => setIsClosing(true)}
              className="px-6 py-3 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl hover:bg-primary/90 transition-all flex items-center gap-2"
            >
              <Lock size={16} /> CLOSE CAIXA
            </button>
          </div>
        )}
      </div>

      {activeSession === undefined ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
      ) : activeSession === null ? (
        <div className="glass-panel p-12 rounded-3xl border border-white/12 text-center max-w-2xl mx-auto mt-20 shadow-2xl">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Unlock className="text-primary" size={32} />
          </div>
          <h2 className="text-2xl font-headline-md text-primary mb-2">No Active Session</h2>
          <p className="text-on-surface-variant mb-8">
            The cash register is currently closed. You must open a new session with an initial float to process cash transactions.
          </p>
          <button 
            onClick={() => setIsOpening(true)}
            className="px-8 py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-sm shadow-xl hover:scale-[1.02] transition-all"
          >
            OPEN CAIXA SESSION
          </button>
        </div>
      ) : (
        <>
          {activeSession.isExpired && (
            <div className="mb-8 p-4 bg-error-container text-on-error-container rounded-2xl border border-error/20 flex items-center gap-3 shadow-sm">
              <AlertTriangle size={24} className="text-error" />
              <div>
                <p className="font-bold text-sm">Expired Session Detected</p>
                <p className="text-xs opacity-80">This session was opened on a previous day ({formatDate(activeSession.openedAt)}). You must close it before processing new transactions.</p>
              </div>
            </div>
          )}

          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 mb-8">
            <KPICard title="Opening Cash" value={formatCurrency(activeSession.openingAmount)} icon={Wallet} colorClass="bg-blue-100 text-blue-700" />
            <KPICard title="Cash Sales" value={formatCurrency(activeSession.totalCashSales)} icon={ArrowDownLeft} colorClass="bg-emerald-100 text-emerald-700" />
            <KPICard title="Cash In" value={formatCurrency(activeSession.totalCashIn)} icon={ArrowDownLeft} colorClass="bg-emerald-100 text-emerald-700" />
            <KPICard title="Cash Out" value={formatCurrency(activeSession.totalCashOut)} icon={ArrowUpRight} colorClass="bg-rose-100 text-rose-700" />
            <div className="col-span-2 md:col-span-4 lg:col-span-1 p-6 rounded-3xl border border-primary/20 bg-primary text-on-primary shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-20"><Calculator size={64} /></div>
              <p className="text-[10px] font-label-caps uppercase tracking-widest opacity-80">Expected Balance</p>
              <h3 className="text-3xl font-headline-md mt-2">{formatCurrency(activeSession.expectedCash)}</h3>
              <p className="text-xs mt-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Live updating
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Ledger Table */}
            <div className="lg:col-span-2 glass-panel rounded-3xl overflow-hidden border border-white/12 shadow-sm flex flex-col">
              <div className="p-6 border-b border-primary/10 bg-white/6 flex flex-wrap justify-between items-center gap-4">
                <h3 className="font-headline-md text-lg text-primary">Live Ledger</h3>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={14} />
                    <input 
                      type="text"
                      placeholder="Search description..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-xl text-xs bg-white/8 border border-primary/10 focus:ring-2 focus:ring-primary/20 outline-none w-48"
                    />
                  </div>
                  <select 
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="px-4 py-2 rounded-xl text-xs bg-white/8 border border-primary/10 focus:ring-2 focus:ring-primary/20 outline-none font-label-caps cursor-pointer"
                  >
                    <option value="ALL">All Types</option>
                    <option value="OPENING">Opening</option>
                    <option value="SALE">Sale</option>
                    <option value="CASH_IN">Cash In</option>
                    <option value="CASH_OUT">Cash Out</option>
                    <option value="SALE_REVERSAL">Reversal</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto flex-1 max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-white/10 backdrop-blur-md z-10 text-[10px] font-label-caps text-outline uppercase">
                    <tr>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                      <th className="px-6 py-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {filteredMovements.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-outline">No movements found.</td></tr>
                    ) : filteredMovements.map((m) => (
                      <tr key={m._id} className="hover:bg-white/6 transition-colors">
                        <td className="px-6 py-4 font-data-tabular text-xs text-outline">{formatTime(m.timestamp)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                            m.type === 'SALE' || m.type === 'CASH_IN' ? 'bg-emerald-100 text-emerald-700' :
                            m.type === 'CASH_OUT' || m.type === 'SALE_REVERSAL' ? 'bg-rose-100 text-rose-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {m.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-primary">{m.description}</p>
                          <p className="text-[10px] text-outline">By: {m.userId}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-data-tabular font-bold">
                          <span className={
                            m.type === 'SALE' || m.type === 'CASH_IN' || m.type === 'OPENING' ? 'text-emerald-600' : 'text-rose-600'
                          }>
                            {m.type === 'CASH_OUT' || m.type === 'SALE_REVERSAL' ? '-' : '+'}{formatCurrency(m.amount)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-data-tabular text-primary font-bold">{formatCurrency(m.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sidebar Widgets */}
            <div className="flex flex-col gap-8">
              {/* Active Session Info */}
              <div className="glass-panel p-6 rounded-3xl border border-white/12 shadow-sm">
                <h3 className="font-headline-md text-lg text-primary mb-4">Session Info</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-primary/10">
                    <span className="text-xs text-outline font-label-caps">Opened By</span>
                    <span className="text-sm font-bold text-primary">{activeSession.openedBy}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-primary/10">
                    <span className="text-xs text-outline font-label-caps">Opened At</span>
                    <span className="text-sm font-data-tabular text-primary">{formatDate(activeSession.openedAt)} {formatTime(activeSession.openedAt)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-outline font-label-caps">Duration</span>
                    <span className="text-sm font-data-tabular font-bold text-primary flex items-center gap-1">
                      <Clock size={14} className="text-outline" />
                      {Math.floor((now - activeSession.openedAt) / 3600000)}h {Math.floor(((now - activeSession.openedAt) % 3600000) / 60000)}m
                    </span>
                  </div>
                </div>
              </div>

              {/* Past Sessions */}
              <div className="glass-panel p-6 rounded-3xl border border-white/12 shadow-sm flex-1">
                <h3 className="font-headline-md text-lg text-primary mb-4 flex items-center gap-2"><History size={18}/> Last Sessions</h3>
                <div className="space-y-4">
                  {recentSessions.filter(s => s.status === 'CLOSED').slice(0, 4).map(s => (
                    <div key={s._id} className="p-4 rounded-2xl border border-primary/5 bg-white/6 hover:bg-white/8 transition-all flex flex-col gap-2 cursor-pointer group">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-primary">{formatDate(s.openedAt)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                          Math.abs(s.variance || 0) <= 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {Math.abs(s.variance || 0) <= 5 ? 'Balanced' : 'Discrepancy'}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-outline font-label-caps">Expected</span>
                          <span className="text-xs font-data-tabular text-primary">{formatCurrency(s.expectedCash)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] text-outline font-label-caps">Counted</span>
                          <span className="text-xs font-data-tabular font-bold text-primary">{formatCurrency(s.countedCash || 0)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentSessions.length === 0 && <p className="text-xs text-outline text-center py-4">No closed sessions found.</p>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <AnimatePresence>
        {isOpening && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-primary/10">
              <h3 className="text-2xl font-headline-md text-primary mb-2">Open Session</h3>
              <p className="text-sm text-outline mb-6">Enter the physical cash amount currently in the drawer to start.</p>
              <form onSubmit={handleOpenSession} className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-label-caps text-outline mb-1 block">OPENING FLOAT (MT)</label>
                  <input type="number" step="0.01" required value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl font-data-tabular text-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="0.00" />
                </div>
                <div className="flex gap-3 mt-4">
                  <button type="button" onClick={() => setIsOpening(false)} className="flex-1 py-3 bg-surface border border-primary/10 rounded-xl text-primary font-label-caps text-xs">CANCEL</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-label-caps text-xs shadow-xl">START CAIXA</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingMovement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-primary/10">
              <h3 className="text-2xl font-headline-md text-primary mb-2">Add Cash Movement</h3>
              <p className="text-sm text-outline mb-6">Manually record cash added or removed from the drawer.</p>
              <form onSubmit={handleAddMovement} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMovementType('CASH_IN')} className={`py-3 rounded-xl font-label-caps text-xs border ${movementType === 'CASH_IN' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-surface border-primary/10 text-outline'}`}>CASH IN</button>
                  <button type="button" onClick={() => setMovementType('CASH_OUT')} className={`py-3 rounded-xl font-label-caps text-xs border ${movementType === 'CASH_OUT' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-surface border-primary/10 text-outline'}`}>CASH OUT</button>
                </div>
                <div>
                  <label className="text-[10px] font-label-caps text-outline mb-1 block">AMOUNT (MT)</label>
                  <input type="number" step="0.01" required value={movementAmount} onChange={e => setMovementAmount(e.target.value)} className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl font-data-tabular text-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] font-label-caps text-outline mb-1 block">DESCRIPTION / REASON</label>
                  <input type="text" required value={movementNote} onChange={e => setMovementNote(e.target.value)} className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="e.g., Change for register, Supplier payment..." />
                </div>
                <div className="flex gap-3 mt-4">
                  <button type="button" onClick={() => setIsAddingMovement(false)} className="flex-1 py-3 bg-surface border border-primary/10 rounded-xl text-primary font-label-caps text-xs">CANCEL</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-label-caps text-xs shadow-xl">RECORD</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isClosing && activeSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-primary/10">
              <h3 className="text-2xl font-headline-md text-primary mb-2 flex items-center gap-2"><Lock size={20}/> Close Caixa</h3>
              <p className="text-sm text-outline mb-6">Enter the physical cash count to close the register and calculate variance.</p>
              
              <div className="bg-primary/5 p-4 rounded-xl mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-outline font-label-caps">Expected System Balance</span>
                  <span className="text-lg font-data-tabular font-bold text-primary">{formatCurrency(activeSession.expectedCash)}</span>
                </div>
              </div>

              <form onSubmit={handleCloseSession} className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-label-caps text-outline mb-1 block">PHYSICAL CASH COUNTED (MT)</label>
                  <input type="number" step="0.01" required value={countedCash} onChange={e => setCountedCash(e.target.value)} className="w-full px-4 py-3 bg-surface border border-primary/20 rounded-xl font-data-tabular text-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="0.00" />
                </div>
                
                {countedCash !== '' && !isNaN(Number(countedCash)) && (
                  <div className={`p-3 rounded-xl border flex justify-between items-center ${
                    Math.abs(Number(countedCash) - activeSession.expectedCash) <= 5 ? 'bg-emerald-50 border-emerald-200' : 'bg-error-container border-error/20'
                  }`}>
                    <span className={`text-[10px] font-label-caps ${Math.abs(Number(countedCash) - activeSession.expectedCash) <= 5 ? 'text-emerald-700' : 'text-error'}`}>VARIANCE</span>
                    <span className={`font-data-tabular font-bold ${Math.abs(Number(countedCash) - activeSession.expectedCash) <= 5 ? 'text-emerald-700' : 'text-error'}`}>
                      {formatCurrency(Number(countedCash) - activeSession.expectedCash)}
                    </span>
                  </div>
                )}

                {countedCash !== '' && !isNaN(Number(countedCash)) && Math.abs(Number(countedCash) - activeSession.expectedCash) > 5 && (
                  <div>
                    <label className="text-[10px] font-label-caps text-error mb-1 block">EXPLANATION REQUIRED FOR VARIANCE</label>
                    <textarea required value={closingNote} onChange={e => setClosingNote(e.target.value)} className="w-full px-4 py-3 bg-error-container/20 border border-error/30 rounded-xl text-sm outline-none focus:ring-2 focus:ring-error" placeholder="Why is the count different from the expected balance?" rows={2}></textarea>
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <button type="button" onClick={() => setIsClosing(false)} className="flex-1 py-3 bg-surface border border-primary/10 rounded-xl text-primary font-label-caps text-xs">CANCEL</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-label-caps text-xs shadow-xl flex items-center justify-center gap-2"><Lock size={14} /> FINALIZE CLOSE</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
