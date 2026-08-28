/**
 * OpenAlex — free academic graph (no API key). Primary source for authors, focus, papers.
 * Polite pool: set OPENALEX_MAILTO=you@domain.com
 */
import type { SearchHit } from "./tavily_client";

const BASE = "https://api.openalex.org";
const MAILTO =
  process.env.OPENALEX_MAILTO ||
  process.env.SEARCH_CONTACT_EMAIL ||
  "scholarreach@users.noreply.github.com";

type OAInstitution = { id: string; display_name: string };
type OAConcept = { display_name?: string; score?: number };
type OAAuthorship = {
  author?: { id?: string; display_name?: string };
  institutions?: Array<{ display_name?: string; id?: string }>;
};
type OAWork = {
  id?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: OAAuthorship[];
  concepts?: OAConcept[];
  primary_location?: { landing_page_url?: string; source?: { display_name?: string } };
};
type OAAuthor = {
  id: string;
  display_name: string;
  works_count?: number;
  last_known_institutions?: Array<{ id?: string; display_name?: string }>;
  topics?: Array<{ display_name?: string }>;
  x_concepts?: OAConcept[];
  ids?: { openalex?: string; orcid?: string; wikipedia?: string; homepage?: string };
  summary_stats?: { h_index?: number };
};

export type OpenAlexFaculty = {
  name: string;
  openAlexId: string;
  university: string;
  researchFocus: string | null;
  recentPaper: string | null;
  tags: string[];
  homepageUrl: string | null;
  orcid: string | null;
  worksCount: number;
};

function headers(): HeadersInit {
  return {
    "User-Agent": `ScholarReach/1.0 (mailto:${MAILTO})`,
    Accept: "application/json",
  };
}

