export type EmailQualityScore = {
  overall: number;
  paperSpecificity: number;
  domainFit: number;
  contributionClarity: number;
  askQuality: number;
  genericRisk: number;
  notes: string[];
};

export function scoreEmailQuality(opts: {
  subject: string;
  body: string;
  professorFocus?: string | null;
}): EmailQualityScore {
  const body = opts.body || "";
  const subject = opts.subject || "";
  const notes: string[] = [];

  const paperSpecificity = /"[^"]{12,}"/.test(body) ? 22 : 10;
  if (paperSpecificity < 18) notes.push("No specific quoted paper title");

  const focusBlob = (opts.professorFocus || "").toLowerCase();
  const domainTokens = focusBlob.split(/\W+/).filter((t) => t.length > 4);
  let domainHits = 0;
  for (const t of domainTokens.slice(0, 8)) {
    if (body.toLowerCase().includes(t)) domainHits += 1;
  }
  const domainFit = Math.min(20, 8 + domainHits * 3);
  if (domainFit < 12) notes.push("Weak domain-specific language");

  const contributionClarity =
    /\b(I can|I would be glad to|I can contribute|I can help|take on)\b/i.test(body) &&
    /\b(data|simulation|analysis|pipeline|tooling|review)\b/i.test(body)
      ? 20
      : 11;
  if (contributionClarity < 16) notes.push("Contribution ask is vague");

  const askQuality = /\b(10 minutes|brief call|short call|reply)\b/i.test(body)
    ? 18
    : 9;
  if (askQuality < 14) notes.push("Close ask is weak or missing");

  let genericRisk = 0;
  const genericPatterns = [
    /fascinating and groundbreaking/i,
    /highly motivated student/i,
    /aligns perfectly with my interests/i,
    /I would love to learn from you/i,
    /I am passionate about/i,
  ];
  for (const p of genericPatterns) if (p.test(body)) genericRisk += 5;
  if (subject.length < 12) genericRisk += 2;
  genericRisk = Math.min(20, genericRisk);
  if (genericRisk >= 8) notes.push("Contains generic/high-flattery phrasing");

  const overall =
    paperSpecificity +
    domainFit +
    contributionClarity +
    askQuality +
    (20 - genericRisk);
  return {
    overall: Math.max(0, Math.min(100, overall)),
    paperSpecificity,
    domainFit,
    contributionClarity,
    askQuality,
    genericRisk,
    notes,
  };
}

