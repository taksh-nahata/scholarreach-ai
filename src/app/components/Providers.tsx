"use client";

import { AuthProvider } from "@/lib/auth-context";
import { JobsProvider } from "@/lib/jobs-context";
import { isStaticHost } from "@/lib/demo-auth";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [staticHost, setStaticHost] = useState(
    process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
  );

  useEffect(() => {
    setStaticHost(isStaticHost());
  }, []);

  if (staticHost) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <SessionProvider>
      <AuthProvider>
        <JobsProvider>{children}</JobsProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
