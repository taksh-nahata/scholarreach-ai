import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuthUser } from "@/lib/api-auth";
import { approveDraftToQueue } from "@/services/approval_service";
import { reviewDraftAsStudent } from "@/services/draft_reviewer";
import { generatePersonalizedDraft } from "@/services/email_personalizer";
import { getProfileBundle } from "@/services/profile_service";
import {
  hasUploadedCv,
  willAttachCv,
  prepareEmailBodies,
  sanitizeEmailText,
} from "@/services/email_format";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";

export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    const status = new URL(req.url).searchParams.get("status") || "pending";
    const statusFilter =
      status === "pending"
        ? { in: [...PENDING_APPROVAL_STATUSES] }
        : status;

    const [drafts, bundle] = await Promise.all([
      prisma.draft.findMany({
        where: { userId: user.id, status: statusFilter },
        include: { professor: true },
        orderBy: [{ matchScore: "desc" }, { updatedAt: "desc" }],
      }),
      getProfileBundle(user.id),
    ]);

    // Clean markdown / false CV claims for display of older drafts
    const hasCv = hasUploadedCv(bundle?.profile);
    const attachCv = willAttachCv(bundle?.profile);
    const cleaned = drafts.map((d) => {
      const prepared = prepareEmailBodies(d.body, attachCv);
      return {
        ...d,
        subject: sanitizeEmailText(d.subject),
        body: prepared.body,
        htmlBody: d.htmlBody || prepared.htmlBody,
      };
    });

    return NextResponse.json({
      drafts: cleaned,
      count: cleaned.length,
      hasCv,
      attachCv,
      profileFuel: {
        displayName: bundle?.profile?.displayName || user.name,
        headline: bundle?.profile?.headline,
        school: bundle?.profile?.school,
        researchInterests: bundle?.profile?.researchInterests,
        achievements: bundle?.profile?.achievements || [],
        projects: bundle?.profile?.projects || [],
        skills: bundle?.profile?.skills || {},
        tone: bundle?.profile?.tonePreference,
        styleNotes: bundle?.profile?.writingStyleNotes,
        customRules: (bundle?.profile as { customRules?: string | null } | null)
          ?.customRules,
        workMode: bundle?.profile?.workModePref,
        hasCv,
        attachCv,
        cvPreview: bundle?.profile?.cvText
          ? String(bundle.profile.cvText).slice(0, 400)
          : null,
        briefPreview: bundle?.profile?.profileBrief
          ? String(bundle.profile.profileBrief).slice(0, 600)
          : null,
      },
    });
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const { draftId, subject, body: emailBody, ccEmails } = body as {
      draftId: string;
      subject?: string;
      body?: string;
      ccEmails?: string;
    };
    if (!draftId) {
      return NextResponse.json({ error: "draftId required" }, { status: 400 });
    }
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId: user.id },
    });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const bundle = await getProfileBundle(user.id);
    const hasCv = hasUploadedCv(bundle?.profile);
    const attachCv = willAttachCv(bundle?.profile);
    const nextSubject =
      subject != null ? sanitizeEmailText(subject) : draft.subject;
    const prepared =
      emailBody != null
        ? prepareEmailBodies(emailBody, attachCv)
        : prepareEmailBodies(draft.body, attachCv);

    const updated = await prisma.draft.update({
      where: { id: draft.id },
      data: {
        subject: nextSubject,
        body: prepared.body,
        htmlBody: prepared.htmlBody,
        ccEmails: ccEmails ?? draft.ccEmails,
      },
      include: { professor: true },
    });
    return NextResponse.json({ ok: true, draft: updated, hasCv, attachCv });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const { draftId, action, ccEmails, specialNotes, formatHint, subject, body: emailBody } =
      body as {
        draftId: string;
        action: "approve" | "reject" | "agent_review" | "regenerate" | "save";
        ccEmails?: string;
        specialNotes?: string;
        formatHint?: string;
        subject?: string;
        body?: string;
      };

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId: user.id },
    });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const bundle = await getProfileBundle(user.id);
    const hasCv = hasUploadedCv(bundle?.profile);
    const attachCv = willAttachCv(bundle?.profile);

    // Persist any in-progress edits before approve / agent / regenerate
    if (subject != null || emailBody != null || ccEmails != null) {
      const prepared =
        emailBody != null
          ? prepareEmailBodies(emailBody, attachCv)
          : prepareEmailBodies(draft.body, attachCv);
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          subject: subject != null ? sanitizeEmailText(subject) : undefined,
          body: emailBody != null ? prepared.body : undefined,
          htmlBody: emailBody != null ? prepared.htmlBody : undefined,
          ccEmails: ccEmails ?? undefined,
        },
      });
    }

    if (action === "save") {
      const fresh = await prisma.draft.findFirst({
        where: { id: draft.id },
        include: { professor: true },
      });
      return NextResponse.json({ ok: true, draft: fresh, hasCv });
    }

    if (action === "agent_review") {
      const verdict = await reviewDraftAsStudent({
        userId: user.id,
        draftId: draft.id,
      });
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          reviewStatus: verdict.approve ? "agent_scored" : "agent_rejected",
          reviewNotes: `${verdict.notes} (score ${verdict.score})`,
          matchScore: verdict.score,
        },
      });
      // Never auto-queue from the Agent button — human still taps Approve
      // Use agent_scored (not agent_approved) so agent_gate sweep can still queue later.
      return NextResponse.json({
        ok: true,
        verdict,
        queued: false,
        explanation:
          "Agent scored this draft the way a careful student would. It does not send. Approve if you agree.",
      });
    }

    if (action === "reject") {
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: "rejected",
          ccEmails: ccEmails || draft.ccEmails,
          specialNotes,
          reviewStatus: "human_rejected",
        },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    if (action === "regenerate") {
      if (!draft.professorId) {
        return NextResponse.json(
          { error: "Draft has no professor to rewrite for." },
          { status: 400 }
        );
      }
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: "rejected",
          reviewStatus: "regenerated",
          reviewNotes: formatHint
            ? `Rewritten: ${formatHint}`
            : "Replaced by a rewritten draft",
        },
      });
      const result = await generatePersonalizedDraft({
        userId: user.id,
        professorId: draft.professorId,
        formatHint:
          formatHint ||
          "Rewrite cleaner for Gmail plain text. No Markdown. Keep under 200 words.",
      });
      const fresh = await prisma.draft.findFirst({
        where: { id: result.draft.id },
        include: { professor: true },
      });
      return NextResponse.json({
        ok: true,
        regenerated: true,
        draft: fresh || result.draft,
        hasCv: result.hasCv,
      });
    }

    try {
      const scheduled = await approveDraftToQueue({
        userId: user.id,
        draftId: draft.id,
        ccEmails,
        specialNotes,
        via: "human",
      });
      return NextResponse.json({ ok: true, ...scheduled });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approve failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
