"use client";

import type { ReactNode } from "react";
import { MethodV2Line, RiskBar } from "@/components/method-v2";
import { Paged } from "@/components/paged";
import { type Report, pct } from "@/lib/egoquant";
import { capSentences, methodV2Of, methodWords } from "@/lib/method-v2";

// The client report (egoquant/report.py's ClientReport) drawn in the app's own design, one part per
// section tab of the portfolio page. Every number and sentence comes from the backend; amounts are only
// scaled to the investor's sum. Long lists page instead of scrolling (Paged).

const CLASS_ROWS = [
  { key: "equity_weight", cls: "equity", label: "Stocks", shade: "bg-zinc-900", rule: "border-zinc-900" },
  { key: "bond_weight", cls: "bond", label: "Bonds", shade: "bg-zinc-500", rule: "border-zinc-500" },
  { key: "commodity_weight", cls: "commodity", label: "Gold & commodities", shade: "bg-zinc-300", rule: "border-zinc-300" },
  { key: "crypto_weight", cls: "crypto", label: "Crypto", shade: "bg-zinc-700", rule: "border-zinc-700" },
  { key: "cash_weight", cls: "cash", label: "Cash", shade: "bg-zinc-100", rule: "border-zinc-200" },
] as const;

/** A holding's rule takes its class's shade in the asset mix bar, so the list and the bar match. */
const CLASS_RULE: Record<string, string> = Object.fromEntries(CLASS_ROWS.map((row) => [row.cls, row.rule]));

const CLASS_LABEL: Record<string, string> = {
  equity: "Stocks", bond: "Bonds", cash: "Cash", commodity: "Gold & commodities", crypto: "Crypto",
};

export function money(x: number, currency: string) {
  return `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

/** The note line under a section's tabs, and the space its content fills. */
export function Panel({ note, children, aside }: { note?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row md:gap-10">
      <div className="flex min-h-0 flex-1 flex-col">
        {note && <p className="mb-4 shrink-0 text-xs leading-relaxed text-zinc-500">{note}</p>}
        {children}
      </div>
      {aside && <div className="flex min-h-0 shrink-0 flex-col md:w-[38%]">{aside}</div>}
    </div>
  );
}

export function AssetMix({ report }: { report: Report }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-zinc-900">
        {CLASS_ROWS.map(({ key, shade }) =>
          report[key] > 0.0005
            ? <div key={key} className={`${shade} eq-rule`} style={{ width: `${report[key] * 100}%` }} />
            : null
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {CLASS_ROWS.map(({ key, label, shade }) =>
          report[key] > 0.0005 ? (
            <span key={key} className="flex items-center gap-2 text-xs text-zinc-600">
              <span className={`inline-block h-2.5 w-2.5 border border-zinc-900 ${shade}`} />
              {label} {pct(report[key])}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

/** A share of the portfolio's risk; a hedge's tiny negative share reads "0%", not "-0%". */
const riskPct = (share: number) => pct(Math.abs(share) < 0.005 ? 0 : share);

export function Holdings({ report, amount }: { report: Report; amount: number }) {
  const scale = amount > 0 ? amount : report.reference_amount;
  const cur = report.currency;
  const v2 = methodV2Of(report);        // portfolio method v2 only: a risk bar per fund and the one-line summary
  const riskOf = new Map(v2?.riskShares.map((s) => [s.id, s.share]));
  const riskMax = Math.max(0, ...report.allocation.map((row) => riskOf.get(row.asset_id) ?? row.risk_share));
  return (
    <Panel note={`What you would hold, with amounts for your ${money(scale, cur)}.`}>
      <div className="mb-5 shrink-0"><AssetMix report={report} /></div>
      {v2 && <MethodV2Line method={v2} weights={report.allocation.map((row) => row.weight)} />}
      <Paged
        items={report.allocation}
        itemKey={(row) => row.asset_id}
        noun="holdings"
        listClassName="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2"
        render={(row) => (
          <div className={`flex items-baseline justify-between gap-4 border-l-4 px-4 py-2.5 ${CLASS_RULE[row.asset_class] ?? "border-zinc-900"}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900" title={row.name}>
                {row.name} <span className="font-normal text-zinc-400">· {row.asset_id}</span>
              </p>
              <p className="truncate text-xs text-zinc-400">
                {CLASS_LABEL[row.asset_class] ?? row.asset_class} · fee {pct(row.expense_ratio, 2)} a year ·{" "}
                {riskPct(v2 ? riskOf.get(row.asset_id) ?? row.risk_share : row.risk_share)} of the risk
              </p>
              {v2 && <RiskBar share={riskOf.get(row.asset_id) ?? row.risk_share} max={riskMax} />}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-2xl leading-none text-zinc-900">{pct(row.weight)}</p>
              <p className="text-xs text-zinc-400">{money(row.weight * scale, cur)}</p>
            </div>
          </div>
        )}
      />
    </Panel>
  );
}

