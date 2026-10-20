// On-chain sealing in the browser: the same canonical JSON and SHA-256 as the backend (egoquant/anchoring), so a
// proof file is checked on the investor's own device. Only the transaction is fetched (/api/verify/tx/<hash>); the
// record, which holds their answers, never leaves the browser. scripts/check-vectors.mjs runs this file against
// the backend's shared test vectors (tests/anchoring/vectors.json), so the two never drift apart.
// Plain, erasable TypeScript only (no imports, no enums): Node runs it directly for that check.

export type SealStatus = "pending" | "submitted" | "confirmed" | "failed";

export type SealOut = {
  status: SealStatus;
  tx_hash: string | null;
  chain_id: number;
  block_number: number | null;
  block_time: string | null;
  sealing_address: string;
  explorer_url: string | null;
  error_kind: string | null;
};

export type SealRecordOut = { record_id: string; commitment: string; confirmed_at: string; seal: SealOut };
export type ConfirmOut = SealRecordOut & { confirmed: true; already_confirmed: boolean };

export type AnchoringStatus =
  | { enabled: false }
  | {
      enabled: true; chain_id: number; network: string; sealing_addresses: string[]; explorer: string;
      consent_version: string; consent_text: string;
    };

export type ProofFile = {
  proof: "egoq-proof-1" | "egoq-proof-2";
  record: string;
  salt: string;
  commitment: string;
  chain_id: number;
  tx_hash: string | null;
  sealing_address: string;
  report?: Record<string, unknown>;
  /** Seal v2: the sealed document (the exact report HTML that was fingerprinted). */
  document?: string;
};

/** What GET /verify/tx/<hash> answers. */
export type TxView = {
  found: boolean; status: "confirmed" | "pending" | "failed" | "not_found"; chain_id: number | null;
  from: string | null; to: string | null; sender_ok: boolean; prefix_ok: boolean; commitment: string | null;
  block_number: number | null; block_time: string | null; explorer_url?: string;
};

export type CheckName = "document" | "hash" | "tx_found" | "chain" | "sender" | "prefix" | "commitment" | "confirmed" | "report";
export type Verdict = {
  match: boolean;
  failed: string | null;
  checks: Record<CheckName, boolean | null>;
  block_number: number | null;
  block_time: string | null;
  /** v2 seals: the sealed document, whom it was sealed for and when it was confirmed. */
  format: "v1" | "v2";
  document: string | null;
  sealedFor: string | null;
  confirmedAt: string | null;
};

// The order of the checks; the first that fails names the verdict (as in egoquant/anchoring/proof.py).
export const FAILURES: [CheckName, string][] = [
  ["document", "report changed"], ["hash", "hash differs"], ["tx_found", "tx not found"], ["chain", "wrong chain"],
  ["sender", "not sent by EgoQuant"], ["prefix", "wrong prefix"], ["commitment", "hash differs"],
  ["confirmed", "not yet in a block"], ["report", "report differs"],
];

export const SEPOLIA = 11155111;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const HEX64 = /^[0-9a-f]{64}$/;
export const TX_HASH = /^0x[0-9a-f]{64}$/;

