import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

// The report with the briefing job's FINAL news briefing (FastAPI POST /briefing/<job>/report): the browser's copy
// of the report without its news sections, plus the Advisor's sealed context. The backend checks the numbers and
// answers 409 while the news is still being rated.
type Context = { params: Promise<{ job: string }> };

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused, like the other POST proxies
  const { job } = await context.params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(job)) return Response.json({ detail: "Not found." }, { status: 404 });
  const body = await readLimitedBody(request, 500_000);
  if (body === null) return Response.json({ detail: "Request too large." }, { status: 413 });
  return forwardToBackend(`/briefing/${job}/report`, { method: "POST", body, timeoutMs: 30_000 });
}
