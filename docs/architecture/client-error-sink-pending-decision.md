# Client error telemetry — pending product/legal decision

**Status: OPEN — requires PO decision and, for options C and D, legal sign-off.**
**Date raised: 2026-08-29 (observability-sink lane)**

The engineering seam is DONE and tested (`lib/observability/`). What is missing
is a decision this document exists to inform, not to make: **which sink**, at
what price, under whose data-processing agreement. That has billing and
international-data-transfer consequences and is explicitly the PO's call.

## Context — where an error goes today

| Surface | Path today | Does anyone find out? |
|---|---|---|
| Server (route handlers, server actions, RSC) | `lib/infra/report-error.ts` → one structured JSON line to stdout → Vercel function logs | **Yes.** Queryable by `level` / `context` / `message`. Works, no vendor needed. |
| Web client (error boundaries, `lib/analytics`) | `lib/observability/report-error.ts` → `console.error` in the visitor's browser | **No.** It dies in the tab. |
| Mobile (`apps/mobile`) | nothing | **No.** Verified: zero occurrences of sentry / bugsnag / crashlytics / datadog / logrocket across the three `package.json` files, and no source-map upload step. A crash reaches us only if a tester says "se cerró sola". |

The server row is why this is easy to under-estimate: production errors *feel*
observable because half of them are. The client half is not, and the mobile
half does not exist at all.

## What is already true (no decision needed)

Wiring a provider is now a **config change**, not a refactor:

- `lib/observability/sink.ts` — `ErrorSink` transport interface plus
  `setErrorSink()`. A provider is one adapter object installed once at
  bootstrap. No error boundary changes.
- `lib/observability/redact.ts` — redaction runs **before** the sink is handed
  anything, so no provider adapter can leak by forgetting to scrub, and the
  rules are not re-implemented per vendor. Covers DNI, product credential codes
  (`DIM-`/`CAS-`/`DEN-`), emails, phones, JWTs, `Authorization` headers,
  capability tokens in URL path segments, and sensitive query-string values.
- `lib/observability/report-error.ts` — the context object is a **closed
  allowlist**; an unreviewed field is a compile error at the call site and is
  dropped at runtime too.
- `hasRemoteErrorSink()` answers "is telemetry actually wired?" truthfully.

Estimated effort once a provider is chosen: **one small PR** — an adapter file,
one `setErrorSink()` call, and (for minified stacks to be readable) a
source-map upload step in CI.

## The legal question, which comes before the pricing one

Every option that sends data to a third party is an **international transfer of
personal data** under **Ley 25.326 (Protección de los Datos Personales)**,
art. 12 — transfer to countries that do not provide adequate protection is
prohibited absent consent or contractual safeguards (AAIP's model clauses,
Disposición 60-E/2016, are the usual instrument).

This bites harder here than for a generic SaaS, because an error report is
*unstructured by nature*: the redaction layer is a strong filter, not a proof.
It is a denylist over free text, and free text is authored by whatever threw.

Three questions for counsel, in order:

1. **Where does the vendor store and process the data?** Most default to the
   United States, which is not on Argentina's adequacy list. Several offer an
   EU region; the EU has an adequacy finding *for* Argentina, which makes an
   EU-hosted processor the materially easier path than a US-hosted one.
2. **Will the vendor sign a DPA naming us as controller and them as processor,
   with sub-processor disclosure?**
3. **Does an error report count as personal data even after redaction?** Assume
   yes and let counsel say otherwise — an IP address is collected by default by
   every SDK on this list, and an IP alone is generally treated as personal
   data.

> I could not verify current adequacy lists, current vendor regional
> availability, or current DPA terms from inside this repo. Every figure and
> claim in the table below is **as advertised at time of writing and must be
> re-checked at decision time.**

## The options

| | Option | Money | Effort | What you get | What you give up |
|---|---|---|---|---|---|
| **A** | **Do nothing** (keep `consoleSink`) | $0 | none | — | Client and mobile errors stay invisible. This is a choice, not a default; it is only defensible while the tester pool is small enough to phone in. |
| **B** | **Vercel only** — add an `/api/telemetry/client-error` route that re-emits the redacted report through `lib/infra/report-error.ts`, so client errors land in the function logs the server already uses | ~$0 marginal (function invocations); log **retention** is the real cost — short on lower plans, longer retention is a paid add-on | small: one route + one adapter | Client errors become visible to the team, in the tool already in use | No grouping or dedup (one noisy bug = thousands of lines), no alerting, no release health, no symbolication of minified stacks, **nothing for mobile** |
| **C** | **Hosted APM (Sentry or equivalent)** | free tier exists at low volume; paid team tiers commonly start around **USD 25–30/month**, and scale by event volume — *verify* | small–medium: adapter + source-map upload in CI + `beforeSend` wired to our redactor | Grouping, dedup, alerting, release health, source maps, **and a React Native SDK that closes the mobile hole with the same vendor** | New data processor → the art. 12 analysis above. Default SDK capture is aggressive (breadcrumbs, request bodies, IP, session replay) and must be turned down deliberately — our `redact.ts` is the `beforeSend`, and the SDK's own auto-capture must be disabled, not merely filtered |
| **D** | **Self-hosted** (GlitchTip, or self-hosted Sentry) | no licence cost; **infra + ops time** is the cost, and it is recurring | medium–large: someone must run, patch, back up and monitor it | Same feature shape as C; data can stay under our control and, if hosted in-country, sidesteps the transfer question almost entirely | Ops burden lands on a one-developer project with a non-technical PO. A crash reporter that is itself down is worse than none, because it is trusted |

## Recommendation (sequencing, not vendor choice)

**The vendor question in options C/D is not answered here — that is the PO's
decision and it needs counsel.** But the options are not mutually exclusive, and
they are not equally gated:

1. **Do B now.** It closes the "dies in the tab" hole, and it introduces **no
   new data processor** — Vercel already processes every request this app
   serves, so the DPA and transfer analysis for it is already settled. It needs
   no legal review, and it is a small PR. It also makes the redaction layer
   earn its keep immediately rather than sitting unused behind a decision.
2. **Then decide C vs D deliberately**, driven by the two things B cannot do:
   alerting on a spike, and **mobile crashes** — which today have no path to
   anyone at all and, unlike web errors, cannot be reconstructed from a user's
   description.

If only one thing is done, it should be B, because it is the one with no gate
in front of it.

## What must NOT happen

- **Do not point an SDK at this seam with its default configuration.** The
  redaction layer only governs what `reportError` sends. Every SDK on this list
  also auto-captures breadcrumbs, `fetch`/XHR payloads, console output, IP, and
  (Sentry) optionally session replay — none of which pass through
  `redact.ts`. Those channels must be disabled explicitly in the adapter.
- **Do not move redaction behind the sink interface.** It sits in front on
  purpose: the first adapter that re-implements it and gets it wrong leaks
  silently, and a leak of this kind is not recoverable once it is in a vendor's
  index.
