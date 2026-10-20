import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

// Start Agent D's full news briefing for a built portfolio: forwards the sealed briefing_context that /portfolio
// returned to FastAPI POST /briefing/start. Short: the job runs on the backend, and the page polls
// /api/briefing/<job> (so no request here comes near a function timeout).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused, like the other POST proxies
  const body = await readLimitedBody(request, 130_000);
  if (body === null) return Response.json({ detail: "Request too large." }, { status: 413 });
  return forwardToBackend("/briefing/start", { method: "POST", body, timeoutMs: 15_000 });
}
