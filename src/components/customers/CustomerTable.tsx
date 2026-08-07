import React from "react";
import {
  ChevronDown,
  HeartPulse,
  CreditCard,
  Smartphone,
  Mail,
  MoreVertical,
  ChevronRight,
  Repeat,
} from "lucide-react";
import { CustomerBalanceBadge } from "./CustomerBalanceBadge";

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  customerType?: string;
  creditStatus?: string;
  customerHealth?: string;
  totalSpent: number;
  creditBalance?: number;
  debitBalance?: number;
  orderCount: number;
  lastPurchaseDate?: number;
  notes?: string;
}

function frequencyLabel(orderCount: number) {
  if (orderCount >= 20) return "Frequent Buyer";
  if (orderCount >= 5) return "Regular Buyer";
  if (orderCount >= 1) return "Occasional Buyer";
  return "No Purchases Yet";
}

interface CustomerTableProps {
  filteredCustomers: Customer[];
  healthFilter: string;
  setHealthFilter: (v: string) => void;
  creditFilter: string;
  setCreditFilter: (v: string) => void;
  formatCurrency: (v: number) => string;
  onSelectCustomer: (c: Customer) => void;
}

export const CustomerTable = ({
  filteredCustomers,
  healthFilter,
  setHealthFilter,
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
          {/* Customer Health */}
          <div className="relative">
            <HeartPulse className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={12} />
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[10px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer text-primary"
            >
              <option>All Health</option>
              <option>New Client</option>
              <option>At Risk</option>
              <option>Growing Client</option>
              <option>Valuable Client</option>
              <option>Elite Client</option>
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
            <tr className="border-b border-primary/5 font-label-caps text-[11px] text-primary">
              <th className="px-8 py-5">CLIENT & HEALTH</th>
              <th className="px-6 py-5">CONTACTS</th>
              <th className="px-6 py-5">LIFETIME VALUE</th>
              <th className="px-6 py-5">DEBT / CREDIT</th>
              <th className="px-6 py-5">FREQUENCY</th>
              <th className="px-8 py-5 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5">
            {filteredCustomers.map((customer) => {
              const health = customer.customerHealth || "New Client";
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
                                  : health === "At Risk"
                                    ? "text-rose-600"
                                    : "text-slate-500"
                          }`}
                        >
                          {health}
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
                      <span className="text-[9px] font-label-caps text-on-surface-variant tracking-wider">
                        {customer.orderCount} Orders
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <CustomerBalanceBadge
                      creditBalance={customer.creditBalance}
                      debitBalance={customer.debitBalance}
                      formatCurrency={formatCurrency}
                    />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <Repeat size={12} className="text-outline" />
                      {frequencyLabel(customer.orderCount)}
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
          <span className="font-label-caps text-[10px] text-primary">Show rows:</span>
          <select className="bg-transparent font-data-tabular text-xs text-primary focus:outline-none">
            <option className="bg-surface-container text-primary">10</option>
            <option className="bg-surface-container text-primary">25</option>
            <option className="bg-surface-container text-primary">50</option>
          </select>
        </div>
        <div className="flex items-center gap-6">
          <p className="font-label-caps text-[10px] text-primary">Page 1 of 1</p>
          <div className="flex gap-2">
            <button className="p-2 border border-outline-variant/30 rounded-lg text-primary hover:bg-primary hover:text-on-primary transition-all">
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <button className="p-2 border border-outline-variant/30 rounded-lg text-primary hover:bg-primary hover:text-on-primary transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
