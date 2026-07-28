import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { ingestCvForUser, ingestCvText } from "@/services/cv_ingest";

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
