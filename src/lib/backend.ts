// Used only by Route Handlers (server side). BACKEND_URL is not a NEXT_PUBLIC_ variable, so it is
// never sent to the browser.
export const backendUrl = (
  process.env.BACKEND_URL ||
  "https://web-production-ee5cc.up.railway.app"
).replace(/\/$/, "");

type ForwardOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: string;
  headers?: Record<string, string>;   // e.g. the signed-in user's Authorization (set server side, never from the browser)
  timeoutMs: number;
};

/** Forward one request to the FastAPI backend and pass its JSON answer through unchanged. */
/** The headers a proxied answer keeps: JSON, and the backend's Retry-After on a 429 or 503 ("try again in N seconds"). */
export function passThrough(response: Response): Record<string, string> {
  const retry = response.headers.get("Retry-After");
  return { "Content-Type": "application/json", ...(retry && /^\d{1,5}$/.test(retry.trim()) ? { "Retry-After": retry.trim() } : {}) };
}

export async function forwardToBackend(
  path: string,
  { method, body, headers, timeoutMs }: ForwardOptions
): Promise<Response> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: passThrough(response),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") {
      return Response.json({ detail: "The server took too long to answer. Please try again." }, { status: 504 });
    }
    return Response.json(
      { detail: "Could not reach the server. Check your connection and try again in a moment." },
      { status: 502 }
    );
  }
}

/** Read a JSON request body with a size cap; returns null when it is too large. */
export async function readLimitedBody(request: Request, maxLength: number): Promise<string | null> {
  const body = await request.text();
  return body.length > maxLength ? null : body;
}
