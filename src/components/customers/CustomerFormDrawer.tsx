import React from "react";
import { motion } from "framer-motion";
import { X, Camera, Smartphone, Mail, Check } from "lucide-react";

interface CustomerFormData {
  firstName: string;
  lastName: string;
  phone1: string;
  phone2: string;
  phone3: string;
  email: string;
  notes: string;
}

interface CustomerFormDrawerProps {
  editingId: string | null;
  formData: CustomerFormData;
  setFormData: (data: CustomerFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const CustomerFormDrawer = ({
  editingId,
  formData,
  setFormData,
  onClose,
  onSubmit,
}: CustomerFormDrawerProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-md"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-xl h-full bg-surface-container shadow-2xl overflow-y-auto border-l border-white/10 flex flex-col"
      >
        <div className="p-8 pb-12 bg-atelier-gradient relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/6 backdrop-blur-md rounded-full text-primary hover:bg-white transition-all shadow-sm"
          >
            <X size={20} />
          </button>
          <div className="flex flex-col items-center text-center mt-4">
            <div className="w-20 h-20 bg-white/6 backdrop-blur-md rounded-3xl border-2 border-white flex items-center justify-center text-primary shadow-xl mb-4">
              <Camera size={32} />
            </div>
            <h2 className="font-headline-md text-3xl text-primary uppercase tracking-tight">
              {editingId ? "Update Client Profile" : "New Client Registration"}
            </h2>
            <p className="font-label-caps text-[10px] text-outline mt-2 tracking-[0.2em]">
              BOUTIQUE MEMBER ENROLLMENT
            </p>
          </div>
        </div>

        <form className="flex-1 p-8 space-y-8" onSubmit={onSubmit}>
          {/* Personal */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h4 className="font-label-caps text-[11px] text-primary tracking-widest">PERSONAL IDENTITY</h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-label-caps text-[9px] text-outline ml-1">FIRST NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Eleanor"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-caps text-[9px] text-outline ml-1">LAST NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Vance"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                  required
                />
              </div>
            </div>
          </section>

          {/* Contact */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-4 bg-secondary rounded-full" />
              <h4 className="font-label-caps text-[11px] text-secondary tracking-widest">CONTACT & REACH</h4>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-label-caps text-[9px] text-outline ml-1">PRIMARY PHONE</label>
                <div className="relative">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                  <input
                    type="tel"
                    placeholder="+258 (Primary)"
                    value={formData.phone1}
                    onChange={(e) => setFormData({ ...formData, phone1: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">SECONDARY PHONE</label>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                    <input
                      type="tel"
                      placeholder="+258"
                      value={formData.phone2}
                      onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="font-label-caps text-[9px] text-outline ml-1">ALTERNATIVE PHONE</label>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                    <input
                      type="tel"
                      placeholder="+258"
                      value={formData.phone3}
                      onChange={(e) => setFormData({ ...formData, phone3: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-label-caps text-[9px] text-outline ml-1">EMAIL ADDRESS</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                  <input
                    type="email"
                    placeholder="client@luxury.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-white/6 border border-white/12 rounded-xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-4 bg-outline rounded-full" />
              <h4 className="font-label-caps text-[11px] text-outline tracking-widest">BOUTIQUE NOTES</h4>
            </div>
            <textarea
              rows={4}
              placeholder="Style preferences, preferred metals, special dates…"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-2xl text-sm focus:ring-4 focus:ring-primary/5 outline-none transition-all shadow-sm resize-none italic"
            />
          </section>
        </form>

        <div className="p-8 border-t border-outline-variant/30 bg-white/4 sticky bottom-0">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-white border border-outline-variant/30 text-outline rounded-2xl font-label-caps text-[11px] hover:bg-surface-variant transition-all uppercase tracking-widest"
            >
              Discard
            </button>
            <button
              type="submit"
              onClick={onSubmit}
              className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl font-label-caps text-[11px] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              <Check size={16} /> {editingId ? "Update Client" : "Create Client Profile"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
