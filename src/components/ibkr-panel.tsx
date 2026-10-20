"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { api, detail } from "@/lib/account-api";
import { IBKR_MAX_BYTES, type IbkrInput, getIbkr, setIbkr } from "@/lib/ibkr";
import { IBKR_EXAMPLES, type IbkrExample } from "@/lib/ibkr-examples";

// Optional step of the Investments flow: let Agent B read the investor's real trading history from
// Interactive Brokers, either from a Flex report they download and upload, or by a Flex token that the
// backend uses once. We never see an IBKR password. What is entered here lives in memory only (lib/ibkr.ts):
// it is not written to localStorage or the saved session, and a Flex token is dropped after the request.
// Before a portfolio or a trade check, the backend reads the file (or fetches it with the token) and says what is in
// it (/api/portfolio/ibkr-check), so a bad file or an expired token is caught here, not minutes later at the build.
// Only an input that passed the check is handed on. The account page imports straight away, so it skips the check;
// it never reads or writes the shared input (lib/ibkr.ts), so an unchecked token typed there cannot reach a build.

type Tab = "upload" | "token";
type Summary = { n_trades: number; start: string; end: string; currency: string; notes: string[] };
type Check = { state: "idle" } | { state: "checking" } | { state: "ok"; summary: Summary } | { state: "failed"; message: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "upload", label: "Upload Flex report" },
  { id: "token", label: "Connect with a Flex token" },
];

const field =
  "w-full border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900";

const HOW_TO = [
  "In IBKR Client Portal open Performance & Reports → Flex Queries and create a trades Flex Query. Include the Trades section (and Cash Transactions if you like); you do not need your account number.",
  "Open Flex Web Service Configuration and generate a token. Choose a short expiry (6 hours is enough), because we only need it once.",
  "Paste the token and the Query ID of your trades query here.",
];

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