export function Reasons({ report }: { report: Report }) {
  const v2 = methodV2Of(report);        // portfolio method v2 only: how it was built, picked and held back
  const words = v2 ? methodWords(v2.method) : null;
  // The report's own reasons already tell how the portfolio was picked ("method") and when the group limit was relaxed
  // ("screening"); only what they do not say is added here, so no sentence appears twice.
  const built = v2
    ? [
        ...(words ? [`${words.name}. ${words.what}`] : []),
        ...capSentences(v2, report.reasons.some((r) => r.kind === "screening")),
      ]
    : [];
  const items = [
    ...built.map((text) => ({ text, strong: false, label: "How it was built" })),
    ...report.reasons.map((r) => ({ text: r.text, strong: r.kind === "behavioral", label: "" })),
    ...report.interest_notes.map((text) => ({ text, strong: false, label: "Your interests" })),
  ];
  return (
    <Panel note="Why the portfolio looks the way it does. The dark rules mark what came from how you take risk.">
      <Paged
        items={items}
        itemKey={(item, i) => `${i}-${item.text.slice(0, 24)}`}
        noun="reasons"
        listClassName="grid grid-cols-2 gap-x-8 gap-y-4"
        render={(item) => (
          <p className={`border-l-4 pl-5 text-sm leading-relaxed ${
            item.strong ? "border-zinc-900 text-zinc-900" : "border-zinc-200 text-zinc-700"
          }`}>
            {item.label && <span className="block text-[11px] font-semibold text-zinc-400">{item.label}</span>}
            {item.text}
          </p>
        )}
      />
    </Panel>
  );
}

export function Limits({ report }: { report: Report }) {
  return (
    <Panel note="Every limit the portfolio must respect, and where it stands.">
      <Paged
        items={report.limits}
        itemKey={(limit, i) => `${i}-${limit.name}`}
        noun="limits"
        listClassName="grid grid-cols-2 gap-x-6 gap-y-2"
        render={(limit) => (
          <div className={`flex items-baseline justify-between gap-4 border-l-4 px-4 py-2.5 ${
            limit.ok ? "border-zinc-200" : "border-red-600 bg-red-50"
          }`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{limit.ok ? "✓" : "✗"} {limit.name}</p>
              <p className="text-xs text-zinc-400">From {limit.source}</p>
            </div>
            <p className="shrink-0 text-sm text-zinc-700">
              {pct(limit.value, 1)} <span className="text-zinc-400">{limit.direction === "min" ? "≥" : "≤"} {pct(limit.limit, 1)}</span>
            </p>
          </div>
        )}
      />
    </Panel>
  );
}

export function Stress({ report, amount }: { report: Report; amount: number }) {
  const scale = amount > 0 ? amount : report.reference_amount;
  const cur = report.currency;
  return (
    <Panel
      note={<>
        A stress test asks: if one of these market shocks happened tomorrow, how much would this portfolio gain or lose?
        Each line is one sudden shock (what falls, and by how much, is written under its name), with the change in percent and in money for your amount.
        They are hypothetical and chosen in advance, not forecasts. Your loss limit applies to: {report.limit_scenario}.
        On the right: what the portfolio costs to hold and to set up.
      </>}
      aside={<Costs report={report} />}
    >
      <Paged
        items={report.stress}
        itemKey={(row, i) => `${i}-${row.name}`}
        noun="scenarios"
        render={(row) => (
          <div className="flex items-baseline justify-between gap-4 border-l-4 border-zinc-200 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{row.name}</p>
              <p className="text-xs leading-snug text-zinc-400">{row.description}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-zinc-900">
                {row.portfolio_return > 0 ? "+" : ""}{pct(row.portfolio_return, 1)}
              </p>
              <p className="text-xs text-zinc-400">{money(row.portfolio_return * scale, cur)}</p>
            </div>
          </div>
        )}
      />
    </Panel>
  );
}

function Costs({ report }: { report: Report }) {
  return (
    <>
      <p className="mb-4 shrink-0 text-xs text-zinc-500">Changes and costs.</p>
      <div className="mb-4 grid shrink-0 grid-cols-1 gap-2">
        <Fact label="Ongoing fund fees" value={`${pct(report.ongoing_fee, 2)} / yr`} />
        <Fact label="One-off trading cost" value={report.one_off_trading_cost === null ? "–" : pct(report.one_off_trading_cost, 2)} />
        <Fact label="Portfolio traded" value={report.turnover === null ? "–" : pct(report.turnover)} />
      </div>
      {report.trades.length > 0 && (
        <Paged
          items={report.trades}
          itemKey={(trade) => trade.asset_id}
          noun="changes"
          render={(trade) => (
            <div className="flex items-baseline justify-between gap-3 border-l-4 border-zinc-200 px-4 py-1.5">
              <p className="truncate text-xs text-zinc-900" title={trade.name}>
                {trade.name} <span className="text-zinc-400">· {trade.asset_id}</span>
              </p>
              <p className="shrink-0 text-xs text-zinc-700">
                {pct(trade.current)} → {pct(trade.proposed)}{" "}
                <span className="text-zinc-400">({trade.change > 0 ? "+" : ""}{pct(trade.change)})</span>
              </p>
            </div>
          )}
        />
      )}
    </>
  );
}

export function Disclosures({ report }: { report: Report }) {
  // The goal simulation's notes first (hypothetical, not a guarantee, assumptions), then the report's.
  const notes = [...(report.goal?.disclosures ?? []), ...report.disclosures];
  if (notes.length === 0) return null;
  return (
    <>
      <p className="mb-3 shrink-0 text-xs text-zinc-500">Important information.</p>
      <Paged
        items={notes}
        itemKey={(text, i) => `${i}-${text.slice(0, 24)}`}
        noun="notes"
        render={(text) => <p className="text-xs leading-relaxed text-zinc-500">· {text}</p>}
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-2 border-zinc-200 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-heading text-xl leading-none text-zinc-900">{value}</p>
    </div>
  );
}
