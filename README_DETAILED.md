# EgoQuant frontend

Next.js (App Router, React, TypeScript, Tailwind) frontend for EgoQuant, a wealth-advisory agent built for the 2026
Shenzhen FinTechathon (WeBank International Track, Topic B). The investor works through these pages:
- the risk questionnaire;
- their investment interests;
- the risk game (with an optional IBKR trading-history upload);
- the portfolio, with tabs for Summary, Holdings, Why, Limits, Stress & costs, Goal, News and Data;
- a review of the independent risk checks;
- an Advisor chat that explains the results;
- a trade check: one planned trade against the investor's limits (verdict, reasons, before/after), with "I made this
  trade" for signed-in users.

- Live: https://www.egoquant.app
- Backend (engine, agents, API): https://github.com/EgoQuantAI/egoquant-backend
- Design and API notes: [Project.md](./Project.md)

**For judges:** start with `docs/judges/README.md` in the backend repository (https://github.com/EgoQuantAI/egoquant-backend): nine short documents, including the user guide and the on-chain seal. The screenshots the user guide uses are in [docs/screens](./docs/screens); the UI decisions are in [docs/UI_DECISIONS.md](./docs/UI_DECISIONS.md).

Every number and sentence about the portfolio comes from the backend. The frontend only lays it out and never
changes it.

## Run locally

Node.js 22 LTS or newer, with npm. Start the backend first (see its README), then:

```sh
npm ci
cp -n .env.example .env.local      # BACKEND_URL=http://localhost:8000
npm run dev
```

Open http://localhost:3000. `BACKEND_URL` is a server-side variable: the browser calls this app's own `/api/*`
routes, and those forward to the backend. Never put API keys in the frontend.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run build
```

## Deploy (Vercel)

Vercel deploys the `oct19` branch to production (the working branch since 19 Oct; `october18` is kept equal to it); other branches get preview deployments. In Vercel set
`BACKEND_URL` to the backend's HTTPS URL. If it is unset, the Railway production URL in `src/lib/backend.ts` is
used. The backend only accepts browser calls from the origins in its `CORS_ORIGINS`, but the normal path is
server-to-server through the `/api/*` routes.

The portfolio page works at phone widths (390px). The News tab (Agent D's read-only market briefing) also works
with older backends that do not send the newer briefing fields: missing fields fall back, and the monthly view is
then disabled.

Errors you may see:
- "Failed to fetch": the Next.js route or the backend is unavailable.
- 503: a backend key is missing.
- 429: an upstream quota or rate limit.
