"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CalmPage, calmPrimary, calmSecondary } from "@/components/calm-page";

// The boundary for any page that throws while rendering. The person sees a calm message, never the error itself;
// the error goes to the browser console for us. `retry` is this Next version's name for what older ones call `reset`.
export default function ErrorPage({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const again = retry ?? reset;
  return (
    <CalmPage
      title="Something went wrong on our side."
      actions={
        <>
          {again && <button type="button" onClick={() => again()} className={calmPrimary}>Try again</button>}
          <Link href="/" className={calmSecondary}>Go to the home page</Link>
        </>
      }
    >
      <p>
        This page could not be shown. Nothing you saved was lost. Please try again; if it keeps happening, continue
        from the home page.
      </p>
    </CalmPage>
  );
}
