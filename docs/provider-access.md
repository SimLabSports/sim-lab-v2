# Provider access investigation — October 19, 2026

No credentials or commercial rights were inferred from a consumer subscription. No provider below was scraped or counted as a verified expert source.

| Candidate | Primary material reviewed | Result / next access requirement |
| --- | --- | --- |
| BettingPros | https://widgets.bettingpros.com/api-data/ | Published offering describes odds, props and BettingPros projections. Individual analyst picks, independent-source identities and commercial redistribution are not established by that offering. Obtain a documented analyst-pick schema and commercial agreement before automation. |
| Action Network (sports, actionnetwork.com) | https://www.actionnetwork.com/terms | Terms restrict automated acquisition. Do not confuse the unrelated actionnetwork.org organizing API with the sports company. Obtain written access and a sports analyst-pick schema; no scraping adapter was added. |
| Covers | https://www.covers.com/terms and https://www.covers.com/ | Public picks and consumer/community consensus do not establish a licensed per-analyst API. Request a feed agreement and independence metadata. Community votes are not expert opinions. |
| SportsLine | https://www.sportsline.com/ and https://help.sportsline.com/s/ | Published expert products include subscriber-only selections. No authorized programmatic pick/redistribution contract was verified. Obtain provider approval, access and schema. |

The implemented alternative is authenticated administrator curation of genuine, reviewed, permitted picks. Every entry requires an original URL, publication timestamp, explicit market and line, analyst and originating organization, permission basis and audit record. This is functional code awaiting database/admin configuration; no picks were seeded.

## Other provider references

- The Odds API: https://the-odds-api.com/liveapi/guides/v4/
- Official MLB data endpoint: https://statsapi.mlb.com/api/v1/schedule
- SportsDataIO MLB: https://sportsdata.io/developers/api-documentation/mlb
- SportsDataIO NFL: https://sportsdata.io/developers/api-documentation/nfl
- SportsDataIO NBA: https://sportsdata.io/developers/api-documentation/nba
- SportsDataIO NHL: https://sportsdata.io/developers/api-documentation/nhl
- OpenAI structured Responses output: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

SportsDataIO access must be a real-data subscription, not scrambled trial data. The adapter is disabled unless the operator confirms real-data entitlement. Public accessibility of a data endpoint does not by itself document commercial redistribution rights; verify intended deployment rights with the provider before public distribution.
