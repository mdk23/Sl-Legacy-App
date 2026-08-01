'use client';

import React, { useState, useMemo } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  TrendingUp,
  Box,
  DollarSign,
  Clock,
  ChevronRight,
  Filter,
  Search,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  X,
  Image as ImageIcon,
  History,
  ShieldCheck,
  Camera,
  Check,
  Tag,
  Gem
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { CHART_COLORS, CHART_CHROME } from '@/lib/chartColors';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types & Interfaces ---

interface InventoryProduct {
  id: string;
  name: string;
  category: 'Rings' | 'Necklaces' | 'Bracelets' | 'Watches' | 'Earrings';
  brand: string;
  goldPurity: string;
  costPrice: number;
  sellingPrice: number;
  quantity: {
    current: number;
    reserved: number;
    damaged: number;
    available: number;
  };
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Dead Stock';
  photos: string[];
  addedDate: string;
  lastMovement: string;
}

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';

// No static MOCK_INVENTORY here anymore

// --- Sub-components ---

const StatCard = ({ title, value, subValue, icon: Icon, percentage, color }: any) => (
  <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:shadow-xl transition-all duration-300">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-${color}/10 text-${color}`}>
        <Icon size={20} />
      </div>
      {percentage !== undefined && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-${color}/10 text-${color} border border-${color}/20`}>
          {percentage}%
        </span>
      )}
    </div>
    <p className="font-label-caps text-[10px] text-outline mb-1">{title}</p>
    <h3 className="font-headline-md text-2xl text-primary mb-1">{value}</h3>
    <p className="font-body-md text-xs text-on-surface-variant opacity-70">{subValue}</p>
    <div className="mt-4 h-1 w-full bg-white/4 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percentage || 0}%` }}
        transition={{ duration: 1, delay: 0.2 }}
        className={`h-full bg-${color}`}
      />
    </div>
  </div>
);


// --- Main Component ---

