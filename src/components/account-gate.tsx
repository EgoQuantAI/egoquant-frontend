"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { PageLoader } from "@/components/ui/loader";
import { AccountsOff } from "@/components/welcome/accounts-off";
import { useProfile } from "@/lib/profile";

// The onboarding steps need an account: the answers are kept there (lib/egoquant.ts syncWithAccount). A signed-out
// visitor is sent to the account page (login first, sign-up one click away), which comes back here after login or
// sign-up. Nothing renders until the session in this browser agrees with the account's copy; when accounts cannot
// be reached the page says so (and retries) instead of letting anyone past.

export function AccountGate({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (profile.state === "out") router.replace(`/account?next=${encodeURIComponent(pathname)}`);
  }, [profile.state, pathname, router]);

  if (profile.state === "off") {
    return <main className="flex h-screen w-full bg-white"><AccountsOff message={profile.message} /></main>;
  }
  if (profile.state !== "in") return <PageLoader label={profile.state === "out" ? "Taking you to sign in" : "Loading your profile"} />;
  return children;
}
