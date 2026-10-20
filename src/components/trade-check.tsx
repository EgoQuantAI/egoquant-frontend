"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Busy } from "@/components/build-status";
import { IbkrPanel } from "@/components/ibkr-panel";
import { Markdown } from "@/components/markdown";
import { money } from "@/components/report-view";
import { api, detail } from "@/lib/account-api";
import { plainMessage } from "@/lib/http-errors";
import { type PortfolioResult, type Session, pct, portfolioFacts } from "@/lib/egoquant";
import { dropIbkrToken, getIbkr, ibkrFields } from "@/lib/ibkr";
import { SCENARIO_NAMES, type TradeCheck as Check, type TradeCheckResponse, VERDICT_TEXT, scenarioName } from "@/lib/trade-check";

// "Check a trade": one planned trade against this investor's limits. The verdict, the reasons and the before/after
// numbers come from the backend's deterministic check; the advisor can phrase them, never change them. Nothing is
// bought or sold. Two ways in:
//   visitor   the IBKR history is sent with this one request (memory only, nothing stored, nothing recorded);
//   signed in uses the history saved in the account, saves the check, and can record "I made this trade".

type Me = { consents: { trade_check: boolean }; n_trades: number };
type Account = "loading" | "visitor" | { me: Me };

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const secondary =
  "border-2 border-zinc-900 bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-default disabled:opacity-50";
const field = "w-full border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900";
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

const SEVERITY: Record<string, string> = {
  blocking: "border-red-600 bg-red-50",
  warning: "border-zinc-900",
  info: "border-zinc-300",
};
const SEVERITY_WORD: Record<string, string> = { blocking: "Blocks", warning: "Warning", info: "Note" };
// Reasons whose before / after / limit are shares of the account (the r_level ones are levels, new_money is money).
const SHARE_CODES = new Set(["max_equity", "max_class_weight", "max_stress_loss", "instrument_cap", "concentration",
  "min_cash", "soft_limit", "near_limit", "reduces_breach"]);

/**
 * `result` is only needed for the currency (USD without it). `onExplain`: where the advisor chat lives next to this
 * form, "Explain" hands the sealed facts to the chat (which shows the explanation there) instead of asking inline.
 */
