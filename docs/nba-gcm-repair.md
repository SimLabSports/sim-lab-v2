# NBA GCM operational repair and baseline v1

Reproduction: New York Knicks vs Philadelphia 76ers, Odds event `2b042ddad3d3c6c6fe5b7005dc26c775`, October 20, 2026. Expert Consensus development is paused. No visual redesign or additional automated test suite is included.

## Scanning repair

Opening a detail page or an alignment inspector no longer starts a paid research request. The existing Run button and deliberate Analysis action initiate research. Price changes do not split in-flight research jobs; research cache freshness is independent of official-approval expiry. Fresh server-published research is reused without another POST. Shared database admission still protects cross-worker races and retains the existing 20/hour, 50/day, 5/visitor-hour defaults and configurable caps. Existing genuine attempt records were not erased or refunded.

Admission reports GLOBAL_HOURLY, GLOBAL_DAILY, VISITOR_HOURLY or MATCHUP_BUSY with actual counts, limit and rolling reset time. Denied and busy requests do not overwrite saved research with ERROR records. 429 responses include Retry-After; duplicate in-progress requests receive 202 and the client performs bounded read-only polling rather than another paid POST. An authenticated administrator uses a separate stable administrator visitor bucket, with the same visitor cap and the same shared global limits; this is not an unlimited bypass.

`GET /api/admin/gcm/scans` requires the existing administrator session and reports the current caller's visitor windows plus the administrator bucket. It exposes no API key, raw IP, visitor hash or database credential. Exact production window counts can only be established after this diagnostic is deployed; the previous generic error did not expose its scope. Connections were already working in the read-only production reproduction.

## Actual NBA inputs

The official `stats.nba.com/stats/leaguedashteamstats` and `leaguedashplayerstats` Advanced feeds responded with real 2025–26 data. They supply offensive/defensive/net rating, pace, possessions, efficiency, minutes and usage. `commonteamroster` provides the current roster; historical player roles are joined only to matching current player IDs. A current roster does not prove a starter or injury clearance. `leaguegamelog` verifies each team-season sample and original game dates. Current empty season rows are retained as unavailable, not invented or filled with last season's values.

The ESPN response's top-level `season` describes the current competition, while `requestedSeason` and dated event records describe a historical request. Prior-season statistics must not be rejected solely because the top-level season differs, and must never be relabeled as current. The NBA-specific enrichment uses explicit official season parameters, actual dated settled logs and exact team IDs instead of that ambiguous header. All historical metrics retain their 2025–26 label and date range.

The local reproduction retrieved 74 attributed observations, including 16 current-roster historical player-role observations. The official prior-season rows were Knicks ORtg 118.7, DRtg 112.3, pace 97.71; Sixers ORtg 114.3, DRtg 114.4, pace 100.39. These are source-specific dated team-season values, not a prediction or current-season form. Current injury reports remain attributed ESPN reports, with final availability unconfirmed.

## Reproducible NBA probability baseline

Official regular-season logs and actual first-period/game-end UTC timestamps verified **6,138 games** from 2021–22 through 2025–26. Twelve records were excluded. Every accepted game's official final play score matched its paired game-log result. Completed statistics enter replay 60 minutes after actual game end; the decision cutoff is 10 minutes before actual first-period start. These are conservative derived timing bounds, not archived pregame injury observations. Normal NBA request headers are required; collection now halts immediately on authorization denial rather than trying further URLs.

Each side uses up to 20 prior completed games within 450 days, including only the current or immediately prior season. Prior-season observations receive 0.35 relative per-game weight; recency has a 10-game half-life. This rule is identical in live extraction and replay. Features include estimated offensive/defensive efficiency, margin and its deviation, sample, capped rest, current-season weight share and estimated possessions. Possessions are explicitly estimated from both teams' FGA + 0.44 FTA − OREB + TOV, not passed off as official possession counts. Correlated margin, rest, pace and sample do not add duplicate directional-advantage votes.

| Partition | Games | Window |
|---|---:|---|
| Train | 3,533 | Before July 1, 2024 |
| Platt calibration | 1,224 | July 2024–June 2025 |
| Untouched holdout | 1,224 | 2025–26 |

Holdout Brier **0.20882358**, versus fixed training-home-rate baseline **0.24700504**; log loss **0.60564006**, versus **0.68714527**; ten-bin calibration error **0.02181912**. A fixed 5,000-resample weekly cluster bootstrap across 26 weeks gave a 95% Brier-improvement interval of **0.02628516–0.05060970**. Forty independently reconstructed feature pairs matched; every holdout feature reference was checked against its target decision cutoff. Ten sampled timing/hash receipts were rechecked. Full receipts and model limits are in `data/gcm-validation/nba-efficiency-v1.json`. Review is a reproducible Codex source/statistical audit, not an external human endorsement or prospective ROI record.

Live prior history is a sourced immutable snapshot in `data/nba-prior-history.json`, not sample/demo games. Newly completed current-season games are accepted only after official final-score and game-end verification. Missing timing records are excluded. Model probability is independent of sportsbook prices and expert opinions. Unsupported features, stale data and thin calibration bins withhold forecasts. Historical calibration bands are not event-specific guarantees.

The local Knicks reproduction produced a 71.08% home baseline forecast, with a 95% historical calibration-bin band of 69.58–82.62% (159 holdout outcomes). This baseline omits player-level injury/roster-change adjustments and is not an official GCM approval. The directionally measured advantages and all current clearance gates still apply. This is a historical validation result, not a claim about the outcome of tonight's game.

## Remaining information before deployment

- Neither side has completed a current regular-season game in the reproduction. Current-season ratings/usage cannot truthfully be supplied yet. Dated priors are available now.
- Current starters, final injury availability and minutes restrictions are not established by a roster listing or historical usage. The official NBA injury report at `https://official.nba.com/nba-injury-report-2026-27-season/` is public; comprehensive machine-readable, exact-event clearance is not yet supplied by this integration. Existing ESPN reports remain partial. No additional key is required merely to view that official report.
- No archived pregame injury/lineup-change feature set was included in training. The deployed baseline therefore cannot claim to adjust for those changes. A richer model requires timestamped historical availability and roles; this is separate from access to team performance logs, which worked.
- Applicable Fanatics jurisdiction is needed to verify settlement/void/overtime rules. Until the user provides the state and the contract is verified, price edge and settlement clearance stay withheld. No new API key or subscription is required for the research, advanced statistics or baseline training implemented here.
- Exact quota scope/count/reset must be verified using the authenticated production diagnostic after deployment. A full global cost window remains binding; the implementation does not manufacture additional quota.

Reproduce collection/training with `node scripts/collect-nba-model-history.mjs` and `node --experimental-strip-types scripts/train-nba-model.mjs`. Publication is a trusted reviewed deployment step; collection/training scripts never promote their own candidate. Research, prices, clearance status and official approval remain separate.
