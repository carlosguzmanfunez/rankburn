# Webhook fixtures

Payloads shaped like the PayPal Sandbox events the application handles. They
exist so the delivery paths can be exercised deliberately, including the ones
that are hard to provoke by clicking through a checkout.

**These are not signed.** `verifyWebhook()` calls PayPal's
`verify-webhook-signature` endpoint, so posting a fixture directly is expected
to be **rejected with 400**. That rejection is itself a test: it proves the
endpoint does not trust unverified input.

To exercise the *credited* path you must replay a genuine Sandbox delivery.
PayPal's developer dashboard can resend any past webhook event, which is how
step 13 (duplicate delivery) is performed.

| File | Purpose | Expected result |
|---|---|---|
| `capture-completed.json` | Normal capture | Budget credited exactly once |
| `capture-completed-duplicate.json` | Same `id` as above | Second delivery credits nothing, returns 200 |
| `capture-unmatched.json` | `custom_id` no payment row has | 200, audit `PAYMENT_EVENT_UNMATCHED`, no credit |
| `capture-for-exhausted.json` | Campaign already EXHAUSTED | 200, refund path, audit `PAYMENT_REFUND_REQUIRED_CAMPAIGN_EXHAUSTED` |
| `capture-for-rejected.json` | Campaign REJECTED | 200, refund path, audit `PAYMENT_REFUND_REQUIRED_CAMPAIGN_REJECTED` |
| `other-event.json` | An event type we do not handle | 200, no credit, no refund |

Replace `REPLACE_WITH_PAYMENT_ID` and `REPLACE_WITH_CAPTURE_ID` with real ids
from your Sandbox run before use.
