/**
 * Multi-file profile attachments + outbound attach resolution.
 */
import { prisma } from "@/lib/prisma";
import { extractTextFromUpload } from "@/services/cv_text_extract";
import {
  credentialNoun,
  detectCredentialDocType,
  type CredentialDocType,
} from "@/services/doc_type";

export type MailAttachment = {
  id?: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  label?: string;
  kind?: string;
};

const MAX_ATTACHMENTS = 12;
/** Keep base64-in-Postgres small until object storage (e.g. Vercel Blob) is wired. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function ruleMatches(
  hint: string | null | undefined,
  haystack: string
): boolean {
  if (!hint?.trim()) return false;
  const h = haystack.toLowerCase();
  const parts = hint
    .toLowerCase()
    .split(/[,;/|]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 2);
  if (!parts.length) return h.includes(hint.toLowerCase());
  return parts.some((p) => h.includes(p));
}

/** Parse custom rules like: attach "Portfolio" when robotics */
export function parseAttachDirectivesFromRules(customRules: string | null | undefined) {
  const rules = customRules || "";
  const out: Array<{ label: string; when: string }> = [];
  const re =
    /attach\s+["']?([^"'\n,]+?)["']?\s+(?:when|if|for|to)\s+([^\n.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rules))) {
    out.push({ label: m[1].trim(), when: m[2].trim() });
  }
  return out;
}

export async function listAttachmentsMeta(userId: string) {
  const rows = await prisma.profileAttachment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      kind: true,
      fileName: true,
      mimeType: true,
      textExcerpt: true,
      attachMode: true,
      ruleHint: true,
      detectedDocType: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function ingestProfileAttachment(opts: {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  label?: string;
  kind?: string;
  attachMode?: string;
  ruleHint?: string | null;
}) {
  if (opts.buffer.length > MAX_FILE_BYTES) {
    throw new Error("File too large (max 8MB). Compress or use a smaller PDF.");
  }
  const count = await prisma.profileAttachment.count({
    where: { userId: opts.userId },
  });
  if (count >= MAX_ATTACHMENTS) {
    throw new Error(`Max ${MAX_ATTACHMENTS} files — remove one first`);
  }

  let text = "";
  let extractWarning: string | null = null;
  try {
    text = (await extractTextFromUpload(
      opts.buffer,
      opts.mimeType,
      opts.fileName
    )).trim();
  } catch (err) {
    extractWarning =
      err instanceof Error ? err.message : "Could not extract text from file";
    // Still store the binary so the file can be attached to emails
    text = "";
  }

  const detected = detectCredentialDocType(opts.fileName, text);
  const kind =
    opts.kind ||
    (detected === "cv" || detected === "resume" ? "credential" : "other");
  const label =
    opts.label?.trim() ||
    (kind === "credential"
      ? detected === "resume"
        ? "Resume"
        : detected === "cv"
          ? "CV"
          : "Credentials"
      : opts.fileName.replace(/\.[^.]+$/, "") || "Attachment");

  const row = await prisma.profileAttachment.create({
    data: {
      userId: opts.userId,
      label,
      kind,
      fileName: opts.fileName,
      mimeType: opts.mimeType || "application/octet-stream",
      textExcerpt: text.slice(0, 4000) || null,
      fileData: opts.buffer.toString("base64"),
      attachMode: opts.attachMode || (kind === "credential" ? "always" : "never"),
      ruleHint: opts.ruleHint || null,
      detectedDocType: detected,
    },
  });

  // Keep legacy primary credential fields in sync for first/always credential
  if (kind === "credential") {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: opts.userId },
    });
    const shouldMirror =
      !profile?.cvFileData ||
      opts.attachMode === "always" ||
      profile.attachCvToEmails !== false;
    if (shouldMirror) {
      await prisma.studentProfile.update({
        where: { userId: opts.userId },
        data: {
          cvFileName: opts.fileName,
          cvMimeType: opts.mimeType,
          cvText: text || profile?.cvText || null,
          cvFileData: opts.buffer.toString("base64"),
          cvUploadedAt: new Date(),
          attachCvToEmails: true,
          credentialDocType: detected,
        },
      });
    }

    // Re-parse profile from CV text when we got enough readable content
    if (text.length >= 40) {
      try {
        const { ingestCvForUser } = await import("@/services/cv_ingest");
        await ingestCvForUser({
          userId: opts.userId,
          fileName: opts.fileName,
          mimeType: opts.mimeType,
          buffer: opts.buffer,
        });
      } catch {
        /* keep file even if parse/LLM fails */
      }
    }
  }

  return {
    attachment: {
      id: row.id,
      label: row.label,
      kind: row.kind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      attachMode: row.attachMode,
      ruleHint: row.ruleHint,
      detectedDocType: row.detectedDocType,
      textExcerpt: row.textExcerpt,
    },
    detectedDocType: detected as CredentialDocType,
    preview: text.slice(0, 600),
    warning: extractWarning,
  };
}

