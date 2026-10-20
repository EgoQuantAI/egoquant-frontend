// The developer pages (/debugmodels and /api/debugmodels) exist only with EGOQUANT_DEBUG_PAGES=on (also 1, true, yes).
// Unset in production, so judges and visitors get a 404. Server side only: not a NEXT_PUBLIC_ variable.
export function debugPagesOn(): boolean {
  return ["1", "true", "on", "yes"].includes((process.env.EGOQUANT_DEBUG_PAGES ?? "").trim().toLowerCase());
}
