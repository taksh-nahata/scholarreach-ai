import type { gmail_v1 } from "googleapis";

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function extractPlainBodyFromPayload(
  payload?: gmail_v1.Schema$MessagePart | null
): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      const text = extractPlainBodyFromPayload(part);
      if (text.trim()) return text;
    }
  }
  for (const part of parts) {
    const text = extractPlainBodyFromPayload(part);
    if (text.trim()) return text;
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return "";
}

/** Trim quoted prior thread so we keep the professor's newest words. */
export function trimReplyQuotes(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  const cutPatterns = [
    /\nOn .{8,120} wrote:\s*\n/i,
    /\nFrom:\s*.+\n/i,
    /\n-----Original Message-----/i,
    /\n_{5,}/,
    /\n> /,
  ];
  for (const p of cutPatterns) {
    const idx = text.search(p);
    if (idx > 40) {
      text = text.slice(0, idx).trim();
      break;
    }
  }
  return text.trim();
}

export function extractUrls(text: string): string[] {
  const found = new Set<string>();
  const re = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  for (const m of text.match(re) || []) {
    const clean = m.replace(/[.,;:!?)]+$/, "");
    if (clean.length > 12) found.add(clean);
  }
  return [...found];
}
