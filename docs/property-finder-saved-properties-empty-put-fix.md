# Saved Properties — production empty-PUT validation fix

Status: the owner has approved this application-only production release after local validation. No production SQL is required or authorized. Customer access stays disabled. No frontend design, administrator role, membership data, RLS policy, SQL function or Cloudflare setting changed.

## Confirmed failure

The owner captured production `PUT /api/property-finder/saved-properties/:listingId` returning **HTTP 400 Bad Request** with JSON `{"code":"invalid_saved_request"}`. The JSON code has no extra leading quote. The same deployed handler reproduced that exact response in local workerd with an authorized synthetic administrator.

The frontend correctly uses `property.id`, the stable UUID projected from the eligible database view. `SavePropertyButton` validates its shape; `savedRequest('/' + id, 'PUT')` sends a same-origin cookie-authenticated request with **no JSON body**. UUID hex/hyphen characters require no additional URL encoding. The Function extracts and validates the path UUID and obtains the owner from signed Supabase claims; it does not expect a JSON owner/property payload. A malformed UUID would return `invalid_listing_id`, not the observed code.

Workers represents a bodyless PUT as a **non-null ReadableStream with zero bytes**, usually `Content-Length: 0`. The deployed `if (request.body)` branch cancelled that empty stream and rejected it. Node's directly constructed bodyless Request uses null instead, so the earlier Node API tests did not reproduce the transport representation. This is an application request-validation bug, not an SQL/SMTP/provider error. The failing branch runs after successful authorization and **before** `savedPropertyOperation`; no PostgreSQL error/SQLSTATE causes this 400. The heart fills optimistically, then its existing error handler rolls back after the rejected response and shows the unchanged friendly fallback.

## All invalid_saved_request validation sites

- Saved IDs/list: unknown query parameters, duplicate cursor, any query on `/ids`, or a malformed cursor/date/UUID.
- Save/remove: query parameters on the UUID route.
- Body validation: invalid/nonzero Content-Length or any actual payload bytes. The deployed bug instead rejected the mere presence of a stream.

The confirmed frontend UUID route has no query parameters and sends no payload; the body-stream truthiness check was the triggering condition. Route matching, UUID extraction and membership checks are preserved.

## Minimal correction

Keep the zero-byte payload contract. Permit absent bodies and streams that reach EOF without bytes; reject any nonempty content, including whitespace, JSON ownership fields and chunked bodies, cancelling at the first payload chunk. Content-Length zero alone is not trusted as proof. There is no change to the frontend request format and no newly accepted JSON payload.

GET `/ids` and GET the saved dashboard normally have null bodies, so the identified condition does not reject them. Read-only production inspection found successful read-counter activity with no write-counter activity and no saved records, consistent with requests stopping before storage. Existing helper signatures, owners, fixed search paths and website EXECUTE grants were verified read-only. DELETE may have a null body or an explicit empty stream depending on transport; the same correction safely supports both. No authenticated production save/remove was attempted by the agent, and there is no claim that every authenticated production endpoint was independently exercised.

## Safe diagnostics

Saved responses now include a server-generated `X-Request-ID`; incoming client request IDs are ignored. Failures log only event/request ID, allowlisted operation and method, HTTP status, safe public code, request/database stage and a validated SQLSTATE or allowlisted connection-error code. Raw database messages/details, SQL parameters, listing/account IDs, URLs, tokens, cookies, passwords and credentials are never logged. Known denial/quota/rate status codes and Retry-After remain unchanged. Unexpected failures keep the existing friendly public message and generic 503 code.

## Validation and rollout

- **146 automated tests passed**, including a real workerd empty PUT → IDs/refresh/dashboard → DELETE regression and nonempty/chunked payload rejection. The fixture stubs persistence/provider verification only; real membership authorization runs. The existing local PostgreSQL and JWT tests retain actual ownership/RLS, admin/Premium, Basic/unpaid, expiry/revocation, restricted portal eligibility, 500-save and 20-item boundaries.
- Diagnostic tests verify safe SQLSTATE/stage/request-ID correlation and absence of raw credentials/details.
- TypeScript, changed-file ESLint, production build, static-export security checks and production Pages Functions compilation passed.
- Complete CMS export verified: **25 public properties, 2 accommodations, 377 CMS images, 418 public assets**, all 48 baseline HTML paths, 67 CMS text fields, 433 internal references and existing navigation/footer.

Production Cloudflare binding presence/flags and Hyperdrive were reviewed read-only. `FINDER_CUSTOMER_ACCESS=disabled` remains unchanged. **No database migration, SQL repair, new secret or Cloudflare dashboard change is required.** The approved release rebuilds/reviews the complete CMS output and publishes the Function/source and full `out/` through the established GitHub/main → Pages workflow. Then use the real administrator to save one eligible listing, refresh, verify `/account/`, remove it and refresh again. Check the response request ID if any failure remains. Do not enable paid customer access or create test memberships for acceptance.
