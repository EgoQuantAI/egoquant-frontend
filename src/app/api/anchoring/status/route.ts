import { forwardToBackend } from "@/lib/backend";

// Public: whether plan sealing is on, the sealing address(es) and the consent text. Off = the feature is hidden.
export async function GET() {
  const response = await forwardToBackend("/anchoring/status", { method: "GET", timeoutMs: 10_000 });
  return response.ok ? response : Response.json({ enabled: false });
}
