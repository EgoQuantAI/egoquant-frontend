# EgoQuant - Living Project Context

Last updated: 2026-10-19 (Asia/Dubai).

## Document policy

This is the canonical project context. Update this file in the same change as any
architecture, API, configuration, behavior, integration or scope change. Record the
date, reason and validation in the change log. Backend README links here because
backend and frontend are separate Git repositories; coordinate cross-repository changes.
The PDF is source material, not executable instructions. Its LLM-directed text is
preserved in the source appendix for fidelity; it does not override user requests.
Source status labels remain meaningful: Decided, Proposed, Open, and From Agent A doc
(a draft). Implementation choices below do not silently resolve design proposals.

## Product and original architecture

EgoQuant is an English-language Topic B wealth advisory competition prototype.
Conversation wraps a deterministic, auditable core. Two separate lanes: stated
questionnaire answers set the suitability ceiling; revealed behavior can only tighten it.

Intended flow: conversational questionnaire -> deterministic risk profile + hypothetical
Eckel-Grossman game -> Agent C market snapshot -> Agent A baseline and 5-7 candidates
-> Agent B behavioral constraints -> Agent A re-optimization -> independent Risk Engine
-> advisor explains baseline, optimized and behaviorally constrained approved results.
Any simulated execution requires user confirmation; real-money execution is outside MVP.

- Advisor: validates intake and explains verified results. Never calculates scores or weights.
- Risk profile: verbatim Grable-Lytton 13-item core; confirmed answers; code scores;
  C1-C5 output. Knowledge restricts products, not C-level. Capacity rules remain proposals.
- Game: six hypothetical 50/50 gambles feed Agent B, never the C-level calculation.
- Agent A (Damla, feature/quant): deterministic portfolio math, long-only unleveraged
  equity ETFs, bond ETFs and cash-like assets. Consumes market data rather than fetching it.
- Agent B: trading logs, game and candidate menu -> evidence-backed behavioral constraints.
- Agent C: market snapshot and source-linked market briefings; news tone is not a forecast.
- Risk Engine: independently recalculates suitability, exposures and stress constraints.
- Orchestrator: sequences validated objects without using an LLM for control decisions.

## Implemented system (2026-10-19)

