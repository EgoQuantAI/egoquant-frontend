import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, sameOrigin } from "@/lib/server-auth";

// The investment-type questions for this profile (options it does not allow come back greyed, with why).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  const body = await readLimitedBody(request, 50_000);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  return forwardToBackend("/preferences/form", { method: "POST", body, timeoutMs: 30_000 });
}
