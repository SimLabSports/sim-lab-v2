# BettingPros server integration

The configured server-only BETTINGPROS_API_KEY is used only with x-api-key against documented https://api.bettingpros.com/v3 endpoints. The adapter does not use partner auth, x-level, debug or ungating parameters. Documentation: https://api.bettingpros.com/docs/ (consumer.4ab42ff2d11c.yaml).

## Implemented

- GET /books?location=MD validates access, actual membership/page cap and Fanatics availability. Safe status is included in /api/connections. No key value is returned.
- POST /api/admin/bettingpros requires the existing admin cookie and same-origin request. Body: {"sport":"NBA","date":"2026-10-21"}. It checks real events, discovers the full-game moneyline market from /markets and reads one actual upcoming event's /offers with picks=true. It returns limited normalized diagnostics, not unbounded upstream bodies.
- GCM statistical retrieval includes BettingPros as an additional source when the exact sport, both named participants/home-away roles and start (15-minute tolerance) match uniquely. No fuzzy matching or assumed provider IDs.
- NCAA basketball pace/efficiency fields retain the provider season and explicitly note absent sample counts. They do not enter the NBA model.
- MLB orders distinguish projected and confirmed. Only two confirmed nine-slot orders with unique player identities can supply lineup verification. An existing blocked lineup proof is not overridden. No injury/workload clearance is inferred.
- Started/unmatched events, unsupported sports, missing credentials, rejected requests and insufficient samples leave approval unavailable. Existing Odds API/Fanatics integration and appearance are preserved.

## Cost controls

Next server data caching shares validated responses across workers: ten minutes for event/offer responses and one hour for books/market metadata. An advisory-lock-protected PostgreSQL audit admission limits uncached attempts to at most 90 per UTC day (configurable downward with BETTINGPROS_DAILY_LIMIT), preserving headroom under the documented Free/Plus 100/day allowance. Failed upstream attempts count conservatively. No automatic retry loop or API-key extraction is used. Event pagination respects membership-capped responses and stops after five pages with an explicit coverage gap.

## Independence and limitations

Aggregate expert counts, community counts, bookmaker consensus and BettingPros projection outputs are not individual analyst identities with publication timestamps and source URLs. This adapter does not manufacture analyst votes or import them into Expert Consensus. It does not substitute BettingPros probabilities for the independent GCM model. Existing three-source and all GCM approval gates remain in force.

Mapped documented sports: NFL, NBA, WNBA, MLB, NHL, NCAAF, NCAAB, soccer, UFC and golf. Golf/field research still needs its separate statistical model; tennis and boxing have no supported mapping in this consumer contract. Data availability is determined from actual responses, not assumed from this list.

The documented consumer contract is personal/non-commercial; commercial display/redistribution permission is a separate provider entitlement, not something this key or code creates. Source logos/headshots excluded from consumer access are not requested or replaced through partner endpoints.
