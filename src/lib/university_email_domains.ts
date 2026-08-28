/**
 * Map university names → institutional email domains.
 * Used to prefer emails that belong to the professor's school.
 */

const DOMAIN_RULES: Array<{ match: RegExp; domains: string[] }> = [
  { match: /\bstanford\b/i, domains: ["stanford.edu"] },
  { match: /\b(uc\s?berkeley|berkeley)\b/i, domains: ["berkeley.edu", "eecs.berkeley.edu"] },
  { match: /\bucla\b/i, domains: ["ucla.edu"] },
  { match: /\b(uc\s?san diego|ucsd)\b/i, domains: ["ucsd.edu"] },
  { match: /\bcaltech\b/i, domains: ["caltech.edu"] },
  {
    match: /\b(university of washington|uw seattle)\b/i,
    domains: ["uw.edu", "washington.edu", "cs.washington.edu"],
  },
  { match: /\busc\b|southern california/i, domains: ["usc.edu"] },
  { match: /\buc\s?davis\b/i, domains: ["ucdavis.edu"] },
  { match: /\buc\s?irvine\b|uci\b/i, domains: ["uci.edu"] },
  { match: /\buc\s?santa barbara\b|ucsb\b/i, domains: ["ucsb.edu"] },
  { match: /\buc\s?santa cruz\b|ucsc\b/i, domains: ["ucsc.edu"] },
  { match: /\bwpi\b|worcester polytechnic/i, domains: ["wpi.edu"] },
  { match: /\bmit\b|massachusetts institute/i, domains: ["mit.edu", "csail.mit.edu"] },
  { match: /\bharvard\b/i, domains: ["harvard.edu"] },
  {
    match: /\b(carnegie mellon|cmu)\b/i,
    domains: ["cmu.edu", "cs.cmu.edu", "andrew.cmu.edu"],
  },
  { match: /\bcolumbia\b/i, domains: ["columbia.edu"] },
  { match: /\bprinceton\b/i, domains: ["princeton.edu"] },
  { match: /\byale\b/i, domains: ["yale.edu"] },
  { match: /\bcornell\b/i, domains: ["cornell.edu"] },
  {
    match: /\b(university of pennsylvania|upenn|penn)\b/i,
    domains: ["upenn.edu", "seas.upenn.edu"],
  },
  { match: /\bnyu\b|new york university/i, domains: ["nyu.edu"] },
  { match: /\bbrown\b/i, domains: ["brown.edu"] },
  { match: /\bjohns hopkins\b|jhu\b/i, domains: ["jhu.edu"] },
  { match: /\bduke\b/i, domains: ["duke.edu"] },
  {
    match: /\b(university of michigan|umich|ann arbor)\b/i,
    domains: ["umich.edu"],
  },
  {
    match: /\b(uiuc|illinois|urbana[- ]champaign)\b/i,
    domains: ["illinois.edu", "uiuc.edu"],
  },
  {
    match: /\bwisconsin[- ]madison\b|\buw[- ]madison\b/i,
    domains: ["wisc.edu"],
  },
  { match: /\bnorthwestern\b/i, domains: ["northwestern.edu"] },
  { match: /\buchicago\b|university of chicago/i, domains: ["uchicago.edu"] },
  { match: /\bohio state\b/i, domains: ["osu.edu"] },
  { match: /\bpurdue\b/i, domains: ["purdue.edu"] },
  { match: /\but austin\b|university of texas/i, domains: ["utexas.edu"] },
  { match: /\bgeorgia tech\b|gatech\b/i, domains: ["gatech.edu"] },
  { match: /\brice\b/i, domains: ["rice.edu"] },
  {
    match: /\b(university of toronto|utoronto)\b/i,
    domains: ["utoronto.ca", "cs.toronto.edu"],
  },
  { match: /\bubc\b|british columbia/i, domains: ["ubc.ca"] },
  { match: /\bmcgill\b/i, domains: ["mcgill.ca"] },
  { match: /\bwaterloo\b/i, domains: ["uwaterloo.ca"] },
  { match: /\boxford\b/i, domains: ["ox.ac.uk"] },
  { match: /\bcambridge\b/i, domains: ["cam.ac.uk"] },
  { match: /\bimperial\b/i, domains: ["imperial.ac.uk"] },
  { match: /\bucl\b|university college london/i, domains: ["ucl.ac.uk"] },
  { match: /\beth\b|zurich\b/i, domains: ["ethz.ch"] },
  { match: /\bepfl\b/i, domains: ["epfl.ch"] },
  { match: /\btum\b|munich\b/i, domains: ["tum.de"] },
  { match: /\bnus\b|national university of singapore/i, domains: ["nus.edu.sg"] },
  { match: /\bntu\b|nanyang\b/i, domains: ["ntu.edu.sg"] },
  { match: /\btsinghua\b/i, domains: ["tsinghua.edu.cn"] },
  { match: /\biisc\b|indian institute of science/i, domains: ["iisc.ac.in"] },
  { match: /\biit\b/i, domains: ["iitb.ac.in", "iitd.ac.in", "iitm.ac.in"] },
];

const INSTITUTIONAL_SUFFIXES = [
  ".edu",
  ".ac.uk",
  ".edu.au",
  ".ac.jp",
  ".ac.kr",
  ".ac.in",
  ".edu.sg",
  ".edu.cn",
  ".edu.hk",
  ".ac.nz",
  ".ac.il",
  ".ethz.ch",
  ".epfl.ch",
  ".tum.de",
];

export function emailDomain(email: string): string {
  const parts = (email || "").toLowerCase().trim().split("@");
  return parts.length === 2 ? parts[1].replace(/^\[|\]$/g, "") : "";
}

export function isInstitutionalDomain(domain: string): boolean {
  const d = (domain || "").toLowerCase();
  if (!d) return false;
  return INSTITUTIONAL_SUFFIXES.some(
    (s) => d === s.slice(1) || d.endsWith(s) || d.endsWith(s.replace(/^\./, ""))
  ) || /\.(edu|ac\.[a-z]{2,3}|edu\.[a-z]{2,3})$/i.test(d);
}

export function hostFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Registrable-ish parent: cs.columbia.edu → columbia.edu */
export function parentDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return host.toLowerCase();
  // Keep 3-part institutional suffixes like ox.ac.uk, edu.sg
  const last2 = parts.slice(-2).join(".");
  if (
    /^(ac\.uk|edu\.au|ac\.jp|ac\.kr|ac\.in|edu\.sg|edu\.cn|edu\.hk|ac\.nz|ac\.il)$/i.test(
      last2
    )
  ) {
    return parts.slice(-3).join(".");
  }
  return last2;
}

export function domainsForUniversity(
  university?: string | null,
  homepageUrl?: string | null
): string[] {
  const out = new Set<string>();
  const u = (university || "").trim();
  if (u) {
    for (const rule of DOMAIN_RULES) {
      if (rule.match.test(u)) {
        for (const d of rule.domains) out.add(d.toLowerCase());
      }
    }
  }
  const host = hostFromUrl(homepageUrl);
  if (host) {
    out.add(host);
    out.add(parentDomain(host));
  }
  return Array.from(out);
}

export function emailMatchesUniversityDomains(
  email: string,
  allowedDomains: string[]
): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (!allowedDomains.length) return isInstitutionalDomain(domain);
  return allowedDomains.some(
    (allowed) =>
      domain === allowed ||
      domain.endsWith(`.${allowed}`) ||
      allowed.endsWith(`.${domain}`)
  );
}
