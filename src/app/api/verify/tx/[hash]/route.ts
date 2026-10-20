import { forwardToBackend } from "@/lib/backend";

// Public: the chain's view of one transaction for the /verify page. Only the hash is sent; the proof file is
// checked in the browser and never leaves it.
const TX_HASH = /^0x[0-9a-f]{64}$/;

export async function GET(_request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = await context.params;
  if (!TX_HASH.test(hash)) return Response.json({ detail: "That is not a transaction hash." }, { status: 422 });
  return forwardToBackend(`/verify/tx/${hash}`, { method: "GET", timeoutMs: 15_000 });
}
