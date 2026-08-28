/**
 * Plain-text + HTML helpers so outreach emails look right in Gmail
 * (no leftover Markdown like **bold**).
 */

export function hasUploadedCv(profile: {
  cvText?: string | null;
  cvFileName?: string | null;
  cvUploadedAt?: Date | string | null;
  cvFileData?: string | null;
  hasCvFile?: boolean;
} | null | undefined): boolean {
  if (!profile) return false;
  if (profile.cvFileName) return true;
  if (profile.cvUploadedAt) return true;
  if (profile.hasCvFile) return true;
  if (profile.cvFileData) return true;
  return !!(profile.cvText && profile.cvText.trim().length > 80);
}

/** True when a real file will be attached to outbound mail. */
export function willAttachCv(profile: {
  attachCvToEmails?: boolean | null;
  cvFileName?: string | null;
  cvFileData?: string | null;
  hasCvFile?: boolean;
} | null | undefined): boolean {
  if (!profile) return false;
  if (profile.attachCvToEmails === false) return false;
  // Need actual file bytes (hasCvFile from API, or cvFileData from DB)
  return !!(profile.cvFileData || profile.hasCvFile);
}

/** Strip Markdown / fancy punctuation that looks broken in Gmail. */
export function sanitizeEmailText(text: string): string {
  let t = text || "";
  // **bold** / __bold__ → keep inner text
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  // *italic* / _italic_ (single) — careful not to eat bullets
  t = t.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
  t = t.replace(/`([^`]+)`/g, "$1");
  // Markdown headings / links
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Normalize bullets
  t = t.replace(/^\s*[-*]\s+/gm, "• ");
  t = t.replace(/—/g, " - ").replace(/–/g, " - ").replace(/\u2014/g, " - ");
  // Collapse weird spaces
  t = t.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  return t.trim();
}

/** Remove CV/resume attachment claims when the student has no file to attach. */
export function stripCvAttachmentClaims(body: string): string {
  return body
    .replace(
      /[^.!\n]*\b(i have attached|i've attached|attached (is|please find)?\s*(my )?(cv|resume|curriculum vitae)|please find (my )?(cv|resume) attached|(cv|resume) (is )?attached for your review)[^.!\n]*[.!]?\s*/gi,
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ensureCredentialMention(
  body: string,
  opts: {
    willAttach: boolean;
    docType?: string | null;
    extraLabels?: string[];
  }
): string {
  const cleaned = opts.willAttach
    ? sanitizeEmailText(body)
    : stripCvAttachmentClaims(sanitizeEmailText(body));
  if (!opts.willAttach) return cleaned;

  const noun =
    opts.docType === "resume"
      ? "resume"
      : opts.docType === "cv"
        ? "CV"
        : "CV/resume";
  if (/\b(cv|resume|curriculum vitae)\b/i.test(cleaned)) {
    // Soft-normalize wrong noun if we know the type
    if (opts.docType === "resume") {
      return cleaned
        .replace(/\bmy CV\b/gi, "my resume")
        .replace(/\bCV attached\b/gi, "resume attached");
    }
    if (opts.docType === "cv") {
      return cleaned
        .replace(/\bmy resume\b/gi, "my CV")
        .replace(/\bresume attached\b/gi, "CV attached");
    }
    return cleaned;
  }

  const extras =
    opts.extraLabels?.filter(
      (l) => !/^(cv|resume|cv\/resume)$/i.test(l.trim())
    ) || [];
  const attachLine =
    extras.length > 0
      ? `I have attached my ${noun} and ${extras.join(", ")} for your review.`
      : `I have attached my ${noun} for your review.`;

  const signOff = cleaned.match(/\n(Sincerely|Best regards|Thank you)[,\s]/i);
  if (signOff && signOff.index != null) {
    return (
      cleaned.slice(0, signOff.index) +
      `\n\n${attachLine}` +
      cleaned.slice(signOff.index)
    );
  }
  return `${cleaned}\n\n${attachLine}`;
}

/** @deprecated use ensureCredentialMention */
export function ensureCvMention(body: string, hasCv: boolean): string {
  return ensureCredentialMention(body, { willAttach: hasCv });
}

/** Convert plain outreach body into simple Gmail-friendly HTML. */
export function plainTextToGmailHtml(body: string): string {
  const safe = sanitizeEmailText(body)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = safe.split("\n");
  const parts: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    parts.push(
      `<ul style="margin:8px 0 12px 18px;padding:0">${list
        .map(
          (li) =>
            `<li style="margin:0 0 6px 0;line-height:1.5">${li.replace(/^•\s*/, "")}</li>`
        )
        .join("")}</ul>`
    );
    list = [];
  };

  for (const line of lines) {
    if (/^\s*•\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      list.push(line.replace(/^\s*(\d+\.|•)\s*/, ""));
      continue;
    }
    flushList();
    if (!line.trim()) {
      parts.push(`<div style="height:10px"></div>`);
    } else {
      parts.push(
        `<p style="margin:0 0 12px 0;line-height:1.55;font-size:14.5px;color:#222">${line}</p>`
      );
    }
  }
  flushList();

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${parts.join("")}</div>`;
}

export function prepareEmailBodies(
  rawBody: string,
  willAttachOrOpts:
    | boolean
    | {
        willAttach: boolean;
        docType?: string | null;
        extraLabels?: string[];
      }
) {
  const opts =
    typeof willAttachOrOpts === "boolean"
      ? { willAttach: willAttachOrOpts }
      : willAttachOrOpts;
  const body = ensureCredentialMention(rawBody, opts);
  return {
    body,
    htmlBody: plainTextToGmailHtml(body),
  };
}
