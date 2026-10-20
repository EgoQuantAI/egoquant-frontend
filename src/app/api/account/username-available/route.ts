import { forwardToBackend } from "@/lib/backend";
import { USERNAME } from "@/lib/server-auth";

// Is this username free? Yes or no only. The backend rate-limits it for everyone together.

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!USERNAME.test(name)) return Response.json({ available: false });
  return forwardToBackend(`/account/username-available?name=${encodeURIComponent(name)}`, { method: "GET", timeoutMs: 10_000 });
}
