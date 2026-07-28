/**
 * University pools keyed by outreach region ids from regions.ts.
 * Used by the faculty miner so each student targets their chosen regions.
 */
export const UNIVERSITIES_BY_REGION: Record<string, string[]> = {
  us_west: [
    "Stanford University",
    "UC Berkeley",
    "UCLA",
    "UC San Diego",
    "Caltech",
    "University of Washington",
    "USC",
    "UC Davis",
    "UC Irvine",
    "UC Santa Barbara",
    "Oregon State University",
    "Arizona State University",
  ],
  us_east: [
    "MIT",
    "Harvard University",
    "Carnegie Mellon University",
    "Columbia University",
    "Princeton University",
    "Yale University",
    "Cornell University",
    "University of Pennsylvania",
    "NYU",
    "Brown University",
    "Johns Hopkins University",
    "Duke University",
  ],
  us_midwest: [
    "University of Michigan",
    "UIUC",
    "University of Wisconsin-Madison",
    "Northwestern University",
    "University of Chicago",
    "Ohio State University",
    "Purdue University",
    "University of Minnesota",
  ],
  us_south: [
    "UT Austin",
    "Georgia Tech",
    "Rice University",
    "Duke University",
    "University of Florida",
    "Texas A&M University",
    "Vanderbilt University",
    "Emory University",
  ],
  canada: [
    "University of Toronto",
    "UBC",
    "McGill University",
    "University of Waterloo",
    "University of Alberta",
    "McMaster University",
  ],
  uk: [
    "University of Oxford",
    "University of Cambridge",
    "Imperial College London",
    "UCL",
    "University of Edinburgh",
    "University of Manchester",
  ],
  europe: [
    "ETH Zurich",
    "EPFL",
    "TU Munich",
    "Max Planck Institute",
    "KU Leuven",
    "Delft University of Technology",
    "University of Amsterdam",
  ],
  asia_pacific: [
    "NUS",
    "NTU Singapore",
    "University of Tokyo",
    "KAIST",
    "ANU",
    "University of Melbourne",
    "Tsinghua University",
  ],
  remote_first: [
    "Stanford University",
    "MIT",
    "Carnegie Mellon University",
    "UC Berkeley",
    "University of Toronto",
    "ETH Zurich",
    "University of Oxford",
    "Georgia Tech",
  ],
};

/** Default pool if student has not picked regions yet */
export const FALLBACK_UNIVERSITIES = [
  ...new Set([
    ...UNIVERSITIES_BY_REGION.us_west.slice(0, 4),
    ...UNIVERSITIES_BY_REGION.us_east.slice(0, 4),
    ...UNIVERSITIES_BY_REGION.us_midwest.slice(0, 2),
    ...UNIVERSITIES_BY_REGION.us_south.slice(0, 2),
  ]),
];

export function universitiesForRegions(regionIds: string[]): string[] {
  if (!regionIds.length) return [...FALLBACK_UNIVERSITIES];
  const set = new Set<string>();
  for (const id of regionIds) {
    for (const u of UNIVERSITIES_BY_REGION[id] || []) set.add(u);
  }
  return set.size ? [...set] : [...FALLBACK_UNIVERSITIES];
}

/** Build search topics from free-text interests + skills */
export function topicsFromProfile(opts: {
  researchInterests?: string | null;
  skills?: { languages?: string[]; frameworks?: string[]; expertise?: string[] } | null;
  headline?: string | null;
}): string[] {
  const chunks: string[] = [];
  if (opts.researchInterests) chunks.push(opts.researchInterests);
  if (opts.headline) chunks.push(opts.headline);
  const skills = opts.skills || {};
  for (const list of [skills.expertise, skills.frameworks, skills.languages]) {
    if (Array.isArray(list) && list.length) chunks.push(list.slice(0, 8).join(", "));
  }

  const blob = chunks.join(" ").trim();
  if (!blob) {
    return [
      "computer science research faculty",
      "machine learning or artificial intelligence",
    ];
  }

  // Split on commas / "and" into topic phrases; keep 2–4 focused queries
  const parts = blob
    .split(/[,;/|]| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, 6);

  if (!parts.length) return [blob.slice(0, 80)];

  const topics: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    topics.push(parts.slice(i, i + 2).join(", "));
  }
  return topics.slice(0, 4);
}
