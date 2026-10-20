import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { debugPagesOn } from "@/lib/debug-pages";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!debugPagesOn()) return Response.json({ detail: "Not Found" }, { status: 404 });
  const body = await readLimitedBody(request, 10_000);
  if (body === null) return Response.json({ detail: "Request too large." }, { status: 413 });
  return forwardToBackend("/debug/portfolio", { method: "POST", body, timeoutMs: 120_000 });
}
