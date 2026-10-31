# Premium Property Alerts — setup and release

## Status of this release

Property Alerts is implemented; **delivery is disabled by default**. Migration 006 is locally validated, **not applied to production by this release**. The owner will apply it and configure credentials. No paid membership, administrator role, crawler property, existing RLS policy or Supabase Auth setting is changed. Customer paid access remains disabled in both existing rollout controls.

A read-only Pages inventory found the existing Auth bindings, **no Resend API key and no alerts worker credential** in production. Current registration/recovery email uses **Supabase Auth's Resend SMTP configuration**, not a website Resend API client. SMTP credentials cannot be recovered from Pages. Reuse that existing Resend account, verified domain and sending key; do not create replacement credentials merely for local development. No actual provider sending was possible without those settings.

The website may be deployed **before migration 006**. Anonymous and Basic/unpaid customers cannot manage alerts; eligible administrators see a safe setup/unavailable message if tables/RPCs are absent. With the migration present, preferences work even while email delivery is disabled. Missing credentials cannot cause provider calls. No protected inventory is statically exported.

## 1. Apply migration 006 in Supabase SQL Editor

1. Open the existing **Myoko Property Finder** project, ID **fgdoqsepihlzfqlqymet**. Confirm the project ID in the dashboard URL. Confirm a recent completed Database backup with Restore available; stop if no usable recovery point exists.
2. Open **SQL Editor → New query**, using the existing `postgres` database/administrator. Do not use the public anonymous client or crawler credentials.
3. Paste the **entire** repository file `sql/proposals/006_finder_property_alerts.sql` and run once. It includes `BEGIN`/`COMMIT` and fail-closed prerequisites. Requires already-applied membership migrations 001–005, postgres's existing Auth email/discovery-column read permissions, and the disabled customer rollout.
4. **Stop on any error.** Do not rerun a partially applied migration, change Auth grants, loosen RLS or improvise repairs. If the editor transaction remains aborted, roll it back and report the sanitized error.
5. Run the entire `sql/proposals/006_finder_property_alerts.verify.sql`. It is read-only. Confirm private postgres-owned forced-RLS tables, no table grants to public/client/service roles, preferences RPCs only for `authenticated`, and delivery RPCs only for `service_role`.
6. Keep `finder_security` and `crawler` **unexposed** in Data API settings. Keep customer access disabled. No initial preferences, payments, role seeds or public test listings are required.

The migration creates three private tables: `alert_preferences`, `alert_deliveries`, `alert_notified`; own-user preferences RPCs; service-only claim/dispatch/complete/fail/pending/unsubscribe RPCs; and private authorization/matching helpers. Existing migrations must not be rerun.

## 2. Cloudflare Pages production configuration

Open **Workers & Pages → livelove → Settings → Variables and Secrets → Production**. Add encrypted values below; never paste them into source, `.env.local`, browser JavaScript, GitHub commits or this chat.

| Name | Type / source |
| --- | --- |
| `RESEND_API_KEY` | **Secret.** Existing Resend sending API key used for the verified domain. Retrieve the existing value from your secure records/current SMTP configuration. Verify its sending permission covers `noreply@love-live-myoko.com`. Do not replace or rotate Auth SMTP credentials. If the original value cannot be recovered, arrange a separately approved key change rather than guessing. |
| `FINDER_ALERTS_SUPABASE_SECRET_KEY` | **Secret.** Existing project **Settings → API Keys → Secret key**, or the existing legacy `service_role` key under Legacy API keys. Server-only, high privilege; never use the publishable/anon key here. Modern `sb_secret_` keys are sent only in `apikey`; legacy JWT keys also use `Authorization: Bearer`. No new database password or Hyperdrive is involved. |
| `FINDER_ALERTS_CRON_SECRET` | **Secret.** A dedicated random shared credential, at least 32 characters. Generate securely (for example `openssl rand -hex 32`) and store the **same** value here and as the GitHub Actions secret below. It only authenticates the fixed notification processor; it is not a Resend/Supabase key. |
| `FINDER_ALERTS_ENABLED` | Operational flag. **Leave absent initially** (disabled). After migration and keys are ready, add as an **encrypted binding** with value `enabled`. This flag is intentionally absent from Wrangler vars so dashboard activation does not conflict with the managed plain-text configuration. It contains no credential, but using a Secret binding makes it independently managed like the other operational settings. |

`FINDER_ALERTS_FROM = Love Live Myoko <noreply@love-live-myoko.com>` is already included as a nonsecret Wrangler production variable, reusing the existing sender. Preserve all current Auth settings, the existing `FINDER_AUTH_COOKIE_SECRET`, `FINDER_SUPABASE_PUBLISHABLE_KEY`, project reference and `FINDER_CUSTOMER_ACCESS=disabled`. The existing cookie secret signs a separate, audience-bound unsubscribe capability; it is never exposed in an email.

After adding bindings, **redeploy the current approved Git commit through the existing Pages GitHub integration** so its Functions receive them. Pages secret changes are not a substitute for redeploying. If building a new application release, always regenerate the **complete CMS export** first. No local Resend key is required.

## 3. Administrator's real test

