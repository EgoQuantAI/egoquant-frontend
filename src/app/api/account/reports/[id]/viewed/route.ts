import { forwardReport, type ReportContext } from "@/lib/anchoring-proxy";

// Logs "report viewed" once per report (part of the sealed record's operation log).
export const POST = (request: Request, context: ReportContext) => forwardReport(request, context, "viewed");
