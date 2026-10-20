"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildStatus } from "@/components/build-status";
import { CategoryLine } from "@/components/category-line";
import { EmailConfirmedNote, useConfirmLink } from "@/components/email-confirmed";
import { GameInvite } from "@/components/game-invite";
import { PlayAlongAgreement, useFlag } from "@/components/onboarding";
import { Sidebar } from "@/components/sidebar";
import { Loader, PageLoader } from "@/components/ui/loader";
import { AccountsOff } from "@/components/welcome/accounts-off";
import { SignedOut } from "@/components/welcome/signed-out";
import { askHref } from "@/lib/ask";
import { basisOfProfile } from "@/lib/category";
import { useBuildRun } from "@/lib/use-build-run";
import { firstName, useProfile } from "@/lib/profile";
import {
  type Session,
  buildPortfolio,
  gameState,
  pct,
  priceLine,
  resetSession,
  useSession,
} from "@/lib/egoquant";

// Home. First visit: the sign-up steps (components/welcome; the answers are kept in the account), then onboarding
// (profile -> investments -> risk game -> first portfolio). After that: the engine,
// a dashboard of the saved profile and portfolio with the actions a returning user needs.
// The conversational advisor that used to live here is now at /advisor (src/app/advisor/page.tsx).

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const secondary = "text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const delay = (ms: number) => ({ "--eq-d": `${ms}ms` }) as CSSProperties;
const C_NAMES: Record<string, string> = { C1: "Conservative", C2: "Cautious", C3: "Balanced", C4: "Active", C5: "Aggressive" };

export default function Home() {
  const account = useProfile();
  const saved = useSession();
  const link = useConfirmLink();
  // Until the sign-in check (and the sync with the account's copy) is done, the saved session may be stale.
  // Signed out, there is none: onboarding starts with the account.
  const session = account.state === "in" ? saved : null;
  const onboarded = !!session?.profile && !!session?.result;
  const name = firstName(account);

  // Opened by the confirmation link: it signs the person in and goes on to the questionnaire. Nothing else shows
  // meanwhile, so the sign-up screens never flash.
  if (link === "working") return <PageLoader label="Confirming your email and signing you in" />;

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">
            {onboarded ? "Home · Overview" : account.state === "out" ? "Welcome · Your account" : "Welcome"}
          </h1>
          <span className="hidden text-xs font-medium uppercase tracking-widest text-zinc-400 sm:inline">
            {onboarded ? "Wealth Advisory Engine" : "Onboarding"}
          </span>
        </div>
        {account.state !== "out" && <div className="h-0.5 shrink-0 bg-zinc-100" />}
        <EmailConfirmedNote link={link} />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">
          {account.state === "loading" ? (
            <Centered><Loader label="Loading your profile" /></Centered>
          ) : account.state === "off" ? (
            <AccountsOff message={account.message} />
          ) : account.state === "out" ? (
            <SignedOut initial="signup" />
          ) : !session?.profile ? (
            <Welcome name={name} />
          ) : !session.result ? (
            <FinishSetup session={session} name={name} />
          ) : (
            <Dashboard session={session} />
          )}
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col justify-center px-6 py-8 max-w-2xl md:px-12 md:py-10">{children}</div>;
}

const STEPS = [
  { roman: "I", title: "Risk Profile", text: "A validated questionnaire on your attitude to risk, your finances and your experience." },
  { roman: "II", title: "Risk Game", text: "A short game that shows how you actually choose when money is at stake." },
  { roman: "III", title: "Investments", text: "Pick the kinds of investments you want; we fetch market data for those." },
  { roman: "IV", title: "Portfolio", text: "Built by deterministic code inside the limits your profile sets." },
  { roman: "V", title: "Review", text: "An independent risk check re-verifies the portfolio before it is offered." },
];

