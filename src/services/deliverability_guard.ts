/**
 * Deliverability and recipient trust guards.
 * Default behavior is strict to protect sender reputation.
 */

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function strictDeliverabilityEnabled() {
  const raw = (process.env.STRICT_DELIVERABILITY_MODE || "true")
    .trim()
    .toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function isSyntacticallyValidRecipient(email?: string | null) {
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e)) return false;
  if (e === "assistant") return false;
  return true;
}

export function isPermanentAddressFailure(errorText?: string | null) {
  return /\b(address not found|recipient address rejected|user unknown|unknown user|no such user|mailbox unavailable|invalid to header|invalid cc header|5\.1\.1|550)\b/i.test(
    errorText || ""
  );
}

