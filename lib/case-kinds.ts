// Case kinds catalog — single source of truth for which kinds the system
// supports. The 9 V1 kinds have full lifecycle declarations in
// `lib/case-lifecycles/<kind>.ts`; the 3 deferred kinds are accepted in
// the schema (`case_kind` is text, not enum) and reserved here so the
// const stays the place to look first.
//
// Adding a new kind:
//   1. Add the string to `CASE_KINDS`.
//   2. Create `lib/case-lifecycles/<kind>.ts` (coverage test enforces).
//   3. Update `lib/case-attachment.ts` rules + `lib/case-normatives.ts`.
//   4. Update relevant server actions to open/close it.

export const CASE_KINDS = [
  // V1 subset — full lifecycles in lib/case-lifecycles/
  "bite_incident",
  "lost_pet_episode",
  "welfare_denuncia",
  "adoption_listing",
  "adoption_application",
  "custody_dispute",
  "foster_placement",
  // Deferred — schema accepts, lifecycle TBD. See attachment spec §6 +
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
];

export function isCaseKind(value: string): value is CaseKind {
  return (CASE_KINDS as readonly string[]).includes(value);
}

// Display labels (es-AR). Used in dashboards + notification copy.
export function caseKindLabel(kind: CaseKind): string {
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
  }
}
