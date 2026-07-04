// Case kinds catalog — single source of truth for which kinds the system
// supports. All 12 V1 kinds have full lifecycle declarations in
// `src/modules/cases/domain/lifecycles/<kind>.ts`. The schema accepts
// `case_kind` as text (not enum) so no migration is required when adding
// new kinds.
//
// Adding a new kind:
//   1. Add the string to `CASE_KINDS`.
//   2. Create `src/modules/cases/domain/lifecycles/<kind>.ts` (coverage test enforces).
//   3. Update `lib/case-attachment.ts` rules + `lib/case-normatives.ts`.
//   4. Update relevant server actions to open/close it.

export const CASE_KINDS = [
  // V1 subset — full lifecycles in src/modules/cases/domain/lifecycles/
  "bite_incident",
  "lost_pet_episode",
  "welfare_denuncia",
  "adoption_listing",
  "adoption_application",
  "custody_dispute",
  "foster_placement",
  // Previously deferred — now activated in feat/deferred-case-kind-lifecycles.
  // Full lifecycles in src/modules/cases/domain/lifecycles/. See attachment spec §6 +
  // lifecycles spec §16.
  "custody_episode",
  "custody_transfer_handshake",
  "foster_proposal",
  "outbreak_investigation",
  "microchip_remediation",
] as const;

export type CaseKind = (typeof CASE_KINDS)[number];

export const V1_CASE_KINDS: readonly CaseKind[] = [
  "bite_incident",
  "lost_pet_episode",
  "welfare_denuncia",
  "adoption_listing",
  "adoption_application",
  "custody_dispute",
  "foster_placement",
  // Activated in spec 2026-05-19-cross-org-transfer-ux-design.
  // Previously deferred (per attachment spec §6).
  "custody_transfer_handshake",
  // Activated in plan 2026-05-20-microchip-replaced-ui.md §3.1.
  // Previously deferred (per attachment spec §6).
  "microchip_remediation",
  // Activated in feat/deferred-case-kind-lifecycles.
  // Previously deferred (per attachment spec §6 + lifecycles spec §16).
  "foster_proposal",
  "custody_episode",
  "outbreak_investigation",
];

export function isCaseKind(value: string): value is CaseKind {
  return (CASE_KINDS as readonly string[]).includes(value);
}

// Display labels (es-AR). Used in dashboards + notification copy.
//
// Accepts plain strings besides the union: `case_kind` is unconstrained text
// in the DB, so rows can carry kinds outside CaseKind (e.g. the panorama
// seed's 'rabies_observation' rows, read literally by fetchVigilanciaMetrics).
// Unknown kinds fall back to the raw key so the UI never renders blank.
export function caseKindLabel(kind: CaseKind | (string & {})): string {
  switch (kind) {
    case "bite_incident":
      return "Mordedura / observación rábica";
    case "lost_pet_episode":
      return "Mascota perdida";
    case "welfare_denuncia":
      return "Denuncia de bienestar";
    case "adoption_listing":
      return "Publicación en adopción";
    case "adoption_application":
      return "Postulación de adopción";
    case "custody_dispute":
      return "Disputa de custodia";
    case "foster_placement":
      return "Tránsito asignado";
    case "custody_episode":
      return "Custodia temporal";
    case "custody_transfer_handshake":
      return "Transferencia de custodia";
    case "foster_proposal":
      return "Propuesta de tránsito";
    case "outbreak_investigation":
      return "Investigación de brote";
    case "microchip_remediation":
      return "Remediación de microchip";
    // Outside the CaseKind union — written by scripts/seed-panorama.ts and
    // counted by fetchVigilanciaMetrics (lib/analytics/govt-dashboards.ts).
    case "rabies_observation":
      return "Observación antirrábica";
    default:
      return kind || "Caso";
  }
}
