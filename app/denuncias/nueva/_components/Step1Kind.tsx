"use client";

// Step 1 — Qué pasó: single-select kind cards.
// Tap a card → immediately advances to the next step.

import {
  WELFARE_REPORT_KINDS,
  type WelfareReportKind,
  welfareReportKindLabel,
} from "@/lib/welfare";

const KIND_ICONS: Record<WelfareReportKind, string> = {
  abandonment: "🚪",
  neglect: "🍃",
  physical_abuse: "🩹",
  chained: "⛓️",
  no_shelter: "🌧️",
  hoarding: "🏚️",
  dog_fighting: "⚡",
  trafficking: "📦",
  other: "❓",
};

const KIND_DESCRIPTIONS: Record<WelfareReportKind, string> = {
  abandonment: "Animal dejado solo, sin cuidado ni dueño",
  neglect: "Sin agua, comida o atención veterinaria",
  physical_abuse: "Golpes, heridas o lesiones visibles",
  chained: "Encadenado o sin posibilidad de moverse",
  no_shelter: "Expuesto al frío, calor o lluvia sin refugio",
  hoarding: "Muchos animales en malas condiciones",
  dog_fighting: "Evidencia de peleas organizadas",
  trafficking: "Venta o transporte clandestino",
  other: "Otra situación que te preocupa",
};

type Step1KindProps = {
  selected: WelfareReportKind | null;
  onSelect: (kind: WelfareReportKind) => void;
};

export function Step1Kind({ selected, onSelect }: Step1KindProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gob-text">¿Qué pasó?</h1>
        <p className="text-sm text-gob-text-muted">
          Elegí la situación que mejor describe lo que viste.
        </p>
      </div>

      <ul className="space-y-2">
        {WELFARE_REPORT_KINDS.map((kind) => {
          const isSelected = selected === kind;
          return (
            <li key={kind}>
              <label
                className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-gob-primary bg-gob-surface-alt"
                    : "border-gob-border hover:border-gob-border-strong hover:bg-gob-surface-alt"
                }`}
              >
                {/* Visually hidden radio — semantics carried by the label */}
                <input
                  type="radio"
                  name="kindCard"
                  value={kind}
                  checked={isSelected}
                  onChange={() => onSelect(kind)}
                  className="sr-only"
                />
                <span className="text-xl leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
                  {KIND_ICONS[kind]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gob-text">
                    {welfareReportKindLabel(kind)}
                  </span>
                  <span className="block text-xs text-gob-text-muted mt-0.5">
                    {KIND_DESCRIPTIONS[kind]}
                  </span>
                </span>
                {isSelected && (
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-gob-primary flex items-center justify-center mt-0.5"
                    aria-hidden="true"
                  >
                    <span className="w-2 h-2 rounded-full bg-white" />
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
