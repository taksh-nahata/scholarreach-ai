/**
 * Map university / place names → IANA timezones for academic send windows.
 * Prefer professor location so Tue–Thu 8–9 AM is THEIR morning.
 * More-specific rules first.
 */

const RULES: Array<{ match: RegExp; tz: string }> = [
  // Arizona (no DST)
  {
    match: /\b(arizona state|asu|university of arizona|tucson|tempe|phoenix)\b/i,
    tz: "America/Phoenix",
  },
  // US West (Pacific) — University of Washington / Seattle, not DC
  {
    match:
      /\b(stanford|berkeley|caltech|ucla|usc|ucsd|uc\s?davis|uc\s?irvine|uc\s?santa|san diego|los angeles|pasadena|seattle|university of washington|\buw\b|washington state|oregon state|oregon|sfu|ubc|vancouver|victoria|california)\b/i,
    tz: "America/Los_Angeles",
  },
  // US Mountain
  {
    match: /\b(denver|colorado|utah|boulder|albuquerque|new mexico|montana|wyoming|idaho)\b/i,
    tz: "America/Denver",
  },
  // US Central
  {
    match:
      /\b(chicago|illinois|uiuc|urbana|northwestern|wisconsin|madison|minnesota|ohio state|columbus|purdue|indiana|iowa|missouri|texas|austin|ut austin|rice|dallas|houston|kansas|nebraska|oklahoma|louisiana|tennessee|nashville|vanderbilt)\b/i,
    tz: "America/Chicago",
  },
  // US East (includes Michigan, WPI / New England)
  {
    match:
      /\b(mit|harvard|yale|princeton|columbia|cornell|cmu|carnegie|penn|upenn|nyu|duke|georgia tech|maryland|virginia|boston|pittsburgh|philadelphia|new york|michigan|ann arbor|umich|florida|georgia|emory|johns hopkins|brown|dartmouth|wpi|worcester|polytechnic institute|washington,? d\.?c\.?|george washington|georgetown)\b/i,
    tz: "America/New_York",
  },
  // Canada East
  {
    match: /\b(toronto|mcgill|montreal|waterloo|ottawa|ontario|quebec|mcMaster|mcmaster)\b/i,
    tz: "America/Toronto",
  },
  // UK / Ireland
  {
    match:
      /\b(oxford|cambridge|imperial|ucl|edinburgh|manchester|bristol|warwick|king'?s college|london|ireland|dublin|trinity)\b/i,
    tz: "Europe/London",
  },
  // Central Europe
  {
    match:
      /\b(eth|epfl|zurich|munich|tum|max planck|berlin|heidelberg|aachen|delft|amsterdam|leuven|paris|sorbonne|inria|grenoble|milan|politecnico|vienna|stockholm|kth|helsinki|copenhagen)\b/i,
    tz: "Europe/Berlin",
  },
  // Israel
  { match: /\b(technion|tel aviv|weizmann|israel|hebrew university)\b/i, tz: "Asia/Jerusalem" },
  // India
  {
    match: /\b(iit|iiit|iisc|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|kanpur|madras|india)\b/i,
    tz: "Asia/Kolkata",
  },
  // China / HK / Taiwan / Singapore
  {
    match: /\b(tsinghua|peking|beijing|shanghai|zhejiang|hong kong|cuhk|hku|ntu|nus|singapore|taiwan|national taiwan|china)\b/i,
    tz: "Asia/Shanghai",
  },
  // Korea / Japan
  {
    match: /\b(tokyo|kyoto|osaka|tohoku|keio|waseda|kaist|seoul|korea|yonsei|postech|japan)\b/i,
    tz: "Asia/Tokyo",
  },
  // Australia
  {
    match: /\b(melbourne|monash|sydney|unsw|anu|canberra|queensland|brisbane|adelaide|perth|australia|new zealand)\b/i,
    tz: "Australia/Sydney",
  },
  // Broad fallbacks
  { match: /\b(canada)\b/i, tz: "America/Toronto" },
  { match: /\b(united kingdom|england|scotland|\buk\b)\b/i, tz: "Europe/London" },
  {
    match:
      /\b(germany|switzerland|france|netherlands|belgium|austria|sweden|denmark|finland|italy|spain)\b/i,
    tz: "Europe/Berlin",
  },
];

const DEFAULT_TZ = process.env.DRIP_TIMEZONE || "America/Los_Angeles";

export function timezoneForUniversity(
  university?: string | null,
  fallback = DEFAULT_TZ
): string {
  const u = (university || "").trim();
  if (!u) return fallback;
  for (const rule of RULES) {
    if (rule.match.test(u)) return rule.tz;
  }
  return fallback;
}

export function defaultDripTimezone() {
  return DEFAULT_TZ;
}
