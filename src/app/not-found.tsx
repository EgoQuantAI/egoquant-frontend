import type { Metadata } from "next";
import Link from "next/link";
import { CalmPage, calmPrimary, calmSecondary } from "@/components/calm-page";

export const metadata: Metadata = { title: "Page not found | EgoQuant" };

export default function NotFound() {
  return (
    <CalmPage
      title="We could not find that page."
      actions={
        <>
          <Link href="/" className={calmPrimary}>Go to the home page</Link>
          <Link href="/advisor" className={calmSecondary}>Ask the Advisor</Link>
        </>
      }
    >
      <p>The address may be mistyped, or the page may have moved. Nothing is wrong with your profile or portfolio.</p>
    </CalmPage>
  );
}