// ------------------------------------------------------------------------------------------- canonical JSON
/** Six decimals of the double's exact value, ties to even (Python: Decimal(x).quantize(..., ROUND_HALF_EVEN)). */
export function fixed6(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const [b0, b1, b2, b52] = [BigInt(0), BigInt(1), BigInt(2), BigInt(52)];   // no BigInt literals (ES2017 target)
  const million = BigInt(1_000_000);
  const exp = Number((bits >> b52) & BigInt(0x7ff));
  const frac = bits & ((b1 << b52) - b1);
  const m = exp === 0 ? frac : frac | (b1 << b52);
  const e = exp === 0 ? -1074 : exp - 1075;                 // |x| = m * 2^e exactly
  let n: bigint;
  if (e >= 0) {
    n = m * (b1 << BigInt(e)) * million;
  } else {
    const num = m * million;
    const den = b1 << BigInt(-e);
    const q = num / den;
    const r2 = (num % den) * b2;
    n = r2 > den ? q + b1 : r2 < den ? q : q + (q % b2 === b0 ? b0 : b1);
  }
  const digits = n.toString().padStart(7, "0");
  return `${x < 0 ? "-" : ""}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

/** The canonical text of a value: sorted keys (UTF-16 order), compact, no NaN. Mode "record" refuses any
 *  non-integer number and non-ASCII keys; mode "report" writes them as integers or six-decimal strings. */
export function canonical(value: unknown, mode: "record" | "report" = "record"): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NaN or Infinity");
    if (Number.isInteger(value) && Math.abs(value) <= MAX_SAFE) return String(value === 0 ? 0 : value);
    if (mode === "record") throw new Error("a fraction in a record");
    return JSON.stringify(fixed6(value));
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, mode)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    if (mode === "record" && keys.some((k) => /[^\x00-\x7f]/.test(k))) throw new Error("a non-ASCII key");
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k], mode)}`).join(",")}}`;
  }
  throw new Error("unsupported value");
}

// ------------------------------------------------------------------------------------------- hashing
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

/** commitment = SHA-256(salt || record bytes) */
export async function commitmentHex(saltHex: string, recordText: string): Promise<string> {
  const salt = unhex(saltHex);
  const record = new TextEncoder().encode(recordText);
  const joined = new Uint8Array(salt.length + record.length);
  joined.set(salt);
  joined.set(record, salt.length);
  return sha256Hex(joined);
}

export async function reportSha256(report: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonical(report, "report")));
}

// ------------------------------------------------------------------------------------------- proof files
/** The proof file, or a plain-words reason why it is not one. */
export function parseProof(data: unknown): ProofFile | string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "This is not an EgoQuant proof file.";
  const p = data as Record<string, unknown>;
  if (p.proof !== "egoq-proof-1" && p.proof !== "egoq-proof-2") return "This is not an EgoQuant proof file.";
  if (p.proof === "egoq-proof-2" && typeof p.document !== "string") return "The seal file has no sealed report in it.";
  if (typeof p.record !== "string" || typeof p.salt !== "string" || !HEX64.test(p.salt)
      || typeof p.commitment !== "string" || !HEX64.test(p.commitment)) return "The proof file is incomplete.";
  if (p.tx_hash != null && (typeof p.tx_hash !== "string" || !TX_HASH.test(p.tx_hash))) {
    return "The proof file has an invalid transaction hash.";
  }
  if (p.report !== undefined && (typeof p.report !== "object" || p.report === null || Array.isArray(p.report))) {
    return "The proof file's report is not readable.";
  }
  return p as unknown as ProofFile;
}

/** Every check of POST /verify, with the transaction as the backend read it from the chain. */
export async function verifyProof(proof: ProofFile, tx: TxView | null): Promise<Verdict> {
  const checks: Record<CheckName, boolean | null> = {
    document: null, hash: null, tx_found: null, chain: null, sender: null, prefix: null, commitment: null, confirmed: null,
    report: null,
  };
  let record: { versions?: { report_document_sha256?: string }; client?: { username?: string }; confirmed_at?: string } = {};
  try {
    record = JSON.parse(proof.record);
  } catch {
    record = {};
  }
  const v2 = proof.proof === "egoq-proof-2";
  if (v2) {                    // the sealed document must be exactly the one fingerprinted in the record
    const sealedHash = record.versions?.report_document_sha256;
    checks.document = !!sealedHash && sealedHash === (await sha256Hex(new TextEncoder().encode(proof.document ?? "")));
  }
  const recomputed = await commitmentHex(proof.salt, proof.record);
  checks.hash = recomputed === proof.commitment;
  checks.tx_found = !!tx?.found;
  if (tx?.found) {
    checks.chain = tx.chain_id === SEPOLIA && tx.chain_id === proof.chain_id;
    checks.sender = tx.sender_ok;
    checks.prefix = tx.prefix_ok;
    checks.commitment = tx.commitment === recomputed;
    checks.confirmed = tx.status === "confirmed";
  }
  if (proof.report !== undefined) {
    try {
      const sealed = (JSON.parse(proof.record) as { versions?: { report_sha256?: string } }).versions?.report_sha256;
      checks.report = sealed === (await reportSha256(proof.report));
    } catch {
      checks.report = false;
    }
  }
  const failed = FAILURES.find(([name]) => checks[name] === false)?.[1] ?? null;
  return { match: failed === null && checks.tx_found === true, failed, checks,
           block_number: tx?.found ? tx.block_number : null, block_time: tx?.found ? tx.block_time : null,
           format: v2 ? "v2" : "v1", document: v2 ? proof.document ?? null : null,
           sealedFor: record.client?.username ?? null, confirmedAt: record.confirmed_at ?? null };
}

// ------------------------------------------------------------------------------------------- sealed reports (v2)
export const FOOTER_BEGIN = "<!--EGOQ-SEAL-FOOTER-BEGIN-->";
const PROOF_TAG_OPEN = '<script type="application/json" id="egoq-proof">';
const PROOF_TAG_CLOSE = "</script>";

/** A downloaded sealed report (.html) as a v2 seal file: everything before the LAST footer marker is the document;
 *  the footer's embedded JSON is the record + salt + commitment + tx. null: no seal footer (never sealed). */
export function splitSealedReport(page: string): ProofFile | null {
  const i = page.lastIndexOf(FOOTER_BEGIN);
  if (i === -1) return null;
  const footer = page.slice(i);
  const a = footer.indexOf(PROOF_TAG_OPEN);
  const b = a === -1 ? -1 : footer.indexOf(PROOF_TAG_CLOSE, a + PROOF_TAG_OPEN.length);
  if (a === -1 || b === -1) return null;
  let fields: unknown;
  try {
    fields = JSON.parse(footer.slice(a + PROOF_TAG_OPEN.length, b));
  } catch {
    return null;
  }
  if (!fields || typeof fields !== "object") return null;
  const parsed = parseProof({ ...(fields as Record<string, unknown>), proof: "egoq-proof-2", document: page.slice(0, i) });
  return typeof parsed === "string" ? null : parsed;
}

/** The demo's tampered copy of a sealed report: the first shown weight ("12.3%") becomes "99.9%". */
export function tamperedReport(page: string): string {
  const i = page.lastIndexOf(FOOTER_BEGIN);
  const document = i === -1 ? page : page.slice(0, i);
  const changed = document.replace(/\d+\.\d%/, "99.9%");
  return changed + (i === -1 ? "" : page.slice(i));
}

/** A copy with one weight moved by 1 ppm (the first holding up, the last down: still 100%). For the demo. */
export function tamperedCopy(proof: ProofFile): ProofFile {
  const record = JSON.parse(proof.record) as { allocation?: { ticker: string; weight_ppm: number }[] };
  const alloc = record.allocation ?? [];
  if (alloc.length >= 2) {
    alloc[0].weight_ppm += 1;
    alloc[alloc.length - 1].weight_ppm -= 1;
  } else if (alloc.length === 1) {
    alloc[0].weight_ppm -= 1;
  }
  return { ...proof, record: canonical(record) };
}

/** Plain words for a failed check. */
export const WHY: Record<string, string> = {
  "report changed": "Something in the report itself (a number, a word or the \"Sealed for\" line) differs from the sealed original.",
  "hash differs": "The record in this file is not the one that was sealed: something in it was changed.",
  "tx not found": "The blockchain has no transaction with this hash.",
  "wrong chain": "The transaction is not on the Sepolia test network.",
  "not sent by EgoQuant": "The transaction was not sent by EgoQuant's sealing address.",
  "wrong prefix": "The transaction is not an EgoQuant seal.",
  "not yet in a block": "The seal was sent but is not in a block yet. Try again in a minute.",
  "report differs": "The report in this file is not the report that was sealed.",
};
