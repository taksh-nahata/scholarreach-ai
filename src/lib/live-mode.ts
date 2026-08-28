import { isStaticHost } from "@/lib/demo-auth";

/** Demo bundle is only for GitHub Pages / static marketing — never for live Vercel app. */
export function allowDemoFallback(): boolean {
  if (typeof window !== "undefined") {
    return isStaticHost();
  }
  return (
    process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
    process.env.STATIC_EXPORT === "true"
  );
}
