<div align="center">

<img src="docs/assets/egoquant-logo.png" alt="EgoQuant" width="120">

# EgoQuant

**A wealth-advisory agent you can understand, question and audit.**<br>
Website · 2026 Shenzhen FinTechathon · WeBank International Track · Topic B

<a href="https://www.egoquant.app"><img src="https://img.shields.io/badge/Live_demo-www.egoquant.app-111111?style=for-the-badge&logo=vercel&logoColor=white" alt="Live demo"></a>
<a href="https://github.com/EgoQuantAI/egoquant-backend"><img src="https://img.shields.io/badge/Engine_+_API-egoquant--backend-24292F?style=for-the-badge&logo=github&logoColor=white" alt="Backend repository"></a>
<a href="https://github.com/EgoQuantAI/egoquant-backend/tree/main/submission/1_Technical_Documentation"><img src="https://img.shields.io/badge/Docs-technical_PDF-B31B1B?style=for-the-badge&logo=adobeacrobatreader&logoColor=white" alt="Technical documentation"></a>

<img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js 16">
<img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
<img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
<img src="https://img.shields.io/badge/Supabase_Auth-HttpOnly_cookies-3ECF8E?logo=supabase&logoColor=white" alt="Supabase Auth">
<img src="https://img.shields.io/badge/seal_check-323%2F323-2EA44F" alt="Seal check 323 of 323">

</div>

---

This is the part of EgoQuant you see in the browser. The engine, the API and all the documents are in **[egoquant-backend](https://github.com/EgoQuantAI/egoquant-backend)**.

> [!NOTE]
> A snapshot of the version we submitted on 20 October 2026 (tag `submission-20oct`), in one commit. Our development history stays in a private repository.

<p align="center">
  <img src="docs/screens/09-advisor-trade-card-desktop.png" alt="The advisor answering a trade question, with the engine's own check underneath" width="88%">
</p>

## ✨ What is in here

| | |
|---|---|
| 🧭 **The five steps** | I. Profile (questionnaire) · II. Risk Game · III. Investments · IV. Portfolio (the report and its tabs, with the advisor beside it) · V. Review |
| 🤖 **The advisor** | Explains the report in plain words, runs what-if scenarios and checks a planned trade through the engine |
| ⛓️ **Verify a report** | Checks a sealed report against the Sepolia test chain, in your browser, with no account |
| 👤 **Account pages** | Saved reports, imported trading history, consents, activity, and deleting your data |
| 🔒 **No token in the browser** | Sign-in runs in the website's own server routes; the session lives in HttpOnly cookies |
| 📐 **Numbers come from the engine** | The website lays out what the backend computed and never changes it |

## 💻 Run it on your machine

You need Node.js 22 or newer. Start the backend first ([its README](https://github.com/EgoQuantAI/egoquant-backend#-run-it-on-your-machine), one command), then:

```bash
git clone https://github.com/EgoQuantAI/egoquant-frontend.git
cd egoquant-frontend
npm install
cp .env.example .env.local      # BACKEND_URL is enough to start
npm run dev
```

Open http://localhost:3000.

| Variable | What it does | Without it |
|---|---|---|
| `BACKEND_URL` | Where the backend runs (`http://127.0.0.1:8000` locally) | The live backend address written in `src/lib/backend.ts` is used |
| `NEXT_PUBLIC_SUPABASE_URL`<br>`NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sign-up, sign-in, saved reports, sealing (the same Supabase project as the backend) | Everything works as a visitor; the site says accounts are off |

## 🧪 Test cases

```bash
npm test                          # automatic tests (node --test, tests/*.test.mjs)
npm run lint                      # ESLint
npx tsc --noEmit -p .             # type check
npm run build                     # the production build
node scripts/check-vectors.mjs    # the in-browser seal code against the backend's test vectors (323 checks; Node 22.18+)
```

The seal check makes sure the browser computes exactly the same fingerprint as the backend, for every committed proof and for tampered copies. The engine's **3,554 tests**, by area, are in the [backend README](https://github.com/EgoQuantAI/egoquant-backend#-test-cases).

## ☁️ Deploy it

See **[DEPLOYMENT.md](DEPLOYMENT.md)**: import into Vercel, set the three variables, deploy. The backend and Supabase side is in the backend's [DEPLOYMENT.md](https://github.com/EgoQuantAI/egoquant-backend/blob/main/DEPLOYMENT.md).

## 🗂️ What is where

<details>
<summary><b>Repository map</b></summary>

| Path | What it is |
|---|---|
| `src/app/` | Pages, and the server routes under `src/app/api/` that talk to the backend and to Supabase |
| `src/components/` | The screens: questionnaire, Risk Game, report tabs, advisor, account, verify |
| `src/lib/` | Server-side auth (`server-auth.ts`), the backend proxy (`backend.ts`), the in-browser seal check (`proof.ts`) |
| `tests/`, `scripts/` | Automatic tests and the seal test-vector check |
| `docs/` | UI decisions and the screenshots used in the documents |
</details>

## 🎨 Design

Deliberately plain: black, white and greys, serif headings, square edges, red only when something is wrong. The decisions behind the screens are in [`docs/UI_DECISIONS.md`](docs/UI_DECISIONS.md); the screenshots used in the documents are in [`docs/screens/`](docs/screens/).

## 👥 Team

**Savas, Umut Bideci, Aslan and Zerya**, working with several Claude Code sessions (Anthropic's Claude) that wrote and reviewed much of the code under the same rules as everyone: lint, type check, build and tests before every merge. The running product does not use Claude.

<sub>The long technical README of the development repository: [README_DETAILED.md](README_DETAILED.md).</sub>
