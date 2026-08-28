/**
 * Signed OAuth state for Gmail connect — binds callback to the logged-in user.
 */
import crypto from "crypto";

type OAuthStatePayload = {
  uid: string;
  exp: number;
  n: string;
};

function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.CRON_SECRET || "dev-insecure";
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function createGmailOAuthState(userId: string, ttlSec = 600): string {
  const payload: OAuthStatePayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
    n: crypto.randomBytes(8).toString("hex"),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    crypto.createHmac("sha256", secret()).update(body).digest()
  );
  return `${body}.${sig}`;
}

export function parseGmailOAuthState(state: string): { userId: string } | null {
  const [body, sig] = (state || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(
    crypto.createHmac("sha256", secret()).update(body).digest()
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as OAuthStatePayload;
    if (!payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.uid };
  } catch {
    return null;
  }
}
