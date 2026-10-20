# MLB scoring-form model v1

This model is a measured scoring-form baseline for MLB full-game winner research. It is not an AI confidence score, expert consensus, player-health model, or prediction for another sport. It does not establish profitability or automatically qualify a green check.

## Source and replay

The official MLB Stats API supplied 38,751 completed games from 2010–2026. Only nine-inning scheduled regular-season/postseason games with valid final scores, first pitch, game duration and provider delay were retained. Flagged resumed/rescheduled, ambiguous and incomplete-duration games were excluded. Results enter the rolling history only after a conservative availability bound: official first pitch plus game duration, provider delay and 60 minutes. That bound is explicitly derived; it is not described as an archived pregame observation timestamp.

Features are computed independently for both teams, using 10–20 prior completed games from the same season within 90 days: scoring mean, opponent scoring mean, scoring margin, margin deviation, sample count and rest. The model uses home-minus-away differences. Correlated scoring margin has no directional-advantage vote. Live inputs use the identical normalizer and feature implementation. Feature bounds come from the training period, rather than being widened to fit a current event. Historical source files and snapshots are retained in the ignored `.cache/gcm/` folder; hashes and audit results are published in `data/gcm-validation/mlb-form-v1.json`.

## Chronological validation

| Partition | Records | Period |
|---|---:|---|
| Training | 29,521 | Before 2024 |
| Platt calibration | 2,233 | 2024 |
| Holdout | 4,304 | 2025–2026 |

Held-out Brier score: **0.24650921**, versus **0.24894100** for the fixed training-period home-win baseline. Held-out log loss: **0.68608384**, versus **0.69102779**. Ten-bin expected calibration error: **0.01885238**. Both 2025 and 2026 independently improved Brier/log loss versus that baseline. The improvement is modest and is not a betting return.

A fixed weekly-cluster bootstrap using 60 holdout weeks and 5,000 resamples gave a 95% Brier-improvement interval of **0.00082377–0.00405039**. Separate scoring calculations reproduced Brier/log loss, 40 independently reconstructed feature vectors matched, and the complete held-out feature references were checked for target/future-result leakage. Twelve official live-game feeds spanning the dataset independently matched final scores and showed the sampled completion bounds were after the last play. This is a reproducible code/statistical/source audit performed by Codex, not an independent human endorsement or an exhaustive proof about every source record.

## Limits and activation

There is no archived pregame injury dataset or prospective win-rate/ROI claim. The model omits player-level starter/pitcher quality, lineup, weather and park predictors. Current availability, workload, environment and integrity gates therefore remain mandatory. A bin needs at least 50 held-out outcomes before an empirical Wilson calibration band can be used. Extreme probabilities without sufficient calibration support are withheld; the baseline does not justify inventing SAFE, BLOWOUT or LIVE CONTROL qualifications.

The independent event forecast can be displayed before bookmaker settlement verification. Price edge and approval require a compatible verified settlement contract. All three perspectives must independently qualify and favor the same comparable selection for 3/3; a supported GCM selection and Market Favorite can produce 2/3 without inventing expert picks.

## Reproduce

```powershell
node --experimental-strip-types scripts/collect-gcm-history.mjs baseball_mlb 2010 2026
node --experimental-strip-types scripts/train-gcm-form.mjs
node scripts/audit-gcm-model.mjs --verify-sources
```

Publication is a separate trusted deployment step after review. The publication script rejects a failed or mismatched audit and never runs from a browser or AI response. Do not republish an existing version or promote this model for NFL, NBA, NHL, soccer or tennis. Those sports retain their own data/model requirements.
