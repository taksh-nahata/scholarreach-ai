/** Shared region catalog for outreach targeting */
export type OutreachRegion = {
  id: string;
  label: string;
  blurb: string;
  examples: string[];
};

export const OUTREACH_REGIONS: OutreachRegion[] = [
  {
    id: "us_west",
    label: "US West Coast",
    blurb: "California, Washington, Oregon, Arizona",
    examples: ["Stanford", "Berkeley", "Caltech", "UW", "UCLA"],
  },
  {
    id: "us_east",
    label: "US East Coast",
    blurb: "Northeast corridor and Mid-Atlantic",
    examples: ["MIT", "Harvard", "CMU", "Columbia", "Princeton"],
  },
  {
    id: "us_midwest",
    label: "US Midwest",
    blurb: "Great Lakes and central research hubs",
    examples: ["Michigan", "UIUC", "Wisconsin", "Northwestern"],
  },
  {
    id: "us_south",
    label: "US South",
    blurb: "Texas, Southeast, and Gulf research schools",
    examples: ["UT Austin", "Georgia Tech", "Rice", "Duke"],
  },
  {
    id: "canada",
    label: "Canada",
    blurb: "U15 and major Canadian research universities",
    examples: ["U of T", "UBC", "McGill", "Waterloo"],
  },
  {
    id: "uk",
    label: "United Kingdom",
    blurb: "Russell Group and leading UK labs",
    examples: ["Oxford", "Cambridge", "Imperial", "UCL"],
  },
  {
    id: "europe",
    label: "Continental Europe",
    blurb: "EU research universities and institutes",
    examples: ["ETH Zurich", "EPFL", "TU Munich", "Max Planck"],
  },
  {
    id: "asia_pacific",
    label: "Asia-Pacific",
    blurb: "East Asia, Singapore, Australia",
    examples: ["NUS", "NTU", "Tokyo", "KAIST", "ANU"],
  },
  {
    id: "remote_first",
    label: "Remote-friendly anywhere",
    blurb: "Prioritize labs open to remote or hybrid mentorship",
    examples: ["Any region · remote preferred"],
  },
];

export function regionLabel(id: string): string {
  return OUTREACH_REGIONS.find((r) => r.id === id)?.label || id;
}
