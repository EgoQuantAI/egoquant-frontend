import { Suspense } from "react";
import { PageLoader } from "@/components/ui/loader";
import { SavedReport } from "./saved-report";

// Cache Components: reading `params` is runtime data, so it sits behind a Suspense boundary.
async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedReport id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoader label="Opening the report" />}>
      <Report params={params} />
    </Suspense>
  );
}
