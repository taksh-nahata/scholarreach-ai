"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Soft-gate incomplete accounts into /onboarding */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.status === 401) {
          if (!cancelled) setReady(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setReady(true);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.user && !data.user.onboardingComplete) {
          router.replace("/onboarding");
          return;
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return <>{children}</>;
}
