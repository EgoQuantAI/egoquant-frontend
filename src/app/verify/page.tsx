"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import {
  type CheckName, type ProofFile, type TxView, type Verdict, WHY, parseProof, splitSealedReport, tamperedCopy,
  tamperedReport, verifyProof,
} from "@/lib/proof";

// Public: check a sealed EgoQuant report. The file (the sealed report .html, or the technical seal file .json) is read
// and hashed HERE, in the browser (WebCrypto); only the transaction hash goes to our server, which reads that
// transaction from the Sepolia test network. On success the page shows the ORIGINAL sealed document, the one whose
// fingerprint is on the chain, never a re-rendering and never anything outside the fingerprinted part of the upload.

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const secondary =
  "border-2 border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-50";
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";
const link = "font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-500";

const CHAIN_CHECKS: CheckName[] = ["hash", "tx_found", "chain", "sender", "prefix", "commitment"];
const CHECKS: [CheckName, string][] = [
  ["document", "The report is exactly the sealed one"],
  ["hash", "The seal data matches its fingerprint"],
  ["tx_found", "The transaction exists on Sepolia"],
  ["chain", "It is on the Sepolia test network"],
  ["sender", "It was sent by EgoQuant's sealing address"],
  ["prefix", "It is an EgoQuant seal (EGOQ1)"],
  ["commitment", "The fingerprint on-chain is this seal's"],
  ["confirmed", "It is in a block"],
  ["report", "The saved report data matches the seal"],
];

type Loaded = { kind: "html"; page: string } | { kind: "json"; proof: ProofFile };
type Shown = { verdict: Verdict; tx: TxView | null; tampered: boolean; name: string; source: Loaded; proof: ProofFile };
type Sealer = { address: string; explorer: string };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "";

