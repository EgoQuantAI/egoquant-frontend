import { backendUrl, passThrough, readLimitedBody } from "@/lib/backend";
import { forbidden, readTokens, sameOrigin } from "@/lib/server-auth";

const MAX_BODY = 200_000;

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { access } = await readTokens();
    return access ? { Authorization: `Bearer ${access}` } : {};
  } catch {
    return {};
  }
}

/** Pass the advisor's server-sent events (meta, delta…, done | error) through as they arrive. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();       // a fetch from another site is refused (SameSite=Lax is the second line)
  const body = await readLimitedBody(request, MAX_BODY);
  if (body === null) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/chat/stream`, {
      method: "POST",
      // A signed-in user's access token from the HttpOnly cookie: the backend then binds what-if runs and privacy
      // counts to the account. Anonymous chat works without it. The browser never sees or sends a token.
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body,
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
    });
  } catch {
    return Response.json({ detail: "Could not reach the backend. Please retry." }, { status: 502 });
  }
  if (!response.ok || !response.body) {
    return new Response(await response.text(), {
      status: response.status,
      headers: passThrough(response),
    });
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
