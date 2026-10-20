import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

// The interest areas a set of answers leads to, in the order the build uses them, and how many it uses
// (the interests page shows "x of 8" before anything is built).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  const body = await readLimitedBody(request, 50_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  return forwardToBackend("/preferences/areas", { method: "POST", body, timeoutMs: 20_000 });
}
