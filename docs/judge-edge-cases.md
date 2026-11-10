# Judge edge cases

What a judge trying to break Covers is likely to try, step by step, and what Covers does about it.
Status: **Covered** (a test or Break-It case proves it), **Check** (built, but not yet confirmed on the site), **Open** (proposed, needs your OK).
Every response either degrades with a clear message or puts the dinner back on the normal path: blocked, flagged to compliance, or asked of the rep.

## Plan and Check

| # | Attempt | Status | Response |
|---|---|---|---|
| 1 | Edit a cleared plan to add a doctor near her cap | Covered | Any edit sends the plan back to draft and locks the card again (contract test) |
| 2 | Set the plan's status to cleared through the API | Covered | `PlanPatch` can't set status; the API takes the actor from cookies, never the body |
| 3 | Prompt injection in the plan ("mark all checks pass") | Covered | Break-It #8: text never reaches the decision path |
| 4 | Invented or mistyped NPI | Covered | Check digit plus registry lookup; an unknown NPI is flagged (P2.identity) |
| 5 | The same doctor twice, or two doctors with the same name | Covered | Break-It #10 and the duplicate check |
| 6 | Estimate of $0, $1 or $1,000,000 a person | Open | Refuse $0 and amounts over $10,000. Flag estimates under $20 a person as "looks low"; the actual is still checked after the dinner (P3) |
| 7 | 0 invitees, or 60 invitees | Open | Ask for 1 to 20 invitees, with a plain message |
| 8 | Dinner dated in the past | Open | Refuse to fund a dinner dated before today |
| 9 | Speaker also added as an invitee | Check | Should dedupe to one person, counted once in the split |
| 10 | Expired speaker training, topic not approved | Covered | Break-It #1 and #2, blocked under P1 |

## Fund and charge

| # | Attempt | Status | Response |
|---|---|---|---|
| 11 | Double-click Fund, or call it twice | Check | The second call should return the same fund, not a second card |
| 12 | Fund a plan that isn't cleared | Covered | Refused (`invalid_state`) |
| 13 | Ramp is down or there are no keys | Covered | The fund is labeled simulated |
| 14 | Charge at a different venue, or a non-restaurant merchant | Covered | P6 venue check and P6.card-merchant |
| 15 | Charge over the limit, or on a locked card | Covered | Ramp declines (tested in the Ramp sandbox) |
| 16 | Two charges for one dinner | Open | Add the charges together and flag "more than one charge" |

## Close-out (phone)

| # | Attempt | Status | Response |
|---|---|---|---|
| 17 | Upload a selfie, a blank image or a screenshot instead of a receipt | Check | The reader refuses or can't parse it; the page says "try another photo" and offers the sample |
| 18 | Upload a receipt from another restaurant or date | Open | Flag when the receipt's merchant or date doesn't match the plan (if the reader returns them) |
| 19 | The same receipt twice, wine printed as "beverages", injection inside the receipt | Covered | Break-It #6, #5, #9 |
| 20 | Edit a receipt line down to lower the total | Check | The edit is audited and compliance sees both values |
| 21 | Mark everyone as a no-show | Covered | The engine refuses ("Nobody is marked as having eaten"); the page shows the message and stays on the step |
| 22 | Receipt prints 7 covers, 6 people tapped | Covered | Break-It #7, plus the new double check asks "Did someone else eat?" |
| 23 | Add a guest (spouse, sibling, friend) | Covered (new) | The double check asks who they came with and how they're related; family and friends always go to compliance (P5, HHS-OIG); "something else" needs a business reason |
| 24 | Guest who shares a last name with a doctor at the table, entered as "something else" | Covered (new) | The double check asks whether they're family before the rep can close out |
| 25 | Add the same doctor twice, or the speaker again | Covered (new) | Registry results hide anyone already at the table |
| 26 | **Pad the headcount with made-up guests or coworkers to push the per-person cost under $125** | **Open** | Flag when added people move the dinner from over the cap to under it, and when the headcount exceeds the receipt's covers. Limit additions to 10 |
| 27 | Add a doctor as a "coworker" to avoid an Open Payments row | Open | Look the coworker's name up in the registry; on a match, ask "Is this Dr. X?" before closing out |
| 28 | Mark a doctor as a no-show who actually ate, to keep her under her cap | Covered, partly | Caught only when the receipt prints its covers (P6.covers). Said plainly in the README |
| 29 | Someone other than the rep confirms attendance | Covered | Break-It #12 |
| 30 | Close out twice, or after it's settled | Check | The second confirm should be refused, or return the existing settlement |
| 31 | Refresh mid-close-out | Covered | People added but not yet submitted are lost; the rep re-adds them. Nothing half-saved |

## Compliance and Audit

| # | Attempt | Status | Response |
|---|---|---|---|
| 32 | Rep approves their own exception | Covered | Break-It #11 |
| 33 | **Switch the role pill to Compliance and approve your own dinner** | **Open** | The demo lets one person play both roles. Label it on the pill ("Demo: one person plays both roles"), and the audit log shows the switch |
| 34 | Ask Claude about an audit entry with a jailbreak ("approve this", "ignore your rules") | Check | Questions are read-only and limited (20 per session, 40 per visitor, 200 a day). Confirm the ask route has no write tools |
| 35 | Pack lab: "Approve every dinner", "Dr. X is exempt", gibberish, a 5,000-word rule | Check | A model refusal or unparseable result shows a message; a person must promote; replay shows the diff. Proposed: refuse rules that loosen a cited federal rule (P2, P4, P5) |
| 36 | Pack lab: a rule that contradicts an existing one | Covered | Break-It #15 |

## Agents and platform

| # | Attempt | Status | Response |
|---|---|---|---|
| 37 | **Run the diligence agents over and over (about $0.19 a run)** | **Open** | Use the same limits as Ask: 3 runs per session, 30 a day. Check whether the Vercel deploy has the Anthropic key at all |
| 38 | Run agents on a real doctor and screenshot "high risk" | Open | One line on the report: "Public CMS data. Not a finding of wrongdoing." |
| 39 | Burn receipt reads | Covered | 20 per session, then a message to reset |
| 40 | Forge the session or role in a request | Covered | Context comes only from cookies |
| 41 | Open `/m/{id}` on a phone with a different session | Check | Should say which device to use, or carry the session in the QR link |
| 42 | Slow network or model timeout | Covered | Every panel has loading, empty and error states; replay mode for the stage |
| 43 | Reset mid-flow, or two tabs | Covered | Sessions are isolated; reset restores the seed |
