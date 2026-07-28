"use client";

import { useEffect, useState } from "react";

/** Compact academic-window status — no decorative “seal” chrome */
export function AcademicWindowSeal() {
  const [label, setLabel] = useState("Checking window…");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const day = now.getDay(); // 0 Sun
      const hour = now.getHours();
      const inWindow = day >= 2 && day <= 4 && hour >= 8 && hour < 9;
      setOpen(inWindow);
      if (inWindow) {
        setLabel("Open now · Tue–Thu 8–9 AM");
      } else {
        setLabel("Next window · Tue–Thu 8–9 AM local");
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-md border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>Academic send window</span>
        <span className={open ? "text-primary" : ""}>{open ? "Live" : "Queued"}</span>
      </div>
      <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
        {label}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Up to 500 personalized research emails per hour, only when faculty typically
        open their inbox.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center text-xs">
        <div>
          <div className="font-display text-lg text-foreground">500/hr</div>
          drip cap
        </div>
        <div>
          <div className="font-display text-lg text-foreground">Tue–Thu</div>
          weekdays
        </div>
        <div>
          <div className="font-display text-lg text-foreground">Human</div>
          approval
        </div>
      </div>
    </div>
  );
}
