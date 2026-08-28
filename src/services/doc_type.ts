/**
 * Detect whether an uploaded document is a CV, resume, or something else.
 */
export type CredentialDocType = "cv" | "resume" | "unknown";

export function detectCredentialDocType(
  fileName: string,
  text: string
): CredentialDocType {
  const name = (fileName || "").toLowerCase();
  const body = (text || "").slice(0, 4000).toLowerCase();

  const cvName =
    /\bcv\b/.test(name) ||
    /curriculum[_\s-]?vitae/.test(name) ||
    /vitae/.test(name);
  const resumeName = /\bresume\b/.test(name) || /\bcv_resume\b/.test(name);

  const cvText =
    /curriculum\s+vitae/.test(body) ||
    /\bcurriculum vitae\b/.test(body) ||
    (/\bc\.?v\.?\b/.test(body.slice(0, 400)) && /publications|refereed|orcid/.test(body));
  const resumeText =
    /\bresume\b/.test(body.slice(0, 500)) ||
    (/objective|professional summary|work experience|employment history/.test(body) &&
      !/curriculum\s+vitae/.test(body));

  if (cvName && !resumeName) return "cv";
  if (resumeName && !cvName) return "resume";
  if (cvText && !resumeText) return "cv";
  if (resumeText && !cvText) return "resume";
  if (cvName || cvText) return "cv";
  if (resumeName || resumeText) return "resume";

  // Academic-leaning signals → CV; industry/skills dump → resume
  if (/publications|peer[\s-]?reviewed|conference|journal articles/.test(body)) {
    return "cv";
  }
  if (/skills|projects|internships|high school/.test(body)) {
    return "resume";
  }
  return "unknown";
}

export function credentialNoun(docType: CredentialDocType | string | null | undefined) {
  if (docType === "resume") return "resume";
  if (docType === "cv") return "CV";
  return "CV/resume";
}

export function credentialPhrase(docType: CredentialDocType | string | null | undefined) {
  if (docType === "resume") return "my resume";
  if (docType === "cv") return "my CV";
  return "my CV/resume";
}
