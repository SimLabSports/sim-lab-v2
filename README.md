# Sim Lab 2.0 — Sports Intelligence

Next.js App Router, React, TypeScript, Tailwind and Lucide. The approved Home, Board and Matchup styling is preserved. The application now uses direct server providers only. Saved market snapshots, sample matchups and demo routes were removed. No automated suites or demo datasets were created in this implementation phase.

## Start and configure

Install with `npm install`, configure server-only environment variables using the blank `.env.example` as the field reference, then `npm run dev`. Preview: http://localhost:3000. Build: `npm run build`.

Never put provider secrets in `NEXT_PUBLIC_` variables. Never commit `.env.local` or send credentials in chat. Configure secrets in the local environment or deployment secret manager and restart the server.

## Operational status verified October 19, 2026

- Official MLB Stats API: successfully retrieved the day's real schedule and a 57-observation research packet for an actual matched game. Includes season hitting/pitching metrics, recent completed results, home/away recent records, rest and available probable pitchers. Confirmed batting lineups, comprehensive injuries, bullpen workload, park/weather and other advanced features are explicitly missing. This is research coverage, not a validated prediction model.
- Direct The Odds API adapter: implemented, not operational in this environment because `ODDS_API_KEY` is absent. The existing chat connector cannot supply its private credential to Next.js.
- OpenAI GCM interpretation: implemented, awaiting `OPENAI_API_KEY`, `OPENAI_MODEL`, and persistent audit storage. No AI evaluation has been claimed as successfully run.
- Expert curation: authenticated entry and PostgreSQL persistence implemented, awaiting `DATABASE_URL`, migration application, and `SIMLAB_ADMIN_TOKEN`. No real analyst votes are seeded.
- Licensed SportsDataIO expansion: NFL/NBA/NHL/MLB team/event mapping and available season statistics retrieval implemented against documented endpoints. Awaiting subscribed real-data credentials and confirmation that inputs are not scrambled trial statistics. Complete sport-specific lineups, injuries, recent game stats and advanced features are not yet mapped for these products. NCAA, soccer and tennis statistics still require their own verified provider adapters.

See `/api/connections` for process-local configuration and actual successful retrieval timestamps. Configuration alone is never a verified connection. Cache and connection status are process-local; multi-instance deployments need shared coordination before launch.

## Market data

`src/lib/market-server.ts` requests the active catalog and Fanatics moneylines/spreads/totals in American format directly from The Odds API. It uses source timestamps, validation, one-minute per-league caching, request coalescing and provider backoff. Expired application cache entries are not returned after provider failures. No bookmaker substitution or saved-data fallback exists. The all-sports catalog lists active leagues and current cached leagues; it does not bulk-poll dozens of leagues. Selecting a league retrieves it. Soccer defaults to an active EPL feed where available; tennis selects an active tournament from the provider catalog.

Original quote timestamps remain authoritative. Stale quotes cannot count as fresh market support. Raw implied percentages and complete-outcome no-vig references are distinct. Spread and total comparisons require matching lines; ties do not invent a favorite.

## Grounded GCM

`src/lib/providers/mlb.ts` retrieves official data and requires a unique participant/start-time match. It uses only completed past games for recent form. Delays, cancellations, started games, ambiguous matches and missing data prevent pregame approval.

`src/lib/gcm/evaluator.ts` sends only verified statistical inputs to the server-side OpenAI Responses API using strict structured output. It sends neither sportsbook odds nor expert selections. AI can select supplied evidence IDs, counter-evidence and a qualitative research lean. Narrative facts are rendered from original evidence values rather than unconstrained generated claims. Invalid references, refusals, incomplete responses and provider errors fail closed. Every published evaluation must be persisted with inputs, timestamps and version identifiers.

Only pregame MLB moneyline qualitative research is currently implemented. All quantitative probabilities, edges and uncertainty intervals remain null. No trained/calibrated probability model is supplied. Research leans are not eligible for a green GCM approval or featured recommendation. Other sport/market extractors and validated models are required to enable those approvals honestly.

## Expert consensus and administrator entry

Apply `migrations/001_live_intelligence.sql` to your PostgreSQL database using your database provider's authorized SQL console or migration process. Then configure `DATABASE_URL` and `SIMLAB_ADMIN_TOKEN` (a private random value at least 32 characters) and open `/admin`.

The admin session uses an HTTP-only, SameSite Strict signed cookie, constant-time token comparison, login rate limiting and same-origin mutation checks. HTTPS enables Secure cookies. Use HTTPS and a trusted ingress in production. Rate limits and caches are process-local and need shared storage when scaling out.

Import real, reviewed picks with an original HTTPS source URL, analyst identity, organization and independent origin, exact provider event/market/selection/line, publication/expiry timestamps, original pick and display-permission basis. Only pregame picks matching a current Fanatics outcome can enter. A retraction endpoint removes a vote from consensus. All imports and retractions are audited.

At least three distinct independent origins/organizations/analysts are required. Syndicated or duplicate opinions collapse to one source; newer reviewed picks supersede older ones. Stale, post-start, retracted, unreviewed, wrong-line and wrong-market records are excluded. Price-specific opinions must still match the current offered price/bookmaker. A majority yields source selection share, never an outcome win probability. Split votes show MIXED; missing votes show INSUFFICIENT DATA.

Provider investigation is recorded in `docs/provider-access.md`. No automated expert scraper or unlicensed feed was introduced.

## Endpoints

- `GET /api/markets?sport=...&market=...`: direct market data and stored independent perspectives.
- `GET /api/statistics/mlb?date=YYYY-MM-DD`: real official MLB schedule.
- `GET /api/statistics/mlb?date=YYYY-MM-DD&gameId=...`: real official research inputs for a listed game; no sportsbook inference.
- `GET /api/statistics?eventId=...&sport=...`: statistics for an event validated through the market provider.
- `GET /api/intelligence`, `/api/alignment`, `/api/expert-consensus`: use eventId, sport and market query parameters; read current verified inputs.
- `POST /api/gcm/evaluate`: administrator-only billable grounded research; accepts eventId, sport, market.
- `POST /api/admin/session`: administrator sign-in. `DELETE` signs out.
- `POST /api/admin/expert-picks`: authenticated, exact-market attributed import. `DELETE` retracts an existing record.
- `GET /api/connections`: configuration flags and actual retrieval status; never secrets.

## Alignment and candidate gates

Three checks require three fresh, independent evaluations for the same normalized selection and comparable market/line. Missing evidence is INCOMPLETE. Qualitative unvalidated GCM leans do not qualify as validated approval. Even agreement is subject to separate price, injuries/lineups, completeness, risk and model-calibration gates. Price preferences are configurable using `GCM_PRICE_MIN` and `GCM_PRICE_MAX`; passing a price range is not a value claim. No FEATURED status is produced until the quantitative model and missing integrity gates are implemented and validated.

## Main implementation files

Provider/cache logic: `src/lib/market-server.ts`, `src/lib/server/provider-http.ts`.
Statistics: `src/lib/providers/mlb.ts`, `src/lib/providers/statistics.ts`.
GCM: `src/lib/gcm/evaluator.ts`, `src/lib/research-types.ts`.
Experts and persistence: `src/lib/providers/experts.ts`, `src/lib/server/database.ts`, `migrations/001_live_intelligence.sql`.
Authentication: `src/lib/server/admin-auth.ts`.
Alignment: `src/lib/server/intelligence.ts`, `src/lib/markets.ts`.
Existing frontend components consume the backend while retaining their approved CSS, imagery, logo assets and layout. The isolated `/admin` page is the new operational entry surface.
