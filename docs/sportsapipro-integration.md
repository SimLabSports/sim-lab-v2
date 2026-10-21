# SportsAPIPro connection — 2026-10-21

Production `SPORTSAPIPRO_API_KEY` was verified through the documented V2 `/basketball/status` endpoint. It reports Free access with 100 requests per UTC day shared across sports. The key is server-only. Neither account identity nor credentials are returned from public diagnostics.

## Actual access, not promised coverage

| Sport family | Schedule request | Usable GCM addition | Remaining limitations |
| --- | --- | --- | --- |
| Basketball (NBA, WNBA, NCAA) | HTTP 200; NBA games found | Exact event binding; derived starting-unit and availability assessments | Today's Wizards–Bucks response has `confirmed:false`, empty starters and availability concerns on both sides. Separate `/missing-players` and `/pregame-form` return 404. WNBA/NCAA league data was not established by the NBA test. |
| American football (NFL, NCAA) | HTTP 200, no games on the requested date | Exact schedule cross-check when a matching game exists | No current NFL/NCAA lineup or injury completeness established. |
| Baseball | HTTP 200 | Exact schedule matching and derived batting-card assessment where its schema matches | MLB was not identified in the tested schedule. Confirmed pitchers, full injury coverage and a validated model remain separate. |
| Hockey | HTTP 200, NHL games found | Exact event cross-check | Upcoming Buffalo–Philadelphia `/lineups` returned 404. Confirmed goalies remain missing. |
| Soccer | HTTP 200 | Exact participant-role/start cross-check | Individual competition, lineups, injuries and model readiness require event-specific verification. |
| Tennis | HTTP 200 | Exact name/start cross-check where supported | No fitness, withdrawal clearance or calibrated surface model established. Names are never fuzzy matched. |
| MMA | HTTP 200, no events on this date | Exact schedule cross-check when available | No bout-specific fitness/availability or validated model established. |
| Golf / boxing | Not in verified V2 catalogue | Existing providers preserved | No SportsAPIPro adapter claimed. |

The schedule can contain adjacent dates. Matching uses both participant roles, an explicit domestic-league check where mapped, and start-time tolerance of 15 minutes; request date alone never identifies a matchup. The completed Knicks–76ers game is present and its lineup endpoint returns a confirmed historical card. Finished games cannot receive a new pregame approval.

## Integration and controls

- `getStatistics` retains existing sources, then adds SportsAPIPro derived assessments. Both teams receive separate lineup/availability evidence.
- Only an explicitly confirmed basketball card with exactly five distinct identified starters per side can clear the lineup gate. Existing BLOCKED verifications are preserved. Missing players, empty injury lists, projected starters and generic roster listings never establish injury or workload clearance.
- Raw rosters, injuries and upstream payloads remain in private server caches and authenticated admin diagnostics. Public packets contain derived assessments, consistent with the provider's distinction between private retained data and publishable analysis. No provider probability is treated as an independent calibrated GCM estimate.
- Requests use an application-wide PostgreSQL advisory-lock budget: at most 80 attempted calls per UTC day, configurable downward with `SPORTSAPIPRO_DAILY_LIMIT`. Cache hits spend nothing. Status is cached one hour; endpoint responses, including HTTP rejection responses, ten minutes. There are no automatic retries. The first basketball schedule timed out; one manual retry succeeded.
- `/api/connections` reports safe account access metadata. `POST /api/admin/sportsapipro` requires the existing administrator session and same-origin validation. It accepts only allowlisted sports/actions/sections, numeric event IDs and ISO dates; arbitrary URLs cannot be requested.
- `.vercelignore` excludes local credentials and private diagnostic captures from subsequent CLI uploads.

## Approval remains conditional

The live verification exposed an eight-second lineup timeout. Provider calls now have a bounded fifteen-second deadline, and the GCM route allows 120 seconds for the statistics pipeline plus its unchanged 45-second OpenAI deadline. Negative responses/timeouts remain cached, with no automatic retries; research request limits remain unchanged.

This key improves actual evidence but does not supply calibrated models for every sport, full injury/minutes restriction clearance, settlement verification, or three independent expert identities. Existing NBA model bounds, risk gates, uncertainty requirements and alignment rules remain unchanged. An availability assessment is not a GCM approval and cannot light a second check by itself.

No additional credential is needed to use the verified endpoints. A 404 response does not establish whether the cause is event coverage, endpoint implementation or subscription entitlement. That distinction must be confirmed with the provider before recommending any plan upgrade. Documentation: https://docs.sportsapipro.com/llms.txt