// Signed in, no risk profile yet (a returning user; a new one goes straight from sign-up to the questionnaire).
function Welcome({ name }: { name: string | null }) {
  const [agreed, agree] = useFlag("agreed");
  // The agreement is asked only if it was not given in this browser before (it is never shown already ticked).
  const [ask, setAsk] = useState<boolean | null>(null);
  if (ask === null && agreed !== null) setAsk(!agreed);
  const ready = agreed === true;
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-8 md:h-full md:grid-cols-2 md:gap-16 md:px-12 md:py-10 short:md:py-6">
      <div className="flex min-h-0 flex-col justify-center">
        <p className="eq-rise font-heading text-4xl leading-[1.1] text-zinc-900 md:text-5xl">
          {name ? <>Welcome back,<br />{name}.</> : <>Begin your advisory<br />session.</>}
        </p>
        <div className="eq-rule my-6 h-px bg-zinc-300 short:my-4" />
        <p className="eq-rise mb-6 text-base leading-relaxed text-zinc-600 short:mb-4" style={delay(120)}>
          Next is your risk profile. EgoQuant then designs a portfolio inside its limits and checks it independently.
          About ten minutes, once. Your answers are kept as you go, and your profile is saved in your account when you finish it.
        </p>
        <div className="hidden flex-col gap-1.5 sm:flex">
          {STEPS.map((step, i) => (
            <div key={step.roman} style={delay(160 + i * 50)}
                 className="eq-rise flex items-baseline gap-5 border-l-4 border-zinc-200 px-5 py-2.5 short:py-1.5">
              <span aria-hidden="true" className="w-8 shrink-0 font-heading text-2xl text-zinc-300">{step.roman}</span>
              <span>
                <span className="block text-sm font-semibold text-zinc-900">{step.title}</span>
                <span className="block text-xs text-zinc-500">{step.text}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col justify-center">
        {ask && agreed !== null && <PlayAlongAgreement agreed={agreed} onAgree={agree} />}
        <div className="eq-rise flex flex-wrap items-center gap-x-8 gap-y-4" style={delay(360)}>
          {ready ? (
            <Link href="/questionnaire" autoFocus className={primary}>Start Risk Profile <span className="eq-arrow">→</span></Link>
          ) : (
            <button type="button" disabled className={primary} title="Tick the box above to start">
              Start Risk Profile <span className="eq-arrow">→</span>
            </button>
          )}
          <Link href={askHref("How does EgoQuant build a portfolio for me?")} className="text-sm text-zinc-500 hover:text-zinc-900">
            Questions first? <span className="font-semibold text-zinc-900 underline">Ask the Advisor</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function FinishSetup({ session, name }: { session: Session; name: string | null }) {
  const profile = session.profile!;
  const needsGame = gameState(session) === "none";        // the game comes first: it is part of the category
  const needsInterests = !session.interests;
  return (
    <Centered>
      <p className="eq-rise font-heading text-4xl leading-[1.1] text-zinc-900 md:text-5xl">Almost there{name ? `, ${name}` : ""}.</p>
      <div className="eq-rule my-8 h-px bg-zinc-300" />
      <p className={`${needsGame ? "mb-4" : "mb-10"} text-base leading-relaxed text-zinc-600`}>
        Your risk profile is on file: <span className="font-semibold text-zinc-900">{profile.c_level}</span>{" "}
        ({C_NAMES[profile.c_level]}).{" "}
        {needsGame
          ? "Next, the Risk Game."
          : needsInterests
          ? "Next, choose the kinds of investments you would like us to consider."
          : "Next, build your first portfolio."}
      </p>
      <div className="flex flex-wrap items-center gap-6">
        {needsGame ? (
          <GameInvite onSkipped={() => undefined} />
        ) : needsInterests ? (
          <Link href="/interests" className={primary}>Choose Investments <span className="eq-arrow">→</span></Link>
        ) : (
          <Link href="/portfolio" className={primary}>Build Portfolio <span className="eq-arrow">→</span></Link>
        )}
      </div>
    </Centered>
  );
}

function Dashboard({ session }: { session: Session }) {
  const router = useRouter();
  const profile = session.profile!;
  const result = session.result!;
  const r = result.report;
  const run = useBuildRun();
  const { pending } = run;
  const [confirmReset, setConfirmReset] = useState(false);

  const gameNewer = !!session.riskGame && !!session.builtAt &&
    session.riskGame.completedAt > session.builtAt;

  function rebuild() {
    const { answers, intake } = session;
    if (pending || !answers || !intake) return;
    run.start((signal) => buildPortfolio(answers, intake, session.riskGame, "auto", signal).then(() => undefined),
              "Could not rebuild the portfolio.");
  }

  function retake() {
    resetSession();
    router.push("/questionnaire");
  }

  return (
    <div className="grid grid-cols-1 gap-8 px-6 pt-6 pb-8 md:h-full md:grid-cols-[3fr_2fr] md:gap-14 md:px-12 md:pt-8 md:pb-6 short:md:pt-4 short:md:pb-3">
      <div className="flex min-h-0 flex-col">
        <div className="eq-rise flex items-baseline gap-4 mb-2">
          <p className="font-heading text-7xl leading-none text-zinc-900 short:text-5xl">{profile.c_level}</p>
          <p className="font-heading text-2xl text-zinc-400">{C_NAMES[profile.c_level]}</p>
        </div>
        <p className="eq-rise text-sm text-zinc-500" style={delay(80)}>
          Stocks up to {pct(profile.suitability_max_equity)} · product risk level up to R{profile.max_r_level} · goal-based loss
          capacity {pct(profile.loss_capacity)}
        </p>
        <CategoryLine basis={basisOfProfile(profile)} state={gameState(session)} className="eq-rise mt-1" />

        <div className="eq-rule my-6 h-px shrink-0 bg-zinc-300 short:my-3" />

        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Current Portfolio</p>
        <div className="eq-rise mb-5 grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4 short:mb-3" style={delay(200)}>
          <Card label="Risk Check" value={result.approved ? "Approved" : "Rejected"}
                note={`Re-checked against your ${result.c_level} (${C_NAMES[result.c_level] ?? "profile"}) limits`} />
          <Card label="In Stocks" value={pct(r.equity_weight)} note="Share of the portfolio" />
          {result.goal
            ? <Card label="Goal Chance" value={r.goal?.chance ?? pct(result.goal.chosen.prob_goal)} note={`$${Math.round(result.goal.spec.goal_amount).toLocaleString("en-US")} in ${result.goal.spec.horizon_years} yrs`} />
            : <Card label="Volatility" value={pct(r.ex_ante_vol, 1)} note="Typical yearly swing" />}
          <Card label="Worst Case" value={pct(r.worst_loss)} note="Hypothetical scenario" />
        </div>
        <p className="mb-3 line-clamp-3 border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-900">{r.headline}</p>
        <p className="text-xs text-zinc-400">
          {priceLine(result)}
          {session.builtAt && ` · built ${new Date(session.builtAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}
          {" · a prototype proposal, not financial advice"}
        </p>

        <div className="mt-8 short:mt-4">
          {gameNewer && (
            <p className="mb-4 border-l-4 border-zinc-900 pl-5 text-sm text-zinc-700">
              You played the Risk Game after this portfolio was built. Rebuild it to take the game into account.
            </p>
          )}
          <BuildStatus run={run} className="mb-3 text-xs" />
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/portfolio" className={primary}>Open Portfolio <span className="eq-arrow">→</span></Link>
            <button type="button" onClick={rebuild} disabled={pending || !session.intake} className={secondary}>
              {pending ? "Rebuilding…" : "Rebuild With Today's Prices"}
            </button>
            <Link href="/review" className={secondary}>Review Checks</Link>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="eq-rise mb-6 shrink-0 border-2 border-zinc-900 p-5 short:mb-3 short:p-4" style={delay(280)}>
          <p className="font-heading text-3xl leading-tight text-zinc-900">Ask the Advisor</p>
          <p className="mt-1 mb-4 text-sm leading-relaxed text-zinc-600 short:mb-2">
            It knows your profile and this portfolio, and answers in plain language.
          </p>
          <div className="mb-4 flex flex-col gap-1.5 short:mb-2 short:gap-1">
            {[
              `What does ${profile.c_level} mean for me?`,
              "Why is my portfolio built this way?",
              result.approved ? "What could make this portfolio lose money?" : "Why was my portfolio not approved?",
            ].map((q) => (
              <Link key={q} href={askHref(q)}
                    className="border-l-4 border-zinc-200 px-4 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900">
                {q}
              </Link>
            ))}
          </div>
          <Link href="/advisor" className="text-xs font-semibold uppercase tracking-widest text-zinc-900 hover:text-zinc-500">
            Open the Advisor <span className="eq-arrow">→</span>
          </Link>
        </div>

        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">More</p>
        <div className="flex flex-col gap-2">
          <Row href="/interests" title="Investments"
               text={session.interests?.summary.length
                 ? `${session.interests.summary.join(" · ")}. Change them any time; the portfolio is then rebuilt.`
                 : "Choose the kinds of investments we fetch market data for."} />
          <Row href="/game" title="Risk Game"
               text={session.riskGame
                 ? `Played · attitude to risk ${Math.round(session.riskGame.tolerance)}/100. It counts one third of your attitude to risk. Play again any time.`
                 : session.gameSkipped
                 ? "Skipped, so your category rests on the questionnaire alone. You can still play it (about 2 minutes)."
                 : session.profile?.no_loss_gate
                 ? "Not played yet. You said you could not accept any loss, so your category stays C1 whatever the game shows."
                 : "Not played yet. It counts one third of your attitude to risk and takes about 2 minutes."} />
          {confirmReset ? (
            <div className="border-l-4 border-red-600 px-5 py-3">
              <p className="text-sm text-zinc-900">Retaking the profile clears your current profile, portfolio and game result.</p>
              <div className="mt-2 flex gap-6">
                <button type="button" onClick={retake} className="text-sm font-semibold uppercase tracking-widest text-red-700 hover:text-red-900">
                  Clear and Retake
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className={secondary}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)}
                    className="border-l-4 border-zinc-200 px-5 py-3 text-left transition-colors hover:border-zinc-500">
              <span className="block text-sm font-semibold text-zinc-900">Retake Risk Profile</span>
              <span className="block text-xs text-zinc-500">If your situation or goals have changed.</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="border-l-4 border-zinc-200 px-5 py-3 short:py-2 transition-colors hover:border-zinc-500">
      <span className="block text-sm font-semibold text-zinc-900">{title} <span className="eq-arrow">→</span></span>
      <span className="line-clamp-2 block text-xs text-zinc-500">{text}</span>
    </Link>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-2 border-zinc-200 p-4 short:p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className={`mb-1 font-heading leading-none text-zinc-900 ${value.length > 6 ? "text-xl" : "text-3xl"}`}>{value}</p>
      <p className="text-xs text-zinc-400">{note}</p>
    </div>
  );
}
