# Property Finder — completed Supabase authentication cutover

Supabase Auth is the sole application authentication provider. The owner confirms both Finder Cloudflare Access applications were deleted and production administrator login, account role, aggregated listings, logout and fresh login work without an Access challenge. Application release `1c5320a5ce82d57e52b05e486d70a4fb86321c94` introduced the Supabase-only boundary. Subsequent cleanup does not change roles, memberships, RLS or provider settings.

## Current authorization

Every Finder inventory request requires a verified Supabase JWT and a fresh version-2 private account/session snapshot. Private `finder_security.account_roles` determines administrator authority; metadata, email headers and browser flags cannot assign it. Active administrators need no subscription. Customers require their real active paid membership, valid dates and the permission selected by the server; **FINDER_CUSTOMER_ACCESS remains disabled**, so customer listing access is not active. Planned Basic is ¥2,000/month and Premium is ¥4,000/month. Stripe and Premium features are separate future work.

`/login/`, `/account/` and `/property-finder/search/` use the existing Supabase session flow. Registration requires trimmed Full Name and at least eight password characters, with exact guidance **Must be 8 characters or more.** The owner manually confirmed the production provider minimum is eight. The technical maximum remains 128 without visible maximum guidance. Public CMS properties and accommodations remain public.

Use the [current deployment checklist](property-finder-deployment-checklist.md), [authentication architecture](property-finder-authentication.md), [security boundary](property-finder-membership-security.md) and [cleanup/secret record](property-finder-access-removal.md). No Access application, JWT/email allowlist or legacy login redirect is required.

## Short migration record

1. Applied migrations 001/002 created private roles/memberships and restricted authorization helpers; see the [database receipt](property-finder-membership-migration-results.md). Do not rerun them.
2. Deployed `1c5320a` through GitHub → Cloudflare Pages with the complete static CMS export while the old edge protection remained available.
3. The owner verified real Supabase administrator login, Finder access and logout/fresh login, then manually deleted both Finder Access applications.
4. Cookie-free live checks now receive the public search shell and HTTP 401 JSON from protected APIs. Forged Access headers/cookies and invalid Supabase tokens cannot grant access. The cleanup preserves those negative regression tests and leaves production secrets unchanged.

## Rollback record — credentials retained, not active dependencies

Encrypted `FINDER_ACCESS_TEAM_DOMAIN`, `FINDER_ACCESS_AUD` and `FINDER_ADMIN_EMAILS` are unused by the current application but remain retained until the owner explicitly approves deletion and closes the rollback window. Do not delete or repurpose their values. Supabase Auth/database secrets and Hyperdrive are still required.

If a security regression occurs, restore the previously recorded Finder edge protection before considering an application rollback. Preserve unrelated/shared applications, WAF, DNS and provider settings. The current Supabase release can run behind a restored edge gate without regaining an Access-only authentication path. The older Access-dependent release is `65ce366`; do not roll it back onto an unprotected hostname. Recreating a deleted Access application can issue a new audience, so its retained old audience secret may not match. Review and verify the restored application/policies and audience before any separately approved legacy application rollback. This record does not certify that a complete original application/policy export is available: the earlier API inventory was incomplete. Obtain the owner's saved configuration rather than guessing or granting broader access.

No new Access gate or bypass policy should be introduced during routine cleanup. Live checks involving the real administrator depend on the owner's authenticated session; automated fixtures are not production paid accounts.
