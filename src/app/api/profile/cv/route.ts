import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { ingestCvForUser, ingestCvText } from "@/services/cv_ingest";
import { prisma } from "@/lib/prisma";
import { compileProfileBrief, parseJsonField } from "@/services/profile_service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (!body.text || typeof body.text !== "string") {
        return NextResponse.json({ error: "Missing text" }, { status: 400 });
      }
      const result = await ingestCvText(user.id, body.text);
      return NextResponse.json({
        ok: true,
        extracted: result.extracted,
        preview: result.preview,
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestCvForUser({
      userId: user.id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    return NextResponse.json({
      ok: true,
      extracted: result.extracted,
      preview: result.preview,
      fileName: file.name,
    });
  });
}

export async function DELETE() {
  return withAuthUser(async (user) => {
    const existing = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ ok: true });
    }

    const brief = compileProfileBrief({
      displayName: existing.displayName,
      headline: existing.headline,
      school: existing.school,
      gradeOrYear: existing.gradeOrYear,
      location: existing.location,
      education: parseJsonField(existing.educationJson, []),
      achievements: parseJsonField(existing.achievementsJson, []),
      projects: parseJsonField(existing.projectsJson, []),
      skills: parseJsonField(existing.skillsJson, {}),
      researchInterests: existing.researchInterests,
      writingStyleNotes: existing.writingStyleNotes,
      tonePreference: existing.tonePreference,
      customRules: existing.customRules,
      targetRegions: parseJsonField(existing.targetRegionsJson, [] as string[]),
      workModePref: existing.workModePref,
      availabilityNotes: existing.availabilityNotes,
      cvText: null,
    });

    await prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        cvFileName: null,
        cvMimeType: null,
        cvText: null,
        cvFileData: null,
        cvUploadedAt: null,
        attachCvToEmails: false,
        profileBrief: brief,
      },
    });

    return NextResponse.json({ ok: true });
  });
}
