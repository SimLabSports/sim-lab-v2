# GCM operational boundaries

The original handoff is a methodology, not a trained model or historical performance record. The implemented AI chooses evidence IDs from verified statistics. It receives no market prices or expert opinions. A research lean remains `LEAN_ONLY`, with null probability, edge and uncertainty, and cannot qualify alignment or featured approval.

## Configure the existing deployment

- `ODDS_API_KEY`: required in the existing Vercel project's Production environment. Redeploy after adding it. Production reported this missing on October 19, 2026.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: production reports configured; model access and billing still require a successful real scan to verify.
- `DATABASE_URL`: production reports configured. `/api/connections` now checks connectivity and existence of all three tables. Use the server database role, not a client anonymous credential.
- `SIMLAB_ADMIN_TOKEN`: missing in production at inspection. Set a private random value of at least 32 characters to enable `/admin` expert curation. Do not share it with ordinary visitors.
- `SPORTSDATAIO_NFL_KEY`, `SPORTSDATAIO_NBA_KEY`, `SPORTSDATAIO_NHL_KEY`: licensed real-data subscriptions for those adapters; also set `SPORTSDATAIO_REAL_DATA_CONFIRMED=true` only for non-scrambled data. MLB defaults to the official public adapter if no MLB subscription key exists. NFL defaults to the public ESPN adapter when a confirmed real-data NFL subscription is absent; no additional API key is needed for qualitative NFL research. The fallback verifies exact event identity and regular-season samples, excludes forecasts and prices, and retains missing final availability and calibration gates.

NCAA Football, NCAA Basketball, tennis and soccer still need legitimately accessible event, historical performance, current availability, and sport-specific advanced-stat schemas. Neither an odds subscription nor an OpenAI key supplies those feeds. Their scans return the specific missing adapter, never substitute another sport's model.

Expert automation needs an authorized analyst-pick feed with originating analyst/organization IDs, original source, exact market/selection/line, publication time, expiry and redistribution rights. No such entitlement is currently connected. The existing curated import remains usable after admin configuration; at least three genuinely independent sources are required.

## Offline probability model development

`src/lib/gcm/calibration.ts` defines separate MLB, NFL, NBA and NHL performance feature contracts. The offline pipeline fits regularized logistic regression, fits a Platt calibrator on a later chronological partition and reports Brier score, log loss and reliability bins on an untouched later holdout. Splits exclude records whose outcomes were unsettled at the next training cutoff. No odds or expert votes are features. The baseline uses the training home-win rate, never the holdout outcome rate.

Run only with genuine archived pregame features and subsequently verified outcomes:

```
node --experimental-strip-types scripts/calibrate-gcm.mjs SPORT REAL_HISTORY.json NEW_REPORT.json
```

Input is an array of `HistoricalGame` records: `eventId`, `sport`, `startTime`, `observedAt`, `settledAt`, `homeWon` (0/1), `features` (numeric, home minus away, in the contract's exact order), and original HTTPS `sourceUrls`. Pregame timestamps must be earlier than start. Settled timestamps must be later than start and earlier than now. Event IDs must be unique. Do not reconstruct historical feature snapshots from today's season totals. Use actual archived provider observations. Files must never contain credentials.

The pipeline requires at least 1,000 authentic records and minimum 500/150/150 training/calibration/holdout records after leakage exclusions. It records source-file SHA-256 and time cutoffs. These engineering minima and an absolute calibration error threshold of 0.05 are conservative development checks, not a claim of betting efficacy or scientific validation. A report cannot enable a live prediction: `approvedForLive` remains false even when development checks pass. There is no valid historical dataset in this repository, so no fitted performance, probabilities, ROI or uncertainty interval is claimed.

Remaining work before validated green approval: obtain point-in-time historical feeds and settled outcomes; assess season/league drift and predictive usefulness on independent periods; implement a justified uncertainty method; complete advanced matchup, injury, lineup, environment and workload features; review the sport-specific model against the GCM rules; then implement versioned reviewed model publication. A four-feature development model alone cannot satisfy those requirements. NCAA/tennis/soccer models require their own feature contracts and, for three-way soccer, a multinomial outcome model.

## Manual verification

Select a real Board matchup and open its checks, or click Analysis on its detail. Observe an actual research result or an explicit configuration/data reason. Reopening within expiry reads the saved record. Passive GET routes never call OpenAI. Shared database admission bounds paid calls across workers; provider project budgets remain the final dollar-spend control.

The final approval remains fail-closed: research is separate from validated GCM support; probabilities, price edge, uncertainty, confirmed availability, source integrity and risk validation must exist before a featured candidate can be published. Three-source agreement alone is insufficient.
