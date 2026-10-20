import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { forbidden, readTokens, sameOrigin } from "@/lib/server-auth";

// The body carries the conversation, the questionnaire answers and the sealed portfolio context
// (chat_context from /portfolio, up to 120 kB), so the cap is higher than the other routes'.
const MAX_BODY = 200_000;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  const body = await readLimitedBody(request, MAX_BODY);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  let headers: Record<string, string> = {};
  try {
    const { access } = await readTokens();     // HttpOnly cookie, server side; anonymous chat works without it
    if (access) headers = { Authorization: `Bearer ${access}` };
  } catch {
    // no session: anonymous
  }
  return forwardToBackend("/chat", { method: "POST", body, headers, timeoutMs: 75_000 });
}
