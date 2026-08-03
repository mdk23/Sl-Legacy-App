'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';

const BATCH_SIZE = 100;

type ParsedRow = {
  code: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
  archived: boolean;
};

type RowError = { row: number; reason: string };

function normalizeHeader(header: string): string {
  return header.toString().trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  code: 'code',
  sku: 'code',
  name: 'name',
  productname: 'name',
  category: 'category',
  costprice: 'costPrice',
  cost: 'costPrice',
  sellingprice: 'sellingPrice',
  price: 'sellingPrice',
  stock: 'stock',
  quantity: 'stock',
  reorderlevel: 'reorderLevel',
  reorder: 'reorderLevel',
  archived: 'archived',
};

function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  const s = value?.toString().trim().toLowerCase() || '';
  return ['true', '1', 'yes', 'sim'].includes(s);
}

function parseNumber(value: any): number | null {
  if (typeof value === 'number') return value;
  const n = Number(value?.toString().trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const BulkImportModal = ({ open, onClose }: BulkImportModalProps) => {
  const bulkImport = useMutation(api.products.bulkImport);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validRows, setValidRows] = useState<ParsedRow[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setFileName(null);
    setValidRows([]);
    setRowErrors([]);
    setProgress(null);
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setValidRows([]);
    setRowErrors([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const valid: ParsedRow[] = [];
      const errors: RowError[] = [];

      rawRows.forEach((raw, i) => {
        const rowNum = i + 2; // account for header row, 1-indexed
        const mapped: Partial<ParsedRow> = {};
        for (const [key, value] of Object.entries(raw)) {
          const field = HEADER_ALIASES[normalizeHeader(key)];
          if (field) (mapped as any)[field] = value;
        }

        const code = mapped.code?.toString().trim();
        const name = mapped.name?.toString().trim();
        const category = mapped.category?.toString().trim();
        const costPrice = parseNumber(mapped.costPrice);
        const sellingPrice = parseNumber(mapped.sellingPrice);
        const stock = parseNumber(mapped.stock);
        const reorderLevel = parseNumber(mapped.reorderLevel);

        if (!code && !name && !category) return; // skip fully blank rows

        if (!code) return errors.push({ row: rowNum, reason: 'Missing code' });
        if (!name) return errors.push({ row: rowNum, reason: 'Missing name' });
        if (!category) return errors.push({ row: rowNum, reason: 'Missing category' });
        if (costPrice === null || costPrice < 0) return errors.push({ row: rowNum, reason: 'Invalid costPrice' });
        if (sellingPrice === null || sellingPrice < 0) return errors.push({ row: rowNum, reason: 'Invalid sellingPrice' });
        if (stock === null || stock < 0) return errors.push({ row: rowNum, reason: 'Invalid stock' });
        if (reorderLevel === null || reorderLevel < 0) return errors.push({ row: rowNum, reason: 'Invalid reorderLevel' });

        valid.push({
          code,
          name,
          category,
          costPrice,
          sellingPrice,
          stock: Math.round(stock),
          reorderLevel: Math.round(reorderLevel),
          archived: parseBoolean(mapped.archived),
        });
      });

      setValidRows(valid);
      setRowErrors(errors);

      if (valid.length === 0 && errors.length === 0) {
        toast.error('No rows found in the file.');
      }
    } catch (err: any) {
      toast.error('Could not read that file. Make sure it is a valid .xlsx, .xls, or .csv file.');
      reset();
    }
  };

  const handleConfirmImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    setProgress({ done: 0, total: validRows.length });

    let createdTotal = 0;
    let updatedTotal = 0;

    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const result = await bulkImport({ rows: batch });
        createdTotal += result.createdCount;
        updatedTotal += result.updatedCount;
        setProgress({ done: Math.min(i + BATCH_SIZE, validRows.length), total: validRows.length });
      }
      toast.success(`Import complete — ${createdTotal} created, ${updatedTotal} updated.`);
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Import failed partway through. Already-imported rows were saved.');
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="relative w-full max-w-lg bg-surface-container rounded-3xl shadow-2xl border border-white/10 p-8 max-h-[85vh] overflow-y-auto"
          >
            <button
              onClick={handleClose}
              className="absolute top-6 right-6 p-2 hover:bg-primary/10 rounded-full text-outline transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="font-headline-md text-lg text-primary mb-1">Import Products</h3>
            <p className="font-body-md text-xs text-on-surface-variant leading-relaxed mb-6">
              Upload a .xlsx, .xls, or .csv file with columns: code, name, category, costPrice, sellingPrice, stock,
              reorderLevel, archived. Rows matching an existing product code will be updated; new codes are created.
            </p>

            {!fileName ? (
              <label className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer">
                <Upload size={28} className="text-primary" />
                <span className="font-label-caps text-[11px] text-primary">CHOOSE FILE</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/6 border border-white/10">
                  <FileSpreadsheet size={18} className="text-primary flex-shrink-0" />
                  <span className="text-xs font-bold text-on-surface truncate">{fileName}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700">{validRows.length} ready to import</span>
                  </div>
                  <div className={`p-3 rounded-xl border flex items-center gap-2 ${rowErrors.length > 0 ? 'bg-error-container/30 border-error/20' : 'bg-white/6 border-white/10'}`}>
                    <AlertTriangle size={16} className={rowErrors.length > 0 ? 'text-error' : 'text-outline'} />
                    <span className={`text-xs font-bold ${rowErrors.length > 0 ? 'text-error' : 'text-outline'}`}>{rowErrors.length} skipped</span>
                  </div>
                </div>

                {rowErrors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto p-3 rounded-xl bg-error-container/10 border border-error/10 space-y-1">
                    {rowErrors.slice(0, 20).map((e, i) => (
                      <p key={i} className="text-[10px] text-error font-data-tabular">Row {e.row}: {e.reason}</p>
                    ))}
                    {rowErrors.length > 20 && (
                      <p className="text-[10px] text-error/70 italic">+{rowErrors.length - 20} more…</p>
                    )}
                  </div>
                )}

                {progress && (
                  <p className="text-[10px] font-label-caps text-on-surface-variant text-center">
                    Importing {progress.done} / {progress.total}…
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={isImporting}
                    className="flex-1 py-3 bg-white border border-outline-variant/30 text-outline rounded-xl font-label-caps text-[10px] hover:bg-surface-variant transition-all disabled:opacity-50"
                  >
                    CHOOSE DIFFERENT FILE
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isImporting || validRows.length === 0}
                    className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-label-caps text-[10px] shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isImporting && <Loader2 size={14} className="animate-spin" />}
                    CONFIRM IMPORT
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
