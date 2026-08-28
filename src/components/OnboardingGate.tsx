"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Soft-gate incomplete accounts into /onboarding; unauthenticated → login */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    // Only show the loading shell once — never remount the whole app on nav
    if (checked.current && ready) {
      // Soft re-check without blanking the UI (e.g. after finishing onboarding)
      if (pathname === "/onboarding") return;
      void (async () => {
        try {
          const res = await fetch("/api/profile");
          if (res.status === 401) {
            router.replace("/login");
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          if (data.user && !data.user.onboardingComplete) {
            router.replace("/onboarding");
          }
        } catch {
          /* ignore */
        }
      })();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.status === 401) {
          if (!cancelled) router.replace("/login");
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            checked.current = true;
            setReady(true);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled && data.user && !data.user.onboardingComplete) {
          router.replace("/onboarding");
          return;
        }
      } catch {
        /* network blip — middleware still enforces auth on app routes */
      }
      if (!cancelled) {
        checked.current = true;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, ready]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return <>{children}</>;
}
