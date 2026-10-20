import { downloadReportHtml, type ReportContext } from "@/lib/anchoring-proxy";

// The saved report as one HTML page: the finished news and (when sealing is on) its Seal section.
export const GET = (request: Request, context: ReportContext) => downloadReportHtml(request, context);