let checks = 0;                          // the latest check wins; an older answer that arrives late is dropped

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * `purpose` words the notices: "portfolio" (the Investments step: used for the build), "trade" (the trade check:
 * used for that one check) or "account" (the account page: the trades are kept in the person's account).
 */
export function IbkrPanel({ onChange, purpose = "portfolio" }: {
  onChange: (input: IbkrInput | null) => void; purpose?: "portfolio" | "trade" | "account";
}) {
  const stored = purpose === "account";
  const request = purpose === "trade" ? "this check" : "this request";
  const held = stored ? null : getIbkr();
  const [tab, setTab] = useState<Tab>(held?.kind === "flex" ? "token" : "upload");
  const [file, setFile] = useState<{ name: string; bytes: number } | null>(
    held?.kind === "report" ? { name: held.filename, bytes: new Blob([held.text]).size } : null,
  );
  const [token, setToken] = useState(held?.kind === "flex" ? held.token : "");
  const [queryId, setQueryId] = useState(held?.kind === "flex" ? held.queryId : "");
  const [consent, setConsent] = useState(held?.kind === "flex");
  const [error, setError] = useState("");
  const [example, setExample] = useState<IbkrExample | null>(null);   // an invented example is the file, instead of an upload
  // What is held already passed its check (it is only handed on after one), so it starts as checked.
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => () => { checks++; }, []);   // leaving the step (e.g. "Skip") drops a check still running

  function publish(input: IbkrInput | null) {
    if (!stored) setIbkr(input);       // the account page keeps its input itself (onChange) until it imports it
    onChange(input);
  }

  /** Ask the backend what is in the input; hand it on only when it can be read. The account page skips this. */
  async function verify(input: IbkrInput) {
    if (stored) return publish(input);
    const mine = ++checks;
    publish(null);
    setCheck({ state: "checking" });
    const body = input.kind === "report"
      ? { ibkr_report: input.text, ibkr_filename: input.filename }
      : { ibkr_flex: { token: input.token, query_id: input.queryId } };
    const { status, data } = await api("/api/portfolio/ibkr-check", { method: "POST", body: JSON.stringify(body), timeoutMs: 60_000 });
    if (mine !== checks) return;
    if (status === 200) {
      setCheck({ state: "ok", summary: data as unknown as Summary });
      publish(input);
    } else {
      setCheck({ state: "failed", message: detail(data, "Could not read that IBKR data. Please try again.") });
      if (picker.current) picker.current.value = "";        // the same file, fixed, can be chosen again
    }
  }

  function resetCheck() {
    checks++;
    setCheck({ state: "idle" });
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    // Exactly one way in, or none: leaving a tab forgets what was entered there.
    setTab(next);
    setError("");
    setExample(null);
    setFile(null);
    setToken("");
    setQueryId("");
    setConsent(false);
    resetCheck();
    if (picker.current) picker.current.value = "";
    publish(null);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError("");
    resetCheck();
    setExample(null);
    if (!/\.(xml|csv)$/i.test(chosen.name)) return reject("Choose the .xml or .csv file that IBKR gave you.");
    if (chosen.size > IBKR_MAX_BYTES) return reject("That file is larger than 2 MB. Export a shorter period.");
    if (chosen.size === 0) return reject("That file is empty.");
    const mine = checks;                 // a tab switch, "Forget it" or another file while reading drops this one
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      if (mine === checks) reject("Could not read that file.");
      return;
    }
    if (mine !== checks) return;
    if (text.includes("\u0000")) return reject("That does not look like a text report (.xml or .csv).");
    setFile({ name: chosen.name, bytes: chosen.size });
    await verify({ kind: "report", text, filename: chosen.name });
  }

  /** An invented example history goes the same way as a chosen file: the same check, the same fields, the same "N trades" line. */
  async function tryExample(chosen: IbkrExample) {
    setError("");
    resetCheck();
    if (picker.current) picker.current.value = "";
    if (tab !== "upload") { setTab("upload"); setToken(""); setQueryId(""); setConsent(false); }   // one way in: the example
    setExample(chosen);
    setFile({ name: chosen.filename, bytes: new Blob([chosen.text]).size });
    await verify({ kind: "report", text: chosen.text, filename: chosen.filename });
  }

  function reject(message: string) {
    setError(message);
    setFile(null);
    if (picker.current) picker.current.value = "";
    publish(null);
  }

  function edit(nextToken: string, nextQuery: string, nextConsent: boolean) {
    setToken(nextToken);
    setQueryId(nextQuery);
    setConsent(nextConsent);
    resetCheck();
    // A changed token is handed on only after "Check the token" (the account page imports it at once).
    publish(stored && filled(nextToken, nextQuery, nextConsent) ? flex(nextToken, nextQuery) : null);
  }

  const filled = (t: string, q: string, c: boolean) => t.trim() !== "" && q.trim() !== "" && c;
  const flex = (t: string, q: string): IbkrInput => ({ kind: "flex", token: t.trim(), queryId: q.trim() });

  function forget() {
    setExample(null);
    setFile(null);
    setToken("");
    setQueryId("");
    setConsent(false);
    setError("");
    resetCheck();
    if (picker.current) picker.current.value = "";
    publish(null);
  }

  const ready = (tab === "upload" && file !== null) || (tab === "token" && (token !== "" || queryId !== ""));
  const accepted = getIbkr() !== null;
  const canCheckToken = filled(token, queryId, consent);
  const status = check.state === "checking" ? (
    <Loader className="mt-4" label={tab === "token" ? "Fetching your trades from IBKR to check the token" : "Reading your report"} />
  ) : check.state === "failed" ? (
    <p role="alert" className="eq-fade mt-4 border-l-4 border-red-600 pl-4 text-sm leading-relaxed text-red-700">
      {check.message}
      <span className="mt-1 block text-xs text-zinc-500">
        {tab === "token" ? "Fix the token or the Query ID and check again, or skip this step." : "Choose another file, or skip this step."}
      </span>
    </p>
  ) : check.state === "ok" ? (
    <p role="status" className="eq-fade mt-4 border-l-4 border-zinc-900 pl-4 text-sm font-semibold leading-relaxed text-zinc-900">
      <span className="eq-tick inline-block">✓</span> {check.summary.n_trades} {check.summary.n_trades === 1 ? "trade" : "trades"},{" "}
      {day(check.summary.start)} to {day(check.summary.end)} ({check.summary.currency}).{" "}
      <span className="font-normal text-zinc-500">{purpose === "trade" ? "Used with your check." : "Used when you build the portfolio."}</span>
      {check.summary.notes.map((note, i) => <span key={i} className="mt-1 block text-xs font-normal text-zinc-500">· {note}</span>)}
    </p>
  ) : null;

  const examples = (
    <div className={purpose === "trade" ? "mb-6 border-b border-zinc-200 pb-5" : "mt-6 border-t border-zinc-200 pt-4"}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Invented example, not a real account</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        No Interactive Brokers account? Use one of these to see how a trading history is read.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {IBKR_EXAMPLES.map((ex) => (
          <button key={ex.id} type="button" onClick={() => void tryExample(ex)} aria-pressed={example?.id === ex.id}
                  className={`border-2 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                    example?.id === ex.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:border-zinc-900"
                  }`}>
            {ex.title}
          </button>
        ))}
      </div>
      {example && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500">{example.title}: {example.about}</p>}
      {purpose === "trade" && example && status}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!stored && purpose === "trade" && examples}
      <div role="tablist" className="mb-6 flex shrink-0 gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}
                  className={`border-2 px-5 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                    tab === t.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-500 hover:border-zinc-500 hover:text-zinc-900"
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-5 max-w-2xl border-l-4 border-zinc-900 pl-4 text-sm font-semibold leading-relaxed text-zinc-900">
        EgoQuant is read-only: it never trades for you and never asks for or stores your IBKR username or password.
      </p>

      {tab === "upload" ? (
        <div className="max-w-2xl">
          <p className="mb-4 text-sm leading-relaxed text-zinc-600">
            Download your trades report from IBKR as a Flex Query (.xml or .csv, at most 2 MB) and add it here. This
            needs no login and no credentials.
          </p>
          <input ref={picker} type="file" accept=".xml,.csv,text/xml,text/csv" onChange={onFile} className="peer sr-only"
                 id="ibkr-file" />
          <label htmlFor="ibkr-file"
                 className="inline-block cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-900 border-2 border-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white">
            {file ? "Choose another file" : "Choose file"}
          </label>
          {file && (
            <p className="mt-4 text-sm text-zinc-900">
              {file.name} <span className="text-zinc-400">· {size(file.bytes)}{stored ? " · ready to import" : accepted && check.state === "idle" ? " · checked" : ""}</span>
            </p>
          )}
          {!(purpose === "trade" && example) && status}
          {!stored && purpose !== "trade" && examples}
        </div>
      ) : (
        <div className="grid max-w-4xl grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <ol className="flex flex-col gap-3">
            {HOW_TO.map((text, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-600">
                <span className="font-heading text-2xl leading-none text-zinc-300">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Flex token
              <input type="password" autoComplete="off" spellCheck={false} value={token} className={`${field} mt-1 font-mono`}
                     onChange={(e) => edit(e.target.value, queryId, consent)} />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Query ID
              <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={queryId}
                     className={`${field} mt-1 font-mono`} onChange={(e) => edit(token, e.target.value, consent)} />
            </label>
            <label className="flex items-start gap-3 text-sm leading-snug text-zinc-700">
              <input type="checkbox" checked={consent} onChange={(e) => edit(token, queryId, e.target.checked)}
                     className="mt-1 h-4 w-4 shrink-0 accent-zinc-900" />
              <span>
                I agree that EgoQuant uses this token to fetch my trades from IBKR
                {stored ? ", once" : `: once now to check it, and once for ${request}`}.
              </span>
            </label>
            <p className="border-l-4 border-zinc-900 pl-4 text-sm font-semibold leading-relaxed text-zinc-900">
              Your token is never stored{stored ? "" : `, and it is forgotten after ${request}`}.
            </p>
            {!stored && (
              check.state === "checking" ? null : accepted ? (
                check.state === "idle" && <p className="text-xs font-semibold uppercase tracking-widest text-zinc-900">Token checked ✓</p>
              ) : (
                <button type="button" disabled={!canCheckToken} onClick={() => verify(flex(token, queryId))}
                        className="self-start border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-40">
                  Check the token
                </button>
              )
            )}
            {status}
          </div>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-zinc-400">
        {stored
          ? "Only the trade and cash-movement lines are kept in your account, for up to 180 days; the file and the token are never stored. "
          : `Your trading history is used only to ${purpose === "trade" ? "see what you hold, so the check can measure the trade" : "see how you behaved in past market falls"}. It is processed for the request that ${purpose === "trade" ? "checks your trade" : "builds your portfolio"}, never saved on our server, and `}
        {stored ? "It is used only to see how you behaved in past market falls, and it" : "it"} can only make your limits more
        careful, never looser.{" "}
        {purpose === "trade" ? "The check needs a history to see what you hold; no IBKR account? Use an invented example above." : "Optional: skip this step if you do not use Interactive Brokers."}
      </p>

      <div className="mt-4 flex items-center gap-6">
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
        {ready && (
          <button type="button" onClick={forget}
                  className="text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
            Forget it
          </button>
        )}
      </div>
    </div>
  );
}
