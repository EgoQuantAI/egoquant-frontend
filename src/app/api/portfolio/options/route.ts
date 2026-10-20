import { connection } from "next/server";
import { forwardToBackend } from "@/lib/backend";

export async function GET() {
  await connection(); // always at request time: never prerendered or cached at build
  return forwardToBackend("/portfolio/options", { method: "GET", timeoutMs: 20_000 });
}
