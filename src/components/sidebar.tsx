"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AdvisorAvatar, Avatar } from "@/components/avatar";
import { Skeleton } from "@/components/ui/loader";
import { type StepState, onboardingSteps } from "@/components/onboarding";
import { useSession } from "@/lib/egoquant";
import { useProfile } from "@/lib/profile";

type NavItem = { id: string; label: string; href: string };

// Onboarding (first visit): the advisory steps in order.
const ONBOARDING: NavItem[] = [
  { id: "profile", label: "I. Profile", href: "/questionnaire" },
  { id: "game", label: "II. Risk Game", href: "/game" },
  { id: "interests", label: "III. Investments", href: "/interests" },
  { id: "portfolio", label: "IV. Portfolio", href: "/portfolio" },
  { id: "review", label: "V. Review", href: "/review" },
];

// After onboarding: the engine a returning user works with.
const ENGINE: NavItem[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio" },
  { id: "interests", label: "Investments", href: "/interests" },
  { id: "review", label: "Review", href: "/review" },
  { id: "game", label: "Risk Game", href: "/game" },
];

const ADVISOR: NavItem = { id: "advisor", label: "Ask the Advisor", href: "/advisor" };

// Today's date, client only (empty while prerendering, so the server and browser output agree).
const noSubscribe = () => () => {};
const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function Sidebar() {
  const pathname = usePathname();
  // Only a signed-in person's session counts: an old copy left in this browser by a signed-out visitor
  // must not show a risk profile or the engine pages (the account is where the answers live).
  const auth = useProfile().state;
  const signedIn = auth === "in";
  const local = useSession();
  const session = signedIn ? local : null;
  const date = useSyncExternalStore(noSubscribe, today, () => "");

  const profile = session?.profile;
  const onboarded = !!profile && !!session?.result;
  const items = onboarded ? ENGINE : ONBOARDING;
  const steps = onboardingSteps(session);
  const doneCount = items.filter((item) => steps[item.id] === "done").length;

  const body = (
    <>
      <div>
        <Link href="/">
          <span className="block font-heading text-3xl leading-none text-zinc-900">
            EgoQuant
          </span>
        </Link>
        <p className="mt-2 text-xs font-medium tracking-widest text-zinc-500 uppercase">
          Wealth Advisory
        </p>
      </div>

      <div className="my-8 h-px bg-zinc-300 tight:my-6 short:my-5" />

      <div className="mb-3 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        <span>{auth === "loading" ? "\u00a0" : onboarded ? "Your Engine" : "Advisory Steps"}</span>
        {!onboarded && session && <span className="tabular-nums text-zinc-400">{doneCount} of {items.length}</span>}
      </div>

      {/* While the sign-in is checked, placeholders: the steps would otherwise flash before the engine pages. */}
      {auth === "loading" ? (
        <div role="status" aria-label="Loading your pages" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : (
        <nav aria-label={onboarded ? "Main" : "Advisory steps"} className="eq-fade flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={pathname === item.href}
                     state={onboarded || !session ? undefined : steps[item.id]} />
          ))}
        </nav>
      )}

      <div className="my-6 h-px bg-zinc-200 tight:my-4 short:my-4" />
      <AdvisorLink active={pathname === ADVISOR.href} />

      <div className="mt-auto" />

      <div className="mt-6 border-t border-zinc-200 pt-5 tight:mt-4 short:mt-4 short:pt-4">
        <p className="mb-4 text-[11px] leading-relaxed text-zinc-400 short:mb-3">
          Prototype. Treat it as real, but no money moves and nothing here is financial advice.
        </p>
        <VerifyLink active={pathname === "/verify"} />
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {profile ? `Profile ${profile.c_level}` : "No profile yet"}
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">{date}</p>
      </div>

      <div className="mt-5 short:mt-3">
        <AccountLink active={pathname === "/account"} />
      </div>
    </>
  );

  return (
    <>
      <a href="#content"
         className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:border-2 focus:border-zinc-900 focus:bg-white focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:tracking-widest focus:text-zinc-900">
        Skip to the page content
      </a>
      {/* On a short screen the sidebar scrolls inside itself: the Account link at its foot must stay reachable, and what
          does not fit must never push the whole page (the pages are one screen tall) up by its overflow. */}
      <aside className="hidden w-[240px] shrink-0 flex-col overflow-y-auto border-r-2 border-zinc-900 px-8 py-10 tight:py-8 short:py-5 md:flex">{body}</aside>
      <MobileMenu>{body}</MobileMenu>
    </>
  );
}

/**
 * Below the md breakpoint there is no room for the sidebar: a small "Menu" button (floating, so no page has to
 * leave space for it) opens the same navigation as a drawer. It closes on a link, on the backdrop and on Escape.
 */
