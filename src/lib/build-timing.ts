// How long a portfolio build may take, in one place, so the three layers cannot drift apart:
//   browser fetch (BUILD_BROWSER_TIMEOUT_MS)  >  platform limit of the route (`maxDuration` = 120 s, a literal in each route
//   file because Next reads it statically)  >  proxy wait (BUILD_PROXY_TIMEOUT_MS)  >  the backend's own budget.
// The proxy gives up first and answers with its own readable 504; the platform never cuts the route before that answer is
// sent; the browser never gives up before the route has answered. A build is normally 5 to 8 s; with many interest areas
// and a slow data feed it can take much longer, so the page says what is going on (see components/build-status.tsx).

export const BUILD_PROXY_TIMEOUT_MS = 115_000;
export const BUILD_BROWSER_TIMEOUT_MS = 125_000;
/** After this many seconds the page says the data source is slow and offers a retry. */
export const BUILD_SLOW_AFTER_S = 100;
/** The backend uses this many interest areas for prices and news (egoquant_routes.py PORTFOLIO_MAX_INTEREST_AREAS). */
export const INTEREST_AREA_LIMIT = 8;
