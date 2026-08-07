# Operator action receipts (#15d) — product scoping

> Scoping-first deliverable (triage 2026-07-12: "WHICH actions warrant a receipt is product
> scoping first"). This doc proposes the receipt catalogue for PO decision; implementation is a
> follow-up once the PO marks the rows. The print mechanism is PROVEN — the public denuncia
> comprobante and the panorama "Informe de situación" (task #55) already ship print-ready,
> stamped documents; #15d reuses that idiom for OPERATOR actions.

## Why receipts

A funcionario acting on a case needs a **paper trail artifact** they can attach to an
expediente: what was done, by whom, when, over which subject, under which authority. The event
ledger HAS this truth (append-only, actor + role + timestamps); the receipt is a projection of
ONE action into a printable, citable document — never a new source of truth.

## Proposed catalogue (PO marks: SÍ / NO / después)

| # | Action | Trigger surface | Receipt contents (all from the event) | Why paper matters |
|---|---|---|---|---|
| R1 | Acta de decomiso | case action (decomiso event) | acta №, pet token + species, actor + role, org/jurisdicción, fecha/hora, legal basis (Ley 14.346), observations | Seizures are contested; the acta is the defensible artifact |
| R2 | Cierre de caso de bienestar | case close | case id, timeline summary (opened → derivations → close reason), actors, dates | Expediente closure needs a closing document |
| R3 | Derivación a autoridad | signalAuthorityReport / derivation event | destination authority, case ref, derivation reason, date, actor | Proof of institutional handoff ("lo derivamos el día X") |
| R4 | Constancia de vacunación emitida por campaña | campaign dose application | pet token, vaccine, lot, vet matrícula (if signed), campaign id, date | Owners at campaigns often need same-day proof |
| R5 | Comprobante de custodia/tránsito | transferCustody accepted | from → to (orgs/persons), pet token, date, conditions | Custody chain disputes |
| R6 | Constancia de observación antirrábica | rabies_observation_started/ended | pet token, start/end dates, outcome, actor | Legally mandated observation window (bite protocol) |

## Non-goals
- NO new events (receipts project EXISTING events).
- NO PDF service dependency — the print-CSS idiom from #55 (client `window.print()` over a
  dedicated `@media print` sheet) is the mechanism.
- NO public receipts in this scope (the public denuncia comprobante already exists).

## Mechanism (shared, once)
One `ActionReceipt` print component (mirrors `PanoramaInformeSituacion`): stamped header
(escudo/MiMAR identity line, fecha de emisión, № de constancia = event id short-hash), body per
receipt type, footer with verification hint (the event id + "verificable en el libro de
eventos"). Mounted on the relevant operator surface behind an "Emitir constancia" button;
`deferPrint` idiom (lib/infra/defer-print).

## Open PO decisions
1. Which rows ship first (propose: R1 + R6 — the legally-loaded ones).
2. Receipt numbering: event-id short-hash (proposed, zero infra) vs sequential per-org counter
   (needs a table + concurrency care).
3. Does R4 need the vet's signature image or is matrícula text enough (proposed: text).
