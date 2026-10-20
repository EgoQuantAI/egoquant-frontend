import { notFound } from "next/navigation";
import { debugPagesOn } from "@/lib/debug-pages";
import { DebugModels } from "./debug-models";

// Read when the page is built: changing EGOQUANT_DEBUG_PAGES on Vercel takes effect with the next deploy.
export default function Page() {
  if (!debugPagesOn()) notFound();
  return <DebugModels />;
}