export default function Inventory() {
  const [showArchived, setShowArchived] = useState(false);
  const products = useQuery(api.products.list, { archived: showArchived }) || [];
  const upsertProduct = useMutation(api.products.upsert);
  const deleteProduct = useMutation(api.products.remove);

  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const selectedProductMovements = useQuery(
    api.movements.getForProduct,
    selectedProduct ? { productId: selectedProduct._id } : "skip"
  ) || [];

  const [activeTab, setActiveTab] = useState<"catalog" | "movements">("catalog");
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [adjustForm, setAdjustForm] = useState({
    quantity: 1,
  });
  const [damageReason, setDamageReason] = useState("");
  const [damageNotes, setDamageNotes] = useState("");

  const [originalStock, setOriginalStock] = useState<number | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const allMovements = useQuery(api.movements.list) || [];
  const adjustStockMutation = useMutation(api.products.adjustStock);

  const damagedCount = useMemo(() => {
    if (!selectedProductMovements) return 0;
    return selectedProductMovements
      .filter((m: any) => m.movementType === "Damage")
      .reduce((sum: number, m: any) => sum + Math.abs(m.quantity), 0);
  }, [selectedProductMovements]);

  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  type SortColumn = 'name' | 'category' | 'costPrice' | 'sellingPrice' | 'stock' | 'status';
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'Rings',
    costPrice: 0,
    sellingPrice: 0,
    stock: 0,
    reorderLevel: 5,
    archived: false,
    description: '',
  });

  const estimatedMargin = useMemo(() => {
    if (formData.sellingPrice <= 0) return 0;
    return ((formData.sellingPrice - formData.costPrice) / formData.sellingPrice) * 100;
  }, [formData.costPrice, formData.sellingPrice]);

  const analytics = useQuery(api.products.getInventoryAnalytics);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [products]);

  const agingData = useMemo(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let bucket0_30 = 0;
    let bucket31_60 = 0;
    let bucket61_90 = 0;
    let bucket90plus = 0;

    products.forEach((p) => {
      const ageInDays = Math.floor((now - p._creationTime) / DAY);
      if (ageInDays <= 30) bucket0_30++;
      else if (ageInDays <= 60) bucket31_60++;
      else if (ageInDays <= 90) bucket61_90++;
      else bucket90plus++;
    });

    return [
      { name: '0-30 Days', value: bucket0_30 },
      { name: '31-60 Days', value: bucket31_60 },
      { name: '61-90 Days', value: bucket61_90 },
      { name: '90+ Days', value: bucket90plus },
    ];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }).sort((a: any, b: any) => {
    if (!sortColumn) return 0;
    let valA = a[sortColumn];
    let valB = b[sortColumn];
    
    if (sortColumn === 'status') {
      const getStatusRank = (p: any) => p.stock > p.reorderLevel ? 3 : (p.stock > 0 ? 2 : 1);
      valA = getStatusRank(a);
      valB = getStatusRank(b);
    } else if (sortColumn === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const COLORS = CHART_COLORS;

  const handleOpenAdd = () => {
    setEditingId(null);
    setOriginalStock(null);
    setAdjustmentReason("");
    setFormData({
      code: '',
      name: '',
      category: 'Rings',
      costPrice: 0,
      sellingPrice: 0,
      stock: 0,
      reorderLevel: 5,
      archived: false,
      description: '',
    });
    setIsAddingProduct(true);
  };

  const handleOpenEdit = (product: any) => {
    setEditingId(product._id);
    setOriginalStock(product.stock);
    setAdjustmentReason("");
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      reorderLevel: product.reorderLevel,
      archived: product.archived,
      description: product.description || '',
    });
    setIsAddingProduct(true);
    setSelectedProduct(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isStockChanged = editingId && originalStock !== null && formData.stock !== originalStock;
      if (isStockChanged && (!adjustmentReason || adjustmentReason.trim() === "")) {
        toast.error("An adjustment reason is mandatory when editing the stock quantity.");
        return;
      }
      await upsertProduct({
        id: (editingId ?? undefined) as any,
        ...formData,
        adjustmentReason: isStockChanged ? adjustmentReason : undefined,
      });
      setIsAddingProduct(false);
      setEditingId(null);
      setOriginalStock(null);
      setAdjustmentReason("");
      toast.success(editingId ? "Inventory piece updated" : "New piece registered in the vault");
    } catch (error: any) {
      toast.error(error.message || "Failed to save inventory piece");
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    toast.warning("Confirm Deletion", {
      description: "Are you sure you want to remove this piece? This action is permanent.",
      action: {
        label: "Remove Permanent",
        onClick: async () => {
          try {
            await deleteProduct({ id: id as any });
            setSelectedProduct(null);
            toast.success("Piece purged from inventory vault");
          } catch (error) {
            toast.error("Failed to delete piece");
            console.error(error);
          }
        },
      },
    });
  };

  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prodId = adjustProduct?._id || selectedProductId;
    if (!prodId) {
      toast.error("Please select a product");
      return;
    }
    if (adjustForm.quantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (!damageReason || damageReason.trim() === "") {
      toast.error("Please select a damage reason");
      return;
    }

    try {
      const fullReason = damageReason + (damageNotes.trim() !== "" ? `: ${damageNotes.trim()}` : "");
      const q = -adjustForm.quantity;
      await adjustStockMutation({
        productId: prodId as any,
        quantity: q,
        reason: fullReason,
        type: "Damage",
      });
      setIsAdjustingStock(false);
      setAdjustProduct(null);
      setSelectedProductId("");
      setDamageReason("");
      setDamageNotes("");
      setAdjustForm({
        quantity: 1,
      });
      toast.success("Defective/damaged stock movement registered successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to register damage");
      console.error(err);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div>
          <h1 className="font-headline-lg text-4xl text-primary mb-2">Inventory Control</h1>
          <p className="font-body-md text-on-surface-variant max-w-xl">
            Global stock management, procurement, and real-time jewelry analytics.
          </p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={() => setIsAddingProduct(true)}
            className="flex-1 md:flex-none px-6 py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} /> NEW ACQUISITION
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="TOTAL STOCK VALUE"
          value={analytics ? `${analytics.totalStockValue.toLocaleString()} Mt` : "..."}
          subValue={`Valuation of ${products.length} active pieces`}
          icon={DollarSign}
          percentage={products.length > 0 ? Math.round((products.filter((p: any) => p.stock > 0).length / products.length) * 100) : 0}
          color="primary"
        />
        <StatCard
          title="LOW STOCK ITEMS"
          value={analytics ? analytics.lowStockCount : "..."}
          subValue="Requires immediate action"
          icon={AlertTriangle}
          percentage={analytics && products.length > 0 ? Math.round((analytics.lowStockCount / products.length) * 100) : 0}
          color="secondary"
        />
        <StatCard
          title="OUT OF STOCK"
          value={analytics ? analytics.outOfStockCount : "..."}
          subValue="Lost revenue potential"
          icon={Box}
          percentage={analytics && products.length > 0 ? Math.round((analytics.outOfStockCount / products.length) * 100) : 0}
          color="error"
        />
        <StatCard
          title="DEAD STOCK"
          value={analytics ? analytics.deadStockCount : "..."}
          subValue="Idle capital > 180 days"
          icon={Clock}
          percentage={analytics && products.length > 0 ? Math.round((analytics.deadStockCount / products.length) * 100) : 0}
          color="outline"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => {
            setAdjustForm({ quantity: 1 });
            setAdjustProduct(null);
            setSelectedProductId("");
            setDamageReason("");
            setDamageNotes("");
            setIsAdjustingStock(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-caps text-[11px] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <AlertTriangle size={16} /> REGISTER DAMAGE / LOSS
        </button>
        <button
          onClick={() => setActiveTab(activeTab === "catalog" ? "movements" : "catalog")}
          className={`flex items-center gap-2 px-5 py-2.5 backdrop-blur-md border text-on-surface-variant rounded-xl font-label-caps text-[11px] hover:bg-surface-variant/50 transition-all ${
            activeTab === "movements" ? "bg-primary/10 border-primary text-primary" : "bg-white/8 border-outline-variant"
          }`}
        >
          <Filter size={16} /> {activeTab === "movements" ? "VIEW CATALOG" : "VIEW MOVEMENTS LOG"}
        </button>
      </div>

      {activeTab === "catalog" ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
            {/* Alerts Section */}
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-error/50">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-error" size={20} />
                  <h3 className="font-headline-md text-lg text-primary">Critical Alerts</h3>
                </div>
                <span className="bg-error/10 text-error px-2 py-0.5 rounded text-[10px] font-bold">4 ISSUES</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Negative Stock Detected', desc: 'SKU: PRD-102 (Bracelet)', type: 'error' },
                  { label: 'Missing Inventory Scan', desc: 'Section: Vault B, Row 4', type: 'warning' },
                  { label: 'Dead Stock Threshold', desc: '12 items idle > 9 months', type: 'warning' },
                  { label: 'Low Margin Warning', desc: 'Celestial Collection (Promo)', type: 'info' },
                ].map((alert, i) => (
                  <div key={i} className="p-3 bg-white/6 rounded-xl border border-white/12 hover:bg-white/8 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-label-caps text-[11px] text-on-surface">{alert.label}</p>
                        <p className="font-body-md text-[10px] text-on-surface-variant">{alert.desc}</p>
                      </div>
                      <ChevronRight size={14} className="text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-6 py-2 border border-error/20 text-error font-label-caps text-[10px] rounded-lg hover:bg-error/5 transition-colors">RESOLVE ALL</button>
            </div>

            {/* Category Distribution Chart */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-headline-md text-lg text-primary">Category Distribution</h3>
                  <p className="font-label-caps text-[9px] text-outline">TOTAL VOLUME BY TYPE</p>
                </div>
              </div>
              <div className="h-48 w-full min-h-[192px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {categoryDistribution.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="font-label-caps text-[10px] text-on-surface-variant">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory Aging Chart */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-headline-md text-lg text-primary">Inventory Aging</h3>
                  <p className="font-label-caps text-[9px] text-outline">STOCK RETENTION PERIOD</p>
                </div>
              </div>
              <div className="h-48 w-full min-h-[192px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={agingData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_CHROME.grid} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: CHART_CHROME.axisText }} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'rgba(180, 131, 43, 0.12)' }}
                      contentStyle={{
                        borderRadius: '12px',
                        border: `1px solid ${CHART_CHROME.tooltipBorder}`,
                        boxShadow: CHART_CHROME.tooltipShadow,
                        backgroundColor: CHART_CHROME.tooltipBg,
                        color: CHART_CHROME.tooltipText,
                      }}
                    />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 font-body-md text-[10px] text-on-surface-variant text-center italic">
                {products.length > 0
                  ? `* ${Math.round((agingData[3].value / products.length) * 100)}% of inventory has exceeded the 90-day retention threshold.`
                  : '* No inventory data available.'}
              </p>
            </div>
          </div>

          {/* Product Table Section */}
          <section className="glass-panel rounded-2xl overflow-hidden shadow-xl border border-white/10">
            <div className="px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-primary/10">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <h4 className="font-headline-md text-xl text-primary whitespace-nowrap">Product Catalog</h4>
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
                  <input
                    type="text"
                    placeholder="Search SKU or Name..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 bg-white/6 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <label className="font-label-caps text-[10px] text-outline whitespace-nowrap">SHOW ARCHIVED</label>
                  <button
                    type="button"
                    onClick={() => { setShowArchived(!showArchived); setCurrentPage(1); }}
                    className={`w-10 h-5 rounded-full transition-colors relative ${showArchived ? 'bg-error' : 'bg-outline-variant'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${showArchived ? 'left-[22px]' : 'left-0.5'}`}></div>
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {['All', 'Earrings', 'Bracelets', 'Charms', 'Piercings', 'Necklaces', 'Necklace & Earring Sets', 'Watches', 'Rings'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setCategoryFilter(cat); setCurrentPage(1); }}
                    className={`px-4 py-1.5 rounded-full font-label-caps text-[10px] transition-all whitespace-nowrap ${categoryFilter === cat ? 'bg-primary text-on-primary shadow-md' : 'bg-white/8 text-primary border border-primary/20 hover:bg-primary/5'}`}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10 font-label-caps text-[11px] text-primary">
                    <th className="px-8 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">PRODUCT INFO {sortColumn === 'name' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('category')}>
                      <div className="flex items-center gap-1">CATEGORY {sortColumn === 'category' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('costPrice')}>
                      <div className="flex items-center gap-1">COST PRICE {sortColumn === 'costPrice' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('sellingPrice')}>
                      <div className="flex items-center gap-1">SELLING PRICE {sortColumn === 'sellingPrice' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('stock')}>
                      <div className="flex items-center gap-1">QUANTITY {sortColumn === 'stock' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">STATUS {sortColumn === 'status' && (sortDirection === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-8 py-5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {paginatedProducts.map((product: any) => (
                    <tr
                      key={product._id}
                      className="hover:bg-white/6 transition-colors group cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg overflow-hidden border border-white bg-surface-container shadow-sm">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          </div>
                          <div>
                            <p className="font-body-md text-sm font-bold text-on-surface">{product.name}</p>
                            <p className="font-data-tabular text-[10px] text-outline">{product.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-label-caps text-[10px] text-on-surface-variant bg-surface-container px-2 py-1 rounded">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-5 font-data-tabular text-sm text-outline">
                        {(product.costPrice).toLocaleString()} Mt
                      </td>
                      <td className="px-6 py-5 font-data-tabular text-sm font-bold text-primary">
                        {(product.sellingPrice).toLocaleString()} Mt
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="font-data-tabular text-sm">{product.stock} units</span>
                          <span className="font-label-caps text-[9px] text-secondary">{product.stock} available</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${product.stock > product.reorderLevel ? 'bg-secondary-container/20 text-secondary' :
                          product.stock > 0 ? 'bg-primary-fixed/30 text-primary' :
                            'bg-error-container/30 text-error'
                          }`}>
                          {product.stock > product.reorderLevel ? 'In Stock' : (product.stock > 0 ? 'Low Stock' : 'Out of Stock')}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(product); }}
                            className="p-2 hover:bg-primary/10 rounded-full text-outline hover:text-primary transition-colors"
                          >
                            <History size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                            className="p-2 hover:bg-primary/10 rounded-full text-outline hover:text-primary transition-colors"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-4 bg-primary/5 flex justify-between items-center border-t border-primary/10">
              <p className="font-label-caps text-[10px] text-outline">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} pieces
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-1 border border-primary/20 rounded-lg text-primary font-label-caps text-[10px] hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  PREVIOUS
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-4 py-1 border border-primary/20 rounded-lg text-primary font-label-caps text-[10px] hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  NEXT
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="glass-panel rounded-2xl p-8 shadow-xl border border-white/10 mb-10">
          <div className="flex justify-between items-center mb-6 border-b border-primary/10 pb-4">
            <div>
              <h3 className="font-headline-md text-2xl text-primary font-bold">Stock Movements Audit Log</h3>
              <p className="font-label-caps text-[9px] text-outline tracking-widest mt-1">REAL-TIME INVENTORY AUDIT TRAIL</p>
            </div>
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-label-caps text-[10px] font-bold">
              {allMovements.length} MOVEMENTS RECORDED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-primary/5 border-b border-primary/10 font-label-caps text-[11px] text-primary">
                  <th className="px-6 py-4">DATE & TIME</th>
                  <th className="px-6 py-4">PRODUCT</th>
                  <th className="px-6 py-4">SKU / CODE</th>
                  <th className="px-6 py-4">MOVEMENT TYPE</th>
                  <th className="px-6 py-4 text-center">QUANTITY</th>
                  <th className="px-6 py-4">REASON</th>
                  <th className="px-6 py-4">USER</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {allMovements.length > 0 ? (
                  allMovements.map((movement: any) => {
                    const product = products.find((p: any) => p._id === movement.productId);
                    const formattedTime = new Date(movement.createdAt).toLocaleString("en-MZ", {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const isQtyPositive = movement.quantity > 0;
                    const isDamage = movement.movementType === "Damage";

                    return (
                      <tr key={movement._id} className="hover:bg-white/6 transition-colors">
                        <td className="px-6 py-4 font-data-tabular text-xs text-outline">{formattedTime}</td>
                        <td className="px-6 py-4 font-body-md text-xs font-bold text-on-surface">
                          {product ? product.name : "Unknown Product"}
                        </td>
                        <td className="px-6 py-4 font-data-tabular text-xs text-outline">
                          {product ? product.code : "N/A"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-label-caps text-[9px] px-2 py-0.5 rounded font-bold ${
                            isDamage
                              ? "bg-error/15 text-error"
                              : movement.movementType === "Sale"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : isQtyPositive
                              ? "bg-secondary/15 text-secondary"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {movement.movementType}
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-data-tabular text-xs font-bold text-center ${
                          isQtyPositive ? "text-secondary" : "text-error"
                        }`}>
                          {isQtyPositive ? `+${movement.quantity}` : movement.quantity}
                        </td>
                        <td className="px-6 py-4 font-body-md text-xs text-on-surface-variant italic">
                          {movement.reason}
                        </td>
                        <td className="px-6 py-4 font-label-caps text-[10px] text-outline">
                          {movement.userId || "System"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-outline italic text-sm">
                      No stock movements have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-end p-0 md:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl h-full bg-surface-container overflow-y-auto shadow-2xl rounded-l-3xl md:rounded-3xl border-l border-white/10"
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 bg-surface-container/80 backdrop-blur-md p-8 flex justify-between items-start border-b border-outline-variant/30">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-xl">
                    <img src={selectedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h2 className="font-headline-md text-2xl text-primary">{selectedProduct.name}</h2>
                    <p className="font-label-caps text-xs text-outline">{selectedProduct.code} • {selectedProduct.category.toUpperCase()}</p>
                    <div className="mt-2 flex gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">PREMIUM COLLECTION</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary text-[10px] font-bold">CERTIFIED</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-primary/5 rounded-full text-outline transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-10">
                {/* Basic Info & Specifics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-label-caps text-[11px] text-outline mb-3 flex items-center gap-2">
                        <ImageIcon size={14} /> BASIC INFO
                      </h4>
                      <div className="space-y-3 bg-white/6 p-4 rounded-2xl border border-white/12">
                        <div className="flex justify-between border-b border-outline-variant/20 pb-2">
                          <span className="font-body-md text-sm text-on-surface-variant">Brand</span>
                          <span className="font-body-md text-sm font-bold">{selectedProduct.brand}</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-2">
                          <span className="font-body-md text-sm text-on-surface-variant">Category</span>
                          <span className="font-body-md text-sm font-bold">{selectedProduct.category}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-body-md text-sm text-on-surface-variant">Added Date</span>
                          <span className="font-body-md text-sm font-bold">{selectedProduct.addedDate}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-label-caps text-[11px] text-outline mb-3 flex items-center gap-2">
                        <ShieldCheck size={14} /> JEWELRY SPECIFIC
                      </h4>
                      <div className="bg-atelier-gradient p-5 rounded-2xl border border-primary/10 text-primary">
                        <p className="font-label-caps text-[10px] opacity-70">METAL & PURITY</p>
                        <p className="font-headline-md text-xl">{selectedProduct.goldPurity}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-label-caps text-[11px] text-outline mb-3 flex items-center gap-2">
                        <DollarSign size={14} /> FINANCIAL DATA
                      </h4>
                      <div className="space-y-3 bg-white/6 p-4 rounded-2xl border border-white/12">
                        <div className="flex justify-between border-b border-outline-variant/20 pb-2">
                          <span className="font-body-md text-sm text-on-surface-variant">Cost Price</span>
                          <span className="font-data-tabular text-sm">{(selectedProduct.costPrice).toLocaleString()} Mt</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-2">
                          <span className="font-body-md text-sm text-on-surface-variant">Selling Price</span>
                          <span className="font-data-tabular text-sm font-bold text-primary">{(selectedProduct.sellingPrice).toLocaleString()} Mt</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="font-body-md text-sm text-on-surface-variant">Profit Margin</span>
                          <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-lg font-bold text-xs">
                            {(((selectedProduct.sellingPrice - selectedProduct.costPrice) / selectedProduct.sellingPrice) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock Info */}
                <div>
                  <h4 className="font-label-caps text-[11px] text-outline mb-4 flex items-center gap-2">
                    <Box size={14} /> STOCK LEVELS
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/8 p-4 rounded-2xl border border-white shadow-sm text-center">
                      <p className="font-label-caps text-[10px] text-outline mb-1">TOTAL</p>
                      <p className="font-headline-md text-2xl text-on-surface">{selectedProduct.stock}</p>
                    </div>
                    <div className="bg-white/8 p-4 rounded-2xl border border-white shadow-sm text-center">
                      <p className="font-label-caps text-[10px] text-outline mb-1">STATUS</p>
                      <p className="font-headline-md text-sm text-secondary">{selectedProduct.stock > selectedProduct.reorderLevel ? 'STOCK OK' : 'LOW STOCK'}</p>
                    </div>
                    <div className="bg-white/8 p-4 rounded-2xl border border-white shadow-sm text-center opacity-40">
                      <p className="font-label-caps text-[10px] text-outline mb-1">RESERVED</p>
                      <p className="font-headline-md text-2xl text-primary">0</p>
                    </div>
                    <div className={`bg-white/8 p-4 rounded-2xl border border-white shadow-sm text-center ${damagedCount > 0 ? '' : 'opacity-40'}`}>
                      <p className="font-label-caps text-[10px] text-outline mb-1">DAMAGED</p>
                      <p className="font-headline-md text-2xl text-error">{damagedCount}</p>
                    </div>
                  </div>
                </div>

                {/* Photos Grid */}
                <div>
                  <h4 className="font-label-caps text-[11px] text-outline mb-4 flex items-center gap-2">
                    <ImageIcon size={14} /> PRODUCT MEDIA
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    {[selectedProduct.imageUrl].filter(Boolean).map((photo: any, i: number) => (
                      <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-white shadow-md hover:scale-[1.02] transition-all cursor-zoom-in">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    <button className="aspect-square rounded-2xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center text-outline hover:bg-white/4 transition-all">
                      <Plus size={24} />
                      <span className="font-label-caps text-[9px] mt-2">ADD PHOTO</span>
                    </button>
                  </div>
                </div>

                {/* History/Timeline */}
                <div>
                  <h4 className="font-label-caps text-[11px] text-outline mb-4 flex items-center gap-2">
                    <History size={14} /> MOVEMENT HISTORY
                  </h4>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    {selectedProductMovements.length > 0 ? (
                      selectedProductMovements.map((m: any, idx: number) => {
                        const isStockIn = m.quantity > 0;
                        const formattedTime = new Date(m.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                        const isLast = idx === selectedProductMovements.length - 1;

                        return (
                          <div 
                            key={m._id} 
                            className={`flex gap-4 items-start relative pl-6 ${!isLast ? 'pb-6 border-l border-outline-variant/30 ml-2' : 'pb-2 border-l border-transparent ml-2'}`}
                          >
                            <div className={`absolute top-1 -left-1.5 w-3 h-3 rounded-full ${isStockIn ? 'bg-secondary' : 'bg-primary'}`}></div>
                            <div>
                              <p className="font-body-md text-sm font-bold">
                                {isStockIn ? 'Stock In' : 'Stock Out'} - {m.movementType}
                              </p>
                              <p className="font-data-tabular text-[10px] text-outline">{formattedTime}</p>
                              <p className="font-body-md text-xs mt-1 text-on-surface-variant">
                                {m.reason?.replace("INV-", "ORD-")} • {isStockIn ? '+' : ''}{m.quantity} unit{Math.abs(m.quantity) !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-outline italic pl-2">No movement history recorded for this piece.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6 border-t border-outline-variant/30">
                  <button
                    onClick={() => {
                      setAdjustProduct(selectedProduct);
                      setAdjustForm({ quantity: 1 });
                      setDamageReason("");
                      setDamageNotes("");
                      setIsAdjustingStock(true);
                    }}
                    className="w-full py-3.5 bg-secondary text-on-secondary rounded-2xl font-label-caps text-xs shadow-lg shadow-secondary/15 hover:opacity-90 transition-all flex items-center justify-center gap-2 uppercase tracking-widest font-bold"
                  >
                    <AlertTriangle size={15} /> Report Piece Damage / Loss
                  </button>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleOpenEdit(selectedProduct)}
                      className="flex-1 py-3 bg-primary text-on-primary rounded-2xl font-label-caps text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                    >
                      <History size={14} /> Edit Details
                    </button>
                    <button
                      onClick={() => handleDelete(selectedProduct._id)}
                      className="flex-1 py-3 bg-white border border-error/30 text-error rounded-2xl font-label-caps text-xs hover:bg-error/5 transition-all uppercase tracking-widest"
                    >
                      Remove Piece
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Adjustment Drawer */}
      <AnimatePresence>
        {isAdjustingStock && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAdjustingStock(false);
                setAdjustProduct(null);
                setSelectedProductId("");
              }}
              className="absolute inset-0 bg-black/20 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-surface-container shadow-2xl overflow-y-auto border-l border-white/10 flex flex-col"
            >
              {/* Drawer Header */}
              <div className="p-8 pb-12 bg-atelier-gradient relative">
                <button
                  onClick={() => {
                    setIsAdjustingStock(false);
                    setAdjustProduct(null);
                    setSelectedProductId("");
                  }}
                  className="absolute top-6 right-6 p-2 bg-white/6 backdrop-blur-md rounded-full text-primary hover:bg-white transition-all shadow-sm"
                >
                  <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center mt-4">
                  <div className="w-20 h-20 bg-white/6 backdrop-blur-md rounded-3xl border-2 border-white flex items-center justify-center text-primary shadow-xl mb-4">
                    <AlertTriangle size={32} />
                  </div>
                  <h2 className="font-headline-md text-3xl text-primary uppercase tracking-tight">
                    Register Damage / Loss
                  </h2>
                  <p className="font-label-caps text-[10px] text-outline mt-2 tracking-[0.2em]">
                    REGISTER DEFECTIVE / DAMAGED ITEMS
                  </p>
                </div>
              </div>

              {/* Form Content */}
              <form className="flex-1 p-8 space-y-8" onSubmit={handleAdjustStockSubmit}>
                {/* Select Product */}
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">SELECT PIECE / PRODUCT</label>
                  {adjustProduct ? (
                    <div className="p-4 bg-white/6 border border-white/12 rounded-xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-white bg-surface-container shadow-sm flex-shrink-0">
                        <img src={adjustProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="font-body-md text-sm font-bold text-on-surface">{adjustProduct.name}</p>
                        <p className="font-data-tabular text-[10px] text-outline">{adjustProduct.code} • Stock: {adjustProduct.stock} available</p>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-body-md text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                      required
                    >
                      <option value="" disabled>-- Select a Jewelry Piece --</option>
                      {products.map((p: any) => (
                        <option key={p._id} value={p._id}>
                          {p.name} ({p.code}) - {p.stock} units
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">QUANTITY</label>
                  <input
                    type="number"
                    min={1}
                    value={adjustForm.quantity}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-data-tabular text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                    required
                  />
                </div>

                {/* Damage Reason */}
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">DAMAGE REASON (REQUIRED)</label>
                  <select
                    value={damageReason}
                    onChange={(e) => setDamageReason(e.target.value)}
                    className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-body-md text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                    required
                  >
                    <option value="" disabled>-- Select Damage Type --</option>
                    <option value="Broken Item">Broken Item</option>
                    <option value="Lost Item">Lost Item</option>
                    <option value="Stolen Item">Stolen Item</option>
                    <option value="Manufacturing Defect">Manufacturing Defect</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Reason Notes */}
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">DAMAGE NOTES / DETAILS (OPTIONAL)</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Scratched gold setting, loose center diamond"
                    value={damageNotes}
                    onChange={(e) => setDamageNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-body-md text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm resize-none"
                  />
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-xs shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 uppercase tracking-widest font-bold"
                  >
                    <Check size={16} /> Save Damage Record
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Product Drawer */}
      <AnimatePresence>
        {isAddingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingProduct(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-surface-container shadow-2xl overflow-y-auto border-l border-white/10 flex flex-col"
            >
              {/* Drawer Header */}
              <div className="p-8 pb-12 bg-atelier-gradient relative">
                <button
                  onClick={() => setIsAddingProduct(false)}
                  className="absolute top-6 right-6 p-2 bg-white/6 backdrop-blur-md rounded-full text-primary hover:bg-white transition-all shadow-sm"
                >
                  <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center mt-4">
                  <div className="w-20 h-20 bg-white/6 backdrop-blur-md rounded-3xl border-2 border-white flex items-center justify-center text-primary shadow-xl mb-4 group cursor-pointer hover:bg-white transition-all">
                    <Camera size={32} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <h2 className="font-headline-md text-3xl text-primary uppercase tracking-tight">
                    {editingId ? 'Update Piece Integrity' : 'New Piece Acquisition'}
                  </h2>
                  <p className="font-label-caps text-[10px] text-outline mt-2 tracking-[0.2em]">REGISTER TO THE ROYAL VAULT</p>
                </div>
              </div>

              {/* Form Content */}
              <form className="flex-1 p-8 space-y-10" onSubmit={handleSubmit}>
                {/* Basic Identification */}
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-4 bg-primary rounded-full"></div>
                    <h4 className="font-label-caps text-[11px] text-primary tracking-widest">PRODUCT IDENTITY</h4>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <label className="font-label-caps text-[9px] text-outline ml-1">PIECE NAME</label>
                        <input
                          type="text"
                          placeholder="e.g. Diamond Drop Earrings"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-label-caps text-[9px] text-outline ml-1">PIECE CODE (SKU)</label>
                        <input
                          type="text"
                          placeholder="VAULT-..."
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-xs font-bold text-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="font-label-caps text-[9px] text-outline ml-1">CATEGORY</label>
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-xs font-bold text-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm appearance-none"
                        >
                          <option value="Earrings">EARRINGS</option>
                          <option value="Bracelets">BRACELETS</option>
                          <option value="Charms">CHARMS</option>
                          <option value="Piercings">PIERCINGS</option>
                          <option value="Necklaces">NECKLACES</option>
                          <option value="Necklace & Earring Sets">NECKLACE & EARRING SETS</option>
                          <option value="Watches">WATCHES</option>
                          <option value="Rings">RINGS</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-label-caps text-[9px] text-outline ml-1">PIECE DESCRIPTION</label>
                        <input
                          type="text"
                          placeholder="Brief stylistic details"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Jewelry Specs */}
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-4 bg-secondary rounded-full"></div>
                    <h4 className="font-label-caps text-[11px] text-secondary tracking-widest">JEWELRY SPECIFICATIONS</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-label-caps text-[9px] text-outline ml-1">MATERIAL</label>
                      <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                        <input
                          type="text"
                          placeholder="e.g. 18K Rose Gold"
                          className="w-full pl-12 pr-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                        />
                      </div>
                    </div>

                  </div>
                </section>

                {/* Financials */}
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-4 bg-tertiary rounded-full"></div>
                    <h4 className="font-label-caps text-[11px] text-tertiary tracking-widest">FINANCIAL VALUATION</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-label-caps text-[9px] text-outline ml-1">COST PRICE (Mt)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={formData.costPrice}
                        onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-data-tabular text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-label-caps text-[9px] text-outline ml-1">SELLING PRICE (Mt)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={formData.sellingPrice}
                        onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-data-tabular text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-secondary/5 rounded-2xl border border-secondary/10 flex justify-between items-center">
                    <span className="font-label-caps text-[10px] text-secondary font-bold">ESTIMATED MARGIN</span>
                    <span className="font-data-tabular text-sm font-bold text-secondary">
                      {estimatedMargin.toFixed(1)}%
                    </span>
                  </div>
                </section>

                {/* Stock Control */}
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-4 bg-outline rounded-full"></div>
                    <h4 className="font-label-caps text-[11px] text-outline tracking-widest">
                      {editingId ? 'STOCK CONTROL' : 'INITIAL STOCK CONTROL'}
                    </h4>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-label-caps text-[9px] text-outline ml-1 text-center block">TOTAL STOCK</label>
                    <input
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-data-tabular text-sm text-center focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                      required
                    />
                  </div>
                  
                  {editingId && originalStock !== null && formData.stock !== originalStock && (
                    <div className="space-y-1.5 mt-4">
                      <label className="font-label-caps text-[9px] text-error font-bold ml-1 block text-center">
                        ADJUSTMENT REASON (REQUIRED)
                      </label>
                      <select
                        value={adjustmentReason}
                        onChange={(e) => setAdjustmentReason(e.target.value)}
                        className="w-full px-4 py-3 bg-white/6 border border-error/50 rounded-xl font-body-md text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                        required
                      >
                        <option value="" disabled>-- Select Reason --</option>
                        <option value="Stock Count">Stock Count</option>
                        <option value="Data Correction">Data Correction</option>
                        <option value="Product Found">Product Found</option>
                        <option value="Inventory Audit">Inventory Audit</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-4">
                    <label className="font-label-caps text-[9px] text-outline ml-1 text-center block">REORDER LEVEL</label>
                    <input
                      type="number"
                      value={formData.reorderLevel}
                      onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl font-data-tabular text-sm text-center focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div className="flex flex-col justify-center items-center mt-4">
                    <label className="font-label-caps text-[9px] text-outline mb-2">ARCHIVED</label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, archived: !formData.archived })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${formData.archived ? 'bg-error' : 'bg-outline-variant'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.archived ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>
                </section>
              </form>

              {/* Drawer Footer Actions */}
              <div className="p-8 border-t border-outline-variant/30 bg-white/4 sticky bottom-0">
                <div className="flex gap-4">
                  <button
                    onClick={() => setIsAddingProduct(false)}
                    className="flex-1 py-4 bg-white border border-outline-variant/30 text-outline rounded-2xl font-label-caps text-[11px] hover:bg-surface-variant transition-all uppercase tracking-widest"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    onClick={handleSubmit}
                    className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                  >
                    <Check size={16} /> {editingId ? 'Update Piece' : 'Register Piece'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

