/**
 * Try a paid API call; on budget exhaustion, errors, or empty results → null
 * so callers can use free/algorithmic fallbacks.
 */
import { tryConsumeApi, type ApiKind } from "@/services/api_budget";
import { freeFirstMode } from "@/lib/free_first_mode";

export async function tryPaidApi<T>(
  userId: string,
  kind: ApiKind,
  label: string,
  fn: () => Promise<T>,
  accept: (value: T) => boolean = (v) => v != null && v !== ""
): Promise<T | null> {
  if (freeFirstMode()) {
    return null;
  }
  if (!(await tryConsumeApi(userId, kind, 1))) {
    console.warn(`[Fallback] ${label}: daily ${kind} budget exhausted → free path`);
    return null;
  }
  try {
    const result = await fn();
    if (!accept(result)) {
      console.warn(`[Fallback] ${label}: empty result → free path`);
      return null;
    }
    return result;
  } catch (err) {
    console.warn(
      `[Fallback] ${label}: ${err instanceof Error ? err.message : err} → free path`
    );
    return null;
  }
}