export function TradeCheck({ session, result, onExplain }: {
  session: Session; result?: PortfolioResult | null; onExplain?: (context: string, summary: string) => void;
}) {
  const [account, setAccount] = useState<Account>("loading");
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [haveIbkr, setHaveIbkr] = useState(() => getIbkr() !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<TradeCheckResponse | null>(null);
  const currency = result?.report.currency ?? "USD";

  useEffect(() => {
    let alive = true;
    api("/api/account/me").then(({ status, data }) => {
      if (!alive) return;
      setAccount(status === 200 ? { me: data as unknown as Me } : "visitor");
    });
    return () => { alive = false; };
  }, []);

  // Signed in with the agreement and saved trades: the account's history. Otherwise: this request's own IBKR data.
  const inAccount = typeof account === "object" && account.me.consents.trade_check && account.me.n_trades > 0;
  const needsAgreement = typeof account === "object" && !account.me.consents.trade_check;
  const needsData = typeof account === "object" && account.me.consents.trade_check && account.me.n_trades === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || account === "loading") return;
    const value = Number(amount);
    const symbol = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return setError("Enter the ticker, for example VTI.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter the amount you plan to trade, above zero.");
    if (!session.answers || !session.profile || !session.intake) return setError("Complete your profile, investments and portfolio first.");
    if (!inAccount && !getIbkr()) return setError("Add your IBKR report or token below, so the check knows what you hold.");

    setPending(true);
    setError("");
    setAnswer(null);
    const body = {
      ...portfolioFacts(session.answers, session.intake, session.riskGame),
      planned: { ticker: symbol, side, amount: value },
      ...(inAccount ? {} : ibkrFields()),
    };
    const { status, data } = await api(inAccount ? "/api/account/trade-check" : "/api/trade-check",
      { method: "POST", body: JSON.stringify(body), timeoutMs: 125_000 });
    dropIbkrToken();                                   // a Flex token is used once
    setHaveIbkr(getIbkr() !== null);
    setPending(false);
    if (status === 200 && data.check) setAnswer(data as unknown as TradeCheckResponse);
    else setError(status === 401 ? "You were signed out. Please log in again." : detail(data, "Could not check that trade. Please retry."));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-4 pr-2">
      <div>
        <p className="text-sm leading-relaxed text-zinc-700">
          Thinking of a trade? Enter it and see how it would change your portfolio against your own limits. Nothing is
          bought or sold, and this is a check against hypothetical stress scenarios, not a recommendation.
        </p>
        {account === "loading" ? null : inAccount ? (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Using the IBKR data saved in your account. The check and what you decide are saved there too.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Not saving anything: the check uses your IBKR history sent with this request only.{" "}
            {needsAgreement && <>Want it saved? <Link href="/account#agreements" className="underline">Agree to the trade-check terms in your account</Link>.</>}
            {needsData && <>Want it saved? <Link href="/account#data" className="underline">Connect your IBKR data in your account</Link>.</>}
            {account === "visitor" && <>Want it saved? <Link href="/account" className="underline">Create an account</Link>.</>}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <label className={label}>
            Ticker
            <input type="text" value={ticker} maxLength={15} spellCheck={false} autoComplete="off" placeholder="VTI"
                   onChange={(e) => setTicker(e.target.value)} className={`${field} mt-1 font-mono uppercase`} />
          </label>
          <div role="radiogroup" aria-label="Buy or sell" className="flex gap-2">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}
                      className={`border-2 px-5 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                        side === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-500 hover:border-zinc-500 hover:text-zinc-900"
                      }`}>
                {s}
              </button>
            ))}
          </div>
          <label className={label}>
            Amount ({currency})
            <input type="number" inputMode="decimal" min="0" step="any" value={amount}
                   onChange={(e) => setAmount(e.target.value)} className={`${field} mt-1`} />
          </label>
        </div>

        {!inAccount && account !== "loading" && (
          <div className="border-2 border-zinc-200 p-4">
            <p className={`${label} mb-3`}>Your IBKR history {haveIbkr ? "· ready" : ""}</p>
            <IbkrPanel purpose="trade" onChange={(input) => setHaveIbkr(input !== null)} />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending || account === "loading"} className={`self-start ${primary}`}>
          {pending ? <Busy label="Checking" /> : "Check this trade"}
        </button>
      </form>

      {answer && <Verdict answer={answer} currency={currency} signedIn={inAccount} onExplain={onExplain} />}
    </div>
  );
}

// ─── The verdict ──────────────────────────────────────────────────────────────


// The independent check words a breach like "hypothetical loss 21.92% in equity_down_30_bond_down_5 vs limit 8.84% (behavioral:max_stress_loss[...])".
// A person reads the scenario's name, not its id, and not the rule it came from.
function plainViolation(v: string): string {
  const withoutRule = v.replace(/\s*\([a-z_]+:[^)]*\)\s*$/, "");
  return Object.entries(SCENARIO_NAMES).reduce((text, [id, name]) => text.split(id).join(name), withoutRule);
}

function Verdict({ answer, currency, signedIn, onExplain }: {
  answer: TradeCheckResponse; currency: string; signedIn: boolean; onExplain?: (context: string, summary: string) => void;
}) {
  const c = answer.check;
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [answer]);   // the form is long: bring the verdict into view
  return (
    <div ref={top} className="max-w-3xl scroll-mt-2 border-t-2 border-zinc-900 pt-6">
      <VerdictView check={c} currency={currency} />

      {answer.trade_context && (onExplain
        ? <button type="button" className={`mt-6 ${secondary}`}
                  onClick={() => onExplain(answer.trade_context!, `Explain my planned trade check: ${c.planned.side} ${money(c.planned.amount, currency)} of ${c.planned.ticker}.`)}>
            Ask the advisor to explain this
          </button>
        : <Explain context={answer.trade_context} />)}
      {signedIn && answer.check_id && <Decision checkId={answer.check_id} ticker={c.planned.ticker} side={c.planned.side} />}
    </div>
  );
}

