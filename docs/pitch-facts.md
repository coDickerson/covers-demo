# Pitch facts and hard questions

For the video, README, Devpost and live Q&A. Every number here was checked against the primary source on Nov 8, 2026.
If a line isn't in this file, check it before it goes on screen.

## Numbers we can say

| Say | Source |
|---|---|
| In 2020 Novartis paid **$678 million** to settle claims that it ran **sham speaker programs** (2002–2011), paying **over $100 million to doctors** | [DOJ, SDNY press release, July 1, 2020](https://www.justice.gov/usao-sdny/pr/acting-manhattan-us-attorney-announces-678-million-settlement-fraud-lawsuit-against) |
| Novartis admitted that "in thousands of instances" it paid for the same group of doctors, often colleagues or friends, to have dinners together repeatedly, with doctors sometimes rotating as the speaker | Same release (paraphrase; quote at most one short phrase) |
| The settlement terms mean Novartis "can no longer pay for inherently-risky in-person programs" (HHS-OIG) | Same release |
| Companies reported **$14.67 billion** in payments to clinicians and teaching hospitals for 2025, including **$3.92 billion** in general payments (which include food and beverage) | [CMS Open Payments data overview](https://www.cms.gov/openpayments/data), Program Year 2025, published 2026 |
| **667,898 physicians** and **362,261 non-physician practitioners** had payment records in 2025 | Same page |
| Drug and device companies reported nearly **$2 billion** in speaker-related payments to clinicians in 2017–2019 | [OIG Special Fraud Alert, Nov 16, 2020](https://oig.hhs.gov/documents/special-fraud-alerts/865/SpecialFraudAlertSpeakerPrograms.pdf), page 1 and footnote 1 |
| For 2026, a payment under **$13.82** isn't reportable unless a clinician's total for the year passes **$138.13** | [CMS reporting thresholds](https://www.cms.gov/openpayments/program-participants/reporting-entities/data-collection) |

## Numbers not to use

- **"$729 million" for Novartis.** Some outlets add a separate $51.25 million co-pay settlement. The speaker-program settlement is $678 million.
- **"$82.24 billion".** That's every Open Payments record CMS has published over seven years, not one year.
- **"Pharma and device" next to Novartis.** Novartis is a pharma case. The OIG alert does cover "pharmaceutical and medical device companies", so say it about the alert, not the case.

## Wording fixes

- The storyboard says *"Every meal a doctor receives is a transfer of value: the company has to report it."* Not every meal is reportable.
  Say: *"Every meal a company buys a doctor is a transfer of value. Above $13.82, or once a doctor passes $138.13 for the year,
  the company has to report it to the federal Open Payments database."*
- Ramp does **not** enforce the restaurants-only setting in the sandbox (5 non-restaurant test charges were approved; see
  `docs/ramp-spike.md`). Say *"restricted to restaurants in Ramp"*, never *"only works at restaurants"*.
- Ramp **does** enforce the lock and the limit (tested Nov 8). On a locked fund, 2 test charges were declined, a café
  included. On the unlocked fund, an $823.56 charge against $754.38 left was declined with reason "Card limit".
  So say: *"Until the plan clears, the card is locked, and Ramp declines it. After it clears, Ramp holds it to the limit."*

## Hard question 1: "The OIG alert lists restaurants as a suspect location. Why build for restaurant dinners?"

Short answer: *Because these dinners still happen, and today nobody checks them before the money moves. Covers doesn't make a
dinner safe; it makes each one checkable.*

Longer:
- The alert's list of suspect characteristics includes a location "not conducive to the exchange of educational information
  (e.g., restaurants…)". It also says the list is illustrative, not exhaustive, and that no single factor is determinative.
- The patterns DOJ cited against Novartis are exactly what Covers checks before the card works: the same doctors at
  repeat dinners (P5 repeat attendance), alcohol (P5), guests with no business reason (P5), expensive meals (P3 per-person cap),
  and money concentrated on a few doctors (P4 annual cap).
- A company that decides restaurants are too risky can say so in English in the Pack lab ("Speaker programs must be held in
  the office or online") and replay it over past dinners before promoting it. Policy changes don't need new software.

## Hard question 2: "Ramp doesn't enforce restaurants-only. What actually stops misuse?"

Short answer: *The parts Ramp does enforce, the lock and the limit, are what Covers relies on to stop money moving. For
everything else, Covers checks what actually happened against the plan, and anything that doesn't match goes to compliance
with evidence.*

Longer:
- No money moves until every check passes: the fund is created or unlocked only for a cleared plan, and editing the plan locks it
  again. We tested it: Ramp declines charges on a locked fund, and declines a charge over the fund's limit ("Card limit").
- After the dinner, Covers reads the actual charge back from Ramp and compares it with the receipt (P6.card-charge); a
  mismatch is an exception for compliance, not a silent difference.
- Honest gap: Covers doesn't yet check the charge's merchant category. Ramp returns it with each transaction, so a
  "not a restaurant" flag is a small addition if we want it.
- Video shot: the fund's "Declined transactions" tab in Ramp, showing a charge declined while the plan was blocked.
