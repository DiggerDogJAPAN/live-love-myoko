# Stripe Live webhook readiness — 2 November 2026

Historical review before customer launch. The owner subsequently authorized [opening customer memberships](stripe-customer-launch.md), confirmed the Live destination enabled and old Sandbox destination disabled, and reserved the first payment/signed Live delivery for separate authorization. Closed-gate observations below describe the audit at its original time.

**No confirmed application defect or open customer-access gate was found. End-to-end Live delivery remains unproven because the owner reports no deliveries yet.** No deployment, customer launch, real customer/subscription creation, payment or subscription modification was performed for this review.

## Verified application and hosted checks

- Canonical production revision remains `97d1d641453e565d5cecdcf3769dd51c7be9873c`. Cloudflare reports Live mode, Sandbox disabled, `FINDER_CUSTOMER_ACCESS=disabled`, and the expected encrypted binding types. Secret values were not retrieved or changed.
- Read-only PostgreSQL inspection over verified TLS confirms mode `live`, database customer access **false**, zero Live billing customers and zero memberships. Administrator roles and existing Sandbox billing state match the cutover fingerprints. Existing processed-event receipts are Sandbox only; there are no processed Live receipts. A valid event for an unknown customer is acknowledged without inserting a receipt, so receipt absence alone cannot prove there were no HTTP deliveries.
- The production endpoint `https://love-live-myoko.com/api/billing/webhook` returned HTTP **400 / `invalid_billing_signature`** for missing, malformed, fresh incorrect-HMAC and expired signatures. GET returned **405 / `method_not_allowed`**. These probes cannot reach billing reconciliation and contained no customer data.
- **51 focused API, catalog, model and SQL migration tests passed**, using isolated fixtures. An additional fixture-only Live-mode check accepted valid signatures for **all 19 event types** and rejected 19 body-tampering variants, with zero real Stripe/database requests. This validates application behavior, not the deployed signing-secret match.
- Signature verification covers exact raw bytes, HMAC-SHA256 `v1`, five-minute timestamp tolerance and multiple signatures during rotation. The handler rejects wrong API versions, Thin envelopes, wrong mode, Connect/organization contexts and mismatched resource shapes before reconciliation. Only `2026-07-29.dahlia` Snapshot envelopes are accepted.
- Event receipts are scoped by Live/test mode and event ID. Leases serialize reconciliation and fence stale writers. Duplicate and out-of-order events are tested. Event bodies supply routing only: current subscription, schedule, invoice and payment evidence is retrieved using the pinned API version. Only verified paid evidence can grant time-limited access; reconciliation preserves manual revocations.
- A brief redacted Cloudflare log stream captured no webhook request. This was a live observation window, not historical Stripe delivery-log access. The owner separately reports **no entries** in the Live destination's Event deliveries tab.

## Destination settings: owner-reported, not independently inspected

The owner reports the Live destination is enabled, uses the exact HTTPS URL above, **Snapshot** format and version **`2026-07-29.dahlia`**, with **19 selected events**. The owner also reports the authenticated configuration check passes (`enabled=true`, `sandbox=false`, `configurationValid=true`); that check validates prices/Portals, not webhook delivery or the secret match.

The exact selected event **names** were not supplied. A count of 19 is insufficient to establish that the selection matches the application's list. Compare the destination with these exact supported types:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.pending_update_applied
customer.subscription.pending_update_expired
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
subscription_schedule.created
subscription_schedule.updated
subscription_schedule.released
subscription_schedule.canceled
subscription_schedule.completed
subscription_schedule.aborted
```

Also confirm **Your account** (not connected/organization accounts) and independently confirm the old Sandbox destination remains **disabled**. Earlier cutover confirmation said both destinations were disabled; the owner's latest review leaves the current Sandbox status unconfirmed. No evidence establishes that it is enabled, and this review did not change either destination.

## Actual blockers versus outstanding evidence

**Actual defects/blockers found:** none in the inspected application, deployment or gates. Customer purchasing remains intentionally closed; opening it still requires separate approval.

**Settings confirmations still needed:** the exact 19 event names, own-account scope and current Sandbox-disabled status. These are unverified settings, not demonstrated defects, and can be checked without generating any billing activity.

**Evidence requiring a real Stripe-signed Live delivery or an appropriate supported Dashboard diagnostic:** compatibility between this exact Live destination's signing secret and encrypted Production `STRIPE_WEBHOOK_SECRET`, plus actual HTTP success and reconciliation for a mapped Live subscription. An empty delivery list is expected before eligible events occur and is not a failure. Invalid-signature rejection and local signed tests cannot establish a production secret match. No keys, signing secrets, signature headers or customer payloads should be shared in chat.

No Stripe CLI trigger was used: Stripe documents that [triggers create the API objects needed for their fixtures](https://docs.stripe.com/cli/trigger). A Sandbox event cannot establish acceptance of a Live event; the application correctly rejects cross-mode data. There is no authenticated Stripe connection available here to inspect or safely invoke a destination-specific test mechanism. Do not weaken version/mode/signature checks, change existing subscriptions, resend an arbitrary customer's event or fabricate paid events to obtain a green result. Signed delivery can be verified when an authorized real Live event occurs, without manufacturing billing activity for this review.

Use **Stripe Live → Workbench → Webhooks → this destination → Event deliveries** to inspect the first delivery's event type, `api_version`, `livemode`, HTTP status and response. See [Stripe delivery-log guidance](https://docs.stripe.com/workbench/event-destinations). A successful acknowledgement for an unknown customer verifies envelope/signing compatibility but does not prove paid-subscription synchronization; the first authorized real subscription event supplies that separate acceptance evidence.
