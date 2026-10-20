import { forwardReport, type ReportContext } from "@/lib/anchoring-proxy";

// "I confirm this plan": stores the record and tries to seal it (the backend answers within its 6 s budget).
export const POST = (request: Request, context: ReportContext) =>
  forwardReport(request, context, "confirm", { timeoutMs: 30_000 });
