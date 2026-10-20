import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

export const maxDuration = 120; // the check rebuilds the investor's limits, like /api/portfolio

// Visitors (no account): the IBKR report or Flex token rides along with THIS request, is used once by the
// backend and never stored. Signed-in users go through /api/account/trade-check instead.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  // The same cap as /api/portfolio: the answers plus an uploaded IBKR report (up to 2 MB, doubled by JSON escaping).
  const body = await readLimitedBody(request, 4_200_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  return forwardToBackend("/trade-check", { method: "POST", body, timeoutMs: 120_000 });
}