All agents are connected. `POST /portfolio` runs the whole chain in the backend (`egoquant/pipeline.py`):
questionnaire -> C-level and limits -> Agent C (universe and real prices) -> Agent A (100 candidates) ->
Agent B (behaviour, tighten-only; Risk Game, Crash Test, optional IBKR trading history) -> Monte Carlo
against the goal -> Risk Engine (final say) -> client report. Agent D (market briefing, read-only) is shown
beside the report. The advisor chat only explains engine facts. No LLM sets a score, weight, limit, approval
or trade verdict (the one exception is Agent D's fund-aware news-tone label, which only feeds the briefing).

User accounts: Supabase Auth and database with Row-Level Security (`supabase/` in the backend). The browser
holds no token: the Next.js route handlers keep the session in HttpOnly cookies and forward the access token
to FastAPI, which verifies it and queries Supabase as the user. Signed-in users can connect IBKR data (Flex
report or Flex token, read-only; token and file never stored), save reports, check one planned trade against
their limits (deterministic) and record a trade they made. EgoQuant never places an order. Visitors can use
everything else without an account and nothing is stored for them. Security, threats and open gaps:
`fintechaton-backend/docs/SECURITY.md`.

The older paragraphs below describe the first starter (2026-10-17) and are kept for history.

## First starter (2026-10-17)

Chat history lives in React memory and clears on refresh/new chat. Each request sends
history to the backend and OpenAI. store=False is requested; this is not a guarantee
about provider retention. History is untrusted and cannot supply system/developer roles.
The server has no chat database. This is a local-development endpoint without user
authentication or per-user rate limiting; add both before public deployment. Input is
bounded; requests have timeouts; upstream
errors return generic messages rather than credentials or provider response bodies.

## Advisor chat (2026-10-18)

The chat is grounded in the engine's own results and explains them; it never computes or changes them.
- Profile: the frontend sends the saved questionnaire answers; the backend re-scores them with the same
  deterministic code on every message (so the browser cannot claim another C-level). The LLM gets the
  C-level, which side bound it, the limits and the plain-language explanation; not the answers or points.
- Portfolio: accepted only inside `chat_context`, the compact facts /portfolio sealed with an HMAC
  (`EGOQUANT_CONTEXT_SECRET`, else a key derived from the OpenAI key). Edited, foreign or older-than-14-days
  contexts are refused and the user is told to rebuild. Facts: Risk Engine verdict and checks, holdings,
  limits, hypothetical stress tests, reasons, goal simulation, Agent C universe, market briefing (marked as
  untrusted third-party text). A portfolio built for another C-level than the current answers is flagged stale.
- Compliance guard (`egoquant/advisor/guard.py`, patterns in `advisor/config.yaml`): every reply is checked
  sentence by sentence BEFORE it is shown, also while streaming. A sentence that reads like a trade instruction,
  price target, return promise or forecast is withheld and a note says so. Hits are logged by pattern only.
- Model: `OPENAI_MODEL` (default gpt-5.5, reasoning effort low). `store=False`. The audit log
  (`egoquant.audit.chat`) records model, prompt version, grounding flags, guard hits, latency and tokens,
  never message text.
- Advisor page: streaming replies with markdown and in-app links, suggested follow-up questions, a "what the
  advisor sees" panel, Stop and New chat; the conversation is kept in sessionStorage for the tab.
  `/advisor?q=<question>` opens the advisor and asks that question at once (for "Ask the advisor" links).
- Two clients share this protocol: `src/app/advisor/page.tsx` and the portfolio page's
  `src/components/advisor-panel.tsx`. Both use the stream events above, the request body, the history window
  (30 messages / 28,000 characters) and the sessionStorage key `egoquant.advisor.chat.v1`, so the panel's
  conversation continues on /advisor. Change any of these in both files together.
- Evaluation: `python eval/chat_redteam.py` (live, a few cents) runs 19 grounding, compliance, privacy,
  prompt-injection and language cases and writes `eval/results/chat_redteam_<time>.jsonl`.

## Current API contract

- GET /: project and running status (existing).
- GET /health: process health only, not OpenAI connectivity (existing).
- POST /chat and POST /chat/stream (Next.js `/api/chat`, `/api/chat/stream`): body
  {"messages":[...], "answers": <questionnaire answers>|null, "portfolio_context": <chat_context from
  /portfolio>|null, "page": "advisor"|...}. 1-30 user/assistant messages, 4000 characters each, 30000 total,
  ending in user. /chat returns {"reply","suggestions","grounding":{"profile","portfolio","notices"},"filtered"};
  /chat/stream sends server-sent events `meta` (grounding, suggestions), `delta` ({"text"}), then `done`
  ({"reply","filtered"}) or `error` ({"status","detail"}). See "Advisor chat" below.
- POST /portfolio also returns `chat_context`: the advisor's facts about this portfolio, sealed with an HMAC.
- Errors: 422 invalid request; 503 missing key; 429 upstream quota/rate limit;
  504 upstream timeout; 502 upstream failure, empty or incomplete output.
- Browser -> same-origin Next.js `/api/chat` route -> BACKEND_URL -> FastAPI -> OpenAI.
  The browser no longer requests the FastAPI service directly.
- POST /preferences/form (Next.js `/api/preferences`): body {"answers": <questionnaire answers>,
  "trading_platforms": [...]}. Returns the investment-type questions (P1-P7) for that profile;
  each option has `available` and, when false, a `reason` (risk class, R-level, knowledge or
  platform). Not scored; never changes the C-level or a limit.
- POST /portfolio now takes `preferences` ({"preferences_version", "choices": {"P1": [...]}})
  instead of `interest_areas` (exactly one of the two). Answers are re-validated against the
  profile's form (an option that was not offered is a 422; an old version is a 409). The
  response adds `universe`: what Agent C priced (instruments, not fetched with reasons,
  same-exposure replacements, cache hits, new requests).

## Investment interests and Agent C data selection (2026-10-18)

Flow: questionnaire -> C-level -> `/interests` (platforms, then P1 "which kinds of
investments" and follow-ups; options the profile does not allow are shown greyed with the
reason) -> Risk Game if needed -> `/portfolio`. Agent C keeps a directory of every US-listed
stock and ETF by name (Nasdaq stock screener and symbol directory, Tiingo's supported-tickers
list, one Tiingo IEX request for dollar volume), sorted into the interest-area clusters by
fixed rules; about 4,450 instruments after excluding leveraged, inverse, options-strategy and
ETN products. It is rebuilt weekly. For the chosen interests Agent C walks those clusters,
most traded first; an instrument Tiingo cannot price is replaced by the next one in the same
cluster. Caps: 25 per cluster, 50 single stocks, 30 crypto-assets, 100 instruments in total
(Agent A's optimizer time). Data budget: 40 new Tiingo requests per build (free tier: 50 an
hour); cached prices are free, and a monthly guard stays under Tiingo's 500 distinct tickers.
Crypto investors get the whole Binance market priced; Agent A receives the most traded coins.
Funds tracking the same index (VOO/IVV/SPY) form exposure groups: Agent A receives one.
"Promising" is not used as a ranking signal: ranking by recent performance would be a
forecast. All numbers are PROVISIONAL. Changing interests clears a saved portfolio;
retaking the questionnaire clears saved interests.

## Integration handoff for the three Python model owners

Treat the source designs as proposals until the team agrees the actual callable interfaces.
Each owner should provide module/import path, supported Python version, dependency list,
input/output schemas, a small synthetic fixture, failure/status contract and tests.
Keep model execution outside the chat route until schemas and orchestration are agreed.

Expected concepts (not implemented shared contracts): InvestorContext, MarketSnapshot,
Constraint (numeric type/value/source/hard/confidence/evidence_ref), PortfolioProposal
(weights/method/as_of/volatility/stress/binding constraints/status/diagnostics/input_hash),
RiskProfile, and GameResult. Do not invent thresholds in an adapter. Preserve optimal,
infeasible and fallback results. Agent B must never relax suitability limits. Agent A's
score-blind input and moving equity caps into constraints still require agreement with
its owner. Risk approval must be independent before results are presented as approved.

## Open decisions carried forward

Urgent: equity caps together with asset R-levels; final portfolio selection rule;
interest areas (gold/real estate/crypto) versus ETF-only investment universe.
Also open: capacity cutoffs and ownership; min(tolerance, capacity) confirmation;
complex-product restrictions; exact questionnaire contradiction exceptions; currency
adaptation; reassessment cadence/drawdown triggers; game comparison/constraint mapping,
confidence and payoff units; shared schemas and stress-scenario ownership; Agent B log
format, signals, confidence, soft-constraint behavior and rules vs LLM; Agent C sources,
licenses, fixtures, tone method and evaluation; rejection fallback; permission tiers;
privacy/retention; sandbox evidence; evaluation baselines; delivery owners and deadlines.
The PDF's numerical worked examples are illustrative, not production policies.

## Change log

- 2026-10-19: Docs brought up to date. Accounts (Supabase Auth + RLS), IBKR trading history (Flex report
  or token) feeding Agent B, saved reports, `/account/trade-check` and "I made this trade", Agent D
  briefing, Crash Test; the "not yet connected" statements were removed. Stray merge markers removed from this
  file. Validation: backend offline suite 1115 passed, 1 known failure (`tests/briefing/test_news_ui.py`,
  routed to its owner). No browser QA by this change.
- 2026-10-18: Goal-based portfolio choice (backend `october18`, see CLAUDE.md decision 19): 100
  candidates, Agent B shortlist of 5-20, 10,000-path block-bootstrap Monte Carlo on ~20 years of real
  returns (younger funds completed by Stambaugh/Page regression), highest goal probability chosen.
  Frontend: the goal view lists the funds whose early history was completed and the history note;
  when too little history exists, the portfolio page shows why no goal probabilities were computed
  (`goal_unavailable`). Validation: ESLint, TypeScript and `npm run build` pass.
- 2026-10-18: Advisor chat grounded in the engine (see "Advisor chat"). Backend: `egoquant/advisor`
  (facts, HMAC seal, compliance guard), `POST /chat/stream`, `chat_context` on `/portfolio`, model gpt-5.5.
  Frontend: rebuilt `/advisor` page (streaming, markdown, suggestions, context panel, `?q=` deep link),
  `/api/chat/stream` proxy. Validation: backend 688 offline tests pass; live red-team eval 19/19;
  TypeScript and ESLint pass on the changed files. No browser visual QA was performed.
- 2026-10-18: Agent C reworked around an investment directory (every US stock and ETF by name,
  clustered by category) and a cluster walk with same-cluster replacement; whole Binance market
  for crypto investors; monthly Tiingo ticker guard. The portfolio page reports how many
  candidates were not priced. Validation: backend 562 offline tests pass; live directory build
  (4,448 instruments, 11 s); real-data build with a 10-request Tiingo budget approved (33
  priced, 2 same-exposure replacements); synthetic end-to-end through the Next.js routes approved;
  ESLint, TypeScript and `npm run build` pass. No browser visual QA was performed.
- 2026-10-18: Investment interests step and interest-driven Agent C data fetching (see the
  section above). New `/interests` page and `/api/preferences` route; the portfolio page uses
  the saved interests instead of raw interest areas and shows what Agent C priced. Backend:
  larger catalog with exposure groups, prioritized fetching within a data budget,
  `POST /preferences/form`, `preferences` in `POST /portfolio`. Validation: backend 514
  offline tests pass; ESLint, TypeScript and `npm run build` pass; end-to-end through the
  Next.js routes on synthetic data (C4 profile -> form -> portfolio approved, 40 instruments);
  one real-data run with a 6-request Tiingo budget (19 cached, 6 fetched, 15 left out with a
  reason, approved). No browser visual QA was performed.
- 2026-10-17: Added a deterministic Risk Game gate. When the stored risk-capacity
  level is below the risk-tolerance level, capacity is already the binding limit and
  the game is skipped in the profile result, sidebar and game route.
- 2026-10-17: Aligned the risk-game wheel's visual win/lose sectors with its top
  pointer. The outcome-selection math already measured sectors from the top, while the
  previous gradient started 90 degrees to the left.
- 2026-10-17: Moved the sidebar date formatting into a client-side effect so the
  chat page no longer evaluates `new Date()` during prerendering.
- 2026-10-17: Removed italic styling from the chat page's editorial titles.
- 2026-10-17: Replaced Geist with DM Sans for the chat interface and Instrument Serif
  for editorial headings and future large numeric displays. Fonts are loaded with
  Next.js font self-hosting and swap behavior.
- 2026-10-17: Hardened the Railway-to-OpenAI connection by disabling inherited proxy
  environment settings in the OpenAI HTTP client. Connection failures now log only the
  exception-type chain for diagnosis without returning provider details or secrets.
- 2026-10-17: Corrected the Next.js chat proxy's production Railway fallback from an
  obsolete application address to `https://web-production-ee5cc.up.railway.app`.
  The previous address reached Railway but returned `404 Application not found`.
- 2026-10-17: Removed all cross-origin configuration. The browser now calls a
  same-origin Next.js `/api/chat` route, which forwards requests to FastAPI using the
  server-only BACKEND_URL setting. Removed the backend middleware, origin settings,
  environment variable, tests and documentation tied to the previous design.
- 2026-10-17: Simplified the frontend to a plain chat page. Removed the product
  header, introductory copy, prototype notice, empty-state prompt, message labels,
  new-chat control and footer while preserving the working conversation flow.
- 2026-10-17: Converted the full initial PDF into the source appendix and added this
  living implementation context. Added backend/frontend onboarding READMEs, environment
  templates, bounded Responses API chat and a Next.js conversation UI. Three external
  Python models remain unintegrated. Validation: six mocked backend tests pass; live GPT smoke request returns HTTP 200;
  ESLint and TypeScript pass; production build passes with `npm run build -- --webpack`.
  Default Turbopack build is blocked here by port-binding restrictions (after Google
  font access was approved). No browser visual QA was performed.

## Initial design - full extracted source

The following is the complete text extracted from the supplied 29-page PDF. PDF diagrams
and visual layout remain in the original PDF; consult it for diagram placement and arrows.
Competition, legal and licensing statements below are source assertions, not independently
verified current guidance. Do not treat proposed limits or example portfolios as policy.

EgoQuant System Context Document
Oct 17, 2026  ·  @Bartu
How to use this document
This is the shared context for our FinTechathon 2026 entry, a Topic B wealth advisory
agent. Paste it whole into any LLM conversation before asking for help, so the model
knows what we are building, what is decided and what is still open.
Instruction to any LLM reading this: treat the decisions in "Decisions made so far" as
fixed unless a team member explicitly reopens them. Where something is listed as an
open question, say so rather than silently choosing an answer. Keep the separation of
roles described below: the LLM never computes scores or portfolio weights; deterministic
code does.
Status labels used throughout:
Decided: agreed by the team.
Proposed: recommended design, not yet confirmed by the whole team.
Open: unresolved; see the open questions section.
From Agent A doc: taken from Damla's "EgoQuant Agent A: Interface and Architecture
Proposal" (branch feature/quant), which is itself a draft for team review.
Working product name: EgoQuant. Official language of the track: English.
Competition context
We are a 5-person team in the International Track of the 2026 Shenzhen International
FinTech Competition (FinTechathon), WeBank FinTech College Students Challenge.
Registration and submission share one deadline: October 20, 2026, 23:59 Beijing time
(UTC+8), which is 15:59 UTC and 19:59 Abu Dhabi.
Theme: "AI as a Financial Participant": an AI agent that completes real tasks in a financial
scenario. We chose Topic B, Wealth Advisory Agent: an agent that mirrors a professional
wealth-advisory workflow (product comparison, client risk profiling, advisory dialogue)
and produces compliant, explainable asset-allocation suggestions.
Scoring (same for all six topics):
EgoQuant System Context Document
Page 1 of 29
The 0–5 point challenge bonus applies to on-chain exploration (Topic F), so it does not
apply to us.
Submission checklist:
1. Technical documentation: system architecture, core algorithm description, security
design.
2. Presentation deck: final presentation of at most 10 minutes.
3. Demo video: optional, at most 5 minutes.
4. Source code: README, GitHub repository link, deployment instructions, test cases.
5. Security self-assessment report: permission-tier implementation and known-risk list.
6. Execution evidence: for non-on-chain topics like ours, simulated-account or sandbox
operation logs plus a demo video.
Submissions can be updated until the deadline; the latest version counts. Third-party
data, code and open-source components must be properly licensed.
After submission: online review by WeBank experts and scholars; finalists announced
October 31; check-in and WeBank HQ visit in Shenzhen November 20; Grand Final
November 21–23. At least one team member must attend in person. Prize pool RMB
250,000 (First Prize RMB 100,000; Best Innovation Award RMB 20,000).
What the judges care about (from presentations we found in Chinese sources about the
competition; these are the organizers' messages, not our ideas):
The brief asks for a commercially viable, innovative, explainable and controllable
agent, and advises teams to pick the topic they can deliver best. A modest idea that
runs beats an ambitious one that does not.
Compliance built into the design, not reviewed afterwards.
The agent acts, a human confirms. WeBank's examples and a bull/bear → trader → risk-
manager structure shown in one talk follow this pattern.
Criterion Weight
Task completion 40%
Security & compliance 30%
Innovation & interaction 30%
EgoQuant System Context Document
Page 2 of 29
Meet users where they are: WeBank's own agent works inside chat groups, so a chat-
based agent fits.
Measured results against a baseline: the 2025 champion presented percentage
improvements over a named baseline, not a feature list.
Deck format: about 10 slides for 10 minutes: problem → why now → architecture → live
demo → security design → results with numbers → commercial case → summary.
Product overview
EgoQuant is a chat-based wealth advisor that profiles a user's risk, builds a suitable
portfolio with deterministic math, adjusts it to how the user actually behaves, has it
checked independently, and explains every step. It also delivers personalized market-
intelligence briefings tied to the user's portfolio.
What the user provides (three inputs):
1. Risk questionnaire, delivered conversationally. Determines risk tolerance
(willingness), risk capacity (ability), knowledge and experience, and produces a C1–C5
classification.
2. Financial and behavioral data: past trading logs, current portfolio, the amount they
plan to invest, and other relevant facts (goal, horizon, liquidity needs). The planned
amount, goal and horizon are collected inside the questionnaire's capacity section so
nothing is asked twice; trading logs go to Agent B.
3. Areas of interest chosen by the user, for example stocks, bonds, gold and metals, real
estate, crypto. These drive Agent C's briefings and trigger suitability checks.
Components:
Component Role Uses an LLM?
Conversational Advisor Talks to the user; turns chat
into validated structured
fields; explains validated
results
Yes, at the edges only
Risk profile module Runs the questionnaire,
scores it with fixed code,
outputs the C-level and
numeric limits
Only for delivery and answer
mapping, never for scoring
EgoQuant System Context Document
Page 3 of 29
System architecture
The system runs two separate lanes. What users say (the questionnaire) sets the
regulatory ceiling. What users do (the Eckel–Grossman game and trading logs) can only
tighten it, never loosen it.
Component Role Uses an LLM?
Eckel–Grossman game One-click risk game
measuring revealed risk
preference; result goes to
Agent B
No
Agent A: Quantitative
Portfolio Engine
Builds candidate portfolios
and optimizes within numeric
constraints
No (deterministic)
Agent B: Behavioral Twin Compares candidates with
trading logs and the game
result; can only tighten limits
Open: how much LLM vs rules
Agent C: Market
Intelligence
Supplies market data to Agent
A; produces news briefings
with a tone score
Yes, for reading and
summarizing news
Risk Engine Independently re-checks the
final portfolio; approves or
rejects
No (deterministic)
Orchestrator Sequences calls and passes
validated objects between
components
No
EgoQuant System Context Document
Page 4 of 29
The example values (C3, 40% equity cap) are illustrative; the actual cap per C-level is an
open question.
Design principles (the first six are from the Agent A doc and apply system-wide):
1. Deterministic core. Scoring, optimization and checks are plain code. Same inputs
always give the same outputs.
2. LLM at the edges only. The LLM turns conversation into validated structured fields on
the way in, and explains validated numbers on the way out. It never computes a score, a
weight or a limit.
3. Agent A fetches no data. Agent C supplies prices and metadata; Agent A validates
them and reports data-quality issues.
4. Every constraint is explicit. Each limit is a numeric Constraint  object with a source
( suitability , system , behavioral ), a confidence and an evidence reference, so its
effect is traceable.
Agent interaction · two lanes, example user at C3
EgoQuant System Context Document
Page 5 of 29
5. Infeasible is a result, not a crash. Every output carries a status.
6. Honest labels. Historical estimates are not forecasts; stress results are hypothetical;
synthetic data is labeled synthetic.
7. Stated vs revealed stay separate (proposed). The questionnaire owns the stated lane;
Agent B owns the revealed lane. Keeping them apart is what makes contradiction
detection possible.
8. Behavior only tightens (proposed). Agent B can lower limits but never raise them
above what the questionnaire allows, because the regulatory classification legally
comes from the assessment.
9. Agent A is score-blind (proposed). Agent A never sees the questionnaire score or C-
level, only numeric limits such as the maximum equity weight.
End-to-end flow (steps 2–7 from the Agent A doc; step 1 and the game are our additions):
1. Profile. The Advisor runs the questionnaire in chat. The risk profile module scores it
and sends numeric limits ( suitability_max_equity , goal-based max_stress_loss ,
allowed R-levels) as Constraint  objects with source = "suitability" . The user
also plays the Eckel–Grossman game.
2. Data. The Orchestrator requests a MarketSnapshot  from Agent C.
3. Menu. Agent A builds a baseline portfolio and a candidate menu of 5–7 portfolios from
minimum variance up to the equity cap, each with volatility and stress losses.
4. Behavior. Agent B compares the menu with trading logs and the game result and
returns Constraint  objects with source = "behavioral" .
5. Re-optimize. Agent A re-optimizes with all constraints and reports which ones were
binding.
6. Check. The Risk Engine independently re-verifies suitability, exposure limits and
behavioral constraints, then approves or rejects.
7. Explain. The Advisor explains three stages to the user: the baseline, the quantitatively
optimized portfolio, and the behaviorally constrained, risk-approved portfolio.
Risk profile module
The risk profile is built from three established components, scored by fixed code, and
outputs a C1–C5 level plus the numeric limits the rest of the system enforces. Everything
downstream depends on it, so validity and auditability come first and innovation sits
around the scored core, not inside it.
EgoQuant System Context Document
Page 6 of 29
Three sections
A. Risk tolerance: Grable & Lytton (G&L)
Format: 13 multiple-choice questions. Each answer carries 1 to 4 points (1 = most risk-
averse); the total runs from 13 to 47.
Published bands: 18 or below = low; 19–22 = below average; 23–28 = average/moderate;
29–32 = above average; 33 and above = high.
Item topics (paraphrased; use the exact published wording): how a best friend would
describe you as a risk taker; a TV game-show choice between a sure amount and
gambles; losing your job before a planned vacation; what to do with an unexpected
sum to invest; comfort investing in stocks; the first word that comes to mind for "risk";
moving from government bonds into hard assets; choosing among investments by best
and worst case; a sure gain vs a gamble (gain framing); a sure loss vs a gamble (loss
framing); where to invest an inheritance; allocating a sum across low, medium and high
risk; investing in a friend's risky venture.
Evidence: a 15-year follow-up of 160,279 responses (2007–2013) found reliability and
validity held up, with Cronbach's α  = 0.77; higher scores were associated with owning
equities and negatively related to cash and bond holdings. A 2003 study found
responses correlated with portfolio ownership as Modern Portfolio Theory predicts
(concurrent and construct validity).
Known limit: predictive validity (forecasting future behavior) was not established; the
2003 authors called for longitudinal study. Agent B's behavioral lane covers this gap.
Section Measures Instrument Status
A. Risk tolerance Willingness to take
risk
Grable & Lytton 13-item
scale, verbatim
Decided
B. Risk capacity Ability to absorb
losses
Factual questions + goal-
based loss capacity (our
rule)
Proposed;
scoring rule
open
C. Knowledge &
experience
Understanding of
what they buy
Lusardi–Mitchell "Big
Three" + experience
questions
Proposed
Gate question Any loss acceptable
at all?
One yes/no question Proposed
EgoQuant System Context Document
Page 7 of 29
Where to get the items and scoring: the Rutgers NJAES Investment Risk Tolerance
Quiz PDF, which reproduces the 13 items and the scoring grid.
Licensing: the FSR papers are published under CC BY-NC 4.0 (non-commercial reuse
with attribution). A competition prototype fits; cite both papers in the technical
documentation. A commercial launch would need the authors' permission; say this on
the commercial-case slide.
Adaptation risk: the items were written in 1999 for a US audience with dollar amounts.
Keep them verbatim in the MVP. Converting currencies is an open question.
B. Risk capacity
Capacity is about facts, not attitudes, so there is no psychometric scale to borrow. The
questions follow the factors regulators require firms to collect (financial situation,
income, objectives, horizon, liquidity needs, experience). Proposed questions:
1. Investment goal (retirement, house, tuition, general growth).
2. Investment horizon.
3. How much of the invested amount they need back, and by when (liquidity need).
4. Months of living expenses saved outside this investment (emergency buffer).
5. Invested amount as a share of total wealth.
6. Income stability.
Goal-based loss capacity (proposed, our main innovation in this module). Compute the
largest loss the user can absorb without missing their goal:
\text{loss capacity} = \frac{\text{amount invested} - \text{amount needed by 
the goal date}}{\text{amount invested}}
Example: invest 50,000, need 40,000 for tuition in 12 months, so loss capacity = 10,000 /
50,000 = 20%. This becomes a Constraint  of type max_stress_loss  with source =
"suitability" , so Agent A rejects any portfolio whose stress scenario loses more than
20%.
Capacity level (1–5) = the lowest of several caps. Illustrative draft only; every cutoff
needs a one-line justification in the technical documentation:
horizon under 1 year → at most 2
emergency buffer under 3 months → at most 2
more than 50% of total wealth invested → at most 3
EgoQuant System Context Document
Page 8 of 29
loss capacity mapped to a level (cutoffs open)
otherwise → 5
C. Knowledge & experience
Big Three financial-literacy questions (Lusardi & Mitchell): compound interest,
inflation and purchasing power, and diversification (single stock vs fund). Score 0–3.
Experience: product types invested in before; years investing.
Effect (Decided): knowledge restricts products, it does not change the C-level. A low
score blocks or warns on complex products such as crypto or leveraged products.
Which products count as complex is open.
Gate question
"Would you accept any loss of the money you invest?" If no, the user goes to C1's lowest-
risk category, R1 products only, regardless of other answers. This mirrors the lowest-
tolerance category in Chinese suitability practice.
Combining into a C-level (proposed)
1. Tolerance level: G&L bands map one-to-one: ≤18 → 1, 19–22 → 2, 23–28 → 3, 29–32 → 4,
≥33 → 5.
2. Capacity level: from the rule above.
3. Final C-level = the lower of the two. Record which one was binding
( binding_dimension ) so the advisor can explain: "Your attitude is C4, but your 8-
month horizon limits you to C2."
4. Gate: if the gate answer is no, override to C1 lowest category.
5. Knowledge: never changes the C-level; adds product restrictions.
Chinese suitability mapping
Under Chinese investor-suitability rules, institutions must design a risk questionnaire and
classify ordinary investors into at least five types, C1 (including a lowest-tolerance
category) to C5. Products are rated R1 (lowest risk) to R5. The regulation does not fix the
scoring formula; each institution decides how to grade, which is why our combination rule
above is a legitimate design choice. Labels vary by firm; a common set is C1 conservative,
C2 cautious, C3 balanced, C4 active, C5 aggressive.
EgoQuant System Context Document
Page 9 of 29
Output: both a C-level and numbers (proposed)
The C-level is the official classification shown to the user and checked by the Risk Engine.
The numbers explain it and feed the math. Agent A never sees the score or the C-level,
only the numeric limits.
class RiskProfile(BaseModel):
    tolerance_score: int            # G&L total, 13-47
    tolerance_level: int            # 1-5 from published bands
    capacity_level: int             # 1-5 from our capacity rule
    loss_capacity: float | None     # goal-based max tolerable loss, e.g. 
0.20
    knowledge_score: int            # 0-3, Big Three correct
    no_loss_gate: bool              # True -> C1 lowest category, R1 only
    c_level: Literal["C1", "C2", "C3", "C4", "C5"]
    binding_dimension: Literal["tolerance", "capacity", "gate"]
    max_r_level: int                # highest product risk level allowed
    suitability_max_equity: float   # from the C-level table (open)
    blocked_product_types: list[str]  # from knowledge score
    flags: list[str]                # contradictions raised, free-text 
mappings
    questionnaire_version: str
The module sends Agent A Constraint  objects with source = "suitability" :
max_equity  (from suitability_max_equity ) and max_stress_loss  (from
loss_capacity ). Allowed R-levels and blocked product types restrict which assets
Agent A may use and are re-checked by the Risk Engine.
Investor level May buy products rated
C1 lowest category R1 only
C1 R1
C2 R1–R2
C3 R1–R3
C4 R1–R4
C5 R1–R5
EgoQuant System Context Document
Page 10 of 29
Conversational delivery (decided approach)
Validation applies to the exact wording and answer options, so the conversation wraps
around the scored questions without changing them:
Verbatim core. The LLM writes transitions; each scored question and its options
appear exactly as published, as tappable buttons.
Free text is mapped, then confirmed. If the user types instead of tapping, the LLM
proposes the matching option and asks the user to confirm. The confirmed option is
recorded, not the LLM's guess.
Scoring is code. A fixed function sums points and applies the rules.
Audit log per item: question ID and version, exact text shown, option chosen, whether
it was mapped from free text, timestamp.
Contradiction detection (decided to include)
Compare the self-description item with the scenario items. If someone calls
themselves a real gambler and then picks the most cautious scenario options, the
agent asks one neutral follow-up and lets them re-answer. Both answers are logged.
Whitelist expected differences. G&L deliberately includes a gain-framed and a loss-
framed version of a similar bet. Answering them differently reflects loss aversion, not a
contradiction. Confirm the exact item numbers against the Rutgers PDF.
Never change a score silently. The agent may ask; the user decides.
Stated-vs-revealed contradictions (questionnaire vs game or trading logs) are raised
through Agent B's lane; see the game section.
Losses shown in money (decided to include)
G&L items stay unchanged. Money framing is applied when explaining results, using
Agent A's stress numbers: "In an 'equities −30%' scenario, your 50,000 would become
about 44,000."
Re-assessment triggers (proposed)
Agent C detects a sharp negative move in one of the user's assets → the agent offers a
re-check ("markets dropped this week; does your risk preference still feel right?").
The user reports a life change (new job, new goal, shorter horizon).
A fixed interval (open).
EgoQuant System Context Document
Page 11 of 29
Eckel–Grossman risk game (feeds Agent B)
Decided: we add one validated risk game, the Eckel–Grossman (EG) task, as a measure of
revealed risk preference. Its result goes to Agent B, never to the C-level calculation. It is
the stated-vs-revealed partner to the G&L questionnaire.
What the game is
The user picks exactly one of six gambles. Each gamble is a coin flip: 50% chance of the
low payoff, 50% chance of the high payoff. Moving down the list, both the expected payoff
and the spread grow. The task comes from Eckel & Grossman (2002, 2008); the commonly
used six-gamble payoffs (as in Dave, Eckel, Johnson & Rojas, 2010) are:
Expected value = (low + high) / 2 and standard deviation = (high − low) / 2, because each
outcome has a 50% chance. Choosing gamble 6 over gamble 5 means accepting extra risk
for no extra expected payoff, which is the signature of risk-seeking.
Why this game
One screen, one click; studies use it because it is easy to understand and keeps error
rates low.
Alternatives considered: Holt–Laury lottery list (more precise, but ten paired choices
that many people find confusing); Balloon Analogue Risk Task (very game-like, more
build work). Both rejected for our timeline.
Implementation (proposed)
Show the six gambles as cards with the two outcomes and "50% / 50%" on each.
Optionally show a virtual coin flip after the choice, for engagement only.
Gamble Low payoff
(50%)
High payoff
(50%)
Expected
value
Standard
deviation
Reading
1 28 28 28 0 Sure thing; most risk-averse
2 24 36 30 6 Very risk-averse
3 20 44 32 12 Moderately risk-averse
4 16 52 34 18 Slightly risk-averse
5 12 60 36 24 Close to risk-neutral
6 2 70 36 34 Risk-seeking: same expected
value as 5, more risk
EgoQuant System Context Document
Page 12 of 29
Payoffs are hypothetical (points, or scaled to the user's currency while keeping the
ratios; open).
Play it right after the questionnaire, before the portfolio is shown, so the result is not
influenced by seeing the recommendation.
Store the result:
class GameResult(BaseModel):
    task: Literal["eckel_grossman_6"]
    choice: int                 # 1-6
    payoff_low: float
    payoff_high: float
    hypothetical: bool = True   # no real money at stake
    version: str
    timestamp: str
How Agent B uses it
1. Stated vs revealed comparison. Agent B maps the EG choice and the G&L tolerance
level onto a common scale (mapping open) and compares them. Research finds
different risk-elicitation methods often disagree, so a gap is expected and informative,
not an error.
Revealed more cautious than stated (e.g. G&L says above-average, EG choice is 1 or
2): the Advisor raises it neutrally in chat, and Agent B may add a tighter behavioral
constraint such as a lower max_stress_loss .
Revealed more aggressive than stated: flag only. It never loosens any limit.
2. New investors with no trading logs. The game is then the only revealed signal. Agent B
can still produce constraints from it, with lower confidence  than constraints drawn
from real trading history.
3. Evidence. Every constraint Agent B derives from the game carries evidence_ref
pointing to the stored GameResult .
Rules
The game never sets or raises the C-level.
Its constraints carry source = "behavioral"  and can only tighten.
It is labeled hypothetical everywhere it is shown or used.
EgoQuant System Context Document
Page 13 of 29
Known limitations (for the security self-assessment)
Hypothetical stakes. In research the task is paid in real money; ours is not, which
weakens validity.
Coarse. One choice gives six categories only.
Gains only. Every payoff is positive, so the task does not capture loss aversion; the
G&L loss-framed item partly covers this.
Method disagreement. Different risk tasks often give different answers for the same
person; we treat disagreement as a signal to ask, not as proof.
Agent A: Quantitative Portfolio Engine
Agent A is a deterministic function that builds and optimizes portfolios within numeric
constraints; it never reads free text and never interprets psychology. Owner: Damla
(branch feature/quant ). This section summarizes her proposal, then lists our proposed
changes.
Scope (from Agent A doc)
Estimates market risk, builds candidate portfolios, optimizes allocations, runs stress
tests.
Proposes portfolios; the independent Risk Engine decides whether they are
acceptable.
MVP universe: long-only, unleveraged; equity ETFs, bond ETFs and cash-like assets.
Stack: Python 3.11+, NumPy, Pandas, SciPy, Pydantic, pytest. Nothing else until
justified.
Inputs (from Agent A doc)
Object From Key fields
InvestorContext Advisor / intake investor_id , horizon_years ,
goal_type , liquidity_need ,
questionnaire_risk_score ,
suitability_max_equity ,
base_currency
EgoQuant System Context Document
Page 14 of 29
Outputs (from Agent A doc)
PortfolioProposal : weights , method , as_of , ex_ante_vol  (labeled a historical
estimate, not a forecast), vol_estimator  (e.g. sample_252d ), binding_constraints ,
status  ( optimal , infeasible , fallback ), stress  (scenario → hypothetical
return), diagnostics  (covariance condition number, data-quality flags), input_hash
(hash of all inputs, so any result can be reproduced).
Candidate menu: 5–7 PortfolioProposal  objects from minimum variance up to the
equity cap, each with volatility and stress losses. This is the main object handed to
Agent B.
Three portfolio stages shown to the user (from Agent A doc)
Object From Key fields
MarketSnapshot Agent C as_of  (no data after it may be used),
prices  (adjusted), assets  (asset class,
currency, expense ratio, liquidity tier),
data_source  (real or synthetic, labeled)
Constraint Suitability, system rules,
Agent B
type  ( max_equity , max_asset_weight ,
max_vol , max_stress_loss ), value ,
source  ( suitability , system ,
behavioral ), hard , confidence ,
evidence_ref
AgentConfig Configuration method (fixed-weight, vol-target, min-
variance, …), estimation window,
covariance shrinkage on/off, version
Stage What it is Produced by
Baseline Simple fixed-weight reference
portfolio
Agent A
Quantitatively optimized Chosen method under suitability
and system constraints
Agent A
Behaviorally constrained and
risk-approved
Re-optimized with Agent B's
constraints, then checked
Agent A, then Risk
Engine
EgoQuant System Context Document
Page 15 of 29
Showing all three makes the effect of each layer visible and auditable.
Relationships (from Agent A doc)
Agent B: A sends the menu; B returns numeric constraints A can compute and test.
Example: if the investor sold after a 12% loss, a portfolio losing 20% in the "equities
−30%" scenario is a poor fit.
Agent C: supplies data; A returns a data-quality report (missing values, gaps, stale
dates). News never changes numbers silently; at most C proposes an explicit, labeled
hypothetical scenario (e.g. rate shock +100bp). A estimates its own volatility regime
from prices.
Risk Engine: receives proposals in the standard format and independently verifies
them; A's internal checks are not a substitute.
Code structure and milestones (from Agent A doc)
Pure math module (NumPy/Pandas in and out): returns, covariance, optimizers, stress
calculations; no Pydantic, no agents; easy to unit test.
Thin wrapper class in egoquant/agents/quant.py  converting Pydantic models to
arrays and back.
Shared files ( models.py , orchestrator.py , risk_engine.py ) change only by team
agreement.
Milestones: 1 repository and interfaces · 2 returns, volatility, covariance on synthetic
data · 3 constrained minimum-variance optimizer · 4 dynamic volatility targeting · 5
deterministic stress testing · 6 behavioral integration with Agent B and Risk Engine · 7
backtesting against baselines (out-of-sample, turnover, transaction costs).
Known limitations (from Agent A doc)
Historical covariance can be unstable with short windows or many assets; volatility
targeting does not guarantee drawdown protection; stress scenarios are hypothetical;
historical mean returns are not assumed to predict future returns.
Proposed changes from the risk-profile work
1. Remove questionnaire_risk_score  from InvestorContext . No step in the Agent A
doc uses it, and keeping it contradicts "Agent A is score-blind".
EgoQuant System Context Document
Page 16 of 29
2. Send the equity cap as a Constraint  ( type = max_equity , source = suitability )
from the risk profile module, rather than as a context field. Same number, consistent
with every other limit.
3. Add the goal-based max_stress_loss  constraint from the capacity section ( source
= suitability ).
4. Restrict the usable universe per user: only assets with R-level ≤ the user's maximum,
minus product types blocked by the knowledge score.
5. Give every asset in the universe an R-level in its metadata (open: who assigns them).
Agent B: Behavioral Twin
Agent B measures what the user actually does and turns it into numeric limits that can
only make the portfolio more cautious. Its internal method is the least specified part of
the system so far.
Inputs:
The candidate menu from Agent A (each portfolio's volatility and stress losses).
Trading logs and current portfolio from the user's input #2.
The Eckel–Grossman GameResult .
Read-only: the G&L tolerance level, used only for stated-vs-revealed comparison.
Agent B does not own or emit suitability limits.
Outputs: Constraint  objects with source = "behavioral" , a confidence  and an
evidence_ref . Agreed first types are open; natural candidates are max_stress_loss ,
max_equity  and max_vol . It also emits contradiction flags for the Advisor to raise in
chat.
Example (from the Agent A doc): the investor sold after a 12% loss, so a portfolio losing
20% in the "equities −30%" scenario is a poor fit; Agent B returns max_stress_loss =
0.12 .
Signals Agent B could read from trading logs (proposed, to be scoped):
Selling after drawdowns: the size of the drop that triggered selling.
Trading frequency and turnover.
Concentration in single assets.
Holding periods vs stated horizon.
Rules:
EgoQuant System Context Document
Page 17 of 29
Behavior only tightens. B can never raise a limit above what the risk profile allows,
because the C-level legally comes from the assessment.
Constraints from real trading history carry higher confidence  than constraints from
the hypothetical game.
No trading logs (new investor): B works from the game alone, with low confidence, or
emits nothing.
Every constraint must point to its evidence, so the Advisor can say why: "You sold after
a 9% drop in 2022, so we kept your worst-case crash loss under 9%."
Open for Agent B: how logs are ingested (format, demo data); the exact mapping from
signals to constraint values; how confidence is computed; whether any LLM is used inside
B or it stays rule-based; how soft ( hard = False ) behavioral constraints are traded off.
Agent C: Market Intelligence
Agent C has two jobs: supply clean market data to Agent A, and give the user
personalized news briefings that explain what changed and why it matters to their
portfolio. It reports what sources say; it never predicts prices. Detailed design of the
briefing module is the next topic the team will work on.
Job 1: market data (from Agent A doc)
Supplies MarketSnapshot  (prices or returns, asset metadata, as_of  date, real or
synthetic label).
News never changes Agent A's numbers silently. At most, C proposes an explicit
scenario object (e.g. rate shock +100bp) labeled hypothetical.
Job 2: market intelligence briefings (proposed design)
Name it "market intelligence briefing", not "speculation". The framing matters for the
compliance score.
1. Areas of interest. The user picks areas (stocks, gold and metals, real estate, crypto,
…).
2. Trusted sources. The user names sources they follow (news outlets, subreddits,
analysts, public investor filings).
3. Interpretation. For each area, the AI summarizes what the sources say, with every
claim linked to its article.
EgoQuant System Context Document
Page 18 of 29
4. Source diversity. The AI suggests sources the user did not mention, deliberately
including credible opposing views ("all 4 of your sources are bullish crypto outlets;
here are 2 credible bearish views"). This counters confirmation bias and is one of the
module's innovation points.
5. Cadence matched to horizon. A regular briefing at a cadence fitting the user's horizon
(e.g. weekly for 6 months), plus alerts only on material change. Twice-daily updates for
a 6-month investor encourage overtrading.
6. Portfolio link. Each briefing ties news to the user's allocation and risk profile: "Tone on
gold turned negative this week (3 sources, linked). Gold is 30% of your allocation,
above the 15% your profile suggests. A reason to review, not a sell signal."
The number: news tone, not prediction (proposed)
Show the tone score next to a qualitative explanation; label it "news tone", never a
forecast. Finance researchers built a finance-specific word list (Loughran & McDonald,
2011) because general word lists misread financial text, which is why plain word counting
is rejected.
Results slide options: hand-label about 50 headlines and report how often our scorer
agrees, against word counting as the baseline; and/or plot tone against next-day returns
for one asset over a few months and report the result honestly, even if weak.
Approach What it measures Use?
Word counting
("war", "crisis")
Frequency of words No: crude; context breaks it
("crisis averted"; "war" is good
news for defense stocks)
Sentiment / tone
score
Whether an article reads
positive or negative for a given
asset
Yes: an LLM scores each article
per asset from −1 to +1 with a
one-line justification, or FinBERT
(a free finance-trained model)
Predictive score Whether news predicts returns No: would need years of data;
news on liquid assets is largely
priced in quickly; unsupported
claims hurt us
EgoQuant System Context Document
Page 19 of 29
Data sources and licensing
Bloomberg is paywalled; we cannot scrape it, and competition rules require licensed
data.
Usable: news APIs and aggregators (GDELT, NewsAPI), publishers' RSS feeds, the
Reddit API, SEC EDGAR filings.
Public investor filings (13F) can be up to about 4.5 months old (filed up to 45 days after
quarter end): background context, not live signals.
Reddit is where pump-and-dump schemes get organized: weight forum sources lower
and say so openly.
Links to the risk profile
Suitability check: if a user picks an interest area above their level (e.g. crypto at C2),
the agent flags the mismatch at selection time.
Drawdown re-check: a sharp negative move in one of the user's assets triggers an
offer to re-check the risk profile.
Compliance guardrails
Label each source by type (outlet, analyst, forum); show confidence; never output "buy X"
or "sell X"; frame as "what changed and why it might matter to you".
Risk Engine, Orchestrator and Conversational Advisor
Risk Engine
The Risk Engine is the independent checker: Agent A builds, the Risk Engine verifies, so
nothing grades its own homework. It recalculates from the weights rather than trusting
Agent A's reported numbers, so a bug in Agent A is caught instead of passed on. Per the
Agent A doc, it has the final say.
Checks:
1. Suitability (from the risk profile)
Every holding's R-level ≤ the user's C-level.
Total equity ≤ suitability_max_equity .
Stress loss ≤ goal-based max_stress_loss .
No product type blocked by the knowledge score.
EgoQuant System Context Document
Page 20 of 29
2. Exposure limits (system rules and MVP scope)
Weights sum to 100%.
Long-only, no leverage.
Only assets from the approved universe.
No single asset above max_asset_weight , if set.
3. Behavioral constraints (from Agent B)
Re-run each named stress scenario on the actual weights; check it against Agent B's
limits.
Output: approve, or reject with a reason ("Rejected: asset X is R5, investor is C3"). Every
rejection is logged for the audit trail and the security self-assessment.
After a rejection (open; proposed): fall back to the next safer portfolio on the menu that
passes. Alternatives: send it back to Agent A with the violated rule added as a constraint,
or tell the user honestly that no suitable portfolio exists ("infeasible is a result, not a
crash").
Orchestrator (from Agent A doc)
Sequences the calls in the end-to-end flow and passes validated Pydantic objects
between components.
Conversational Advisor
In: turns chat into validated structured fields ( InvestorContext , questionnaire
answers with confirmation, interest areas, sources).
Out: explains validated numbers; never invents them.
Explains the three stages (baseline, optimized, behaviorally constrained and
approved), never a single unlabeled "recommendation".
Explains why: which limit was binding and where it came from (questionnaire, capacity,
behavior).
Shows losses in money using Agent A's stress numbers.
Raises contradictions neutrally and lets the user decide.
The agent acts, a human confirms: any action (for example a simulated rebalance in
the sandbox) requires explicit user confirmation.
EgoQuant System Context Document
Page 21 of 29
Worked example: one user end to end
Sara ends at C3 with a 20% equity portfolio: the questionnaire allowed up to 40%, and her
own trading history pulled it down. All numbers below are illustrative, not computed.
1. Questionnaire. Sara invests 50,000 for about 3 years and needs 35,000 of it back at the
end.
G&L total 27 (average) → tolerance level 3.
Loss capacity = (50,000 − 35,000) / 50,000 = 30%; horizon and emergency buffer
are fine → capacity level 4.
Gate: accepts some loss. Knowledge: 2 of 3 correct (missed diversification) →
crypto blocked.
Final level = min(3, 4) = C3, binding dimension: tolerance.
2. Limits sent to Agent A ( source = suitability ): max equity 40%, max stress loss
30%, assets up to R3, no crypto.
3. Game. Sara picks gamble 2 (very risk-averse): more cautious than her "average"
questionnaire answers.
4. Agent A menu within the limits:
5. Agent B. Her logs show she sold everything after a 9% drop in 2022; the game result
agrees. B returns max_stress_loss = 0.09 , source = behavioral , high confidence,
with evidence pointing to the 2022 trades and the game. It also flags "stated average,
revealed very cautious" for the Advisor.
6. Agent A re-optimizes. Portfolios 1–3 satisfy every limit. Which one is chosen depends
on the selection rule (open); for example, the highest expected return within limits
gives portfolio 3, 20% equity. Binding constraint: B's 9% limit, not the 40% cap.
Portfolio Equity Loss if equities fall 30%
1 0% −2%
2 10% −5%
3 20% −8%
4 30% −11%
5 40% −14%
EgoQuant System Context Document
Page 22 of 29
7. Risk Engine. Recomputes: all holdings R3 or below, equity 20% ≤ 40%, stress loss
about −8% ≤ 9% and ≤ 30%, weights sum to 100%, long-only. Approved.
8. Advisor explains: "Your questionnaire allows up to 40% in stocks. But you sold after a
9% drop in 2022, and the game showed a cautious choice, so we kept your worst-case
crash loss under 9%. That's why you're at 20% stocks. In a 30% stock crash, your
50,000 would become about 46,000." It shows the baseline, optimized and approved
portfolios side by side.
If Sara had no trading logs, Agent B would rely on the game alone, with lower confidence.
Compliance, security and innovation, mapped to scoring
Our argument to the judges: a validated, auditable core with innovation placed where it
cannot compromise the classification.
Not innovation, but needed for compliance: equity caps per C-level and R-levels for
assets. Do them carefully; they earn compliance points, not innovation points.
Security self-assessment report needs (required deliverable): a permission-tier
implementation and a known-risk list. Permission tiers are not designed yet (open). A
possible starting point: read-only information and explanations need no confirmation;
Criterion (weight) What earns it in our design
Task completion (40%) Full live demo: chat profiling → game → menu →
behavioral tightening → Risk Engine approval →
explanation; sandbox execution logs
Security & compliance (30%) Validated G&L scale; C1–C5 / R1–R5 suitability
matching; deterministic scoring; independent Risk
Engine; every constraint sourced and evidenced;
audit logs; behavior only tightens; no buy/sell
signals; licensed data only
Innovation & interaction (30%) Conversational delivery with verbatim scored core;
stated-vs-revealed comparison (G&L + Eckel–
Grossman + trading logs); contradiction detection;
goal-based loss capacity; losses shown in money;
source-diversity briefings tied to the portfolio;
profile re-checks triggered by market moves
EgoQuant System Context Document
Page 23 of 29
suggestions are shown with sources and labels; any simulated transaction requires
explicit user confirmation; no real-money transactions in the MVP.
Known-risk list candidates: G&L items dated (1999, US-centric); hypothetical game
stakes; method disagreement between risk measures; historical covariance instability;
stress scenarios hypothetical; LLM mis-mapping free-text answers (mitigated by
confirmation); news-source manipulation (forum weighting); data staleness ( as_of
checks); our capacity cutoffs are design assumptions, not validated.
Decisions made so far
Decision Status
Topic B, Wealth Advisory Agent Decided (most likely; team consensus)
Use an established questionnaire (Grable &
Lytton) as the scored core rather than writing
our own
Decided
Deliver the questionnaire conversationally, with
scored items verbatim and confirmation of free-
text answers
Decided
Classify users into Chinese C1–C5 levels Decided
Contradiction detection, losses shown in money,
link to market intelligence
Decided
Knowledge restricts products; it does not
change the C-level
Decided
Add the Eckel–Grossman game as a revealed-
preference measure feeding Agent B
Decided
No random scenarios and no self-made
questionnaire replacing G&L
Decided
Architecture: two lanes (stated sets ceiling,
behavior only tightens); Agent A score-blind;
Risk Engine independent
Agreed as sound; details below are
proposals
Output both a C-level and the numeric sub-
scores
Proposed
EgoQuant System Context Document
Page 24 of 29
Open questions and issues to resolve
The three most urgent: the equity caps and R-levels, the rule that picks the final portfolio,
and the mismatch between users' interest areas and Agent A's ETF-only universe. Each
blocks code someone is writing now.
Risk profile
Decision Status
Final C-level = lower of tolerance and capacity Proposed
Goal-based loss capacity as a max_stress_loss
suitability constraint
Proposed
Remove questionnaire_risk_score  from
Agent A's input; send the cap as a Constraint
Proposed (needs Damla's agreement)
Market intelligence uses a tone score, not a
predictive score
Proposed
Equity caps per C-level and R-levels per asset. Who assigns them? Proposed starting
point: C1 0%, C2 0–10%, C3 40%, C4 70%, C5 90%; cash fund R1, bond ETF R2, broad
equity ETF R3. The two tables interact: if equity ETFs are R3, C1 and C2 can hold no
equity whatever the cap says, so decide them together.
Capacity scoring rule: who owns it, final cutoffs, and how loss capacity maps to a level.
Each cutoff needs a one-line justification in the technical documentation.
Confirm "final C-level = lower of tolerance and capacity".
Confirm outputting both the C-level and the sub-scores.
Which product types count as "complex" for the knowledge restriction.
Exact G&L item numbers for the gain/loss pair that the contradiction detector must
whitelist (check the Rutgers PDF).
G&L dollar amounts: keep verbatim, or convert to the user's currency (an adaptation to
note as a limitation).
Re-assessment: fixed interval, and how far a drawdown must go to trigger a re-check.
Verify the exact current C1–C5 labels and lowest-category definition before putting
them in the deck.
EgoQuant System Context Document
Page 25 of 29
Eckel–Grossman game
Agent A
Agent B
Agent C and interest areas
How to map the game choice (1–6) and the G&L level (1–5) onto one scale for
comparison, and what gap counts as a contradiction.
How a game result converts into a constraint value, and its confidence.
Payoff units: points, or scaled to the user's currency.
Final portfolio selection rule. Minimum variance always picks the lowest-risk point;
volatility targeting needs a target. What places this user on the menu (e.g. a target set
by C-level, or the highest return within limits)? This is the one place the risk profile
might legitimately steer Agent A beyond setting limits.
Agree the proposed changes (remove questionnaire_risk_score ; cap as
Constraint ; goal-based max_stress_loss ; per-user universe filter).
Damla's open decisions: adopt InvestorContext , Constraint , PortfolioProposal
as shared models; which constraint types B emits first; Agent C's price and metadata
format; menu as one object or a list; which stress scenarios are predefined and who
owns the list.
Trading-log format and demo data (synthetic logs are fine if labeled).
Exact signals and the mapping from signals to constraint values.
How confidence is computed; behavior with no logs.
Rule-based or partly LLM.
Interest areas vs Agent A universe. Users may pick gold, real estate or crypto, but
Agent A's MVP universe is equity ETFs, bond ETFs and cash. Either add assets such as
a gold ETF or a REIT ETF (each needs an R-level), or state that those areas feed
briefings only.
Detailed briefing design (next topic for the team).
Tone scorer: LLM or FinBERT; evaluation set and baseline.
Data sources and licences; real vs synthetic market data for the demo.
EgoQuant System Context Document
Page 26 of 29
Risk Engine and system
Pitch and delivery
Glossary and references
Glossary
What happens after a rejection (proposed: fall back to the next safer passing
portfolio).
Permission tiers for the security self-assessment report (not designed yet).
Execution evidence: we need a simulated account or sandbox that produces operation
logs, plus the demo video. Nothing is built for this yet.
Privacy handling of trading logs and personal data (storage, retention, what the LLM
sees).
Results against a baseline for the deck: candidates are tone-scorer accuracy vs word
counting; Risk Engine catches on deliberately faulty proposals; optimized vs baseline
portfolio risk in backtests.
Commercial case slide, including that G&L needs the authors' permission for
commercial use.
Owners and internal deadlines for every item above, given the October 20 submission.
Term Meaning
Risk tolerance Willingness to take financial risk (attitude)
Risk capacity Ability to absorb losses without missing goals
(facts)
Loss capacity Largest loss the user can absorb and still meet
their goal; our goal-based capacity measure
Stated preference What people say about their risk attitude
(questionnaire)
Revealed preference What people's choices show (game, trading logs)
C1–C5 Chinese investor risk levels, conservative to
aggressive
EgoQuant System Context Document
Page 27 of 29
References
Grable, J. E., & Lytton, R. H. (1999). Financial risk tolerance revisited: the development
of a risk assessment instrument. Financial Services Review.
Grable, J. E., & Lytton, R. H. (2003). The development of a risk assessment instrument: a
follow-up study. Financial Services Review 12(3).
Kuzniak, S., Rabbani, A., Heo, W., Ruiz-Menjivar, J., & Grable, J. E. (2015). The Grable and
Lytton risk-tolerance scale: a 15-year retrospective. Financial Services Review 24(2),
177–192.
Rutgers NJAES Investment Risk Tolerance Quiz: the 13 items and scoring grid.
Eckel, C. C., & Grossman, P. J. (2002, 2008). Risk-attitude elicitation with a single choice
among six 50/50 gambles.
Dave, C., Eckel, C., Johnson, C., & Rojas, C. (2010). Eliciting risk preferences: when is
simple better? Journal of Risk and Uncertainty 41(3), 219–243.
Crosetto, P., & Filippin, A. (2016). A theoretical and experimental appraisal of four risk
elicitation methods. Experimental Economics 19(3).
Lusardi, A., & Mitchell, O. S. The "Big Three" financial-literacy questions (compound
interest, inflation, diversification).
Loughran, T., & McDonald, B. (2011). When is a liability not a liability? Journal of Finance.
Term Meaning
R1–R5 Chinese product risk ratings, lowest to highest
Equity cap Maximum share of the portfolio in stocks for a C-
level (our system rule)
Stress scenario Hypothetical shock (e.g. equities −30%) applied to
a portfolio to estimate its loss
Binding constraint The limit that actually decided the result
Candidate menu Agent A's 5–7 portfolios from minimum variance up
to the equity cap
Cronbach's α Statistic for a scale's internal consistency; 0.7 or
above is usually acceptable
Tone score −1 to +1 rating of how positive an article reads for
an asset; not a forecast
EgoQuant System Context Document
Page 28 of 29
Chinese suitability practice (C1–C5 / R1–R5 matching), as published by fund
distributors: example 1, example 2, and coverage of the 2017 suitability guidelines
noting that grading rules are left to each institution.
Damla, "EgoQuant Agent A: Interface and Architecture Proposal" (internal draft,
branch feature/quant ).
FinTechathon 2026 International Track brochure (internal copy); fintechathon.g-
ican.com.
EgoQuant System Context Document
Page 29 of 29
