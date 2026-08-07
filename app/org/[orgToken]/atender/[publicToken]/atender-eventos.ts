// Server-safe clinical-event catalog for the walk-in signing surface.
//
// This list is rendered by BOTH the server page (page.tsx maps it into the
// event picker) AND the client capture mounter (AtenderCaptureMounter reads
// ?evento= against it). It must live in a plain module WITHOUT "use client":
// importing a data const from a "use client" module into a Server Component
// yields a client-reference proxy (not the array), so `ATENDER_EVENTOS.map`
// throws "map is not a function" at render (val-4-org blocker, digest crash).
//
// Only clinical/identification event kinds — no custody/transfer/adoption.
// "chip" was confirm-only (PendingSignaturesCard) until the PO decision of
// 2026-08-06 (Cowork QA v3, M3): vets are the ones who actually implant and
// register microchips, so fresh placement is a first-class walk-in record.
export const ATENDER_EVENTOS = [
  { key: "vacuna", label: "Vacuna" },
  { key: "desparasitacion", label: "Desparasitación" },
  { key: "cirugia", label: "Cirugía / estudio" },
  { key: "medicacion", label: "Medicación" },
  { key: "chip", label: "Colocación de microchip" },
  { key: "nota", label: "Nota clínica" },
] as const;

export type AtenderEvento = (typeof ATENDER_EVENTOS)[number]["key"];
