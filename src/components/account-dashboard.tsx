"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountReports } from "@/components/account-reports";
import { AccountTrades } from "@/components/account-trades";
import { MySeals } from "@/components/my-seals";
import { Avatar, AvatarPicker, DEFAULT_AVATAR } from "@/components/avatar";
import { Busy } from "@/components/build-status";
import { Loader } from "@/components/ui/loader";
import { Pager } from "@/components/ui/pager";
import { api, detail, when } from "@/lib/account-api";
import { CONSENT, SCOPES, type Scope } from "@/lib/consent";
import { clearLocal, useSession } from "@/lib/egoquant";
import { saveAvatar, signedOut } from "@/lib/profile";

// The signed-in account page: who you are on one line, then one section at a time (reports, IBKR data, agreements,
// activity, delete) so nothing needs a long scroll. The open section is kept in the address (#reports), so a link
// from elsewhere opens the right one and a reload stays on it.

export type Me = {
  username: string | null;
  name?: string | null;
  avatar?: string | null;
  consents: Record<Scope, boolean>;
  consent_version: string;
  n_trades: number;
  n_reports: number;
};
type LogRow = { at: string; action: string; details: Record<string, unknown> };
type Section = "reports" | "data" | "agreements" | "activity" | "delete";

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const secondary =
  "border-2 border-zinc-900 bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-default disabled:opacity-50";
const danger =
  "border-2 border-red-700 bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-default disabled:opacity-50";
const field =
  "w-full border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900";
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

const ACTIONS: Record<string, string> = {
  consent_given: "You agreed to data use",
  data_connected: "IBKR data connected",
  data_deleted: "Data deleted",
  report_generated: "Report saved",
  trade_checked: "Trade checked",
  warning_shown: "Warning shown",
  trade_recorded: "Trade recorded by you",
  decision_recorded: "Decision recorded",
  questionnaire_submitted: "Questionnaire answers used for a report",
  report_viewed: "Report opened",
  plan_confirmed: "Plan confirmed",
  seal_pending: "Seal requested",
  record_sealed: "Record sealed on-chain",
};
const LOG_PAGE = 12;

const SECTIONS: { id: Section; title: string }[] = [
  { id: "reports", title: "Reports" },
  { id: "data", title: "Past trades (optional)" },
  { id: "agreements", title: "Agreements" },
  { id: "activity", title: "Activity" },
  { id: "delete", title: "Delete" },
];

function initialSection(): Section {
  const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return SECTIONS.some((s) => s.id === hash) ? (hash as Section) : "reports";
}

