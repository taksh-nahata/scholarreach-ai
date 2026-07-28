"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

function nextAcademicWindow(from = new Date()) {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 10; i++) {
    const day = cursor.getDay();
    const mins = cursor.getHours() * 60 + cursor.getMinutes();
    if ((day === 2 || day === 3 || day === 4) && mins < 9 * 60) {
      if (mins < 8 * 60) {
        cursor.setHours(8, 0, 0, 0);
        return cursor;
      }
      if (mins <= 9 * 60) return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(8, 0, 0, 0);
    while (![2, 3, 4].includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return cursor;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Window open";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Signature UI: the 8 AM academic send window as a sealed letter.
 */
export function AcademicWindowSeal() {
  const reduce = useReducedMotion();
  const [label, setLabel] = useState("Calculating…");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const day = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      const inWindow =
        (day === 2 || day === 3 || day === 4) && mins >= 8 * 60 && mins <= 9 * 60;
      setOpen(inWindow);
      const target = inWindow ? now : nextAcademicWindow(now);
      setLabel(
        inWindow
          ? "Tue–Thu · 8:00–9:00 AM · live"
          : `Next window in ${formatCountdown(target.getTime() - now.getTime())}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-md"
    >
      <div className="absolute -inset-6 desk-grid opacity-70" aria-hidden />
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-2xl"
        animate={
          reduce
            ? undefined
            : {
                boxShadow: open
                  ? "0 0 0 1px color-mix(in oklch, var(--primary) 40%, transparent), 0 20px 60px color-mix(in oklch, var(--primary) 25%, transparent)"
                  : "0 20px 50px rgba(0,0,0,0.35)",
              }
        }
      >
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium tracking-wide uppercase">Academic window</span>
          <span className="tabular-nums text-primary">{label}</span>
        </div>

        <div className="relative mx-auto h-44 w-full max-w-sm">
          {/* Envelope body */}
          <div className="absolute inset-x-4 bottom-0 top-10 rounded-xl border border-border bg-secondary" />
          <motion.div
            className="absolute inset-x-4 top-10 origin-top rounded-t-xl border border-border bg-muted"
            style={{ height: "42%" }}
            animate={reduce ? undefined : { rotateX: open ? -18 : 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          />
          {/* Letter */}
          <motion.div
            className="absolute inset-x-8 top-6 rounded-lg border border-border bg-[color-mix(in_oklch,var(--foreground)_96%,var(--dawn))] p-3 text-[10px] leading-relaxed text-[color-mix(in_oklch,var(--background)_88%,black)]"
            animate={reduce ? undefined : { y: open ? -8 : 10, opacity: open ? 1 : 0.85 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-1 font-semibold">Dear Dr. Chen,</div>
            Your recent work on safety-aware robotic learning aligns with my
            research interests in embedded perception…
            <div className="mt-2 text-right italic">— A. Rivera</div>
          </motion.div>

          {/* Wax seal */}
          <motion.div
            className="wax-seal absolute bottom-6 left-1/2 size-14 -translate-x-1/2 rounded-full"
            animate={
              reduce
                ? undefined
                : { scale: open ? 0.92 : [1, 1.04, 1], rotate: open ? -8 : 0 }
            }
            transition={
              open
                ? { duration: 0.4 }
                : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
            }
            aria-hidden
          >
            <div className="flex size-full items-center justify-center text-[10px] font-bold tracking-wider text-primary-foreground">
              8AM
            </div>
          </motion.div>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Up to 500 personalized research emails per hour — only when professors
          first open their inbox.
        </p>
      </motion.div>
    </motion.div>
  );
}
