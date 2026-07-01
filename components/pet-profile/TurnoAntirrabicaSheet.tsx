// ---------------------------------------------------------------------------
// TurnoAntirrabicaSheet — owner "compliance-first" slice (WS-2, 2026-07-01)
// Spec: docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md §3
//
// Intent fork opened from the antirrábica compliance card (?sheet=turno-antirrabica,
// mounted by SheetMounter). Two options routing into EXISTING machinery:
//   1. Reserve a vet appointment (recommended) → /turnos/buscar?service_kind=vaccination_rabies
//   2. Just remind me → /mis-mascotas/[token]/vacunas/programar
//
// Pet pre-selection in the booking flow is a deferred follow-up (the booking
// form does not accept a pet yet); the owner picks the pet in the existing
// select. Touch targets ≥44px via min-h-11 (Ley 26.653 / WCAG 2.1 AA).
// ---------------------------------------------------------------------------

import Link from "next/link";

export function TurnoAntirrabicaSheet({ petToken }: { petToken: string }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="font-[var(--font-ln-sans)] text-sm text-[var(--color-ln-ink-2)]">
        ¿Cómo querés ponerte al día con la vacuna antirrábica?
      </p>

      <Link
        href="/turnos/buscar?service_kind=vaccination_rabies"
        className="inline-flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-[var(--radius-card)] bg-[var(--color-ln-azul)] px-4 py-2 no-underline transition-colors hover:bg-[var(--color-ln-azul-700)]"
      >
        <span className="font-[var(--font-ln-sans)] text-sm font-semibold text-white">
          Reservar turno con un veterinario
        </span>
        <span className="font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-celeste-050)]">
          Recomendado · agenda la aplicación
        </span>
      </Link>

      <Link
        href={`/mis-mascotas/${petToken}/vacunas/programar`}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-ln-line-strong)] px-4 py-2 no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
      >
        <span className="font-[var(--font-ln-sans)] text-sm font-semibold text-[var(--color-ln-azul)]">
          Solo recordármelo
        </span>
      </Link>

      <p className="font-[var(--font-ln-sans)] text-xs text-[var(--color-ln-faint)]">
        Un recordatorio solo te avisa; no reemplaza la vacuna ni pone la obligación al día.
      </p>
    </div>
  );
}
