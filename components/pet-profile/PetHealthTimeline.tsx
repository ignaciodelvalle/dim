"use client";

import Link from "next/link";
import { useState } from "react";

// PetHealthTimeline — recent health events with a filter chip row.
//
// Filters mirror the existing LIBRETA_FILTER_CHIPS but with a smaller set
// for the home-of-profile view. Clicking an event navigates to the
// event detail page (or opens a sheet in a future iteration).
//
// The "full" timeline lives at /mis-mascotas/{token}/historial — this
// component is for the at-a-glance card on the profile and caps at
// MAX_VISIBLE rows.

export type TimelineEvent = {
  id: string;
  kind: "vacuna" | "vet" | "peso" | "medicacion" | "incidente" | "otro";
  title: string;
  /** Subtitle: "Dra. Pérez · lote 7842" */
  subtitle?: string;
  /** Display date, e.g. "16/05". */
  dateLabel: string;
  /** Where to go on click. Usually /mis-mascotas/{token}/eventos/{id}. */
  href: string;
};

const MAX_VISIBLE = 5;

const FILTERS: Array<{ value: TimelineFilter; label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "vacuna", label: "Vacunas" },
  { value: "vet", label: "Vet" },
  { value: "peso", label: "Peso" },
  { value: "medicacion", label: "Medicación" },
];

type TimelineFilter = "todo" | "vacuna" | "vet" | "peso" | "medicacion";

const KIND_ICON: Record<TimelineEvent["kind"], { icon: string; classes: string }> = {
  vacuna: { icon: "💉", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
  vet: { icon: "🏥", classes: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" },
  peso: { icon: "⚖", classes: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" },
  medicacion: { icon: "💊", classes: "bg-pink-50 text-pink-800 dark:bg-pink-950/40 dark:text-pink-200" },
  incidente: { icon: "🩹", classes: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  otro: { icon: "•", classes: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200" },
};

export function PetHealthTimeline({
  events,
  fullHistoryHref,
}: {
  events: TimelineEvent[];
  fullHistoryHref: string;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("todo");
  const filtered =
    filter === "todo"
      ? events
      : events.filter((e) =>
          filter === "medicacion" ? e.kind === "medicacion" : e.kind === filter,
        );
  const visible = filtered.slice(0, MAX_VISIBLE);

  return (
    <section
      aria-labelledby="pp-health-h"
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          id="pp-health-h"
          className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Salud
        </h2>
        <Link
          href={fullHistoryHref}
          className="text-xs font-medium text-gob-azul-link hover:underline"
        >
          Ver historial completo →
        </Link>
      </div>

      <ul role="group" aria-label="Filtros" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <li key={f.value}>
              <button
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={active}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-gob-primary text-white"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800")
                }
              >
                {f.label}
              </button>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Sin eventos en este filtro.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {visible.map((e) => {
            const k = KIND_ICON[e.kind];
            return (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className="flex items-start gap-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${k.classes}`}
                  >
                    {k.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {e.title}
                    </span>
                    {e.subtitle && (
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                        {e.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {e.dateLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
