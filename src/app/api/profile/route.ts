import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  const body = await readLimitedBody(request, 25_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  return forwardToBackend("/profile", { method: "POST", body, timeoutMs: 30_000 });
}