export function AccountDashboard({ me, reload, onGone, onNotice }: {
  me: Me; reload: () => Promise<void>; onGone: (message: string) => void; onNotice: (text: string) => void;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [picking, setPicking] = useState(false);
  const [picture, setPicture] = useState(me.avatar ?? DEFAULT_AVATAR);
  const session = useSession();

  function open(next: Section) {
    setSection(next);
    setError("");
    try { window.history.replaceState(null, "", `#${next}`); } catch { /* the address is a convenience only */ }
  }

  async function run(key: string, work: () => Promise<{ status: number; data: Record<string, unknown> }>, done: (data: Record<string, unknown>) => void | Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError("");
    const { status, data } = await work();
    setBusy("");
    if (status >= 200 && status < 300) await done(data);
    else if (status === 401) onGone("You were signed out. Please log in again.");
    else setError(detail(data, "Something went wrong. Please retry."));
  }

  async function savePicture() {
    if (busy) return;
    setBusy("avatar");
    setError("");
    const result = await saveAvatar(picture);
    setBusy("");
    if (result.ok) {
      setPicking(false);
      await reload();
    } else {
      setError(result.message ?? "The picture could not be saved.");
    }
  }

  const logout = () =>
    run("logout", () => api("/api/auth/logout", { method: "POST" }), () => { signedOut(); onGone("You are logged out."); });

  const missing = SCOPES.filter((scope) => !me.consents[scope]).length;
  const counts: Partial<Record<Section, string>> = {
    reports: me.n_reports ? String(me.n_reports) : "",
    data: me.n_trades ? String(me.n_trades) : "",
    agreements: missing ? `${missing} open` : "✓",
  };

  return (
    <div className="flex max-w-6xl flex-col md:h-full md:min-h-0">
      {/* Who: picture, name, counts and log out, on one line. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking}
                title="Change your picture" className="group relative shrink-0">
          <Avatar value={me.avatar} size={56} label="Your profile picture" />
          <span className="absolute inset-x-0 bottom-0 bg-zinc-900/80 py-0.5 text-center text-[8px] font-semibold uppercase tracking-widest text-white opacity-0 transition-opacity group-hover:opacity-100">
            Change
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className={label}>Signed in as</p>
          <p className="truncate font-heading text-3xl leading-tight text-zinc-900">{me.name || me.username || "your account"}</p>
          {me.name && me.username && <p className="truncate text-xs text-zinc-400">@{me.username}</p>}
        </div>
        <button type="button" onClick={logout} disabled={!!busy} className={secondary}>
          {busy === "logout" ? <Busy label="Logging out" /> : "Log out"}
        </button>
      </div>
      {picking && (
        <div className="eq-enter mt-4 shrink-0 border-2 border-zinc-200 p-4">
          <AvatarPicker value={picture} onChange={setPicture} />
          <div className="mt-3 flex items-center gap-4">
            <button type="button" onClick={savePicture} disabled={!!busy} className={primary}>
              {busy === "avatar" ? <Busy label="Saving" /> : "Save picture"}
            </button>
            <button type="button" onClick={() => { setPicking(false); setPicture(me.avatar ?? DEFAULT_AVATAR); }}
                    className="text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      {session && !session.profile && (
        <div className="eq-rise mt-5 flex shrink-0 flex-wrap items-center justify-between gap-4 border-2 border-zinc-900 p-4">
          <div>
            <p className="font-heading text-xl text-zinc-900">Next: your risk profile</p>
            <p className="mt-0.5 text-sm text-zinc-600">About ten minutes. Your answers are kept as you go, and your profile is saved in this account when you finish it.</p>
          </div>
          <Link href="/" className={primary}>Start <span className="eq-arrow">→</span></Link>
        </div>
      )}

      <div role="tablist" aria-label="Account sections" className="mt-6 flex shrink-0 gap-1 overflow-x-auto border-b-2 border-zinc-900">
        {SECTIONS.map((s) => {
          const active = s.id === section;
          return (
            <button key={s.id} type="button" role="tab" id={`tab-${s.id}`} aria-selected={active} aria-controls={`panel-${s.id}`}
                    onClick={() => open(s.id)}
                    className={`-mb-0.5 shrink-0 border-2 border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                      active ? "border-zinc-900 bg-zinc-900 text-white" : "border-transparent text-zinc-500 hover:text-zinc-900"
                    } ${s.id === "delete" && !active ? "hover:text-red-700" : ""}`}>
              {s.title}
              {counts[s.id] && (
                <span className={`ml-2 text-[10px] ${active ? "text-zinc-300" : s.id === "agreements" && missing ? "text-red-600" : "text-zinc-400"}`}>
                  {counts[s.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-3 shrink-0 text-sm text-red-600">{error}</p>}

      <div key={section} role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`}
           className="eq-fade min-h-0 flex-1 pt-6 md:overflow-y-auto">
        {section === "reports" && <><AccountReports onChanged={reload} onGone={onGone} /><MySeals /></>}
        {section === "data" && (
          <>
            <IbkrIntro />
            <AccountTrades consented={me.consents.ibkr_data} onChanged={reload} onGone={onGone}
                           onAgree={() => open("agreements")} />
          </>
        )}
        {section === "agreements" && <Agreements me={me} busy={busy} run={run} reload={reload} onNotice={onNotice} />}
        {section === "activity" && <Activity onGone={onGone} />}
        {section === "delete" && <Delete me={me} busy={busy} run={run} reload={reload} onGone={onGone} onNotice={onNotice} />}
      </div>
    </div>
  );
}

type Run = (key: string, work: () => Promise<{ status: number; data: Record<string, unknown> }>,
            done: (data: Record<string, unknown>) => void | Promise<void>) => Promise<void>;

function Agreements({ me, busy, run, reload, onNotice }: {
  me: Me; busy: string; run: Run; reload: () => Promise<void>; onNotice: (text: string) => void;
}) {
  const agree = (scope: Scope) =>
    run(`consent-${scope}`,
      () => api("/api/account/consent", { method: "POST", body: JSON.stringify({ scope, version: me.consent_version }) }),
      async () => { onNotice(""); await reload(); });

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SCOPES.map((scope) => (
          <div key={scope} className={`flex flex-col border-2 p-5 ${me.consents[scope] ? "border-zinc-200" : "border-zinc-900"}`}>
            <p className="text-sm font-semibold text-zinc-900">{CONSENT[scope].title}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{CONSENT[scope].text}</p>
            {me.consents[scope] ? (
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-900"><span className="eq-tick inline-block">You agreed ✓</span></p>
            ) : (
              <button type="button" onClick={() => agree(scope)} disabled={!!busy} className={`mt-4 self-start ${primary}`}>
                {busy === `consent-${scope}` ? <Busy label="Saving" /> : "I agree"}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-zinc-400">
        Trading data and trade checks are stored only after you agree. Without an agreement the app works as before,
        without saving them. To withdraw an agreement, delete your data in the Delete section.
      </p>
    </div>
  );
}

function Activity({ onGone }: { onGone: (message: string) => void }) {
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    api("/api/account/log").then(({ status, data }) => {
      if (!alive) return;
      if (status === 200 && Array.isArray(data.log)) setLog(data.log as LogRow[]);
      else if (status === 401) onGone("You were signed out. Please log in again.");
      else setError(detail(data, "Could not load the activity log."));
    });
    return () => { alive = false; };
  }, [onGone]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (log === null) return <Loader label="Loading what we did with your data" />;
  if (log.length === 0) return <p className="text-sm text-zinc-500">Nothing yet. Every use of your data will be listed here.</p>;

  const pages = Math.ceil(log.length / LOG_PAGE);
  const shown = log.slice(page * LOG_PAGE, (page + 1) * LOG_PAGE);
  return (
    <div>
      <p className={label}>What we did with your data</p>
      <ul className="mt-3 flex flex-col gap-1 border-l-4 border-zinc-200 pl-4">
        {shown.map((row, i) => (
          <li key={`${row.at}-${i}`} className="text-sm text-zinc-700">
            {ACTIONS[row.action] ?? row.action}
            <span className="ml-2 text-xs text-zinc-400">{when(row.at)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 && <Pager page={page} pages={pages} onPage={setPage} />}
    </div>
  );
}

function Delete({ me, busy, run, reload, onGone, onNotice }: {
  me: Me; busy: string; run: Run; reload: () => Promise<void>; onGone: (message: string) => void; onNotice: (text: string) => void;
}) {
  const [confirmData, setConfirmData] = useState(false);
  const [typed, setTyped] = useState("");

  const eraseData = () =>
    run("data", () => api("/api/account/data", { method: "DELETE" }), async () => {
      clearLocal();                        // the answers in this browser go too
      setConfirmData(false);
      onNotice("All the data stored in your account was deleted. Your sign-in and username are still here.");
      await reload();
    });

  const eraseAccount = () =>
    run("account", () => api("/api/account", { method: "DELETE" }), () => {
      signedOut();
      onGone("Your account and everything stored in it were deleted.");
    });

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="flex flex-col border-2 border-red-200 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-red-700">Delete my data</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">Erases, for good:</p>
        <ul className="mt-1 flex-1 list-disc pl-5 text-sm leading-relaxed text-zinc-600">
          <li>your questionnaire answers, risk profile and Risk Game result</li>
          <li>your IBKR trades and cash flows</li>
          <li>your saved reports and trade checks</li>
          <li>your what-if history, and the record of what was hidden from the AI in it</li>
          <li>your confirmed plans and their seals (the on-chain fingerprint itself cannot be removed, but it reveals nothing without your data)</li>
          <li>your profile picture, your agreements and the activity log</li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Your sign-in and username stay. This cannot be undone.</p>
        {confirmData ? (
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={eraseData} disabled={!!busy} className={danger}>
              {busy === "data" ? <Busy label="Deleting" /> : "Yes, delete my data"}
            </button>
            <button type="button" onClick={() => setConfirmData(false)} className="text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmData(true)} disabled={!!busy} className={`mt-4 self-start ${danger}`}>Delete my data</button>
        )}
      </div>

      <div className="flex flex-col border-2 border-red-200 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-red-700">Delete my account</p>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">
          Erases the account itself and everything listed on the left. You will be signed out. This cannot be undone.
        </p>
        <label className={`${label} mt-4`}>
          Type your username{me.username ? ` (${me.username})` : ""} to confirm
          <input type="text" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && me.username && typed.trim().toLowerCase() === me.username) void eraseAccount(); }}
                 className={`${field} mt-1`} />
        </label>
        <button type="button" onClick={eraseAccount} disabled={!!busy || !me.username || typed.trim().toLowerCase() !== me.username}
                className={`mt-3 self-start ${danger}`}>
          {busy === "account" ? <Busy label="Deleting" /> : "Delete my account"}
        </button>
      </div>
    </div>
  );
}

/** What the IBKR part is, in plain words, before anything else on that tab. */
function IbkrIntro() {
  return (
    <div className="mb-6 max-w-2xl space-y-3">
      <p className="font-heading text-2xl leading-tight text-zinc-900">Optional: learn from your past trades (Interactive Brokers)</p>
      <p className="text-sm leading-relaxed text-zinc-700">
        Interactive Brokers (IBKR) is an online broker. If you trade there, EgoQuant can read your past trades, only to see how
        you reacted when markets fell. That can only make your limits stricter, never looser. EgoQuant never trades and never
        asks for or stores your IBKR login.
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-sm text-zinc-700 md:grid-cols-[max-content_1fr]">
        <dt className="font-semibold text-zinc-900">Flex report</dt>
        <dd>a trade-history file you export from IBKR (Reports → Flex Queries) and upload here.</dd>
        <dt className="font-semibold text-zinc-900">Flex token</dt>
        <dd>a one-time code from IBKR that lets EgoQuant fetch the same history once. It is used once and never stored.</dd>
        <dt className="font-semibold text-zinc-900">Import into my account</dt>
        <dd>saves the trade lines (date, fund, buy or sell, quantity, price) for up to 180 days, so your next portfolio uses them.</dd>
      </dl>
    </div>
  );
}
