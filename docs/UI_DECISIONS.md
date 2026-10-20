# UI decisions

The record of Bideci's UI decisions for EgoQuant. **Savas's rule:** on any UI clash, a `binding` line here wins over everyone
except Savas. Read this before changing the UI.

- `binding`: Bideci said it (the source quotes his words, in Turkish when he wrote Turkish) or Bideci approved a commit.
- `proposal`: not decided by Bideci. The current state, or a suggestion. Follow it unless you have a reason; ask
  Bideci (through Savas) before changing it in a big way.

Newest line at the bottom of each section. Change a line only with a new source; never delete one
(mark it `replaced by UI-xx`).

## Theme

| ID | Decision | Date | Source | Status |
|---|---|---|---|---|
| UI-01 | Never break the theme: black, white and greys (Tailwind `zinc`), square edges, the heading serif. No new accent colours anywhere. | 20 Oct | "her zaman icin temayı bozma" | binding |
| UI-02 | Red is the only colour besides the greys, and it means a problem (a blocking limit, a failed check, money running out). Warnings that do not block are black, not amber or yellow. | 20 Oct | "bazı renkli kısımlar var temayı bozan … onları siyah ve kırmızıya limitle"; commit e842bb6 | binding |
| UI-03 | Exceptions that exist today and are not yet decided: green/blue/red news-tone badges (News tab, Aslan's lane), green "sealed/match" and amber "waiting" on /verify and the seal badge, amber notices on the Advisor page. | 20 Oct | current code | proposal: ask Bideci before adding more |

## Onboarding and step order

| ID | Decision | Date | Source | Status |
|---|---|---|---|---|
| UI-10 | The investments question "How would you like to hold bonds?" (P7) is not shown; its first option ("Bond funds") is always sent. Both answers end in bond funds. | 20 Oct | "Onboarding bond sorusu iki sık da aynı kaldır … onu her turlu 1. secenek olarak kabul et"; commit 99036e7 | binding |
| UI-11 | Sidebar steps as they are on oct19 today: I. Profile, II. Risk Game, III. Investments, IV. Portfolio, V. Review; then "Ask the Advisor". | 20 Oct | current code (`components/sidebar.tsx`) | proposal: not confirmed by Bideci |
| UI-12 | If the investor did not choose stocks, the portfolio shows none, and the Summary says why. | 20 Oct | "Stok almak istemesek bile zorla stok veriyor"; backend commit 5ce2f30 | binding |

## Report (Portfolio page and saved reports)

| ID | Decision | Date | Source | Status |
|---|---|---|---|---|
| UI-20 | Tab order: Summary, Goal, Outlook, Holdings, Limits, Stress, Trade check, News, Data, Method, **Why last**. | 20 Oct | "Remove Why page, put it at the end"; commit e842bb6 | binding (Why last); the rest of the order is proposal |
| UI-21 | The Why tab opens with a box that tells the investor to ask the Advisor "why" questions. | 20 Oct | "advice to use chatbot to ask why" | binding |
| UI-22 | The Advisor always knows what the investor is doing and seeing (today: the report tab on screen is sent with every question), so they can ask about anything they see, any time. | 20 Oct | "AI will be constantly plotted about the what user doing and seeing at that point so user can ask anything about what he is seeing at anytime" | binding |
| UI-23 | Holdings: each holding's left rule has the same shade as its asset class in the asset-mix bar. | 20 Oct | "Holdings color match" | binding |
| UI-24 | Goal tab: the three outcome boxes are explained as possible end values of the portfolio. | 20 Oct | "Goal page boxes represent potentail portfolios" | binding |
| UI-25 | Outlook tab: more description; explain how to read the chart. | 20 Oct | "Outlook page description more, explain the graph" | binding |
| UI-26 | Stress tab: a plain description of what a stress test is. | 20 Oct | "Stress page describe" | binding |
| UI-27 | Data tab: sections by heading that open and close (one open at a time), not one block of text. | 20 Oct | "datapage sadece yazı, onu baslıklara gore dropdown yap" | binding |
| UI-28 | News tab: the tone scale reflects the data on screen (where the funds' tone sits, the matching band lit), never a fixed picture. | 20 Oct | "Tonescale … hep sabit onu fonksiyonel yap" | binding (the News tab is Aslan's lane; he decides how) |
| UI-29 | Lists never hide their last rows behind a "more" label; the hint sits under the list. | 20 Oct | Bideci reported a bug at the bottom of the News tab; the fix is a best guess, not confirmed | proposal |

| UI-30 | Invented sample histories (Investments IBKR step, Trade check) are always labelled "Invented example, not a real account", in the same greys as the rest. | 20 Oct | `fix/umut-12` (5cf1c47), reviewed: no clash | proposal |

## Advisor

| ID | Decision | Date | Source | Status |
|---|---|---|---|---|
| UI-50 | The chat shows faces: the person's own profile picture beside their messages, and the Advisor has its own picture, beside its replies, in the panel header and on "Ask the Advisor" in the sidebar, to give it a personality. | 20 Oct | "Advisor ile konusurken bizim pp'de gozuksun ve advisorun de pp'si olsun, ask the advisor derken onu da gorelim bi kisilik katmak adina" | binding |
| UI-51 | The Advisor's picture is an original black-and-white drawing (aviator sunglasses, short beard, dark coat and tie: `AdvisorAvatar` in `components/avatar.tsx`), inspired by the photo Bideci chose. That photo shows a real person and carries a stock-site watermark, so it is not used (likeness and copyright, and UI-01). A licensed or own photo can replace the drawing later. | 20 Oct | After Bideci's request | proposal |

## Speed

| ID | Decision | Date | Source | Status |
|---|---|---|---|---|
| UI-40 | Loading must be short everywhere; long waits are bugs. | 20 Oct | "Yuklenme sureleri her yerde … cok uzun, ona da bi el at" | binding |
| UI-41 | A build with many investments must answer in time (no timeouts). | 20 Oct | "Fazla investment secince server zamanında reply etmiyor" | binding |

## Reviews against this file

| Date | Work | Result |
|---|---|---|
| 20 Oct | `fix/umut-12` (sample histories, judges' screenshots, CSP without `unsafe-eval`, same-origin check on POST proxies), merged as 771819b | no clash |
| 20 Oct | `fix/umut-11` (trade-check card under the Advisor's reply, first-name greeting, "within your limits" wording, sign-up e-mail limit messages), merged as 12f6517 | no clash (greys and red only) |
| 20 Oct | `fix/umut-13` (24 px+ tap area for small links and buttons on phones, nothing moves), merged as 30f29f0 | no clash |
| 20 Oct | `fix/umut-14` (Trade check titles "Within your limits" / "Within your limits, with warnings" in black, "Outside your limits" in red; "attitude to risk" wording; screenshots re-made), merged as 17d23f1 | no clash; follows UI-02 |
| 20 Oct | `fix/aslan-2` (News tab wording without "Agent D"; /verify in the common shell, sidebar fixed), merged as f277099 | no clash; UI-28 tone scale kept |
| 20 Oct | `fix/aslan-3` (news dates in UTC like the report header; grey note when a saved report has no month view; "Download report (not sealed)" once sealed), fast-forwarded as 483f7c0 | no clash; greys only; UI-28/29 untouched |
| 20 Oct | `fix/umut-19` (Advisor picture in the "Ask the Advisor" title row; sidebar spacing tightens at 940 px or less so the account box stays above the fold at 900 px) + `docs/onur-1` (README pointer) | no clash; UI-50 kept |
| 20 Oct | `fix/aslan-4` (portfolio page: "Download report (not sealed)" once sealed; saved report: "news refreshed <window> when opened") | no clash; greys only |
