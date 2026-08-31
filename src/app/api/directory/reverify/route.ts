import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuthUser } from "@/lib/api-auth";
import { applyFacultyEmailCheck } from "@/services/faculty_email_apply";
import {
  isJunkFacultyEmail,
  scoreEmailCandidate,
} from "@/services/faculty_email_verifier";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";
import { parseJsonArray, toJsonArray } from "@/lib/utils";
import {
  formatCcForStorage,
  normalizeCcList,
} from "@/services/outreach_recipients";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const all = Boolean(body.all);
    const pendingOnly = Boolean(body.pendingOnly);
    const limit = Math.min(Number(body.limit) || 3, 5);

    let professors = await prisma.professor.findMany({
      where: { userId: user.id },
      orderBy: [{ emailVerified: "asc" }, { updatedAt: "asc" }],
      take: 300,
    });

    if (pendingOnly) {
      const pendingProfIds = await prisma.draft.findMany({
        where: {
          userId: user.id,
          status: { in: [...PENDING_APPROVAL_STATUSES] },
          professorId: { not: null },
        },
        select: { professorId: true },
        distinct: ["professorId"],
      });
      const idSet = new Set(
        pendingProfIds.map((d) => d.professorId).filter(Boolean) as string[]
      );
      professors = professors.filter((p) => idSet.has(p.id));
    }

    const needsWork = professors.filter((p) => {
      if (all || pendingOnly) return true;
      if (!p.email) return true;
      if (!p.emailVerified) return true;
      if (isJunkFacultyEmail(p.email)) return true;
      const scored = scoreEmailCandidate({
        email: p.email,
        name: p.name,
        university: p.university,
        homepageUrl: p.homepageUrl,
      });
      return !(scored.domainMatch && scored.nameMatch);
    });

    const targets = needsWork.slice(0, limit);
    const results: Array<{
      id: string;
      name: string;
      email: string | null;
      emailVerified: boolean;
      notes: string;
    }> = [];

    for (const p of targets) {
      const applied = await applyFacultyEmailCheck({
        userId: user.id,
        name: p.name,
        university: p.university,
        existingEmail: p.email,
        homepageUrl: p.homepageUrl,
        allowLiveResolve: !p.email || isJunkFacultyEmail(p.email),
      });

      const ccMerged = normalizeCcList(
        [...parseJsonArray(p.ccEmails), ...(applied.ccEmails || [])],
        applied.email,
        3
      );

      await prisma.professor.update({
        where: { id: p.id },
        data: {
          email: applied.email,
          emailVerified: applied.emailVerified,
          verificationNotes: applied.verificationNotes,
          homepageUrl: applied.sourceUrl || p.homepageUrl,
          ccEmails: toJsonArray(ccMerged),
        },
      });

      if (applied.email && applied.email !== p.email) {
        await prisma.draft.updateMany({
          where: {
            userId: user.id,
            professorId: p.id,
            status: { in: [...PENDING_APPROVAL_STATUSES] },
          },
          data: { recipientEmail: applied.email },
        });
      }

      if (ccMerged.length) {
        await prisma.draft.updateMany({
          where: {
            userId: user.id,
            professorId: p.id,
            status: { in: [...PENDING_APPROVAL_STATUSES] },
          },
          data: { ccEmails: formatCcForStorage(ccMerged) },
        });
      }

      results.push({
        id: p.id,
        name: p.name,
        email: applied.email,
        emailVerified: applied.emailVerified,
        notes: applied.verificationNotes,
      });
    }

    return NextResponse.json({
      checked: results.length,
      remaining: Math.max(0, needsWork.length - results.length),
      totalNeedingWork: needsWork.length,
      results,
    });
  });
}
