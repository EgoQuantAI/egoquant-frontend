# EgoQuant (website)

This is the website of EgoQuant, a wealth-advisory agent we built for the 2026 Shenzhen FinTechathon (WeBank International Track, Topic B). The engine, the API and all the documents are in [egoquant-backend](https://github.com/EgoQuantAI/egoquant-backend); this repository is the part you see in the browser. It is a snapshot of the version we submitted on 20 October 2026 (tag `submission-20oct`); our development history stays in a private repository.

| | |
|---|---|
| Website | https://www.egoquant.app |
| Frontend repository (this one) | https://github.com/EgoQuantAI/egoquant-frontend |
| Backend repository | https://github.com/EgoQuantAI/egoquant-backend |
| Technical documentation | in the backend repository: [`submission/1_Technical_Documentation/`](https://github.com/EgoQuantAI/egoquant-backend/tree/main/submission/1_Technical_Documentation) |
| Deployment instructions | [`DEPLOYMENT.md`](DEPLOYMENT.md) |

## What is in here

Next.js (App Router), React, TypeScript, Tailwind. The pages follow the steps of the product: I. Profile (the questionnaire), II. Risk Game, III. Investments, IV. Portfolio (the report with its tabs and the advisor beside it), V. Review. Plus the account pages and **Verify a report**, which checks a sealed report against the Sepolia test chain in your browser, with no account.

Two rules we kept throughout. Every number and sentence about the portfolio comes from the backend; the website lays it out and never changes it. And the browser never holds a session token: sign-in runs in the website's own server routes (`src/app/api/`), which keep the session in HttpOnly cookies and add it to each call to the backend.

| Path | What it is |
|---|---|
| `src/app/` | Pages, and the server routes under `src/app/api/` that talk to the backend and to Supabase |
| `src/components/` | The screens: questionnaire, Risk Game, report tabs, advisor, account, verify |
| `src/lib/` | Server-side auth (`server-auth.ts`), the backend proxy (`backend.ts`), the in-browser seal check (`proof.ts`) |
| `tests/`, `scripts/` | Automatic tests and the seal test-vector check |
| `docs/` | UI decisions and the screenshots used in the documents |

## Run it on your machine

You need Node.js 22 or newer. Start the backend first (its README, one command), then:

```bash
git clone https://github.com/EgoQuantAI/egoquant-frontend.git
cd egoquant-frontend
npm install
cp .env.example .env.local      # then fill in what you have; BACKEND_URL is enough to start
npm run dev
```

Open http://localhost:3000.

| Variable | What it does | Without it |
|---|---|---|
| `BACKEND_URL` | Where the backend runs (`http://127.0.0.1:8000` locally) | The live backend address written in `src/lib/backend.ts` is used |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sign-up, sign-in, saved reports, sealing (the same Supabase project as the backend) | Everything works as a visitor; the site says accounts are off |

## Test cases

```bash
npm test                          # automatic tests (node --test, tests/*.test.mjs)
npm run lint                      # ESLint
npx tsc --noEmit -p .             # type check
npm run build                     # the production build
node scripts/check-vectors.mjs    # the in-browser seal code against the backend's test vectors (323 checks; Node 22.18+)
```

The seal check makes sure the browser computes exactly the same fingerprint as the backend, for every committed proof and for tampered copies. The engine's own 3,554 tests, and what each area covers, are in the backend's README.

## Deploy it

[`DEPLOYMENT.md`](DEPLOYMENT.md): import into Vercel, set the three variables, deploy. The backend and Supabase side is in the backend's [DEPLOYMENT.md](https://github.com/EgoQuantAI/egoquant-backend/blob/main/DEPLOYMENT.md).

## Design notes

The look is deliberately plain: black, white and greys, serif headings, square edges, red only when something is wrong. The decisions behind the screens are in [`docs/UI_DECISIONS.md`](docs/UI_DECISIONS.md), and the screenshots used in the documents are in [`docs/screens/`](docs/screens/).

## The team

Savas, Umut Bideci, Aslan and Zerya, working with several Claude Code sessions (Anthropic's Claude) that wrote and reviewed much of the code under the same rules as everyone: lint, type check, build and tests before every merge. The running product does not use Claude.

The long technical README of the development repository is [README_DETAILED.md](README_DETAILED.md).