export async function updateAttachmentMeta(
  userId: string,
  id: string,
  data: {
    label?: string;
    kind?: string;
    attachMode?: string;
    ruleHint?: string | null;
  }
) {
  const existing = await prisma.profileAttachment.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new Error("Attachment not found");
  return prisma.profileAttachment.update({
    where: { id },
    data: {
      label: data.label ?? undefined,
      kind: data.kind ?? undefined,
      attachMode: data.attachMode ?? undefined,
      ruleHint: data.ruleHint === undefined ? undefined : data.ruleHint,
    },
    select: {
      id: true,
      label: true,
      kind: true,
      fileName: true,
      mimeType: true,
      attachMode: true,
      ruleHint: true,
      detectedDocType: true,
      textExcerpt: true,
      createdAt: true,
    },
  });
}

export async function deleteAttachment(userId: string, id: string) {
  const existing = await prisma.profileAttachment.findFirst({
    where: { id, userId },
  });
  if (!existing) return { ok: true };
  await prisma.profileAttachment.delete({ where: { id } });

  // If this was the mirrored credential file, clear legacy fields when names match
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (profile?.cvFileName && profile.cvFileName === existing.fileName) {
    const otherCred = await prisma.profileAttachment.findFirst({
      where: { userId, kind: "credential" },
      orderBy: { createdAt: "desc" },
    });
    if (otherCred) {
      await prisma.studentProfile.update({
        where: { userId },
        data: {
          cvFileName: otherCred.fileName,
          cvMimeType: otherCred.mimeType,
          cvText: otherCred.textExcerpt,
          cvFileData: otherCred.fileData,
          cvUploadedAt: otherCred.createdAt,
          credentialDocType: otherCred.detectedDocType,
        },
      });
    } else {
      await prisma.studentProfile.update({
        where: { userId },
        data: {
          cvFileName: null,
          cvMimeType: null,
          cvText: null,
          cvFileData: null,
          cvUploadedAt: null,
          attachCvToEmails: false,
          credentialDocType: null,
        },
      });
    }
  }
  return { ok: true };
}

export async function resolveOutboundAttachments(
  userId: string,
  ctx: {
    professorFocus?: string | null;
    professorUniversity?: string | null;
    subject?: string | null;
    body?: string | null;
    customRules?: string | null;
  }
): Promise<{
  attachments: MailAttachment[];
  credentialDocType: CredentialDocType | string | null;
  mentionLabels: string[];
}> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const rows = await prisma.profileAttachment.findMany({ where: { userId } });
  const haystack = [
    ctx.professorFocus,
    ctx.professorUniversity,
    ctx.subject,
    ctx.body,
    ctx.customRules || profile?.customRules,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const directives = parseAttachDirectivesFromRules(
    ctx.customRules || profile?.customRules
  );
  const selected = new Map<string, MailAttachment>();

  const add = (row: {
    id: string;
    label: string;
    kind: string;
    fileName: string;
    mimeType: string;
    fileData: string;
  }) => {
    if (selected.has(row.id)) return;
    selected.set(row.id, {
      id: row.id,
      filename: row.fileName,
      mimeType: row.mimeType,
      contentBase64: row.fileData,
      label: row.label,
      kind: row.kind,
    });
  };

  for (const row of rows) {
    if (row.attachMode === "always") add(row);
    if (row.attachMode === "on_rule" && ruleMatches(row.ruleHint, haystack)) {
      add(row);
    }
    for (const d of directives) {
      const labelHit =
        row.label.toLowerCase().includes(d.label.toLowerCase()) ||
        row.fileName.toLowerCase().includes(d.label.toLowerCase());
      if (labelHit && ruleMatches(d.when, haystack)) add(row);
    }
  }

  // Legacy primary credential when no ProfileAttachment credential selected
  const hasCredential = [...selected.values()].some((a) => a.kind === "credential");
  if (
    !hasCredential &&
    profile?.attachCvToEmails !== false &&
    profile?.cvFileData
  ) {
    selected.set("legacy-cv", {
      id: "legacy-cv",
      filename: profile.cvFileName || "CV.pdf",
      mimeType: profile.cvMimeType || "application/pdf",
      contentBase64: profile.cvFileData,
      label: credentialNoun(profile.credentialDocType),
      kind: "credential",
    });
  }

  const attachments = [...selected.values()].slice(0, 5);
  const mentionLabels = attachments.map(
    (a) => a.label || a.filename || "attachment"
  );
  const cred = attachments.find((a) => a.kind === "credential");
  const credRow = rows.find((r) => r.id === cred?.id);
  const credentialDocType =
    credRow?.detectedDocType ||
    profile?.credentialDocType ||
    (cred ? detectCredentialDocType(cred.filename, "") : null);

  return { attachments, credentialDocType, mentionLabels };
}

export async function attachmentContextBrief(userId: string) {
  const rows = await listAttachmentsMeta(userId);
  if (!rows.length) return "";
  const lines = ["Available files (for context / conditional attach):"];
  for (const r of rows) {
    lines.push(
      `- ${r.label} (${r.kind}, mode=${r.attachMode}${r.ruleHint ? `, when: ${r.ruleHint}` : ""}${r.detectedDocType ? `, type=${r.detectedDocType}` : ""})${r.textExcerpt ? `\n  excerpt: ${r.textExcerpt.slice(0, 280)}` : ""}`
    );
  }
  return lines.join("\n");
}