async function readTx(hash: string | null): Promise<{ tx: TxView | null; error: string }> {
  if (!hash) return { tx: null, error: "" };
  try {
    const r = await fetch(`/api/verify/tx/${hash}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { tx: data as TxView, error: "" };
    return { tx: null, error: typeof data.detail === "string" ? data.detail : "The blockchain could not be read." };
  } catch {
    return { tx: null, error: "The blockchain could not be read. Please try again." };
  }
}

/** The headline for a failed check, in the words of the design. */
function failureLine(v: Verdict): string {
  if (v.failed === "report changed") return "this report was changed after it was sealed";
  if (v.failed === "not yet in a block") return "the seal is not in a block yet; try again in a minute";
  if (CHAIN_CHECKS.some((c) => v.checks[c] === false)) return "the seal doesn't match the blockchain";
  return v.failed ?? "";
}

export default function VerifyPage() {
  const [sealer, setSealer] = useState<Sealer | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {                                     // EgoQuant's public sealing address (when sealing is on)
    let alive = true;
    fetch("/api/anchoring/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { enabled?: boolean; sealing_addresses?: unknown; explorer?: unknown }) => {
        const address = Array.isArray(s.sealing_addresses) ? s.sealing_addresses[0] : null;
        if (alive && s.enabled && typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)) {
          const explorer = typeof s.explorer === "string" && /^https:\/\/[^\s]+$/.test(s.explorer) ? s.explorer : "https://sepolia.etherscan.io";
          setSealer({ address, explorer });
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function check(source: Loaded, name: string, tampered = false) {
    setBusy(true);
    setMessage("");
    setShown(null);
    const proof = source.kind === "html" ? splitSealedReport(source.page) : source.proof;
    if (!proof) {
      setBusy(false);
      setMessage("This report was never sealed.");
      return;
    }
    const { tx, error } = await readTx(proof.tx_hash);
    if (error) {
      setBusy(false);
      setMessage(error);
      return;
    }
    const verdict = await verifyProof(proof, tx);
    setShown({ verdict, tx, tampered, name, source, proof });
    setBusy(false);
  }

  async function load(text: string, name: string) {
    if (/\.html?$/i.test(name) || text.trimStart().toLowerCase().startsWith("<!doctype") || text.trimStart().startsWith("<")) {
      await check({ kind: "html", page: text }, name);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setShown(null);
      setMessage("This file is not a sealed report (.html) or a seal file (.json).");
      return;
    }
    const proof = parseProof(data);
    if (typeof proof === "string") {
      setShown(null);
      setMessage(proof);
      return;
    }
    await check({ kind: "json", proof }, name);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 12_000_000) {
      setMessage("This file is too large to be an EgoQuant report.");
      return;
    }
    await load(await file.text(), file.name);
  }

  async function demo() {
    const r = await fetch("/demo-sealed-report.html", { cache: "no-store" });
    await load(await r.text(), "demo-sealed-report.html (invented investor, real market data)");
  }

  function tamper() {
    if (!shown) return;
    const s = shown.source;
    const changed: Loaded = s.kind === "html" ? { kind: "html", page: tamperedReport(s.page) }
      : s.proof.document !== undefined ? { kind: "json", proof: { ...s.proof, document: tamperedReport(s.proof.document) } }
      : { kind: "json", proof: tamperedCopy(s.proof) };
    void check(changed, `${shown.name} (tampered copy)`, true);
  }

  function printOriginal() {
    frame.current?.contentWindow?.print();
  }

  const v = shown?.verdict;
  const etherscan = shown?.proof.tx_hash ? (shown.tx?.explorer_url ?? `https://sepolia.etherscan.io/tx/${shown.proof.tx_hash}`) : null;

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-4 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Verify · Sealed report</h1>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Sepolia test network</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-4xl space-y-8 px-4 py-10 md:px-12">
          <div className="space-y-4">
            <p className="font-heading text-4xl leading-tight text-zinc-900">Was this report changed?</p>
            <ol className="grid gap-3 text-sm text-zinc-800 md:grid-cols-3">
              {["Upload the sealed report (.html) or the seal file (.json)",
                "We check it against the public blockchain, in your browser",
                "You see the original report and who it was sealed for"].map((text, i) => (
                <li key={text} className="border-l-4 border-zinc-900 pl-3"><span className="font-heading text-2xl">{i + 1}</span> {text}</li>
              ))}
            </ol>
            {sealer && (
              <p className="text-xs leading-relaxed text-zinc-500">
                EgoQuant seals from one public address:{" "}
                <a href={`${sealer.explorer}/address/${sealer.address}`} target="_blank" rel="noopener noreferrer"
                   className="break-all font-mono text-zinc-900 underline">{sealer.address} ↗</a> (every seal we made is listed there).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept=".html,.htm,.json,text/html,application/json" className="hidden"
                   onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className={primary} disabled={busy} onClick={() => input.current?.click()}>
              Upload a sealed report
            </button>
            <button type="button" className={secondary} disabled={busy} onClick={demo}>Use the demo report</button>
            {shown && !shown.tampered && (
              <button type="button" className={secondary} disabled={busy} onClick={tamper}>Try a tampered copy</button>
            )}
            {busy && <span role="status" className="animate-pulse text-sm text-zinc-400">Checking…</span>}
          </div>

          {message && <p role="alert" className="border-2 border-zinc-900 px-4 py-3 text-base font-semibold text-zinc-900">{message}</p>}

          {shown && v && (
            <section className="space-y-5" aria-live="polite">
              <div className={`space-y-2 border-2 px-5 py-4 ${v.match ? "border-emerald-700" : "border-red-700"}`}>
                <p className={label}>{shown.name}</p>
                {v.match ? (
                  <>
                    <p className="font-heading text-3xl leading-snug text-emerald-800">
                      Unchanged ✓{v.sealedFor ? ` · Sealed for: ${v.sealedFor}` : ""}
                      {v.confirmedAt ? ` · confirmed ${when(v.confirmedAt)}` : ""}
                      {v.block_number != null ? ` · block ${v.block_number.toLocaleString("en-US")}` : ""}
                    </p>
                    {v.format === "v1" && <p className="text-sm text-zinc-600">Older seal format, no document fingerprint.</p>}
                    {etherscan && <a href={etherscan} target="_blank" rel="noopener noreferrer" className={`${link} text-sm`}>View on Etherscan ↗</a>}
                  </>
                ) : (
                  <>
                    <p className="font-heading text-3xl text-red-800">Does not match ✗: {failureLine(v)}</p>
                    {v.failed && WHY[v.failed] && <p className="text-sm text-zinc-700">{WHY[v.failed]}</p>}
                    {shown.tampered && (
                      <p className="text-xs text-zinc-500">This copy changed one number that the report shows. That is enough to break the fingerprint.</p>
                    )}
                  </>
                )}
              </div>

              <ul className="space-y-1 text-sm">
                {CHECKS.filter(([name]) => v.checks[name] !== null).map(([name, text]) => (
                  <li key={name} className={v.checks[name] ? "text-zinc-700" : "font-semibold text-red-800"}>
                    {v.checks[name] ? "✓" : "✗"} {text}
                  </li>
                ))}
              </ul>

              {v.match && v.document && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-heading text-2xl text-zinc-900">The original sealed report</p>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className={secondary} onClick={printOriginal}>Download the original as PDF</button>
                      {etherscan && <a href={etherscan} target="_blank" rel="noopener noreferrer" className={secondary}>View on Etherscan</a>}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Shown from the sealed document whose fingerprint is on the blockchain. A printed or PDF copy can&apos;t
                    prove itself: keep the sealed report (.html) or the seal file to check it again.
                  </p>
                  {/* the verified document only; no scripts run in it */}
                  <iframe ref={frame} title="The original sealed report" sandbox="allow-same-origin allow-modals"
                          srcDoc={v.document} className="h-[70vh] w-full border-2 border-zinc-200 bg-white" />
                </div>
              )}

              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 break-all text-xs text-zinc-600">
                <dt className={label}>Fingerprint</dt><dd className="font-mono">{shown.proof.commitment}</dd>
                <dt className={label}>Transaction</dt>
                <dd className="font-mono">{etherscan ? <a className="underline" target="_blank" rel="noopener noreferrer" href={etherscan}>{shown.proof.tx_hash} ↗</a> : "not sent yet"}</dd>
                {shown.tx?.from && (<><dt className={label}>Sent by</dt><dd className="font-mono">{shown.tx.from}</dd></>)}
              </dl>
            </section>
          )}

          <p className="text-xs leading-relaxed text-zinc-400">
            What a seal proves: that this exact report existed, unchanged, no later than its block was made, and whom it was
            sealed for. It does not prove that the advice was right. The fingerprint is salted, so it reveals nothing by
            itself. A public blockchain entry can never be deleted, but when an investor deletes their data, the record and
            its salt are deleted, and we can no longer link the fingerprint to anyone (a sealed report someone downloaded
            keeps its own copy). This is the Sepolia test network: no real money.
          </p>
        </div>
        </div>
      </div>
    </main>
  );
}