/** The verdict itself: the trade, the verdict, what it changes, the reasons, the before/after numbers and the label. The Trade
 *  check page shows it whole; the advisor chat shows the same words and numbers as a small card (`compact`: a smaller heading,
 *  three rows of numbers, the short label). */
export function VerdictView({ check: c, currency, compact = false, words }: {
  check: Check; currency: string; compact?: boolean;
  /** The heading when the backend sends its own words for it (the chat card); otherwise the label of lib/trade-check.ts VERDICT_TEXT. */
  words?: string | null;
}) {
  const v = VERDICT_TEXT[c.verdict];
  const heading = words?.trim() ? `${words.trim().charAt(0).toUpperCase()}${words.trim().slice(1)}` : v.title;
  return (
    <>
      <p className={label}>{c.planned.side} {money(c.planned.amount, currency)} of {c.planned.ticker} · as of {c.as_of}</p>
      <p className={`mt-1 font-heading leading-tight ${compact ? "text-3xl" : "text-4xl"} ${v.tone}`}>{heading}</p>
      {compact && <Numbers check={c} currency={currency} compact />}   {/* the chat card leads with the numbers: its box is short */}
      {!compact && !!c.direction_parts?.length && (
        <div className="mt-3">
          <p className={label}>What this trade changes</p>
          {c.direction_parts.map((part, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-zinc-600">{part}</p>)}
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {c.reasons.map((r, i) => (
          <li key={i} className={`border-l-4 px-4 py-2 text-sm leading-relaxed text-zinc-800 ${SEVERITY[r.severity] ?? SEVERITY.info}`}>
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{SEVERITY_WORD[r.severity] ?? "Note"}</span>{" "}
            {r.message}
            {SHARE_CODES.has(r.code) && (r.before != null || r.after != null) && (
              <span className="mt-0.5 block text-xs tabular-nums text-zinc-500">
                {pct(r.before, 1)} → {pct(r.after, 1)}{r.limit != null ? ` (limit ${pct(r.limit, 1)})` : ""}
              </span>
            )}
          </li>
        ))}
        {c.reasons.length === 0 && <li className="text-sm text-zinc-600">No limit is affected.</li>}
      </ul>

      {!compact && <Numbers check={c} currency={currency} />}
      {!compact && c.notes.map((n, i) => <p key={i} className="mt-2 text-xs leading-relaxed text-zinc-500">· {n}</p>)}
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        {compact ? "Deterministic check, not a recommendation" : c.label}. The independent risk check of the portfolio after this trade: {c.risk_review.approved ? "approved" : "not approved"}.
      </p>
      {c.risk_review.violations.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {[...new Set(c.risk_review.violations.map(plainViolation))].map((v, i) => (
            <li key={i} className="text-xs leading-relaxed text-zinc-500">· {v}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Numbers({ check: c, currency, compact = false }: { check: Check; currency: string; compact?: boolean }) {
  const classes = ["bond", "cash", "commodity", "crypto"].filter(
    (k) => (c.before?.class_shares[k] ?? 0) > 0 || (c.after.class_shares[k] ?? 0) > 0);
  const rows: { name: string; before: string; after: string }[] = [
    { name: "Account value", before: c.before ? money(c.before.total_value, currency) : "–", after: money(c.after.total_value, currency) },
    { name: "Stocks", before: c.before ? pct(c.before.equity_share, 1) : "–", after: pct(c.after.equity_share, 1) },
    { name: "Largest holding", before: c.before?.largest_holding ? `${c.before.largest_holding} ${pct(c.before.largest_weight, 1)}` : "–",
      after: c.after.largest_holding ? `${c.after.largest_holding} ${pct(c.after.largest_weight, 1)}` : "–" },
    ...classes.map((k) => ({ name: k === "bond" ? "Bonds" : k[0].toUpperCase() + k.slice(1),
      before: c.before ? pct(c.before.class_shares[k] ?? 0, 1) : "–", after: pct(c.after.class_shares[k] ?? 0, 1) })),
    { name: `Highest product risk level (yours: R${c.investor_max_r_level})`,
      before: c.before?.max_r_level != null ? `R${c.before.max_r_level}` : "–", after: c.after.max_r_level != null ? `R${c.after.max_r_level}` : "–" },
    { name: `Hypothetical loss in "${scenarioName(c.after.stress_scenario)}"`, before: c.before ? pct(c.before.stress_loss, 1) : "–", after: pct(c.after.stress_loss, 1) },
  ];
  const shown = compact ? rows.filter((r) => r.name === "Stocks" || r.name === "Largest holding" || r.name.startsWith("Hypothetical loss")) : rows;
  return (
    <table className={`${compact ? "mt-4" : "mt-5"} w-full max-w-xl text-left text-sm`}>
      <thead className="text-[10px] uppercase tracking-widest text-zinc-400">
        <tr><th className="py-1 font-semibold">Your portfolio</th><th className="py-1 font-semibold">Before</th><th className="py-1 font-semibold">After this trade</th></tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.name} className="border-t border-zinc-100 text-zinc-800">
            <td className="py-1.5 pr-4">{r.name}</td><td className="py-1.5 pr-4">{r.before}</td><td className="py-1.5 font-semibold text-zinc-900">{r.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The advisor phrases the verdict; the backend checks its words against the numbers (else a fixed template). */
function Explain({ context }: { context: string }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    if (pending) return;
    setPending(true);
    setError("");
    const { status, data } = await api("/api/chat", {
      method: "POST", timeoutMs: 80_000,
      body: JSON.stringify({ messages: [{ role: "user", content: "Explain this trade check to me." }], trade_context: context, page: "portfolio", view: "trade" }),
    });
    setPending(false);
    if (status === 200 && typeof data.reply === "string") setText(data.reply);
    else setError(plainMessage(detail(data, "The advisor could not explain this right now.")));
  }

  return (
    <div className="mt-6">
      {!text && <button type="button" onClick={ask} disabled={pending} className={secondary}>{pending ? <Busy label="Explaining" /> : "Explain this in plain words"}</button>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {text && (
        <div className="border-l-4 border-zinc-900 pl-4 text-sm leading-[1.7] text-zinc-800">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}

/** Signed in: what did you do? "I made this trade" is recorded (quantity and price as THEY report them). */
function Decision({ checkId, ticker, side }: { checkId: string; ticker: string; side: string }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function send(decision: "made" | "not_made") {
    if (busy) return;
    const body: Record<string, unknown> = { decision };
    if (decision === "made") {
      const q = Number(quantity), p = Number(price);
      if (!(q > 0) || !(p > 0)) return setError("Enter the quantity and the price you traded at.");
      Object.assign(body, { quantity: q, price: p, ...(date ? { trade_date: date } : {}) });
    }
    setBusy(true);
    setError("");
    const { status, data } = await api(`/api/account/trade-checks/${checkId}/decision`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (status === 200) {
      setDone(decision === "made"
        ? `Recorded: you ${side === "buy" ? "bought" : "sold"} ${ticker}. Your next check starts from it.`
        : "Noted: you did not make this trade.");
    } else {
      setError(status === 409 ? "You already recorded what you did for this check." : detail(data, "Could not save that. Please retry."));
    }
  }

  if (done) return <p role="status" className="mt-6 border-l-4 border-zinc-900 pl-4 text-sm font-semibold text-zinc-900">{done}</p>;
  return (
    <div className="mt-6 border-2 border-zinc-200 p-4">
      <p className={label}>What did you do?</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        We never trade for you. If you made it yourself, record it as it really happened, so the next check starts from it.
      </p>
      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={label}>Quantity<input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${field} mt-1`} /></label>
          <label className={label}>Price<input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} mt-1`} /></label>
          <label className={label}>Date (optional)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
        </div>
      ) : null}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {open ? (
          <button type="button" onClick={() => send("made")} disabled={busy} className={primary}>{busy ? <Busy label="Saving" /> : "Record this trade"}</button>
        ) : (
          <button type="button" onClick={() => setOpen(true)} disabled={busy} className={primary}>I made this trade</button>
        )}
        <button type="button" onClick={() => send("not_made")} disabled={busy} className={secondary}>I did not</button>
      </div>
    </div>
  );
}
