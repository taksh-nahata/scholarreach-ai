import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  deleteAttachment,
  ingestProfileAttachment,
  listAttachmentsMeta,
  updateAttachmentMeta,
} from "@/services/profile_attachments";

export const runtime = "nodejs";

export async function GET() {
  return withAuthUser(async (user) => {
    const attachments = await listAttachmentsMeta(user.id);
    return NextResponse.json({ attachments, count: attachments.length });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await ingestProfileAttachment({
        userId: user.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer,
        label: String(form.get("label") || "") || undefined,
        kind: String(form.get("kind") || "") || undefined,
        attachMode: String(form.get("attachMode") || "") || undefined,
        ruleHint: form.get("ruleHint") ? String(form.get("ruleHint")) : null,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Upload failed" },
        { status: 400 }
      );
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    try {
      const attachment = await updateAttachmentMeta(user.id, body.id, {
        label: body.label,
        kind: body.kind,
        attachMode: body.attachMode,
        ruleHint: body.ruleHint,
      });
      return NextResponse.json({ ok: true, attachment });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Update failed" },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withAuthUser(async (user) => {
    const id =
      new URL(req.url).searchParams.get("id") ||
      ((await req.json().catch(() => ({}))) as { id?: string }).id;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteAttachment(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
