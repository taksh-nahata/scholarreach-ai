export type DemoSession = {
  email: string;
  name: string;
  gmailConnected: boolean;
  createdAt: string;
};

const KEY = "scholarreach.session.v1";

export function isStaticHost(): boolean {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "true") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith("github.io") || host.endsWith("pages.dev");
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export function saveDemoSession(session: DemoSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("scholarreach-auth"));
}

export function clearDemoSession() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("scholarreach-auth"));
}

export function startFreeSession(input?: { email?: string; name?: string }) {
  const email =
    (input?.email || "").trim().toLowerCase() || "student@university.edu";
  const name = (input?.name || "").trim() || "Student Researcher";
  const session: DemoSession = {
    email,
    name,
    gmailConnected: false,
    createdAt: new Date().toISOString(),
  };
  saveDemoSession(session);
  return session;
}

export function connectDemoGmail(email?: string) {
  const current = getDemoSession() || startFreeSession({ email });
  const next: DemoSession = {
    ...current,
    email: (email || current.email).trim().toLowerCase(),
    gmailConnected: true,
  };
  saveDemoSession(next);
  return next;
}
