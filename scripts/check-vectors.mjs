// Checks src/lib/proof.ts against the backend's shared vectors (a copy of fintechaton-backend
// tests/anchoring/vectors.json in scripts/proof-vectors.json) and the public demo proof. No network.
//   node scripts/check-vectors.mjs          (Node 22.18+ runs the .ts file directly)
import { readFileSync } from "node:fs";
import { canonical, commitmentHex, fixed6, parseProof, reportSha256, sha256Hex, splitSealedReport, tamperedCopy,
  tamperedReport, verifyProof } from "../src/lib/proof.ts";

const here = new URL(".", import.meta.url);
const vectors = JSON.parse(readFileSync(new URL("proof-vectors.json", here), "utf8"));
let failures = 0;
const check = (ok, what) => { if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };

for (const v of vectors.records) {
  const text = canonical(v.value);
  check(text === v.canonical, `record canonical: ${v.name}`);
  check(new TextEncoder().encode(text).length === v.bytes, `record bytes: ${v.name}`);
  check((await sha256Hex(new TextEncoder().encode(text))) === v.sha256, `record sha256: ${v.name}`);
  check((await commitmentHex(v.salt, text)) === v.commitment, `commitment: ${v.name}`);
}
for (const v of vectors.reports) {
  check(canonical(v.value, "report") === v.canonical, `report canonical: ${v.name}`);
  check((await reportSha256(v.value)) === v.sha256, `report sha256: ${v.name}`);
}
for (const v of vectors.fixed6) check(fixed6(v.x) === v.s, `fixed6(${v.x}) = ${fixed6(v.x)}, want ${v.s}`);
for (const bad of [{ w: 0.5 }, { "é": 1 }, { w: NaN }]) {
  let threw = false;
  try { canonical(bad); } catch { threw = true; }
  check(threw, `record mode refuses ${JSON.stringify(bad)}`);
}

// The public demo proof (real engine output on real market data for an invented investor, sealed on Sepolia): the hash and the report fingerprint hold, and a
// tampered copy says "hash differs". The chain part is checked live by the /verify page, not here.
const demo = parseProof(JSON.parse(readFileSync(new URL("../public/demo-proof.json", here), "utf8")));
check(typeof demo === "object", "demo proof parses");
const tx = { found: true, status: "confirmed", chain_id: 11155111, from: demo.sealing_address, to: demo.sealing_address,
             sender_ok: true, prefix_ok: true, commitment: demo.commitment, block_number: 1, block_time: null };
const ok = await verifyProof(demo, tx);
check(ok.match && ok.checks.report === true, `demo proof matches (${ok.failed})`);
const bad = await verifyProof(tamperedCopy(demo), tx);
check(!bad.match && bad.failed === "hash differs", `tampered demo says hash differs (${bad.failed})`);

// Seal v2: a sealed report and its seal file, made by the backend on a FAKE chain (scripts/seal-v2/, synthetic prices,
// test user). The browser must reach the backend's verdicts: both verify; one changed character, a changed weight, a
// changed username or a changed embedded document says "report changed"; a page with no footer was never sealed.
const dir = new URL("seal-v2/", here);
const page = readFileSync(new URL("sealed-report.html", dir), "utf8");
const sealFile = parseProof(JSON.parse(readFileSync(new URL("seal.json", dir), "utf8")));
const fromPage = splitSealedReport(page);
check(fromPage !== null && typeof sealFile === "object", "v2 sealed report and seal file parse");
const chainTx = (p) => ({ found: true, status: "confirmed", chain_id: 11155111, from: p.sealing_address, to: p.sealing_address,
                          sender_ok: true, prefix_ok: true, commitment: p.commitment, block_number: 7, block_time: null });
for (const [name, p] of [["sealed report", fromPage], ["seal file", sealFile]]) {
  const v = await verifyProof(p, chainTx(p));
  check(v.match && v.format === "v2" && v.checks.document === true && v.sealedFor === "user_a", `v2 ${name} verifies (${v.failed})`);
}
check(fromPage.document === sealFile.document, "the sealed report's document part is the seal file's document");
const flip = (text, at) => { const i = text.indexOf("Approved", at); return text.slice(0, i) + "approved" + text.slice(i + 8); };
for (const [name, changed] of [["one character", flip(page, 0)], ["a weight", tamperedReport(page)],
                               ["the username", page.replace("Sealed for: user_a", "Sealed for: user_b")]]) {
  const p = splitSealedReport(changed);
  const v = await verifyProof(p, chainTx(p));
  check(!v.match && v.failed === "report changed", `changing ${name} says report changed (${v.failed})`);
}
const badFile = { ...sealFile, document: sealFile.document + " " };
check((await verifyProof(badFile, chainTx(badFile))).failed === "report changed", "a seal file with a changed document fails");
check(splitSealedReport(readFileSync(new URL("unsealed-report.html", dir), "utf8")) === null, "an unsealed report has no seal");

// Byte-exact sealed files: a checkout that turns LF into CRLF (Git for Windows, core.autocrlf) changes the fingerprint
// and the demo would say "Does not match". .gitattributes marks them -text; this fails if a \r gets in anyway.
const byteExact = [new URL("../public/demo-sealed-report.html", here), new URL("../public/demo-proof.json", here),
                   new URL("sealed-report.html", dir), new URL("seal.json", dir), new URL("unsealed-report.html", dir)];
for (const f of byteExact) check(!readFileSync(f).includes(0x0d), `${f.pathname.split("/").slice(-2).join("/")} has no \\r (LF bytes)`);

const total = vectors.records.length + vectors.reports.length + vectors.fixed6.length + 13 + byteExact.length;
if (failures) {
  console.error(`${failures} of ${total} checks failed`);
  process.exit(1);
}
console.log(`proof.ts matches the backend: ${total} checks passed`);