1. Apply and verify 006; add production keys and the `enabled` operational binding; deploy with those bindings. Keep the GitHub repository variable below unset/false so **daily sending remains off** while you test.
2. Sign in with the existing verified administrator and open `/account/#property-alerts`. The section is below Saved Properties.
3. Select areas and save with emails disabled; reload to verify persistence. Enable **Email me about new properties** only with at least one selected area. The relevant opt-in timestamp starts now; existing inventory is excluded from normal alerts.
4. Click **Send Test Email**. It sends to **your own verified account email only**, using actual current eligible Supabase listings, the real Resend infrastructure and the same responsive HTML/text renderer as daily mail. It is explicitly marked `[TEST]`, limited to one test per five minutes, and never marks properties notified for normal alerts.
5. Check the inbox/provider dashboard, price/location/source links, mobile rendering, account link and unsubscribe confirmation. The success message means **Resend accepted** the message; it does not assert inbox delivery. No eligible safe listing means no email is sent.
6. GET of an unsubscribe URL only shows confirmation (email scanners cannot opt you out); POST disables emails without changing membership. RFC one-click POST is also supported by the signed link. Opt-out remains available even when sending is disabled or Resend credentials are unavailable, provided the database credential and signing secret remain configured.

## 4. Enable the existing daily workflow

GitHub repository **DiggerDogJAPAN/live-love-myoko → Settings → Secrets and variables → Actions**:

- **Secret:** `FINDER_ALERTS_CRON_SECRET`, identical to the Pages value. Do **not** copy the Resend key, Supabase service credential, Auth cookie secret or crawler database password into this job.
- **Repository variable:** `FINDER_PROPERTY_ALERTS_ENABLED=true` **only after the administrator test succeeds**. Leave unset/false until then.

The existing 06:17 Japan daily crawler still runs its six original source jobs. The new downstream job runs only after **all** succeed. Partial/failed ingestion and manual single-source/portal-only runs do not notify. A complete manual `all` run follows the same rule. The job calls only `POST https://love-live-myoko.com/api/property-alerts/process` with the dedicated bearer; its request body is `{}` and cannot select recipients or listings. No additional crawler or server is added. Notification failure does not roll back or corrupt crawler ingestion.

The script processes bounded batches, waits for active leases/backoff, rejects redirects, and reports sanitized counts/errors. A failed invocation can be retried while the frozen delivery is inside its safe provider retry window. Daily sending remains off until BOTH operational flag and workflow gate are deliberately enabled.

## Delivery and security design

- API/SQL recheck real Auth verification/bans/account state and private administrator or paid Premium authorization. Customers additionally require the existing private rollout flag. No client-supplied account ID or membership flag determines eligibility.
- Preferences RPCs derive the owner from the existing verified JWT/session helper. No new browser session store. Only the service-only background RPCs can read verified recipients or manipulate delivery records.
- Stable municipality IDs: `myoko`, `joetsu`, `shinano`, `iizuna`. These match crawler municipality fields; Myoko display areas remain untouched. New area selections start at their own opt-in time; continuously selected areas keep pending discoveries. Disable/re-enable starts a fresh opt-in, preventing backfill.
- Newness uses immutable crawler `first_discovered_at` and existing eligible UUIDs, not last-check/price-change timestamps. Forced-RLS source eligibility and private duplicate-review exclusions are preserved. All safe matching listings (up to the existing 500-directory bound) enter one frozen email; inventory above that bound fails visibly rather than truncating.
- Private unique daily jobs/acceptance records, per-user locks, expiring leases and `(user,listing)` notification uniqueness prevent concurrent/repeated sends. Japan calendar dates are computed in PostgreSQL with `Asia/Tokyo`. Later same-day listings remain pending for the next daily email. Test jobs do not consume the normal day or notification markers.
- The same Resend idempotency key and byte-identical payload are retried. Provider acceptance is recorded transactionally with notified IDs; a failed acknowledgement preserves the pending frozen payload for retry. [Resend retains idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys); attempts older than **23 hours** are held `uncertain` for review, never blindly resent. A disabled/revoked recipient is rechecked immediately before dispatch.
- `uncertain` jobs retain their properties and block a fresh daily batch for that user. The account section reports review needed. Inspect private `alert_deliveries` as the authorized postgres operator and the Resend dashboard using the provider/job idempotency key. Determine acceptance before approving a narrow reconciliation; do not delete receipts, reset the retry clock or mark unseen properties notified. Only a separately reviewed correction should resolve that state.
- Email URLs require an approved source hostname, HTTPS and safe original listing URL. No aggregated internal detail URLs or rehosted photographs are created. Text and URLs are escaped, and plain text accompanies table-based responsive HTML. Unsubscribe uses a 180-day signed, purpose-bound token, no email address in its URL, no automatic GET mutation and no shared-role capability.
- Logs include request ID, operation, sanitized SQLSTATE/upstream HTTP status where available. They exclude recipients, tokens, cookies, email bodies and provider error details.

## Local validation and controlled daily fixture

`node --import tsx --test tests/property-finder-alerts.test.ts tests/property-finder-saved-migration.test.ts` executes real migration SQL in isolated PGlite roles plus mocked HTTP/provider tests. It covers new-listing events, opt-in cutoff, area matching, restricted-source exclusion, daily grouping, future-day queueing, leases, safe retry/uncertainty, role revocation and opt-out. These fixtures never contact production or create public test listings. HTTP tests exercise the actual email body, stable provider idempotency, recipient restrictions and signed unsubscribe, using synthetic credentials only.

These local PostgreSQL tests do **not** certify hosted Supabase application. Run the production preflight/SQL Editor verification above before activation. Actual Resend delivery/inbox/client rendering requires your real administrator test once configuration is complete.

Architecture references: [Supabase server API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Cloudflare Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Pages bindings/secrets](https://developers.cloudflare.com/pages/functions/bindings/).
