/** Live Vercel app URL (used by GitHub Pages marketing CTAs). */
export const LIVE_APP_URL =
  process.env.NEXT_PUBLIC_LIVE_APP_URL || "https://scholarreach-ai.vercel.app";

export function isStaticExport(): boolean {
  return (
    process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
    process.env.STATIC_EXPORT === "true"
  );
}

/** On Pages, send users to the real app; on Vercel, use in-app routes. */
export function appHref(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isStaticExport()) {
    return `${LIVE_APP_URL.replace(/\/$/, "")}${normalized}`;
  }
  return normalized;
}
