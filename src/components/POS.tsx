"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  PlusCircle,
  Plus,
  Trash2,
  CheckCircle2,
  User,
  X,
  CreditCard,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useAuth } from "./AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { CustomerBalanceBadge } from "./customers/CustomerBalanceBadge";

export default function POS() {
  const { user } = useAuth();
  const products = useQuery(api.products.list, { archived: false }) || [];
  const customers = useQuery(api.customers.list) || [];
  const activeSession = useQuery(api.caixa.getActiveSession);

  const createTransaction = useMutation(api.transactions.create);

  const [activeCategory, setActiveCategory] = useState("Earrings");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [cart, setCart] = useState<any[]>([]);

  const [paymentEntries, setPaymentEntries] = useState<
    { id: string; method: string; amount: string }[]
  >([{ id: "1", method: "Cash", amount: "" }]);
  const [changeHandling, setChangeHandling] = useState("Cash");
  const [addRemainingToAccount, setAddRemainingToAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    return customers
      .filter((c) =>
        `${c.firstName} ${c.lastName}`
          .toLowerCase()
          .includes(customerSearch.toLowerCase()),
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    // An active search runs across the whole catalog, overriding the category tab —
    // a cashier searching by SKU/barcode shouldn't be silently scoped to whichever tab is selected.
    if (query) {
      return products.filter(
        (p) => p.name.toLowerCase().includes(query) || (p.code || "").toLowerCase().includes(query),
      );
    }
    if (!activeCategory) return products;
    return products.filter(
      (p) => p.category.toLowerCase() === activeCategory.toLowerCase(),
    );
  }, [products, activeCategory, productSearch]);

  const handleAddToCart = (product: any) => {
    const existing = cart.find((i) => i.id === product._id);
    if (existing) {
      setCart(
        cart.map((i) =>
          i.id === product._id ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          id: product._id,
          name: product.name,
          price: product.sellingPrice,
          sku: product.code || "N/A",
          quantity: 1,
          discount: 0,
          image: product.imageUrl || "",
          costPrice: product.costPrice || 0,
        },
      ]);
    }
  };

  const saleTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0,
    );
    const discount = cart.reduce(
      (acc, item) => acc + (item.discount || 0),
      0,
    );
    const total = subtotal - discount;
    const profit = cart.reduce((acc, item) => {
      const itemDiscount = item.discount || 0;
      const cost = (item.costPrice || 0) * item.quantity;
      const revenue = item.price * item.quantity - itemDiscount;
      return acc + (revenue - cost);
    }, 0);

    return { subtotal, discount, total, profit };
  }, [cart]);

  const amountReceived = useMemo(
    () =>
      paymentEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
    [paymentEntries],
  );

  // Auto-derived settlement state
  const settlementType = useMemo(() => {
    if (amountReceived > 0 && amountReceived >= saleTotals.total) return "Completed";
    if (amountReceived > 0 && amountReceived < saleTotals.total) return "Partially Paid";
    return "Pending";
  }, [amountReceived, saleTotals.total]);

  const changeGiven = useMemo(
    () =>
      settlementType === "Completed"
        ? Math.max(0, amountReceived - saleTotals.total)
        : 0,
    [settlementType, amountReceived, saleTotals.total],
  );


  const remainingAmount = useMemo(() => {
    if (settlementType === "Completed") return 0;
    if (settlementType === "Pending") return saleTotals.total;
    return Math.max(0, saleTotals.total - amountReceived);
  }, [settlementType, amountReceived, saleTotals.total]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-MZ", { style: "currency", currency: "MZN" })
      .format(val)
      .replace("MZN", "Mt");

  const handleCompleteTransaction = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty. Add items before completing the transaction.");
      return;
    }

    // Stock validation
    for (const item of cart) {
      const originalProduct = products.find((p) => p._id === item.id);
      if (originalProduct && originalProduct.stock < item.quantity) {
        toast.error(
          `Insufficient stock for "${item.name}". Available: ${originalProduct.stock}`,
        );
        return;
      }
    }

    // Unregistered client (Walk-in): Must receive full payment
    if (!selectedCustomerId && amountReceived < saleTotals.total) {
      toast.error(
        amountReceived === 0
          ? "Please enter the amount received before completing the transaction."
          : `Walk-in customers must pay in full. Received ${formatCurrency(amountReceived)} of ${formatCurrency(saleTotals.total)}.`,
      );
      return;
    }

    if (!selectedCustomerId && changeGiven > 0 && changeHandling === "Store Credit") {
      toast.error("Walk-in customers cannot receive Store Credit. Please select a different change handling method.");
      return;
    }

    // Store Credit validation
    const storeCreditUsed = paymentEntries
      .filter((e) => e.method === "Store Credit" && parseFloat(e.amount) > 0)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);

    if (storeCreditUsed > 0) {
      const availableCredit = selectedCustomer?.creditBalance || 0;
      if (storeCreditUsed > availableCredit) {
        toast.error(`Insufficient store credit. Trying to use Mt ${storeCreditUsed} but only Mt ${availableCredit} is available.`);
        return;
      }
    }

    // Caixa validation
    const hasCashPayment = paymentEntries.some(p => p.method.toLowerCase() === "cash" && parseFloat(p.amount) > 0);
    if (hasCashPayment) {
      if (activeSession === undefined) {
        toast.error("Checking Caixa session status... Please wait.");
        return;
      }
      if (activeSession === null) {
        toast.warning("Cannot process cash payment. No Caixa session open. Please go to Caixa and open a session first.");
        return;
      }
      if (activeSession.isExpired) {
        toast.warning("Caixa Session from previous day is still open. Please close it and open a new session for today.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Determine effective settlement type
      let effectiveSettlement = settlementType;

      const paymentBreakdown =
        effectiveSettlement === "Pending"
          ? []
          : paymentEntries
              .filter((e) => parseFloat(e.amount) > 0)
              .map((e) => ({
                method: e.method,
                amount: parseFloat(e.amount),
              }));

      const result = await createTransaction({
        customerId: (selectedCustomerId as Id<"customers">) || undefined,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal: saleTotals.subtotal,
        discount: saleTotals.discount,
        taxes: 0,
        total: saleTotals.total,
        profit: saleTotals.profit,
        cashierName: user?.username || "Sl Legacy Cashier",
        amountReceived: effectiveSettlement === "Pending" ? 0 : amountReceived,
        changeGiven,
        changeHandling: changeGiven > 0 ? changeHandling : undefined,
        deliveryStatus: effectiveSettlement === "Pending" ? "Pending" : "Delivered",
        paymentBreakdown,
        addRemainingToAccount: selectedCustomerId ? addRemainingToAccount : undefined,
      });

      toast.success(`Transaction Complete: ${result.receiptNumber}`);
      setCart([]);
      setPaymentEntries([{ id: "1", method: "Cash", amount: "" }]);
      setSelectedCustomerId(null);
      setCustomerSearch("");
      setAddRemainingToAccount(false);
    } catch (err: any) {
      console.error("Transaction Error:", err);
      let errorMessage = "Failed to complete transaction.";
      if (err.data) {
        errorMessage = typeof err.data === 'string' ? err.data : JSON.stringify(err.data);
      } else if (err.message) {
        errorMessage = err.message.replace(/Uncaught Error: |\[ConvexError\] /g, "");
      }
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      {/* Left Section: Search & Products */}
      <section className="col-span-12 lg:col-span-8 flex flex-col gap-4 h-full">
        {/* Search & Filters */}
        <div className="bg-white/6 backdrop-blur-md p-6 rounded-xl shadow-sm border border-white/12 flex flex-col gap-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-outline"
                size={20}
              />
              <input
                className="w-full pl-12 pr-4 py-3 bg-transparent border-b border-primary/20 focus:border-primary focus:ring-0 font-label-caps text-label-caps outline-none transition-all placeholder:text-on-surface-variant/50"
                placeholder="SEARCH BY NAME, SKU, OR BARCODE"
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <button className="p-3 bg-surface-container rounded-lg border border-outline-variant/30 hover:bg-surface-variant transition-colors">
              <Filter className="text-primary" size={20} />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
            {[
              "Earrings",
              "Bracelets",
              "Charms",
              "Piercings",
              "Necklaces",
              "Necklace & Earring Sets",
              "Watches",
              "Rings",
            ].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? "" : cat)}
                className={`px-4 py-2 rounded-full font-label-caps text-[10px] whitespace-nowrap transition-all border ${activeCategory === cat
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-white/6 border-white/12 text-on-surface-variant hover:bg-white/8"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 overflow-y-auto pr-2 pb-6">
          {filteredProducts.map((p) => (
            <div
              key={p._id}
              className="bg-white/6 backdrop-blur-md rounded-xl overflow-hidden border border-white/12 flex flex-col group cursor-pointer transition-all hover:shadow-lg"
            >
              <div className="relative aspect-square bg-surface-container overflow-hidden">
                {p.imageUrl ? (
                  <img
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    alt={p.name}
                    src={p.imageUrl}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary/30">
                    <CheckCircle2 size={32} />
                  </div>
                )}
                <span
                  className={`absolute top-2 right-2 px-2 py-0.5 bg-white/10 backdrop-blur text-[9px] font-bold rounded-md ${p.stock > 0 ? "text-primary" : "text-error"}`}
                >
                  {p.stock > 0 ? `${p.stock} IN STOCK` : "OUT OF STOCK"}
                </span>
              </div>
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                <div className="flex justify-between items-start gap-1">
                  <h3 className="font-headline-md text-sm text-on-surface leading-tight line-clamp-2">
                    {p.name}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-1 mt-auto">
                  <span className="text-[8px] bg-secondary-container/20 text-secondary px-1.5 py-0.5 rounded font-bold">
                    {p.category}
                  </span>
                  <span className="text-[8px] bg-surface-variant/40 text-on-surface-variant px-1.5 py-0.5 rounded font-bold uppercase truncate max-w-[80px]">
                    {p.code || "N/A"}
                  </span>
                </div>
                <div className="mt-2 flex justify-between items-center border-t border-primary/10 pt-2">
                  <p className="font-headline-md text-primary text-sm">
                    {formatCurrency(p.sellingPrice)}
                  </p>
                  <button
                    onClick={() => handleAddToCart(p)}
                    disabled={p.stock <= 0}
                    className="p-1.5 bg-primary/10 text-primary rounded-full hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/10 disabled:hover:text-primary"
                  >
                    <PlusCircle size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Right Section: Cart & Payment */}
      <aside className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-6">
        {/* Customer Integration */}
        <div className="bg-white/6 backdrop-blur-md p-6 rounded-xl shadow-sm border border-white/12 shrink-0">
          <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-4">
            Customer Profile
          </h4>

          {/* Selected customer / walk-in card */}
          <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-white font-bold text-xl">
              {selectedCustomer ? (
                selectedCustomer.firstName.charAt(0)
              ) : (
                <User size={24} />
              )}
            </div>
            <div className="flex-1">
              <p className="font-body-md font-bold text-on-surface">
                {selectedCustomer
                  ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
                  : "Walk-in Client"}
              </p>
              <p className="text-[11px] text-on-surface-variant mb-1.5">
                Status: {selectedCustomer ? (selectedCustomer.customerHealth || "New Client") : "N/A"}
              </p>
              {selectedCustomer && (
                <CustomerBalanceBadge
                  creditBalance={selectedCustomer.creditBalance}
                  debitBalance={selectedCustomer.debitBalance}
                  formatCurrency={formatCurrency}
                />
              )}
            </div>
            {selectedCustomer && (
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerSearch("");
                }}
                className="p-1 text-outline hover:text-error transition-colors"
                title="Switch to Walk-in"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Client search */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-2.5 border border-outline-variant/30 focus-within:border-primary transition-colors">
              <Search size={14} className="text-outline flex-shrink-0" />
              <input
                type="text"
                placeholder="Search client by name..."
                className="flex-1 bg-transparent text-xs outline-none text-on-surface placeholder:text-outline/50"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() =>
                  setTimeout(() => setShowCustomerDropdown(false), 150)
                }
              />
              {customerSearch && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCustomerSearch("");
                    setShowCustomerDropdown(false);
                  }}
                  className="text-outline hover:text-error transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-outline-variant/20 z-20 max-h-44 overflow-y-auto">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((c) => (
                    <button
                      key={c._id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedCustomerId(c._id);
                        setCustomerSearch(`${c.firstName} ${c.lastName}`);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-primary/5 transition-colors border-b border-outline-variant/10 last:border-0"
                    >
                      <span className="font-bold text-inverse-on-surface">
                        {c.firstName} {c.lastName}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-xs text-outline">No clients found</p>
                )}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="mt-4">
              <button className="w-full py-2 text-[10px] font-bold border border-outline-variant/30 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors">
                PURCHASE HISTORY
              </button>
            </div>
          )}
        </div>

        {/* Transaction Cart */}
        <div
          className="bg-white/6 backdrop-blur-md rounded-xl shadow-sm border border-white/12 flex flex-col shrink-0"
          style={{ height: "500px" }}
        >

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {cart.map((item) => (
              <div key={item.id} className="flex gap-4">
                <div className="w-16 h-20 bg-surface-container rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <CheckCircle2 size={24} className="text-primary/30" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className="font-body-md font-bold text-sm">
                      {item.name}
                    </p>
                    <p className="font-data-tabular text-sm font-bold">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <p className="text-[10px] text-outline uppercase">
                    {item.sku}
                  </p>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setCart(
                            cart.map((i) => {
                              if (i.id === item.id) {
                                const newQty = Math.max(1, i.quantity - 1);
                                return {
                                  ...i,
                                  quantity: newQty,
                                  discount: Math.min(i.discount || 0, i.price * newQty),
                                };
                              }
                              return i;
                            }),
                          )
                        }
                        className="w-6 h-6 border border-outline-variant/50 rounded flex items-center justify-center text-on-surface-variant hover:bg-white hover:text-primary transition-colors"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold">{item.quantity}</span>
                      <button
                        onClick={() =>
                          setCart(
                            cart.map((i) =>
                              i.id === item.id
                                ? { ...i, quantity: i.quantity + 1 }
                                : i,
                            ),
                          )
                        }
                        className="w-6 h-6 border border-outline-variant/50 rounded flex items-center justify-center text-on-surface-variant hover:bg-white hover:text-primary transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[10px] text-primary font-bold">
                        <span>Disc: Mt</span>
                        <input
                          type="number"
                          min="0"
                          max={item.price * item.quantity}
                          value={item.discount || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const maxDisc = item.price * item.quantity;
                            const clampedVal = Math.min(Math.max(0, val), maxDisc);
                            setCart(
                              cart.map((i) =>
                                i.id === item.id ? { ...i, discount: clampedVal } : i
                              )
                            );
                          }}
                          className="w-14 px-1 py-0.5 bg-surface-container/60 border border-outline-variant/30 rounded text-[10px] font-bold text-primary outline-none focus:border-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setCart(cart.filter((i) => i.id !== item.id))
                        }
                        className="text-outline hover:text-error transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-white/6 border-t border-outline-variant/20 space-y-3 mt-auto">
            <div className="flex justify-between items-center text-[12px] font-bold text-on-surface-variant/70">
              <span>Subtotal</span>
              <span className="font-data-tabular">
                {formatCurrency(saleTotals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 mt-2 border-t border-outline-variant/30">
              <span className="font-label-caps text-primary text-base">
                TOTAL DUE
              </span>
              <span className="font-headline-md text-2xl text-primary">
                {formatCurrency(saleTotals.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment & Actions */}
        <div className="bg-white/6 backdrop-blur-md p-6 rounded-xl shadow-sm border border-white/12 flex flex-col gap-5 shrink-0">

          {/* Payment Methods */}
          <div className="space-y-2.5">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-1">
              Payment Methods
            </h4>
            <AnimatePresence mode="popLayout">
              {paymentEntries.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex gap-2 items-center"
                >
                  <select
                    value={entry.method}
                    onChange={(e) =>
                      setPaymentEntries((prev) =>
                        prev.map((p) => {
                          if (p.id === entry.id) {
                            const newMethod = e.target.value;
                            let newAmount = p.amount;
                            const isBlank = !newAmount || Number(newAmount) === 0;
                            if (isBlank) {
                              // Auto-fill so picking a method never silently submits with no amount.
                              const othersTotal = prev
                                .filter((other) => other.id !== p.id)
                                .reduce((sum, other) => sum + (parseFloat(other.amount) || 0), 0);
                              const remaining = Math.max(0, saleTotals.total - othersTotal);
                              newAmount = (
                                newMethod === "Store Credit" && selectedCustomer?.creditBalance
                                  ? Math.min(remaining, selectedCustomer.creditBalance)
                                  : remaining
                              ).toString();
                            } else if (newMethod === "Store Credit" && selectedCustomer?.creditBalance) {
                              if (Number(newAmount) > selectedCustomer.creditBalance) {
                                newAmount = selectedCustomer.creditBalance.toString();
                              }
                            }
                            return { ...p, method: newMethod, amount: newAmount };
                          }
                          return p;
                        }),
                      )
                    }
                    className="bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-2 text-[11px] font-bold text-primary outline-none w-28 flex-shrink-0 cursor-pointer"
                  >
                    {["Cash", "BCI", "BIM", "M-Pesa", "e-Mola", "Conta Movel", "Bank Transfer"]
                      .concat(selectedCustomer?.creditBalance && selectedCustomer.creditBalance > 0 ? ["Store Credit"] : [])
                      .filter(
                        (m) =>
                          m === entry.method ||
                          !paymentEntries.some((other) => other.id !== entry.id && other.method === m),
                      )
                      .map((m) => (
                      <option key={m} value={m}>{m === "Store Credit" ? `Store Credit (Mt ${selectedCustomer!.creditBalance})` : m}</option>
                    ))}
                  </select>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-outline pointer-events-none">Mt</span>
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={entry.amount}
                      onChange={(e) =>
                        setPaymentEntries((prev) =>
                          prev.map((p) => {
                            if (p.id === entry.id) {
                              let newAmount = e.target.value;
                              if (p.method === "Store Credit" && selectedCustomer?.creditBalance) {
                                if (Number(newAmount) > selectedCustomer.creditBalance) {
                                  newAmount = selectedCustomer.creditBalance.toString();
                                }
                              }
                              return { ...p, amount: newAmount };
                            }
                            return p;
                          }),
                        )
                      }
                      className="w-full pl-9 pr-3 py-2 bg-surface-container border border-outline-variant/30 rounded-lg text-sm font-bold text-on-surface outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  {paymentEntries.length > 1 && (
                    <button
                      onClick={() => setPaymentEntries((prev) => prev.filter((p) => p.id !== entry.id))}
                      className="p-1.5 text-outline hover:text-error transition-colors flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {paymentEntries.length < 6 && (
              <button
                onClick={() =>
                  setPaymentEntries((prev) => [
                    ...prev,
                    { id: Date.now().toString(), method: "Cash", amount: "" },
                  ])
                }
                className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:opacity-70 transition-opacity mt-1"
              >
                <Plus size={12} /> ADD PAYMENT METHOD
              </button>
            )}
          </div>

          {/* Payment Summary */}
          <div className="bg-gradient-to-br from-primary/8 to-primary/3 border border-primary/15 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">PAYMENT SUMMARY</p>
              <div className="flex items-center gap-1.5">                {amountReceived > 0 && (
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${
                    settlementType === "Completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {amountReceived >= saleTotals.total ? "FULLY PAID" : "PARTIAL"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-on-surface-variant">Invoice Total</span>
              <span className="font-bold text-on-surface font-data-tabular">{formatCurrency(saleTotals.total)}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-on-surface-variant">Amount Received</span>
              <span className={`font-bold font-data-tabular ${
                amountReceived > 0 ? "text-emerald-600" : "text-outline/60"
              }`}>{formatCurrency(amountReceived)}</span>
            </div>

            {remainingAmount > 0 && amountReceived > 0 && (
              <div className="flex justify-between items-center text-error bg-error/5 p-3 rounded-xl border border-error/10">
                <span className="font-bold font-label-caps text-xs tracking-wider">Remaining to Pay</span>
                <span className="font-bold text-error font-data-tabular">{formatCurrency(remainingAmount)}</span>
              </div>
            )}

            {remainingAmount > 0 && selectedCustomerId && (
              <label className="flex items-start gap-2.5 p-3 bg-surface-container rounded-xl border border-outline-variant/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addRemainingToAccount}
                  onChange={(e) => setAddRemainingToAccount(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span className="leading-snug">
                  <span className="block text-xs font-bold text-on-surface">Add Remaining Balance to Customer Account</span>
                  <span className="block text-[11px] text-on-surface-variant mt-0.5">
                    Otherwise this sale stays pending — the customer&rsquo;s account balance won&rsquo;t change.
                  </span>
                </span>
              </label>
            )}

            {changeGiven > 0 && (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant">Change Given</span>
                  <span className="font-bold text-amber-600 font-data-tabular">{formatCurrency(changeGiven)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant">Change Handling</span>
                  <select
                    value={changeHandling}
                    onChange={(e) => setChangeHandling(e.target.value)}
                    className="bg-transparent border border-outline-variant/30 rounded px-1 py-0.5 text-[10px] font-bold text-primary outline-none cursor-pointer"
                  >
                    {["Cash", "BCI", "BIM", "M-Pesa", "e-Mola", "Conta Movel", "Bank Transfer"]
                      .concat(selectedCustomerId ? ["Store Credit"] : [])
                      .map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}


            <div className="flex justify-between items-center pt-2 mt-1 border-t border-primary/15">
              <span className="font-label-caps text-label-caps text-primary">Total Due</span>
              <span className="font-headline-md text-2xl text-primary">{formatCurrency(saleTotals.total)}</span>
            </div>
          </div>

          {/* Finalize */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleCompleteTransaction}
            disabled={isSubmitting || cart.length === 0}
            className={`w-full py-4 font-bold text-label-caps tracking-widest rounded-lg shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-white`}
          >
            <span className="flex items-center justify-center gap-2">
              {isSubmitting ? (
                "PROCESSING..."
              ) : (
                "COMPLETE TRANSACTION"
              )}
            </span>
          </motion.button>
        </div>
      </aside>
    </div>
  );
}
