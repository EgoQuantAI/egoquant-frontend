# EgoQuant (website)

This is the website of EgoQuant, a wealth-advisory agent we built for the 2026 Shenzhen FinTechathon (WeBank International Track, Topic B). The engine, the API and all the documents are in [egoquant-backend](https://github.com/EgoQuantAI/egoquant-backend); this repository is only the part you see in the browser.

Live: https://fintechaton-frontend.vercel.app

This is a snapshot of the version we submitted on 20 October 2026 (tag `submission-20oct`), in one commit. Our development history stays in a private repository.

## What is in here

Next.js (App Router), React, TypeScript, Tailwind. The pages follow the five steps of the product: I. Profile (the questionnaire), II. Risk Game, III. Investments, IV. Portfolio (the report with its tabs and the advisor beside it), V. Review. Plus the account pages and **Verify a report**, which checks a sealed report against the Sepolia test chain in your browser, no account needed.

One rule we kept throughout: every number and sentence about the portfolio comes from the backend. The website lays it out and never changes it.

## Run it on your machine

You need Node.js 22. Start the backend first (its README says how; one command), then:

```bash
git clone https://github.com/EgoQuantAI/egoquant-frontend.git
cd egoquant-frontend
npm install
set BACKEND_URL=http://127.0.0.1:8000     # on macOS or Linux: export BACKEND_URL=http://127.0.0.1:8000
npm run dev
```

Open http://localhost:3000. The website needs nothing else: sign-in, saved reports and sealing all go through the backend, so they work exactly as far as the backend is set up (its README says what each key turns on).

Useful checks:

```bash
npm run build                      # the production build
node scripts/check-vectors.mjs     # the browser-side seal code against the backend's test vectors (323 checks)
```

## Deploy it

Import the repository into Vercel, set `BACKEND_URL`, deploy. Details and the backend side: [DEPLOYMENT.md in the backend repository](https://github.com/EgoQuantAI/egoquant-backend/blob/main/DEPLOYMENT.md).

## Design notes

The look is deliberately plain: black, white and greys, serif headings, square edges, red only when something is wrong. The decisions behind the screens are written down in [`docs/UI_DECISIONS.md`](docs/UI_DECISIONS.md), and the screenshots we used in the documents are in [`docs/screens/`](docs/screens/).

The long technical README of the development repository is [README_DETAILED.md](README_DETAILED.md).
