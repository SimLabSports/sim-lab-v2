# Automatic GCM approval

The decision engine is `src/lib/gcm/approval.ts`. Server-side orchestration in `decision-server.ts` applies it after independent AI research and reapplies it to saved research against current prices on every intelligence read. Decisions, both candidate assessments, categories, grades, gates, timestamps and source IDs are persisted in the existing `gcm_evaluations.record` JSON. No new database migration is required.

AI receives verified statistics, source IDs and missing-input/risk descriptions. It receives neither prices, market favorite nor analyst opinions. The structured response must independently assess both exact participants, with separate supporting and opposing evidence IDs; soccer adds a third explicit Draw assessment. Binary approval remains withheld for that three-way market until a matching model exists. Duplicate participants, unknown IDs or contradictory support/counter references are rejected. AI cannot output probability, grade, approval, clearance or category fields.

The approval function then evaluates both sides using current Fanatics prices and independently reviewed statistical forecasts. Market Favorite and Expert Consensus are not inputs to this function. A price-aware GCM selection can differ from either of those perspectives. The selected side must have an independent AI research lean and measured statistical advantages; the engine cannot turn an unsupported AI abstention into approval.

## Hard gates

- Exact event, sport, start, participants, market and comparable line.
- Verified pregame phase, or explicitly verified live phase for a live-trained model. Delayed/final/suspended or unverified states fail closed.
- Independent research of both sides and at least three distinct supporting citations for the candidate.
- Unambiguous provider event and evidence IDs, HTTPS sources, current timestamps and complete required inputs.
- Current cited clearance for relevant lineups/participants, injuries, workload, environment and integrity. Booleans alone are insufficient: provider evidence IDs must back each clearance. A verified blocked condition is a veto; missing clearance prevents approval.
- Exact sport/market/phase model with reviewed historical calibration, sample requirements, supported feature ranges, recent form, consistency, contextual and matchup features.
- Multiple measured directional advantages. Sample size itself is not counted as an advantage.
- Fresh valid offered price, positive expected return, material price edge and a historical calibration-band lower bound above raw implied probability.

Pregame observations/quotes expire after at most 15 minutes; live approval after at most 30 seconds. An approval also expires at the earliest research, source, clearance or model-review deadline. Client expiry timers clear stale official approval without waiting for the next full page refresh. Passive GET rechecks do not initiate paid AI calls. An expired client approval causes an explicit scan to recheck the server rather than reuse an expired badge.

## Categories and grades

| Category | Additional requirements |
| --- | --- |
| SAFE | Pregame, validated probability at least 70%, configured preferred price range, and every common gate. The original framework prefers 70%; this is stricter than the newer approximate 68% lower range. `GCM_SAFE_MIN_PROBABILITY` may raise the threshold, never lower it below 70. |
| VALUE | Pregame, material positive edge, positive expected return and conservative historical calibration support. This supplies the documented value-based exception to the general price preference. |
| BLOWOUT | Pregame and a separately reviewed score-margin model whose lower prediction bound exceeds its reviewed sport-specific blowout threshold, plus four measured advantages. Win probability alone cannot qualify the category. |
| LIVE CONTROL | Verified live state, a live-trained exact-market model, current live performance features and prices, availability and thesis/integrity clearance. Pregame evaluations are not reused as live forecasts. |
| UPSET RADAR | Pregame, positive underdog odds, three measured matchup/performance advantages and every common value/risk gate. |

All categories require the common gates, not merely their category-specific conditions. The initial conservative material-edge policy is 2 percentage points (`GCM_MIN_EDGE_PP`, always strictly positive), with positive expected return and the calibration-band lower-bound test. This is an explicit operating threshold, not a claimed historically optimized number. The general preferred range defaults to -250 through -120, configurable with existing price settings. SAFE enforces the range; other categories require the documented stronger value conditions and show the offered price and edge.

Every officially approved selection receives A. A+ additionally requires at least 80% validated probability, five percentage points of price edge and four measured advantages, with all other gates still passed. These are conservative implementation rules, not measured success rates. No grade is assigned to unvalidated research. Only A/A+ can be official GCM approvals.

Outcomes: APPROVED, LEAN, PASS or INCOMPLETE, with specific candidate and category reasons. A supported qualitative lean with missing calibration/clearance remains research. A known veto, invalid event phase, poor price value or inconsistent calibrated estimate returns PASS. No model probability or edge is generated when a reviewed estimate does not exist.

## Reviewed model boundary

`data/gcm-reviewed-models.json` is a trusted deployment allowlist. It includes the bounded MLB scoring-form baseline documented in [model validation](gcm-model-validation.md); no other sport is inferred from that model. Runtime users, web content and AI cannot register or approve models. A trusted reviewed deployment change is required to add one.

`reviewed-models.ts` implements logistic prediction, Platt calibration, historical holdout-bin uncertainty and separate linear score-margin prediction for properly reviewed artifacts. A record requires identity/version, exact sport/market/phase/target, named numeric features with directions, supported value bounds and feature groups, normalization and weights, minimum sample/bin sizes, chronological training/calibration/settlement cutoffs, dataset SHA-256, a named reviewer and review reference/expiry. A win model additionally requires calibrator parameters and genuine holdout Brier/log loss, baseline scores and ten calibration bins. A margin model requires reviewed residual bounds, holdout coverage/RMSE and a sport-specific margin threshold.

The loader checks dimensions, unique features, chronology, review expiry, recent settled data, missing or ambiguous metrics, supported feature ranges, relevant held-out sample size, calibration error and improvement over the training-derived baseline. It cannot create or certify historical data. Model review must verify source rights, leakage prevention, drift, exact bookmaker settlement semantics (including ties, pushes, overtime or voids), and suitability of the feature set for the sport. A binary two-way model must never be promoted for three-way soccer or a target whose settlement semantics it does not model. The independent event forecast can be displayed before settlement clearance. Price edge and official approval additionally require provider-declared `settlement: NO_PUSH_TWO_WAY` and cited settlement clearance. A PUSH_POSSIBLE or THREE_WAY packet cannot be approximated with complementary binary probabilities. Current providers do not yet supply this verified settlement packet. The runtime withholds soccer/spread/total/futures approval until compatible adapters exist.

The displayed 95% Wilson band estimates the observed outcome rate in the relevant historical holdout prediction bin. It is explicitly labeled **historical calibration band**, not an event-specific predictive confidence interval, guaranteed win range or posterior probability. A point estimate outside that band or a lower bound not exceeding the offered raw implied probability cannot pass the conservative value gate.

The offline training script is a development tool. Its existing four-feature reports do not automatically satisfy the richer approval schema and cannot be promoted unchanged. No fitted artifact, historical accuracy, profitable edge, model-driven official approval or live/blowout validation is claimed in the absence of the real required data and review.

## Third perspective in Triple Green Check

The GCM perspective becomes available only when the current approval is APPROVED and fresh. Triple 3/3 additionally requires fresh Market Favorite and at least three qualifying independent expert sources to select the same exact comparable outcome. The Green Check Method is the third perspective in the same 3/3 system. Its approval rules determine whether that perspective qualifies; the alignment indicators light only for qualifying perspectives supporting the market selection. A fully aligned candidate has internal status QUALIFIED; GCM_APPROVED is retained as an internal compatibility status when the method qualifies before all three agree. No expert vote is inferred from either research or prices.

The existing design classes, stylesheets, stadium assets, logos and navigation are preserved. Approval summaries, expandable gate reasons, both-side evaluations, probabilities when validated, grades and categories use the existing panels.
