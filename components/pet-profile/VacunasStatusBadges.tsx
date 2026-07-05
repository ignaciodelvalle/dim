"use client";

// VacunasStatusBadges — interactive "Estado de vacunación" summary (spec §5.1).
//
// PO 2026-07-05: the 3-state summary (Vigente / Por vencer / Vencida) is now a
// DRILL-DOWN — each state is a button that discloses WHICH vaccines are in it
// (from summary.perVaccine), so the count is actionable instead of opaque.
// Accordion: one state open at a time; keyboard-accessible via real <button>
// semantics + aria-expanded/aria-controls.

import type { VaccinationSummary, VaccineSnapshot } from "@/lib/domain/libreta-health-status";
import { useState } from "react";

type BadgeKey = "vigente" | "por-vencer" | "vencida";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function metaFor(v: VaccineSnapshot): string {
  switch (v.status) {
    case "missing":
      return "Nunca aplicada";
    case "active":
      return v.nextDueAt ? `Próxima ${fmtDate(v.nextDueAt)}` : "Al día";
    case "due_soon":
      return v.nextDueAt ? `Vence ${fmtDate(v.nextDueAt)}` : "Por vencer";
    case "expired":
      return v.nextDueAt ? `Venció ${fmtDate(v.nextDueAt)}` : "Vencida";
  }
}

export function VacunasStatusBadges({ summary }: { summary: VaccinationSummary }) {
  const [open, setOpen] = useState<BadgeKey | null>(null);

  const badges: Array<{
    key: BadgeKey;
    label: string;
    count: number;
    items: VaccineSnapshot[];
    bg: string;
    border: string;
    text: string;
  }> = [
    {
      key: "vigente",
      // "Vigente", not "Al día" — this panel classifies dose recency (VIGENTE /
      // POR VENCER / VENCIDA). "Al día" is the compliance panel's claim (which
      // also requires professional verification); using it here contradicted
      // that panel for an owner-declared dose (QA round 2 2026-07-03 finding A).
      label: "Vigente",
      count: summary.active,
      items: summary.perVaccine.filter((v) => v.status === "active"),
      bg: "var(--color-ln-ok-050)",
      border: "var(--color-ln-ok-100)",
      text: "var(--color-ln-ok)",
    },
    {
      key: "por-vencer",
      label: "Por vencer",
      count: summary.dueSoon + summary.missing,
      items: summary.perVaccine.filter((v) => v.status === "due_soon" || v.status === "missing"),
      bg: "var(--color-ln-warn-025)",
      border: "var(--color-ln-warn-050)",
      text: "var(--color-ln-warn)",
    },
    {
      key: "vencida",
      label: "Vencida",
      count: summary.expired,
      items: summary.perVaccine.filter((v) => v.status === "expired"),
      bg: "var(--color-ln-err-050)",
      border: "var(--color-ln-err-100)",
      text: "var(--color-ln-seal)",
    },
  ];

  const openBadge = badges.find((b) => b.key === open) ?? null;

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
          <button
            key={b.key}
            type="button"
            className="ln-vac-badge"
            style={{ background: b.bg, borderColor: b.border, color: b.text }}
            aria-expanded={open === b.key}
            aria-controls="vacunas-drilldown"
            disabled={b.count === 0}
            onClick={() => setOpen(open === b.key ? null : b.key)}
          >
            <span className="ln-vac-badge-count">{b.count}</span>
            <span className="ln-vac-badge-label">
              {b.label}
              {b.count > 0 && (
                <span className="ln-vac-caret" aria-hidden>
                  ›
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Drill-down panel — one state at a time. Always present (stable
          aria-controls target); populated only when a state is expanded. */}
      <div id="vacunas-drilldown">
        {openBadge && openBadge.items.length > 0 && (
          <section className="ln-vac-list" aria-label={`Vacunas: ${openBadge.label}`}>
            {openBadge.items.map((v) => (
              <div key={v.vaccineName} className="ln-vac-list-item">
                <span className="ln-vac-list-name">{v.vaccineName}</span>
                <span className="ln-vac-list-meta">{metaFor(v)}</span>
              </div>
            ))}
          </section>
        )}
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
