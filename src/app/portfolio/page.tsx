"use client";

import Link from "next/link";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { AdvisorPanel } from "@/components/advisor-panel";
import { Busy, BuildStatus } from "@/components/build-status";
import { CategoryLine } from "@/components/category-line";
import { InterestAreas } from "@/components/interest-areas";
import { INTEREST_AREA_LIMIT } from "@/lib/build-timing";
import { useBriefingJob } from "@/components/use-briefing-job";
import { useFinalReport } from "@/components/use-final-report";
import { StepReminder } from "@/components/onboarding";
import { ReportSections } from "@/components/report-sections";
import { SealControl } from "@/components/seal-control";
import { Loader } from "@/components/ui/loader";
import { Sidebar } from "@/components/sidebar";
import { type AccountMe, currentAccount } from "@/lib/account-state";
import { markReportViewed } from "@/lib/anchoring";
import { basisOfProfile } from "@/lib/category";
import { getIbkr } from "@/lib/ibkr";
import { useFreshProfile } from "@/lib/risk-game";
import { useBuildRun } from "@/lib/use-build-run";
import { useProfile } from "@/lib/profile";
import {
  type Answers,
  type Interests,
  type PortfolioOptions,
  type PortfolioResult,
  type Profile,
  type Session,
  buildPortfolio,
  callApi,
  gameState,
  label,
  priceLine,
  useSession,
} from "@/lib/egoquant";

// Same visual language as the questionnaire (Umut's design): top bar, progress line, roman section
// headings, left-bordered option buttons, solid black actions. Nothing on this page scrolls: the form
// sits in two columns, and the result is split into section tabs (70%) beside the advisor (30%).

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const compact =
  "border-2 border-zinc-900 bg-zinc-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";
const quiet = "text-xs font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900";

export default function PortfolioPage() {
  const session = useSession();
  useFreshProfile(session);          // a profile scored before the game it now has is scored again
  const [editing, setEditing] = useState(false);
  const showResult = !!session?.result && !editing;

  return (
    <main className="flex min-h-screen bg-white md:h-screen md:overflow-hidden">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-zinc-900 py-4 pl-4 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">
            {showResult ? "Portfolio · Proposal" : "Portfolio · Your Preferences"}
          </h1>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Portfolio Construction
          </span>
        </div>
        <div className="h-0.5 shrink-0 bg-zinc-100">
          <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: showResult ? "100%" : "50%" }} />
        </div>
        {!showResult && session?.interests && <StepReminder step="portfolio" />}

        <div className="min-h-0 flex-1 md:overflow-hidden">
          {session === null ? (
            <Centered><Loader label="Loading your portfolio" /></Centered>
          ) : !session.answers || !session.profile ? (
            <NeedsProfile />
          ) : showResult && session.result ? (
            <ResultView session={session} result={session.result} amount={session.answers.amount_invested}
                        onEdit={() => setEditing(true)} />
          ) : !session.interests ? (
            <NeedsInterests />
          ) : (
            <IntakeForm session={session} answers={session.answers} profile={session.profile}
                        interests={session.interests} onDone={() => setEditing(false)}
                        onCancel={session.result ? () => setEditing(false) : undefined} />
          )}
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full max-w-2xl flex-col justify-center px-4 py-10 md:px-12">{children}</div>;
}

function NeedsProfile() {
  return (
    <Centered>
      <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">Complete your<br />profile first.</p>
      <div className="eq-rule my-8 h-px bg-zinc-300" />
      <p className="text-base leading-relaxed text-zinc-600 mb-10">
        Your portfolio is built inside the limits your suitability profile sets, so the profile must be on file first.
      </p>
      <Link href="/questionnaire" className={`self-start ${primary}`}>Start Risk Profile <span className="eq-arrow">→</span></Link>
    </Centered>
  );
}

function NeedsInterests() {
  return (
    <Centered>
      <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">Choose your<br />investments first.</p>
      <div className="eq-rule my-8 h-px bg-zinc-300" />
      <p className="text-base leading-relaxed text-zinc-600 mb-10">
        We fetch market data only for the kinds of investments you pick, so tell us what you would like to
        invest in before the portfolio is built.
      </p>
      <Link href="/interests" className={`self-start ${primary}`}>Choose Investments <span className="eq-arrow">→</span></Link>
    </Centered>
  );
}

