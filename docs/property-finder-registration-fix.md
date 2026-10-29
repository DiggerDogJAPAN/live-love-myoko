# Registration 503 — fix and combined footer release

The owner approved deploying this fix together with the completed four-column footer improvements, using commit message `fix: resolve authentication and improve footer layout`. The investigation below records the original failure and pre-deployment evidence. Deployment status is established by the matching Git commit and Cloudflare Pages release; no automated real registrations or test memberships are part of the deployment.

The reported production request is `POST https://love-live-myoko.com/api/auth/register`, returning HTTP 503 with `{"code":"authentication_unavailable"}`. The path is `AuthForm` → browser `authRequest` → Pages `functions/api/auth/[[path]].ts` → `handleAuthRequest` → registration PKCE generation → `providerRequest('/settings')` → signup → signed flow cookie.

## Confirmed cause

The deployed provider helper passes **`redirect: 'error'`** to server-side `fetch`. Workers supports `follow` and `manual` only. With the production compatibility date/flags, workerd throws a **TypeError while constructing that fetch**, before it sends a request to Supabase. The generic outer handler converts that exception to the exact reported 503/code. The same helper also affects other Auth provider operations.

An isolated workerd reproduction produced: `Invalid redirect value, must be one of "follow" or "manual"`. This is an **application/runtime compatibility defect**, not evidence of an SMTP failure. The original helper's HTTP error handling would instead have returned `authentication_failed` for an upstream HTTP error, or `email_confirmation_not_configured` for a confirmation-settings rejection. Node-only tests and Functions compilation did not exercise this runtime restriction.

Reference: [Cloudflare Request redirect modes](https://developers.cloudflare.com/workers/runtime-apis/request/#constructor) explicitly documents the unsupported `error` mode and the required manual status check.

## Local changes

- Provider fetch uses **`redirect: 'manual'`** and rejects every 3xx response as an unavailable provider. It never follows Location or forwards API keys/passwords/tokens to another host. Browser-side fetch still uses its supported `redirect: 'error'` mode.
- A real workerd regression test executes the actual provider helper against an intercepted in-memory provider. It verifies successful settings/signup requests and rejects redirects before any second destination/request. No production accounts or emails are generated.
- Failures now log `finder_auth_failure` with a server-generated request ID, fixed Auth action/stage, HTTP status, an allowlisted Supabase error enum, validated provider request UUID and a coarse failure category. `X-Request-ID` supports correlation. Provider messages, payloads, URLs, headers, passwords, email addresses, cookies, keys, tokens and exception messages/stacks are never logged or reflected. Unknown provider codes/IDs are discarded. Masked signup/recovery errors retain account-existence privacy but become diagnosable server-side.
- Customer messages distinguish an unavailable account service from an origin mismatch without exposing internal details. Security tests cover diagnostic redaction, malformed responses, timeout/network classification, redirects and account-existence privacy.

## Production evidence and limits

Read-only Pages inspection confirmed all four expected production flags, both encrypted Auth secrets, the existing five encrypted Access/database bindings, unchanged Hyperdrive, and GitHub main → `npm ci` → complete tracked `out/`. `GET /api/auth/config` returns enabled/Google disabled, confirming runtime configuration passes its syntactic checks. Deliberately invalid registration bodies return JSON `invalid_email`/400 directly from the application, with no Access redirect; they cannot reach signup or send mail. Finder's separate Access protection is unchanged.

The Supabase target is derived from `FINDER_DATABASE_PROJECT_REF`; the intended production reference remains `fgdoqsepihlzfqlqymet`. Encrypted values cannot be read back. **Acceptance of the configured key by that project and actual email delivery were not established by the failed registration**, because it never reached Supabase. Existing Site URL/redirect, email-confirmation and Resend settings remain owner-confirmed rather than independently retrieved from the dashboard. Do not rotate secrets or change SMTP speculatively. No dashboard change is required for the confirmed redirect defect.

The existing deployment had no application provider diagnostics. A short, filtered live-tail attempt provided no historical failure details; the deterministic runtime reproduction establishes the cause independently. No real signup, recovery email, role assignment, membership write, database migration, CMS write or production configuration change was performed during this investigation.

With the corrected fetch option, a local workerd **read-only** GET reached the intended project's Auth settings endpoint and returned 401 for a deliberately invalid diagnostic key, confirming connectivity and normal provider HTTP processing. This probe used no production API key and proves no claim about its acceptance or SMTP delivery.

## Verification

All **112 tests** passed, including the actual workerd test, redirect rejection, diagnostic redaction and existing authorization/migration tests. TypeScript, changed-file ESLint and production Pages Functions compilation passed. The complete Directus-backed production build regenerated all 48 HTML pages and downloaded the current CMS assets; the security guard checked 258 text artifacts. The independent CMS audit checked 25 properties, 2 accommodations, 67 nonempty CMS text fields, 377 images, all 418 public assets, every existing HTML path and 432 local references with no missing content. SQL migration checksums remain identical to the already-applied receipt. The current production commit remains `509b5c6`; these fixes and the refreshed export are uncommitted and undeployed.

## Combined release checks

The combined release rebuild re-fetched all **377 CMS images**, regenerated the complete **48-page** static website, and independently verified **25 public properties**, **2 accommodations**, **67 CMS text fields**, **418 public assets**, all **48 baseline HTML paths** and **432 internal references**. No CMS content was missing. All **44 existing public production page URLs**, including the 27 CMS details, returned 200 with CMS text matching the current records before deployment. All **112 tests**, TypeScript, changed-file lint, production Functions compilation and the static-export security guard passed; dependency audit reported zero vulnerabilities. The four production feature flags, seven encrypted bindings and existing Hyperdrive ID were confirmed unchanged through read-only Pages metadata.

Footer source is included with Company, Navigation, Additional Information and Account in that order; the email belongs to Company and membership/account links to Account. Shared spacing uses 12px link gaps, aligned headings and the existing colour/type tokens. The responsive layout has four desktop columns, two tablet columns and one narrow-mobile column, preserving every footer destination, licence and copyright. The generated export, not an isolated source-only build, is the release artifact.

## Deployment and acceptance

Publish the **complete CMS static export** following [the established checklist](property-finder-authentication-deployment.md), and retain Access with customer paid access/Google disabled. After the successful Git-triggered Pages deployment, perform the approved read-only page/asset/footer/security checks. Leave real registration to the owner: use the same browser and verify the confirmation email/callback/account flow. If a further failure occurs, capture only HTTP status, safe JSON code and `X-Request-ID`, then correlate the sanitized event with Supabase Auth logs using its validated request ID. Check the publishable key/project pairing or SMTP only when those new logs identify the corresponding provider failure. Never paste request bodies, credentials or tokens into diagnostic tickets.
