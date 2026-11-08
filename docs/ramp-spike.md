# A1 — Ramp sandbox spike (Sat Nov 7, 2026)

## Decision: **fully real**

Every step in the plan passed against the Ramp sandbox (`https://demo-api.ramp.com`).
`issueFund` will create a real Ramp fund (`simulated: false`); after the dinner, Covers attaches the receipt and memo to the
real transaction. The only simulated piece is the card swipe itself, which the sandbox fakes through its own demo tool.
The video and the proof page's real-vs-simulated table should say exactly that.

| Step | Result | Evidence |
|---|---|---|
| 1. Developer app, client credentials | ✅ | App needs its scopes ticked in Settings → Developer, otherwise every endpoint returns 403 `DEVELOPER_7100` (the token endpoint itself grants anything) |
| 2. Token; list users and cards | ✅ | `POST /developer/v1/token` (Basic auth, `grant_type=client_credentials`, `scope=...`), token valid 10 days |
| 3. Fund with a cap and a restaurant restriction; poll task | ✅ | $875 TOTAL fund created, task `SUCCESS` on first poll, physical + virtual card issued; shows in Ramp's Funds page |
| 3b. Hold until cleared (lock / unlock) | ✅ | suspend → `SUSPENDED`, unsuspend → `ACTIVE`; Ramp's activity log shows "Locked/Unlocked access to funds via API" |
| 4. Cleared transaction | ✅ (sandbox tool) | Created with ⌘D → Demo tools form → Create transactions; $612.00 `CLEARED` on the fund's card, visible via API |
| 5. Receipt + memo on the transaction | ✅ | Receipt upload `201`; memo `200`; both read back on the transaction |
| 6. Screenshots for the video | ✅ partly | Funds list, fund detail and activity log captured by Nikhil; transaction with receipt still to capture |

## Endpoints that worked (base `https://demo-api.ramp.com/developer/v1`)

| Purpose | Call | Notes |
|---|---|---|
| Token | `POST /token` | form body; Basic auth with client id/secret |
| Create fund | `POST /limits/deferred` | body: `user_id`, `display_name`, `idempotency_key`, `spending_restrictions: { limit: { amount: <cents>, currency_code: "USD" }, interval: "TOTAL" }`, `permitted_spend_types: { primary_card_enabled: true, reimbursements_enabled: false }` → `{ id: <task> }` |
| Poll creation | `GET /limits/deferred/status/{task}` | `status: SUCCESS`, `data.spend_limit_id` |
| Read fund | `GET /limits/{id}` | `state`, `suspension`, `restrictions`, `cards[].card_id/last_four` |
| Lock | `POST /limits/{id}/suspension` | |
| Unlock | `POST /limits/{id}/unsuspension` | `DELETE` returns 405 |
| Restrict to restaurants | `PATCH /limits/{id}` with `spending_restrictions.allowed_categories: [19]` | 19 = Restaurants (confirmed in Ramp's activity log) |
| Find the dinner charge | `GET /transactions?card_id={card}` | amounts in cents; `limit_id` links back to the fund |
| Attach receipt | `POST /receipts` multipart: `transaction_id`, `user_id`, `idempotency_key`, **`receipt`** = file | field must be `receipt`, not `file` (400 `DEVELOPER_7041`) |
| Memo | `POST /memos/{transaction_id}` JSON `{ "memo": "..." }` | |

Fund limits are integer cents (`minor_unit_conversion_rate: 100`); **transaction `amount` is in dollars** (612 = $612.00), so the client converts to cents.

## Open items

1. **Is the restaurant restriction enforced?** The fund detail panel still says "Can spend on: All categories", and the test
   charge landed at a grocery merchant, but the demo tool's `random` mode bypasses controls. Rerun the demo tool with
   `decision_mode = stored_controls` on card `…1273`: a non-restaurant charge should be declined. If it is, that decline is a
   strong video shot. If not, we say "restriction recorded in Ramp" and don't claim enforcement.
2. **Demo flow mapping for A6:** create fund at plan creation, **suspended**; unsuspend in `issueFund` only when the plan is
   `cleared`; re-suspend if the plan is edited back to draft. Fund cap = $125 × (invitees + speaker + employees).
3. **One fund per judge session** would create many sandbox funds; A6 should reuse one fund per session or clean up on reset.

## Sandbox objects created by this spike
- Fund `de822829-8120-41ad-9086-cfd2801e30c5` "Covers spike: Speaker dinner (plan-demo)", owner Sawyer Maloney, card …1273
- Transaction `0474c975-c5d1-447c-a24c-32e137084eb1` ($612.00, cleared) with receipt and memo