function SectionHeading({ roman, title, note }: { roman: string; title: string; note?: string }) {
  return (
    <div className="mb-4">
      <p className="flex items-baseline gap-3">
        <span aria-hidden="true" className="font-heading text-4xl leading-none text-zinc-200">{roman}</span>
        <span className="font-heading text-2xl leading-tight text-zinc-900">{title}</span>
      </p>
      {note && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{note}</p>}
    </div>
  );
}

function percent(text: string): number | null {
  if (text.trim() === "") return 0;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

function IntakeForm({ session, answers, profile, interests, onDone, onCancel }: {
  session: Session; answers: Answers; profile: Profile; interests: Interests; onDone: () => void; onCancel?: () => void;
}) {
  const saved = session.intake;
  const [options, setOptions] = useState<PortfolioOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [horizon, setHorizon] = useState(saved ? String(saved.horizon_years) : "");
  // Agent A, the Risk Engine and the report all use max(liquidity_need, min_cash_buffer), so one field holds both.
  const [cash, setCash] = useState(saved ? String(Math.round(Math.max(saved.liquidity_need, saved.min_cash_buffer) * 100)) : "");
  const [editCash, setEditCash] = useState(false);
  const band = HORIZON_BANDS[answers.choices.B2 ?? ""];
  const [goalAmount, setGoalAmount] = useState(saved?.goal_amount ? String(saved.goal_amount) : "");
  const [monthly, setMonthly] = useState(saved?.monthly_flow ? String(Math.abs(saved.monthly_flow)) : "");
  const [withdraw, setWithdraw] = useState((saved?.monthly_flow ?? 0) < 0);
  const run = useBuildRun();
  const { pending, error, setError } = run;
  const [account, setAccount] = useState<AccountMe | null>(null);
  const holdsIbkr = getIbkr() !== null;

  useEffect(() => {
    let alive = true;
    currentAccount().then((me) => { if (alive) setAccount(me); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    callApi<PortfolioOptions>("/api/portfolio/options", { method: "GET", timeoutMs: 25_000 })
      .then((data) => { if (alive) setOptions(data); })
      .catch((cause: Error) => { if (alive) setLoadError(cause.message); });
    return () => { alive = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !options) return;
    const horizonYears = Number(horizon);
    const minCash = percent(cash);
    if (!Number.isFinite(horizonYears) || horizonYears <= 0 || horizonYears > 60)
      return setError("The investment horizon must be between 0 and 60 years.");
    if (minCash === null) return setError("The cash share must be a number from 0 to 100.");
    const goal = Number(goalAmount);
    const monthlyAmount = monthly.trim() === "" ? 0 : Number(monthly);
    if (!Number.isFinite(goal) || goal <= 0) return setError("Enter the amount you want to reach.");
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) return setError("The monthly amount cannot be negative.");

    setError("");
    run.start(async (signal) => {
      await buildPortfolio(answers, {
        preferences: interests.preferences, trading_platforms: interests.trading_platforms,
        horizon_years: horizonYears, liquidity_need: minCash, min_cash_buffer: minCash,
        goal_amount: goal, monthly_flow: withdraw ? -monthlyAmount : monthlyAmount,
      }, session.riskGame, "auto", signal);
      onDone();
    }, "Could not build the portfolio.");
  }

  if (loadError) return <Centered><p role="alert" className="text-sm text-red-600">{loadError}</p></Centered>;
  if (!options) return <Centered><Loader label="Loading the options" /></Centered>;

  return (
    <form onSubmit={submit} className="flex h-full flex-col px-4 pt-8 pb-6 md:px-12">
      <p className="mb-6 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Your risk category {profile.c_level} · products up to risk level R{profile.max_r_level}
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-16">
        <div className="eq-rise eq-scroll flex min-h-0 flex-col md:overflow-y-auto md:pr-2">
          <SectionHeading roman="I" title="Your investments"
                          note={`We fetch prices and news for these: up to ${INTEREST_AREA_LIMIT} areas, in a fixed order (broad areas first).`} />
          <div className="mb-8 border-l-4 border-zinc-900 pl-5">
            <p className="text-sm leading-relaxed text-zinc-900">
              {interests.summary.length ? interests.summary.join(" · ") : "Chosen on the previous step."}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {interests.trading_platforms.length
                ? `Trading on ${interests.trading_platforms
                    .map((id) => options.trading_platforms.find((p) => p.id === id)?.name ?? label(id)).join(", ")}`
                : "No trading platform given"}
              {" · "}
              <Link href="/interests" className="eq-tap font-semibold text-zinc-900 underline">Change</Link>
            </p>
            <InterestAreas answers={answers} platforms={interests.trading_platforms} preferences={interests.preferences} className="mt-3" />
          </div>

          <SectionHeading roman="II" title="Your situation" />
          <div className="flex flex-col gap-5">
            <div>
              <AmountField id="horizon" label="Your goal date: in how many years?" unit="years" value={horizon} onChange={setHorizon} />
              {/* B2 is a band, not a number of years, so it cannot fill this in; it is shown, and a clash is pointed out. */}
              {band && (
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-500">
                  {horizon.trim() !== "" && Number.isFinite(Number(horizon)) && (Number(horizon) < band.min || Number(horizon) > band.max)
                    ? <span className="text-zinc-900">Your profile says you start using this money in {band.text}; the goal date here is later or earlier. Your limits follow the profile.</span>
                    : <>Your profile says you start using this money in {band.text}. We need an exact number of years for the goal.</>}
                </p>
              )}
            </div>
            <CashLine value={cash} editing={editCash} onEdit={() => setEditCash(true)} onChange={setCash} />
          </div>
        </div>

        <div className="eq-rise eq-scroll flex min-h-0 flex-col md:overflow-y-auto md:pr-2" style={{ "--eq-d": "120ms" } as CSSProperties}>
          <SectionHeading roman="III" title="Your goal"
                          note={`You start with $${answers.amount_invested.toLocaleString("en-US")} (from your profile). The goal date is your investment horizon.`} />
          <div className="mb-8 flex flex-col gap-4">
            <AmountField id="goal" label="Amount you want to reach" unit="$" value={goalAmount} onChange={setGoalAmount} />
            <div className="grid grid-cols-2 gap-2">
              <OptionButton selected={!withdraw} onClick={() => setWithdraw(false)}>I will add money each month</OptionButton>
              <OptionButton selected={withdraw} onClick={() => setWithdraw(true)}>I will take money out each month</OptionButton>
            </div>
            <AmountField id="monthly" label={withdraw ? "Monthly withdrawal (optional)" : "Monthly contribution (optional)"}
                         unit="$ / month" value={monthly} onChange={setMonthly} />
          </div>

          <SectionHeading roman="IV" title="Risk Game" />
          <GameStatus profile={profile} session={session} />
        </div>
      </div>

      <div className="mt-8 flex shrink-0 flex-col items-stretch justify-between gap-4 border-t border-zinc-200 pt-5 md:mt-0 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 text-xs leading-relaxed">
          {error || pending ? (
            <BuildStatus run={run} />
          ) : (
            <>
              {options.data === "synthetic" && <p className="text-zinc-600">Demo mode: the server uses synthetic (invented) market data.</p>}
              {account && (
                <p className="text-zinc-600">
                  {holdsIbkr
                    ? "You added IBKR data in this tab, so this report is built without saving. To save reports, connect that data on your Account page."
                    : `Signed in as ${account.username ?? "you"}: this report is saved to your account for up to 180 days. Delete it any time under Account.`}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-8">
          {onCancel && !pending && (
            <button type="button" onClick={onCancel} className={quiet}>Back to the result</button>
          )}
          <button type="submit" disabled={pending} className={primary}>
            {pending ? <Busy label="Building" /> : <>Build Portfolio <span className="eq-arrow">→</span></>}
          </button>
        </div>
      </div>
    </form>
  );
}

// B2 "When will you need to start using this money?" (egoquant/risk_profile/questions.json): the bands in years.
const HORIZON_BANDS: Record<string, { text: string; min: number; max: number }> = {
  lt1: { text: "less than 1 year", min: 0, max: 1 },
  y1_3: { text: "1 to 3 years", min: 1, max: 3 },
  y3_5: { text: "3 to 5 years", min: 3, max: 5 },
  gt5: { text: "more than 5 years", min: 5, max: 60 },
};

/** Cash kept inside the portfolio: one line, already filled in, opened only to change it. Not taken from the profile:
 *  B3 (what you need back by the goal date) already sets your loss limit and B4 counts savings OUTSIDE this money. */
function CashLine({ value, editing, onEdit, onChange }: {
  value: string; editing: boolean; onEdit: () => void; onChange: (value: string) => void;
}) {
  if (editing) {
    return (
      <div>
        <AmountField id="cash" label="Cash to keep inside this portfolio (optional)" unit="%" value={value} onChange={onChange} />
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-500">
          For money you may need soon. Your emergency savings and the amount you need back are already in your profile.
        </p>
      </div>
    );
  }
  const share = Number(value);
  return (
    <p className="text-sm leading-relaxed text-zinc-600">
      Cash kept inside the portfolio:{" "}
      <span className="font-semibold text-zinc-900">
        {value.trim() === "" || share === 0 ? "no extra (0%)" : `at least ${share}%`}
      </span>
      {" · "}
      <button type="button" onClick={onEdit} className="eq-tap font-semibold text-zinc-900 underline">Change</button>
    </p>
  );
}

function GameStatus({ profile, session }: { profile: Profile; session: Session }) {
  const game = session.riskGame;
  return (
    <div className="border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-700">
      {game && (
        <p>
          Completed · attitude to risk {Math.round(game.tolerance)}/100 · loss acceptance {Math.round(game.lossAcceptance)}/100.
          It counts one third of your attitude to risk.
        </p>
      )}
      <CategoryLine basis={basisOfProfile(profile)} state={gameState(session)} className={game ? "mt-1" : ""} />
    </div>
  );
}

function OptionButton({
  selected, disabled = false, onClick, children,
}: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`eq-choice border-l-4 px-4 py-3 text-left text-sm leading-snug ${
        disabled
          ? "cursor-not-allowed border-zinc-100 bg-white text-zinc-400"
          : selected
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500 hover:text-zinc-900"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${selected ? "border-zinc-500" : "border-zinc-300"}`}>
          {selected && <span className="block h-2 w-2 bg-white" />}
        </span>
        <span className="flex-1">{children}</span>
      </span>
    </button>
  );
}

function AmountField({ id, label: text, unit, value, onChange }: {
  id: string; label: string; unit: string; value: string; onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm text-zinc-600">{text}</label>
      <div className="flex max-w-xs items-center gap-3 border-b-2 border-zinc-900 pb-1.5">
        <input id={id} type="number" inputMode="decimal" min={0} step="any" value={value}
               onChange={(event) => onChange(event.target.value)} placeholder="0"
               className="min-w-0 flex-1 bg-transparent text-xl font-medium text-zinc-900 outline-none placeholder:text-zinc-400" />
        <span className="shrink-0 font-medium text-zinc-400">{unit}</span>
      </div>
    </div>
  );
}

// ─── Result ─────────────────────────────────────────────────────────────────

/** "12 Oct" (the news period, shown beside the price date). */
function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Save the full report (the backend's self-contained, escaped HTML page) as a file the trader can keep or print.
 *  A saved report comes from the backend: the finished news and its Seal section (`job`: the finished briefing). */
async function downloadReport(result: PortfolioResult, job?: string) {
  if (result.report_id) {
    try {
      const query = job ? `?job=${encodeURIComponent(job)}` : "";
      const r = await fetch(`/api/account/reports/${encodeURIComponent(result.report_id)}/download${query}`, { cache: "no-store" });
      if (r.ok) {
        saveFile(await r.blob(), `egoquant-report-${result.as_of}.html`);
        return;
      }
    } catch {
      // the page the build returned, below
    }
  }
  saveFile(new Blob([result.html], { type: "text/html;charset=utf-8" }), `egoquant-report-${result.as_of}.html`);
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultView({ session, result, amount, onEdit }: {
  session: Session; result: PortfolioResult; amount: number; onEdit: () => void;
}) {
  // Agent D's full news briefing starts right away, in the background (the News tab shows its progress). When it
  // is done the report itself takes its final briefing (download, report tabs, What changed, Advisor).
  const briefingJob = useBriefingJob(result.briefing_context);
  const { state: finalReport, saved: savedBriefing, retrySave } = useFinalReport(result, briefingJob);
  const profile = useProfile();
  const signedIn = profile.state === "in";
  useEffect(() => { if (result.report_id && signedIn) void markReportViewed(result.report_id); }, [result.report_id, signedIn]);   // logs "report viewed" once, only when sealing is on
  const [wantDownload, setWantDownload] = useState(false);
  const [sealed, setSealed] = useState(false);                 // the plain download is then labelled "not sealed"
  useEffect(() => {
    if (wantDownload && finalReport !== "waiting") {
      void downloadReport(result, briefingJob.id);   // the final version (or, if the rating failed, the first one)
      setWantDownload(false);             // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [wantDownload, finalReport, result, briefingJob.id]);
  const news = result.report.market_briefing;

  return (
    <div className="grid min-h-0 grid-cols-1 md:h-full md:grid-cols-[7fr_3fr]">
      <section className="flex min-h-0 min-w-0 flex-col px-4 pt-7 pb-5 md:px-10 [@media(max-height:800px)]:pt-4 [@media(max-height:800px)]:pb-3">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <div className="eq-rise flex items-baseline gap-3">
              <p className={`font-heading text-5xl leading-none [@media(max-height:800px)]:text-4xl ${result.approved ? "text-zinc-900" : "text-red-700"}`}>
                {result.approved ? "Approved" : "Rejected"}
              </p>
              <p className="font-heading text-xl text-zinc-400">{result.c_level}</p>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500 [@media(max-height:800px)]:mt-1 [@media(max-height:800px)]:line-clamp-1">
              {result.approved
                ? "The independent risk check approved this portfolio."
                : "The independent risk check rejected this portfolio: it must not be offered."}{" "}
              {priceLine(result)}
              {news && ` · news ${shortDay(news.period_start)}–${shortDay(news.period_end)}`}
            </p>
            <CategoryLine basis={session.profile ? basisOfProfile(session.profile) : null} state={gameState(session)} className="mt-1" />
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3">
            {result.html && (
              <button type="button" className={quiet} aria-busy={wantDownload}
                      title={sealed ? "The report without its seal. To prove it was not changed, use Download sealed report." : undefined}
                      onClick={() => (finalReport === "waiting" ? setWantDownload(true) : void downloadReport(result, briefingJob.id))}>
                {wantDownload
                  ? <Busy label={briefingJob.total > 0 ? `Rating news ${briefingJob.rated} of ${briefingJob.total}` : "Rating news"} />
                  : sealed ? "Download report (not sealed)" : "Download report"}
              </button>
            )}
            <SealControl key={result.report_id ?? "unsaved"} reportId={result.report_id} approved={result.approved}
                         signedIn={signedIn} onRetrySave={retrySave} onSealed={setSealed}
                         ready={savedBriefing === "saved" ? { phase: "final", saved: true, rated: 0, total: 0 }
                           : savedBriefing === "unsaved" ? { phase: "final", saved: false, rated: 0, total: 0 }
                           : savedBriefing === "waiting" ? { phase: "rating", saved: false, rated: briefingJob.rated, total: briefingJob.total }
                           : { phase: "failed", saved: false, rated: 0, total: 0,
                               reason: "The news rating could not be finished, so this plan cannot be sealed yet." }} />
            <Link href="/interests" className={quiet}>Investments</Link>
            <button type="button" onClick={onEdit} className={quiet}>Situation</button>
            <Link href="/review" className={compact}>Review checks <span className="eq-arrow">→</span></Link>
          </div>
        </div>

        <ReportSections result={result} amount={amount} job={briefingJob} session={session} live />
      </section>

      <AdvisorPanel session={session} result={result} />
    </div>
  );
}