function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    items()[0]?.focus();                                    // keyboard and screen-reader users start inside the drawer
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); return; }
      if (event.key !== "Tab") return;
      const all = items();                                  // Tab stays inside the drawer while it is open
      if (!all.length) return;
      const head = all[0], tail = all[all.length - 1];
      if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="md:hidden">
      <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-menu"
              className="fixed right-3 top-3 z-40 border-2 border-zinc-900 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-900">
        Menu
      </button>
      {open && (
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation" className="fixed inset-0 z-50">
          <button type="button" tabIndex={-1} aria-label="Close the menu" onClick={close} className="absolute inset-0 bg-zinc-900/40" />
          <div ref={panel} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}
               className="relative flex h-full w-[280px] max-w-[85vw] flex-col overflow-y-auto border-r-2 border-zinc-900 bg-white px-8 py-10">
            <button type="button" onClick={close}
                    className="absolute right-3 top-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
              Close
            </button>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** The person's picture and name, always at the foot of the sidebar; a blank mark and "Sign in" for visitors. */
function AccountLink({ active }: { active: boolean }) {
  const profile = useProfile();
  const signedIn = profile.state === "in";
  return (
    <Link href="/account" aria-current={active ? "page" : undefined}
          className={`group flex items-center gap-3 border-2 p-2 transition-colors duration-300 ${
            active ? "pointer-events-none border-zinc-900 bg-zinc-900" : "border-zinc-200 hover:border-zinc-900"
          }`}>
      <Avatar value={signedIn ? profile.avatar : null} size={40}
              label={signedIn ? `${profile.username ?? "Your"} profile picture` : "Not signed in"}
              className={profile.state === "loading" ? "eq-skeleton" : ""} />
      <span className="min-w-0 flex-1">
        {profile.state === "loading" ? (
          <span role="status" aria-label="Checking your sign-in"><Skeleton className="my-0.5 h-4 w-24" /></span>
        ) : (
          <span className={`eq-fade block truncate text-sm font-semibold ${active ? "text-white" : "text-zinc-900"}`}>
            {signedIn ? (profile.name ?? profile.username ?? "Your account") : "Sign in"}
          </span>
        )}
        <span className={`block text-[10px] font-semibold uppercase tracking-widest ${active ? "text-zinc-300" : "text-zinc-400 group-hover:text-zinc-600"}`}>
          Account
        </span>
      </span>
    </Link>
  );
}

function AdvisorLink({ active }: { active: boolean }) {
  // The picture sits in the title row, so the line under it keeps the full width of the sidebar (beside the picture it wrapped into
  // seven short lines and pushed the account box below the fold of a 900 px screen).
  return (
    <Link
      href={ADVISOR.href}
      aria-current={active ? "page" : undefined}
      className={`eq-choice block border-l-4 px-4 py-3 ${
        active ? "pointer-events-none border-zinc-900 bg-zinc-900 text-white" : "border-zinc-900 text-zinc-900 hover:bg-zinc-50"
      }`}
      data-selected={active}
    >
      <span className="flex items-center gap-2.5">
        <AdvisorAvatar size={32} />
        <span className="block text-sm font-semibold">{ADVISOR.label}</span>
      </span>
      <span className={`mt-1.5 block text-[11px] leading-snug ${active ? "text-zinc-300" : "text-zinc-500"}`}>
        Questions about your profile, portfolio or money, any time.
      </span>
    </Link>
  );
}

/** "Verify a report": as visible as the sidebar's main items, with a small shield and one grey line. */
function VerifyLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/verify"
      aria-current={active ? "page" : undefined}
      className={`eq-choice mb-4 flex items-start gap-2 border-l-4 px-4 py-3 short:mb-3 short:py-2 ${
        active ? "pointer-events-none border-zinc-900 bg-zinc-900 text-white" : "border-zinc-900 text-zinc-900 hover:bg-zinc-50"
      }`}
      data-selected={active}
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <span>
        <span className="block text-sm font-semibold">Verify a report</span>
        <span className={`block text-[11px] leading-snug ${active ? "text-zinc-300" : "text-zinc-500"}`}>
          Check a sealed report on the blockchain
        </span>
      </span>
    </Link>
  );
}

function NavLink({ item, active, state }: { item: NavItem; active: boolean; state?: StepState }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 py-2 border-l-2 pl-3 text-sm font-medium transition-colors duration-300 ${
        active
          ? "border-zinc-900 text-zinc-900 pointer-events-none"
          : state === "current"
          ? "border-zinc-500 text-zinc-700 hover:border-zinc-900 hover:text-zinc-900"
          : "border-zinc-200 text-zinc-400 hover:border-zinc-500 hover:text-zinc-700"
      }`}
    >
      <span className="flex-1">{item.label}</span>
      {state === "done" && (
        <svg aria-label="done" viewBox="0 0 12 12" className="eq-tick h-3 w-3 text-zinc-900">
          <path d="M1.5 6.5 4.5 9.5 10.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      )}
      {state === "current" && !active && <span aria-label="next" className="h-1.5 w-1.5 bg-zinc-900" />}
    </Link>
  );
}
