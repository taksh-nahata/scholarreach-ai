"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearDemoSession,
  connectDemoGmail,
  getDemoSession,
  isStaticHost,
  startFreeSession,
  type DemoSession,
} from "@/lib/demo-auth";

type AuthContextValue = {
  session: DemoSession | null;
  ready: boolean;
  isStatic: boolean;
  signInFree: (input?: { email?: string; name?: string }) => DemoSession;
  connectGmail: (email?: string) => DemoSession;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [ready, setReady] = useState(false);
  const [isStatic, setIsStatic] = useState(false);

  const refresh = useCallback(() => {
    setSession(getDemoSession());
  }, []);

  useEffect(() => {
    setIsStatic(isStaticHost());
    refresh();
    setReady(true);
    const onAuth = () => refresh();
    window.addEventListener("scholarreach-auth", onAuth);
    window.addEventListener("storage", onAuth);
    return () => {
      window.removeEventListener("scholarreach-auth", onAuth);
      window.removeEventListener("storage", onAuth);
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      isStatic,
      signInFree: (input) => {
        const next = startFreeSession(input);
        setSession(next);
        return next;
      },
      connectGmail: (email) => {
        const next = connectDemoGmail(email);
        setSession(next);
        return next;
      },
      signOut: () => {
        clearDemoSession();
        setSession(null);
      },
    }),
    [session, ready, isStatic]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
