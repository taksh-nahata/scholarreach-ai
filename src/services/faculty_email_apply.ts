/**
 * Apply stored-email trust + optional live resolve.
 * Never wipe a plausible faculty email just because scrape failed.
 */
import {
  auditStoredEmail,
  resolveFacultyEmail,
} from "@/services/faculty_email_resolver";
import { isJunkFacultyEmail } from "@/services/faculty_email_verifier";
import { loadPageTextRedundant } from "@/services/faculty_search";
import { pickCcRecipients } from "@/services/outreach_recipients";
import {
  extractMentorshipEvidence,
  mergeMentorshipEvidence,
  type MentorshipEvidence,
} from "@/services/mentorship_evidence";

export type ApplyEmailResult = {
  email: string | null;
  emailVerified: boolean;
  verificationNotes: string;
  sourceUrl?: string | null;
  ccEmails?: string[];
  mentorshipEvidence?: MentorshipEvidence[];
};

async function harvestLabPageSignals(opts: {
  userId: string;
  name: string;
  university: string;
  email: string;
  homepageUrl?: string | null;
}): Promise<{ ccEmails: string[]; mentorshipEvidence: MentorshipEvidence[] }> {
  if (!opts.homepageUrl || !opts.email) {
    return { ccEmails: [], mentorshipEvidence: [] };
  }
  try {
    const text = await loadPageTextRedundant(opts.userId, {
      title: opts.name,
      url: opts.homepageUrl,
      snippet: "",
    });
    if (!text || text.length < 40) {
      return { ccEmails: [], mentorshipEvidence: [] };
    }
    return {
      ccEmails: pickCcRecipients({
        primaryEmail: opts.email,
        pageText: text,
        name: opts.name,
        university: opts.university,
        max: 2,
      }),
      mentorshipEvidence: extractMentorshipEvidence(text, opts.homepageUrl),
    };
  } catch {
    return { ccEmails: [], mentorshipEvidence: [] };
  }
}

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
      const trustedEmail = audited.email || existing;
      const labSignals = trustedEmail
        ? await harvestLabPageSignals({
            userId: opts.userId,
            name: opts.name,
            university: opts.university,
            email: trustedEmail,
            homepageUrl: opts.homepageUrl,
          })
        : { ccEmails: [], mentorshipEvidence: [] };
      return {
        email: trustedEmail,
        emailVerified: true,
        verificationNotes: `Trusted stored email (${audited.notes})`,
        sourceUrl: opts.homepageUrl || null,
        ccEmails: labSignals.ccEmails,
        mentorshipEvidence: labSignals.mentorshipEvidence,
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
        const email = resolved.primaryEmail.toLowerCase();
        const pageUrl = resolved.sourceUrl || opts.homepageUrl;
        const labSignals = await harvestLabPageSignals({
          userId: opts.userId,
          name: opts.name,
          university: opts.university,
          email,
          homepageUrl: pageUrl,
        });
        const ccEmails =
          resolved.ccEmails?.length
            ? resolved.ccEmails
            : labSignals.ccEmails;
        const mentorshipEvidence = mergeMentorshipEvidence(
          resolved.mentorshipEvidence || [],
          labSignals.mentorshipEvidence
        );
        return {
          email,
          emailVerified: true,
          verificationNotes: resolved.reasoning,
          sourceUrl: resolved.sourceUrl,
          ccEmails,
          mentorshipEvidence,
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
