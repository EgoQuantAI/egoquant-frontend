"use client";

import { useCallback, useEffect, useState } from "react";
import { Busy } from "@/components/build-status";
import { IbkrPanel } from "@/components/ibkr-panel";
import { Loader } from "@/components/ui/loader";
import { Pager } from "@/components/ui/pager";
import { api, detail } from "@/lib/account-api";
import type { IbkrInput } from "@/lib/ibkr";

// The IBKR data connected to the account (account page). A Flex report or a Flex token is read once by the backend,
// only the trade and cash-movement lines are kept (180 days), and the previous import is replaced.
// Needs the person's agreement to keep IBKR data first; the file and the token are never stored.

type Trade = {
  id: string; trade_date: string; symbol: string; side: string; quantity: number; price: number; currency: string; source: string;
};
type Imported = { n_trades: number; n_cash_flows: number; start: string; end: string; currency: string; notes: string[] };

const PAGE = 10;
const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const number = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 4 });

const SAMPLE_FILE = "ibkr_balanced_investor.xml";      // an invented account from the demo pack (public/samples)

export function AccountTrades({ consented, onChanged, onGone, onAgree }: {
  consented: boolean; onChanged: () => Promise<void>; onGone: (message: string) => void; onAgree: () => void;
}) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState<IbkrInput | null>(null);
  const [panelKey, setPanelKey] = useState(0);        // a new key empties the panel (file name, token fields)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Imported | null>(null);
  const [page, setPage] = useState(0);
  const [connecting, setConnecting] = useState(false);    // the import panel instead of the table

  const load = useCallback(async () => {
    const { status, data } = await api("/api/account/trades");
    if (status === 200 && Array.isArray(data.trades)) setTrades(data.trades as Trade[]);
    else if (status === 401) onGone("You were signed out. Please log in again.");
    else setError(detail(data, "Could not load your trades."));
  }, [onGone]);

  useEffect(() => {
    let alive = true;
    api("/api/account/trades").then(({ status, data }) => {
      if (!alive) return;
      if (status === 200 && Array.isArray(data.trades)) setTrades(data.trades as Trade[]);
      else if (status === 401) onGone("You were signed out. Please log in again.");
      else setError(detail(data, "Could not load your trades."));
    });
    return () => { alive = false; };
  }, [onGone]);

  async function loadSample() {
    try {
      const r = await fetch("/samples/ibkr_balanced_investor.xml", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setInput({ kind: "report", text: await r.text(), filename: SAMPLE_FILE });
      setError("");
    } catch {
      setError("The sample file could not be loaded.");
    }
  }

  async function importIt() {
    const held = input;
    if (!held || busy) return;
    setBusy(true);
    setError("");
    setDone(null);
    const body = held.kind === "report"
      ? { ibkr_report: held.text, ibkr_filename: held.filename }
      : { ibkr_flex: { token: held.token, query_id: held.queryId } };
    const { status, data } = await api("/api/account/trades/import", { method: "POST", body: JSON.stringify(body), timeoutMs: 60_000 });
    setInput(null);                      // the file text and the token are forgotten, whatever the answer
    setPanelKey((k) => k + 1);
    setBusy(false);
    if (status === 200) {
      setDone(data as unknown as Imported);
      setConnecting(false);
      setPage(0);
      await load();
      await onChanged();
    } else if (status === 401) {
      onGone("You were signed out. Please log in again.");
    } else {
      setError(detail(data, "Could not import that data."));
    }
  }

  const sorted = trades ? [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date)) : [];
  const symbols = new Set(sorted.map((t) => t.symbol)).size;
  const pages = Math.ceil(sorted.length / PAGE);
  const shown = sorted.slice(page * PAGE, (page + 1) * PAGE);
  const link = "text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900";

  if (trades === null && !error) return <Loader label="Loading your IBKR data" />;

  if (connecting || (trades !== null && trades.length === 0)) {
    return (
      <div className="eq-fade">
        <div className="flex items-baseline justify-between gap-4">
          <p className={label}>{sorted.length > 0 ? "Replace with new data" : "Connect IBKR data"}</p>
          {sorted.length > 0 && <button type="button" onClick={() => setConnecting(false)} className={link}>← Back to my trades</button>}
        </div>
        {sorted.length === 0 && (
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            No trading data is connected. Connect your IBKR history to let the advisor study how you behaved in past market
            falls. It can only make your limits more careful.
          </p>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {consented ? (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center gap-3 border-l-4 border-zinc-200 pl-3 text-sm text-zinc-600">
              <button type="button" onClick={loadSample} disabled={busy} className={link}>Try it with a sample IBKR file</button>
              <span>An invented account from our demo pack (not a real person), for trying this out.</span>
              {input?.kind === "report" && input.filename === SAMPLE_FILE && (
                <span className="w-full font-semibold text-zinc-900">
                  Sample loaded: {SAMPLE_FILE} (invented, not a real account). Click &ldquo;Import into my account&rdquo;.
                </span>
              )}
            </div>
            <IbkrPanel key={panelKey} purpose="account" onChange={setInput} />
            <button type="button" onClick={importIt} disabled={!input || busy} className={`mt-2 ${primary}`}>
              {busy ? <Busy label="Importing" /> : "Import into my account"}
            </button>
          </div>
        ) : (
          <div className="mt-4 border-2 border-zinc-900 p-4">
            <p className="text-sm leading-relaxed text-zinc-700">
              To keep your IBKR data in the account, first agree to &ldquo;Keep my connected IBKR data&rdquo;.
            </p>
            <button type="button" onClick={onAgree} className={`mt-3 ${primary}`}>Go to agreements <span className="eq-arrow">→</span></button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className={label}>Connected IBKR data</p>
        <button type="button" onClick={() => { setConnecting(true); setDone(null); setError(""); }} className={link}>
          Replace with new data →
        </button>
      </div>
      {done && (
        <div role="status" className="eq-fade mt-3 border-l-4 border-zinc-900 pl-4">
          <p className="text-sm font-semibold text-zinc-900">
            <span className="eq-tick inline-block">✓</span> Connected: {done.n_trades} {done.n_trades === 1 ? "trade" : "trades"} and {done.n_cash_flows} cash{" "}
            {done.n_cash_flows === 1 ? "movement" : "movements"}, {day(done.start)} to {day(done.end)} ({done.currency}).
          </p>
          {done.notes.map((note, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-zinc-500">· {note}</p>)}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {sorted.length > 0 && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            {sorted.length} {sorted.length === 1 ? "trade" : "trades"} in {symbols} {symbols === 1 ? "symbol" : "symbols"},{" "}
            {day(sorted[sorted.length - 1].trade_date)} to {day(sorted[0].trade_date)}.
          </p>
          <div className="mt-3 border-2 border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-white text-[10px] uppercase tracking-widest text-zinc-400">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Symbol</th><th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Price</th></tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-zinc-100 text-zinc-700">
                    <td className="px-3 py-1.5">{day(t.trade_date)}</td>
                    <td className="px-3 py-1.5 font-semibold text-zinc-900">{t.symbol}</td>
                    <td className="px-3 py-1.5 uppercase">{t.side}</td>
                    <td className="px-3 py-1.5 text-right">{number(t.quantity)}</td>
                    <td className="px-3 py-1.5 text-right">{number(t.price)} {t.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && <Pager page={page} pages={pages} onPage={setPage} />}
        </>
      )}
    </div>
  );
}
