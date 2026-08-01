import React from "react";
import { Search, Filter, Calendar, CreditCard, MoreVertical, ChevronRight } from "lucide-react";

interface SalesTableProps {
  filteredSales: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  isFiltersExpanded: boolean;
  setIsFiltersExpanded: (v: boolean) => void;
  onSelectSale: (sale: any) => void;
  formatCurrency: (v: number) => string;
  paginationStatus: "LoadingMore" | "CanLoadMore" | "Exhausted" | "LoadingFirstPage";
  loadMore: (numItems: number) => void;
}

export const SalesTable = ({
  filteredSales,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  isFiltersExpanded,
  setIsFiltersExpanded,
  onSelectSale,
  formatCurrency,
  paginationStatus,
  loadMore,
}: SalesTableProps) => {
  return (
    <section className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/12 bg-white/4">
      <div className="px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-primary/10 bg-white/6">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <h4 className="font-headline-md text-xl text-primary">Transactions</h4>
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
            <input
              type="text"
              placeholder="Search Invoice # or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/6 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={14} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/6 border border-outline-variant/30 rounded-xl text-[11px] font-label-caps focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="All Status">All Status</option>
              <option value="Completed">Completed / Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Pending">Pending</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className={`p-2 border border-outline-variant/30 rounded-xl hover:bg-white transition-all text-outline ${
              isFiltersExpanded ? "bg-primary/10 text-primary border-primary/20 shadow-sm" : ""
            }`}
            title="Toggle Advanced Filters"
          >
            <Calendar size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-primary/5 border-b border-primary/10 font-label-caps text-[11px] text-primary">
              <th className="px-8 py-5">ORDER Nº</th>
              <th className="px-6 py-5">CUSTOMER</th>
              <th className="px-6 py-5">ITEMS</th>
              <th className="px-6 py-5">TOTAL AMOUNT</th>
              <th className="px-6 py-5">BALANCE</th>
              <th className="px-6 py-5">STATUS</th>
              <th className="px-6 py-5">METHOD</th>
              <th className="px-8 py-5 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5">
            {filteredSales.map((sale) => (
              <tr
                key={sale._id}
                className="hover:bg-white/6 transition-colors group cursor-pointer"
                onClick={() => onSelectSale(sale)}
              >
                <td className="px-8 py-5 font-data-tabular text-sm font-bold text-primary">
                  {sale.receiptNumber?.replace("INV-", "ORD-")}
                </td>
                <td className="px-6 py-5">
                  <div>
                    <p className="font-body-md text-sm font-bold text-on-surface">{sale.customerName || "Walk-in"}</p>
                    <p className="font-label-caps text-[9px] text-outline tracking-widest">{sale.paymentStatus}</p>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex -space-x-3">
                    {(sale.items || []).slice(0, 3).map((item: any, i: number) => (
                      <div
                        key={i}
                        className="w-10 h-10 rounded-full border-2 border-white overflow-hidden shadow-sm bg-surface-container"
                      >
                        <div className="w-full h-full bg-primary/10 flex items-center justify-center text-[10px] text-primary">
                          ITEM
                        </div>
                      </div>
                    ))}
                    {(sale.items || []).length > 3 && (
                      <div className="w-10 h-10 rounded-full border-2 border-white bg-surface-variant flex items-center justify-center text-[10px] font-bold text-outline shadow-sm">
                        +{(sale.items || []).length - 3}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-5 font-data-tabular text-sm font-bold">
                  {formatCurrency(sale.total)}
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`font-data-tabular text-sm ${
                      sale.balance > 0 ? "text-error" : "text-outline opacity-40"
                    }`}
                  >
                    {sale.balance > 0 ? formatCurrency(sale.balance) : "0 Mt"}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      sale.status === "Completed"
                        ? "bg-secondary-container/20 text-secondary"
                        : sale.status === "Partially Paid"
                          ? "bg-primary/10 text-primary"
                          : "bg-error-container/20 text-error"
                    }`}
                  >
                    {sale.status}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 font-label-caps text-[10px] text-on-surface-variant">
                    <CreditCard size={12} className="text-outline" /> {sale.paymentMethod}
                  </div>
                </td>
                <td className="px-8 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSelectSale(sale)}
                    className="p-2 hover:bg-primary/10 rounded-full text-outline transition-colors"
                  >
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-8 py-5 bg-white/6 flex justify-between items-center border-t border-primary/5">
        <div className="flex items-center gap-4">
          {paginationStatus === "CanLoadMore" && (
            <button
              onClick={() => loadMore(15)}
              className="px-4 py-2 bg-primary text-on-primary rounded-xl font-label-caps text-[10px] shadow-sm hover:opacity-90 transition-opacity"
            >
              LOAD MORE
            </button>
          )}
          {paginationStatus === "LoadingMore" && (
            <span className="font-label-caps text-[10px] text-outline animate-pulse">LOADING MORE...</span>
          )}
          {paginationStatus === "Exhausted" && (
            <span className="font-label-caps text-[10px] text-outline opacity-60">ALL TRANSACTIONS LOADED</span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <p className="font-label-caps text-[10px] text-outline">
            Showing {filteredSales.length} records
          </p>
        </div>
      </div>
    </section>
  );
};
