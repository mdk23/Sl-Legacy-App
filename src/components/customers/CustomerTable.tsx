import React from "react";
import {
  Filter,
  ChevronDown,
  Star,
  CreditCard,
  Smartphone,
  Mail,
  MoreVertical,
  ChevronRight,
} from "lucide-react";

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  customerType?: string;
  financialTier?: string;
  loyaltyLevel?: string;
  creditStatus?: string;
  customerScore?: number;
  customerHealth?: string;
  totalSpent: number;
  creditBalance?: number;
  debitBalance?: number;
  orderCount: number;
  lastPurchaseDate?: number;
  notes?: string;
}

interface CustomerTableProps {
  filteredCustomers: Customer[];
  financialFilter: string;
  setFinancialFilter: (v: string) => void;
  loyaltyFilter: string;
  setLoyaltyFilter: (v: string) => void;
  creditFilter: string;
  setCreditFilter: (v: string) => void;
  formatCurrency: (v: number) => string;
  onSelectCustomer: (c: Customer) => void;
}

export const CustomerTable = ({
  filteredCustomers,
  financialFilter,
  setFinancialFilter,
  loyaltyFilter,
  setLoyaltyFilter,
  creditFilter,
  setCreditFilter,
  formatCurrency,
  onSelectCustomer,
}: CustomerTableProps) => {
  return (
    <section className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/12 bg-white/4">
      <div className="px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-primary/10 bg-white/6">
        <div className="flex items-center gap-4">
          <h4 className="font-headline-md text-xl text-primary">Customer Directory</h4>
          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
            {filteredCustomers.length} CLIENTS
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Financial Tier */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={12} />
            <select
              value={financialFilter}
              onChange={(e) => setFinancialFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[10px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer text-primary"
            >
              <option>All Tiers</option>
              <option>Regular</option>
              <option>Premium</option>
              <option>VIP</option>
              <option>Platinum</option>
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              size={12}
            />
          </div>
          {/* Loyalty Level */}
          <div className="relative">
            <Star className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={12} />
            <select
              value={loyaltyFilter}
              onChange={(e) => setLoyaltyFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[10px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer text-primary"
            >
              <option>All Levels</option>
              <option>Bronze</option>
              <option>Silver</option>
              <option>Gold</option>
              <option>Diamond</option>
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              size={12}
            />
          </div>
          {/* Credit Status */}
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={12} />
            <select
              value={creditFilter}
              onChange={(e) => setCreditFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[10px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer text-primary"
            >
              <option>All Credits</option>
              <option>Good Standing</option>
              <option>Outstanding</option>
              <option>Overdue</option>
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              size={12}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-white/10 backdrop-blur-md">
            <tr className="border-b border-primary/5 font-label-caps text-[11px] text-outline">
              <th className="px-8 py-5">CLIENT & HEALTH</th>
              <th className="px-6 py-5">CONTACTS</th>
              <th className="px-6 py-5">LIFETIME VALUE</th>
              <th className="px-6 py-5">BALANCE</th>
              <th className="px-6 py-5">CLASSIFICATION</th>
              <th className="px-8 py-5 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5">
            {filteredCustomers.map((customer) => {
              const health = customer.customerHealth || "Growing Client";
              const scoreVal = customer.customerScore || 0;
              const tier = customer.financialTier || "Regular";
              const lvl = customer.loyaltyLevel || "Bronze";
              return (
                <tr
                  key={customer._id}
                  className="hover:bg-white/6 transition-colors cursor-pointer"
                  onClick={() => onSelectCustomer(customer)}
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shadow-md text-primary font-bold">
                        {customer.firstName.charAt(0)}
                        {customer.lastName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-body-md text-sm font-bold text-on-surface">
                          {customer.firstName} {customer.lastName}
                        </p>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${
                            health === "Elite Client"
                              ? "text-purple-600"
                              : health === "Valuable Client"
                                ? "text-emerald-600"
                                : health === "Growing Client"
                                  ? "text-blue-600"
                                  : "text-rose-600"
                          }`}
                        >
                          {health} ({scoreVal} pts)
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 font-data-tabular text-xs text-on-surface">
                        <Smartphone size={12} className="text-outline" />
                        {customer.phone1}
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-2 font-data-tabular text-[10px] text-outline">
                          <Mail size={12} className="text-outline" />
                          {customer.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-data-tabular text-sm font-bold text-primary">
                        {formatCurrency(customer.totalSpent)}
                      </span>
                      <span className="text-[9px] font-label-caps text-outline tracking-wider">
                        {customer.orderCount} Orders
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      {(customer.debitBalance || 0) > 0 ? (
                        <>
                          <span className="font-data-tabular text-sm text-error font-bold">
                            Owes {formatCurrency(customer.debitBalance || 0)}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-error">
                            DEBIT
                          </span>
                        </>
                      ) : (customer.creditBalance || 0) > 0 ? (
                        <>
                          <span className="font-data-tabular text-sm text-emerald-600 font-bold">
                            {formatCurrency(customer.creditBalance || 0)}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                            STORE CREDIT
                          </span>
                        </>
                      ) : (
                        <span className="font-data-tabular text-sm text-outline opacity-50">No balance</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit ${
                          tier.toLowerCase() === "platinum"
                            ? "bg-purple-900/10 text-purple-700 border border-purple-800/20"
                            : tier.toLowerCase() === "vip"
                              ? "bg-amber-900/10 text-amber-700 border border-amber-800/20"
                              : tier.toLowerCase() === "premium"
                                ? "bg-rose-950/10 text-rose-700 border border-rose-900/20"
                                : "bg-slate-800/10 text-slate-700 border border-slate-700/20"
                        }`}
                      >
                        {tier}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-bold text-outline uppercase tracking-wider">
                        <Star
                          size={10}
                          className={
                            lvl.toLowerCase() === "diamond"
                              ? "text-cyan-500 fill-cyan-400"
                              : lvl.toLowerCase() === "gold"
                                ? "text-amber-500 fill-amber-400"
                                : lvl.toLowerCase() === "silver"
                                  ? "text-slate-400 fill-slate-400"
                                  : "text-amber-700 fill-amber-700"
                          }
                        />
                        {lvl}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelectCustomer(customer)}
                      className="p-2 hover:bg-primary/10 rounded-full text-outline hover:text-primary transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-8 py-5 bg-white/6 flex justify-between items-center border-t border-primary/5">
        <div className="flex items-center gap-4">
          <span className="font-label-caps text-[10px] text-outline">Show rows:</span>
          <select className="bg-transparent font-data-tabular text-xs focus:outline-none">
            <option>10</option>
            <option>25</option>
            <option>50</option>
          </select>
        </div>
        <div className="flex items-center gap-6">
          <p className="font-label-caps text-[10px] text-outline">Page 1 of 1</p>
          <div className="flex gap-2">
            <button className="p-2 border border-outline-variant/30 rounded-lg hover:bg-white transition-all">
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <button className="p-2 border border-outline-variant/30 rounded-lg hover:bg-white transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
