import { forwardToBackend } from "@/lib/backend";

// Progress of one news-briefing job (and, when done, the briefings): FastAPI GET /briefing/<job>.
type Context = { params: Promise<{ job: string }> };

export async function GET(_request: Request, context: Context) {
  const { job } = await context.params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(job)) return Response.json({ detail: "Not found." }, { status: 404 });
  return forwardToBackend(`/briefing/${job}`, { method: "GET", timeoutMs: 15_000 });
}
