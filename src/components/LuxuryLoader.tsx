"use client";

import { motion } from "framer-motion";

export default function LuxuryLoader({ text = "Entering Digital Atelier..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* Background Image with overlay */}
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Gold jewelry on black marble"
          className="w-full h-full object-cover opacity-10"
          src="/ultra-bg.png"
        />
        <div className="absolute inset-0 bg-background/90"></div>
      </div>

      {/* Spinner and Text */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.img
          src="/sl-legacy-emblem.svg"
          alt="SL Legacy"
          className="w-12 h-auto"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Luxury Rotating Circle */}
        <div className="relative w-16 h-16">
          {/* Inner static border */}
          <div className="absolute inset-0 rounded-full border border-primary/10"></div>
          {/* Outer rotating accent */}
          <motion.div
            className="absolute inset-0 rounded-full border-t border-r border-primary"
            style={{ borderWidth: "2px" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          ></motion.div>
        </div>

        <motion.p
          className="font-label-caps text-xs text-on-surface-variant tracking-[0.2em] uppercase mt-2 opacity-80"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {text}
        </motion.p>
      </div>
    </div>
  );
}
