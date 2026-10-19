# Production connection investigation — October 19, 2026

The reported historical ENOTFOUND failure was no longer reproducible when this repair began. Production `/api/connections` returned `connected:true` and `tablesReady:true`, and real expert and GCM read/write operations succeeded. There is no evidence identifying the exact earlier malformed hostname; do not replace the now-working DATABASE_URL based on an assumed region or the older diagnostic.

## Actual provider results

- Production Fanatics feed returned the upcoming Cleveland Guardians at Tampa Bay Rays event, provider ID `be50f6c59c20efa430eec6f146a0fcb1`, scheduled October 20 at 00:10 UTC.
- A genuine production GCM POST retrieved 57 official statistical observations and reached the OpenAI Responses API. OpenAI returned **HTTP 401**. This is an AI authentication blocker, not a Supabase DNS, model calibration or statistics failure.
- The failed assessment `db93c373-a838-47d7-b9f2-d14f1e7880f0` was saved on October 19 at 20:46:41 UTC. An independent GET to `/api/intelligence` returned the identical record ID and timestamp, proving persistence and readback. This is a saved failure, not a successful AI research lean.
- Expert lookup succeeded and returned zero qualifying sources. No expert votes were invented or imported. `SIMLAB_ADMIN_TOKEN` remains unconfigured, so the authenticated import UI cannot yet be used.
- No API/DB credentials, full connection URIs or secret fragments were recorded. No new automated tests, mock data or UI redesign were introduced.

## Exact remaining external changes

In the **existing sim-lab-v2 Vercel project**, replace `OPENAI_API_KEY` for **Production** with a valid OpenAI API project secret authorized for the intended project. This must be an OpenAI API key; neither a sportsbook key nor a Supabase token authenticates to OpenAI. Save and redeploy so the runtime receives the new value. Keep the value server-only. The current 401 must be resolved before model access, quotas or a successful assessment can be verified. Do not paste the key into chat.

Set `SIMLAB_ADMIN_TOKEN` in the same environment to a private random value of at least 32 characters and redeploy. `/admin` can then import actual reviewed selections with source URLs, independent analyst/organization/origin identities, publication/expiry times, exact event/market/line, original pick and permission basis. Three independent qualifying sources are required for Expert Consensus. No licensed automatic analyst-pick feed is currently connected.

To independently verify the database is the **new Sim Lab 2.0 project**, optionally set `SUPABASE_EXPECTED_PROJECT_REF` to the project reference shown in that project's Supabase settings, without quotes or whitespace. Diagnostics report MATCH or MISMATCH without disclosing the reference. A mismatch blocks database operations. Without that independent reference, project identity remains UNVERIFIED even if SQL succeeds; table names alone cannot distinguish the old and new projects.

## Diagnostic stages

`/api/connections` now reports PostgreSQL URI validity, recognized Supabase endpoint structure, inferred connection mode, transaction port, pooled username/database shape, optional project identity match, actual DNS lookup, real SQL authentication, and a read of expected columns on each of the three tables. No host, username, project reference, password or IP address is returned. Table existence alone no longer qualifies as accessibility.

The existing pg pool remains bounded and uses unnamed parameterized queries, compatible with transaction pooling. A query timeout bounds stalled queries. TLS verification is not disabled. For any future connection change, copy the full **Transaction pooler** URI from the intended project's Supabase Connect panel: the provider supplies the host and pooled username, port 6543 and database postgres. Percent-encode reserved characters in the password; never invent the pooler hostname from a region.

AI failures now have fixed, credential-safe categories for authentication, access, quota/rate limits, inaccessible models and rejected schemas. Provider response messages are never exposed because they can contain key fragments. Connection health reads real saved GCM history across Vercel workers, so a new instance does not lose the last attempt/failure simply because its process-local health map is empty. A successful AI result is never claimed from key presence alone.

Official references: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [OpenAI API errors](https://developers.openai.com/api/docs/guides/error-codes).