async function oaGet<T>(path: string): Promise<T | null> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const joiner = url.includes("?") ? "&" : "?";
  const full = `${url}${joiner}mailto=${encodeURIComponent(MAILTO)}`;
  try {
    const res = await fetch(full, { headers: headers(), next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn(`[OpenAlex] ${res.status} ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[OpenAlex]`, err instanceof Error ? err.message : err);
    return null;
  }
}

const institutionCache = new Map<string, string | null>();

export async function resolveInstitutionId(
  university: string
): Promise<string | null> {
  const key = university.toLowerCase().trim();
  if (institutionCache.has(key)) return institutionCache.get(key) || null;

  const data = await oaGet<{ results?: OAInstitution[] }>(
    `/institutions?search=${encodeURIComponent(university)}&per-page=5`
  );
  const hit =
    data?.results?.find((r) =>
      r.display_name.toLowerCase().includes(key.split(" ")[0] || key)
    ) || data?.results?.[0];
  const id = hit?.id || null;
  institutionCache.set(key, id);
  return id;
}

function focusFromConcepts(
  concepts?: Array<{ display_name?: string; score?: number }>,
  topics?: Array<{ display_name?: string }>
): { focus: string | null; tags: string[] } {
  const tags: string[] = [];
  for (const t of topics || []) {
    if (t.display_name) tags.push(t.display_name);
  }
  const sorted = [...(concepts || [])]
    .filter((c) => c.display_name)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const c of sorted.slice(0, 6)) {
    if (c.display_name && !tags.includes(c.display_name)) tags.push(c.display_name);
  }
  const focus = tags.slice(0, 3).join(", ") || null;
  return { focus, tags: tags.slice(0, 8) };
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

/** Topic-targeted faculty at a university via recent works → authors. */
export async function discoverFacultyAtUniversity(opts: {
  university: string;
  topic: string;
  limit?: number;
}): Promise<OpenAlexFaculty[]> {
  const limit = opts.limit ?? 8;
  const instId = await resolveInstitutionId(opts.university);
  const filterParts: string[] = [];
  if (instId) {
    // OpenAlex IDs look like https://openalex.org/I27837315 — filter wants I27837315 or full URL
    const short = instId.split("/").pop() || instId;
    filterParts.push(`institutions.id:${short}`);
  }

  const search = encodeURIComponent(opts.topic);
  const filter = filterParts.length
    ? `&filter=${encodeURIComponent(filterParts.join(","))}`
    : "";
  const works = await oaGet<{ results?: OAWork[] }>(
    `/works?search=${search}${filter}&sort=publication_date:desc&per-page=${Math.min(25, limit * 3)}`
  );

  const byAuthor = new Map<string, OpenAlexFaculty>();
  for (const work of works?.results || []) {
    const title = (work.title || work.display_name || "").trim();
    for (const a of work.authorships || []) {
      const name = cleanName(a.author?.display_name || "");
      const aid = a.author?.id || "";
      if (!name || !aid || byAuthor.has(aid)) continue;

      const instMatch =
        !instId ||
        (a.institutions || []).some((i) => i.id === instId) ||
        (a.institutions || []).some((i) =>
          (i.display_name || "")
            .toLowerCase()
            .includes(opts.university.toLowerCase().split(" ")[0] || "")
        );

      // If we filtered by institution at works level, accept; else require soft match
      if (instId && !instMatch && filterParts.length) {
        // still ok — work already institution-filtered
      } else if (!instId) {
        const uniHint = opts.university.toLowerCase();
        const ok = (a.institutions || []).some((i) =>
          (i.display_name || "").toLowerCase().includes(uniHint.slice(0, 8))
        );
        if (!ok && (a.institutions || []).length) continue;
      }

      const { focus, tags } = focusFromConcepts(work.concepts);
      byAuthor.set(aid, {
        name: name.startsWith("Dr.") ? name : `Dr. ${name}`,
        openAlexId: aid,
        university: opts.university,
        researchFocus: focus || opts.topic,
        recentPaper: title || null,
        tags,
        homepageUrl: null, // never use paper DOI as faculty homepage
        orcid: null,
        worksCount: 0,
      });
      if (byAuthor.size >= limit) break;
    }
    if (byAuthor.size >= limit) break;
  }

  // Enrich top authors (homepage / better focus); skip thin profiles (likely students)
  const out: OpenAlexFaculty[] = [];
  for (const fac of byAuthor.values()) {
    const enriched = await enrichAuthor(fac);
    if ((enriched.worksCount || 0) > 0 && enriched.worksCount < 8) continue;
    out.push(enriched);
    if (out.length >= limit) break;
  }
  return out;
}

async function enrichAuthor(fac: OpenAlexFaculty): Promise<OpenAlexFaculty> {
  const short = fac.openAlexId.split("/").pop() || fac.openAlexId;
  const author = await oaGet<OAAuthor>(`/authors/${short}`);
  if (!author) return fac;

  const { focus, tags } = focusFromConcepts(author.x_concepts, author.topics);
  const homepageRaw =
    author.ids?.homepage ||
    author.ids?.wikipedia ||
    null;
  const homepage =
    homepageRaw && !/doi\.org|dx\.doi/i.test(homepageRaw)
      ? homepageRaw
      : fac.homepageUrl && !/doi\.org|dx\.doi/i.test(fac.homepageUrl)
        ? fac.homepageUrl
        : homepageRaw;

  // Latest work title if missing
  let recent = fac.recentPaper;
  if (!recent) {
    const works = await oaGet<{ results?: OAWork[] }>(
      `/works?filter=author.id:${short}&sort=publication_date:desc&per-page=1`
    );
    recent =
      works?.results?.[0]?.title ||
      works?.results?.[0]?.display_name ||
      null;
  }

  return {
    ...fac,
    name: cleanName(author.display_name).startsWith("Dr.")
      ? cleanName(author.display_name)
      : `Dr. ${cleanName(author.display_name)}`,
    researchFocus: focus || fac.researchFocus,
    tags: tags.length ? tags : fac.tags,
    homepageUrl: homepage || fac.homepageUrl,
    orcid: author.ids?.orcid || null,
    worksCount: author.works_count || 0,
    recentPaper: recent,
  };
}

/** Look up one professor by name + university. */
export async function findAuthorByName(
  name: string,
  university: string
): Promise<OpenAlexFaculty | null> {
  const bare = name.replace(/^dr\.?\s*/i, "").trim();
  const instId = await resolveInstitutionId(university);
  const filter = instId
    ? `&filter=last_known_institutions.id:${instId.split("/").pop()}`
    : "";
  const data = await oaGet<{ results?: OAAuthor[] }>(
    `/authors?search=${encodeURIComponent(bare)}${filter}&per-page=5`
  );
  const hit = data?.results?.[0];
  if (!hit) return null;
  return enrichAuthor({
    name: hit.display_name,
    openAlexId: hit.id,
    university,
    researchFocus: null,
    recentPaper: null,
    tags: [],
    homepageUrl: hit.ids?.homepage || null,
    orcid: hit.ids?.orcid || null,
    worksCount: hit.works_count || 0,
  });
}

export async function findRecentPaperFree(
  name: string,
  university: string,
  topicHint?: string
): Promise<string | null> {
  const author = await findAuthorByName(name, university);
  if (author?.recentPaper) return author.recentPaper;

  const bare = name.replace(/^dr\.?\s*/i, "").trim();
  const q = encodeURIComponent(
    `${bare} ${topicHint || ""} ${university}`.trim()
  );
  const works = await oaGet<{ results?: OAWork[] }>(
    `/works?search=${q}&sort=publication_date:desc&per-page=5`
  );
  for (const w of works?.results || []) {
    const title = (w.title || w.display_name || "").trim();
    const authored = (w.authorships || []).some((a) =>
      (a.author?.display_name || "")
        .toLowerCase()
        .includes(bare.split(" ").pop()?.toLowerCase() || "___")
    );
    if (authored && title.length > 12) return title;
  }
  return works?.results?.[0]?.title || works?.results?.[0]?.display_name || null;
}

/** Turn OpenAlex / ORCID / wiki URLs into SearchHits for email resolver. */
export function facultyUrlsToHits(fac: OpenAlexFaculty): SearchHit[] {
  const hits: SearchHit[] = [];
  if (fac.homepageUrl) {
    hits.push({
      title: `${fac.name} homepage`,
      url: fac.homepageUrl,
      snippet: `${fac.researchFocus || ""} ${fac.recentPaper || ""}`.trim(),
    });
  }
  if (fac.orcid) {
    const orcid = fac.orcid.replace(/^https?:\/\/orcid\.org\//, "");
    hits.push({
      title: `${fac.name} ORCID`,
      url: `https://orcid.org/${orcid}`,
      snippet: fac.researchFocus || "",
    });
  }
  return hits;
}
