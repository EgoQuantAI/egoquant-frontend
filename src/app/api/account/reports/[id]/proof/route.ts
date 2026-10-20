import { forwardReport, type ReportContext } from "@/lib/anchoring-proxy";

// The proof file as a download: egoquant-proof-<id>.json (the record, its salt and the transaction hash).
export async function GET(request: Request, context: ReportContext) {
  const response = await forwardReport(request, context, "proof");
  if (!response.ok) return response;
  const { id } = await context.params;
  return new Response(await response.text(), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="egoquant-proof-${id.toLowerCase()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
