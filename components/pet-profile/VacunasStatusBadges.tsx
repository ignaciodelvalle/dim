// VacunasStatusBadges — "Estado de vacunación" 3-badge summary block (spec §5.1).
//
// Extracted from VacunasTimeline.tsx (two-face redesign, 2026-07-01) so
// LibretaFace (Face 2) can render the same summary under its `vacunas` lens
// without depending on the whole VacunasTimeline card composition.

import type { VaccinationSummary } from "@/lib/domain/libreta-health-status";

export function VacunasStatusBadges({ summary }: { summary: VaccinationSummary }) {
  const badges: Array<{
    label: string;
    count: number;
    bg: string;
    border: string;
    text: string;
  }> = [
    {
      // "Vigente", not "Al día" — this panel classifies dose recency (same
      // vocabulary as LnVstamp: VIGENTE / POR VENCER / VENCIDA). "Al día" is
      // the compliance panel's claim, which additionally requires professional
      // verification; using it here made the two panels contradict each other
      // for an owner-declared dose (QA round 2 2026-07-03 finding A).
      label: "Vigente",
      count: summary.active,
      bg: "var(--color-ln-ok-050)",
      border: "var(--color-ln-ok-100)",
      text: "var(--color-ln-ok)",
    },
    {
      label: "Por vencer",
      count: summary.dueSoon + summary.missing,
      bg: "var(--color-ln-warn-025)",
      border: "var(--color-ln-warn-050)",
      text: "var(--color-ln-warn)",
    },
    {
      label: "Vencida",
      count: summary.expired,
      bg: "var(--color-ln-err-050)",
      border: "var(--color-ln-err-100)",
      text: "var(--color-ln-seal)",
    },
  ];

  return (
    <section aria-label="Estado de vacunación">
      <p
        className="mb-2 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] font-semibold"
        style={{ color: "var(--color-ln-mute)" }}
      >
        Estado de vacunación
      </p>
      <div className="grid grid-cols-3 gap-2">
        {badges.map((b) => (
          <div
            key={b.label}
            className="rounded-[var(--radius-md)] border px-3 py-2.5 text-center"
            style={{ background: b.bg, borderColor: b.border }}
          >
            <p
              className="text-[var(--text-2xl)] font-semibold leading-tight tabular-nums"
              style={{ color: b.text }}
            >
              {b.count}
            </p>
            <p
              className="mt-0.5 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.05em]"
              style={{ color: b.text }}
            >
              {b.label}
            </p>
          </div>
        ))}
      </div>
      {summary.otherCount > 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-ln-mute)" }}>
          {summary.otherCount === 1
            ? "1 vacuna registrada fuera del calendario"
            : `${summary.otherCount} vacunas registradas fuera del calendario`}
        </p>
      )}
    </section>
  );
}
