/**
 * Extract plain text from uploaded CV/resume files.
 * Prefer unpdf on Vercel; fall back to pdf-parse/lib (skips debug-mode crash).
 */
export async function extractTextFromUpload(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lower = fileName.toLowerCase();
  if (
    mimeType.includes("text") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md")
  ) {
    return buffer.toString("utf8");
  }

  if (
    mimeType.includes("pdf") ||
    lower.endsWith(".pdf") ||
    buffer.slice(0, 5).toString("utf8") === "%PDF-"
  ) {
    const errors: string[] = [];

    // 1) unpdf — works in serverless without native canvas
    try {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      const text = Array.isArray(result.text)
        ? result.text.join("\n")
        : String(result.text || "");
      if (text.trim().length >= 20) return text;
      if (text.trim()) return text;
      errors.push("unpdf returned little/no text");
    } catch (err) {
      errors.push(
        `unpdf: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 2) pdf-parse via lib entry (avoids index.js debug-mode ENOENT)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        b: Buffer
      ) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      if ((parsed.text || "").trim()) return parsed.text;
      errors.push("pdf-parse returned empty text");
    } catch (err) {
      errors.push(
        `pdf-parse: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    throw new Error(
      `Could not read text from this PDF (${errors.join("; ")}). ` +
        `If it is a scanned image PDF, export a text-based PDF or paste the text.`
    );
  }

  if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    throw new Error(
      "DOCX upload is not supported yet — please upload a PDF or paste the text."
    );
  }

  // Binary fallback is usually garbage; refuse rather than silent fail later
  const asText = buffer.toString("utf8");
  if (/[\x00-\x08\x0e-\x1f]/.test(asText.slice(0, 200))) {
    throw new Error(
      "Unsupported file type. Upload a PDF or plain-text (.txt) resume."
    );
  }
  return asText;
}
