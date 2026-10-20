import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

export const maxDuration = 60; // seconds; a Flex token makes the backend wait for IBKR to generate the report

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  // An uploaded IBKR report (up to 2 MB of text, which JSON escaping can double), or a Flex token.
  const body = await readLimitedBody(request, 4_200_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  return forwardToBackend("/portfolio/ibkr-check", { method: "POST", body, timeoutMs: 55_000 });
}
