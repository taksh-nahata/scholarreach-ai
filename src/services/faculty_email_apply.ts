/**
 * Apply stored-email trust + optional live resolve.
 * Never wipe a plausible faculty email just because scrape failed.
 */
import {
  auditStoredEmail,
  resolveFacultyEmail,
} from "@/services/faculty_email_resolver";
import { isJunkFacultyEmail } from "@/services/faculty_email_verifier";

export type ApplyEmailResult = {
  email: string | null;
  emailVerified: boolean;
  verificationNotes: string;
  sourceUrl?: string | null;
};

export async function applyFacultyEmailCheck(opts: {
  userId: string;
  name: string;
  university: string;
  existingEmail?: string | null;
  homepageUrl?: string | null;
  /** Spend search/scrape APIs only when stored email is missing/junk */
  allowLiveResolve?: boolean;
}): Promise<ApplyEmailResult> {
  const existing = (opts.existingEmail || "").trim() || null;

  if (existing && !isJunkFacultyEmail(existing)) {
    const audited = auditStoredEmail({
      email: existing,
      name: opts.name,
      university: opts.university,
      homepageUrl: opts.homepageUrl,
    });
    if (audited.keep && audited.verified) {
      return {
        email: audited.email,
        emailVerified: true,
        verificationNotes: `Trusted stored email (${audited.notes})`,
        sourceUrl: opts.homepageUrl || null,
      };
    }
    // Strong enough to keep; only live-resolve if we still want evidence
    if (audited.keep && opts.allowLiveResolve === false) {
      return {
        email: audited.email,
        emailVerified: false,
        verificationNotes: audited.notes,
        sourceUrl: opts.homepageUrl || null,
      };
    }
  }

  const needLive =
    opts.allowLiveResolve !== false &&
    (!existing || isJunkFacultyEmail(existing));

  if (needLive || (opts.allowLiveResolve && existing && !isJunkFacultyEmail(existing))) {
    // Only burn APIs when missing/junk. For existing plausible emails, trust path above already returned.
    if (!existing || isJunkFacultyEmail(existing)) {
      const resolved = await resolveFacultyEmail({
        userId: opts.userId,
        name: opts.name,
        university: opts.university,
        hintUrl: opts.homepageUrl,
      });
      if (resolved.verified && resolved.primaryEmail) {
        return {
          email: resolved.primaryEmail.toLowerCase(),
          emailVerified: true,
          verificationNotes: resolved.reasoning,
          sourceUrl: resolved.sourceUrl,
        };
      }
      return {
        email: null,
        emailVerified: false,
        verificationNotes: resolved.reasoning,
        sourceUrl: resolved.sourceUrl,
      };
    }
  }

  if (existing && !isJunkFacultyEmail(existing)) {
    return {
      email: existing.toLowerCase(),
      emailVerified: false,
      verificationNotes: "Kept existing email (not junk; live resolve not needed)",
      sourceUrl: opts.homepageUrl || null,
    };
  }

  return {
    email: null,
    emailVerified: false,
    verificationNotes: "No email",
    sourceUrl: opts.homepageUrl || null,
  };
}
