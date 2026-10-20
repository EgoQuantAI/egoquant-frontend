import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";
import { BUILD_PROXY_TIMEOUT_MS } from "@/lib/build-timing";

export const maxDuration = 120; // seconds; hosts with a shorter default would cut the request off. Keep it above BUILD_PROXY_TIMEOUT_MS (lib/build-timing.ts)

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  // 50 KB for the answers; an uploaded IBKR report (up to 2 MB of text, which JSON escaping can double) rides along.
  const body = await readLimitedBody(request, 4_200_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  // Real market data plus optimization can take a while on a cold cache.
  return forwardToBackend("/portfolio", { method: "POST", body, timeoutMs: BUILD_PROXY_TIMEOUT_MS });
}
