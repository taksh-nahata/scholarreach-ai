import { scoreEmailCandidate } from "@/services/faculty_email_verifier";

export type EmailConfidenceTier = "high" | "medium" | "low";

export function emailConfidenceTier(opts: {
  email?: string | null;
  name: string;
  university: string;
  homepageUrl?: string | null;
}): { tier: EmailConfidenceTier; score: number; reason: string } {
  const email = (opts.email || "").trim().toLowerCase();
  if (!email) return { tier: "low", score: 0, reason: "missing_email" };
  const s = scoreEmailCandidate({
    email,
    name: opts.name,
    university: opts.university,
    homepageUrl: opts.homepageUrl,
  });
  if (s.score >= 65 && (s.domainMatch || s.nameMatch)) {
    return { tier: "high", score: s.score, reason: s.reasons.join(",") };
  }
  if (s.score >= 35) {
    return { tier: "medium", score: s.score, reason: s.reasons.join(",") };
  }
  return { tier: "low", score: s.score, reason: s.reasons.join(",") };
}

