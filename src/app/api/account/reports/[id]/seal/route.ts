import { forwardReport, type ReportContext } from "@/lib/anchoring-proxy";

// The seal's status; a pending seal is re-sent and a submitted one checked (the seal badge polls this).
export const GET = (request: Request, context: ReportContext) => forwardReport(request, context, "seal");
