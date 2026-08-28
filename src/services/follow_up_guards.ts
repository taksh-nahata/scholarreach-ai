/** Guards so follow-ups only go to real, platform-sent outreach. */

const REAL_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isLegacyContactedSubject(subject?: string | null) {
  return /\(\s*legacy contacted\s*\)/i.test(subject || "");
}

export function isFollowUpEligibleAddress(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!REAL_EMAIL_RE.test(e)) return false;
  if (/hubspotemail\.net$/i.test(e)) return false;
  if (e === "assistant") return false;
  if (/^(info|hello|support|admin|noreply)@/i.test(e)) return false;
  return true;
}
