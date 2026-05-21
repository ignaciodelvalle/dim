"use client";

// Step 2 — Qué tan grave: three stacked severity cards.
// Maps wizard-friendly labels to the welfareReports.severity enum:
//   "grave_urgente"  → "critical"
//   "moderado"       → "medium"
//   "sospecha"       → "low"
// Per plan: the three buttons use human language, not the enum labels.

export type WizardSeverity = "grave_urgente" | "moderado" | "sospecha";

// Maps wizard value → DB enum value
export const WIZARD_SEVERITY_TO_DB: Record<WizardSeverity, "critical" | "medium" | "low"> = {
  grave_urgente: "critical",
  moderado: "medium",
  sospecha: "low",
};

type SeverityCard = {
  value: WizardSeverity;
  label: string;
  description: string;
  icon: string;
  borderClass: string;
  selectedBorderClass: string;
};

const SEVERITY_CARDS: SeverityCard[] = [
  {
    value: "grave_urgente",
    label: "Grave / urgente",
    description: "El animal está en peligro inmediato o hay heridas visibles",
    icon: "🚨",
    borderClass:
      "border-red-200 dark:border-red-900 hover:border-red-400 dark:hover:border-red-700",
    selectedBorderClass: "border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950/30",
  },
  {
    value: "moderado",
    label: "Moderado",
    description: "Condiciones de vida malas, abandono, descuido sostenido",
    icon: "⚠️",
    borderClass:
      "border-amber-200 dark:border-amber-900 hover:border-amber-400 dark:hover:border-amber-700",
    selectedBorderClass: "border-amber-600 dark:border-amber-400 bg-amber-50 dark:bg-amber-950/30",
  },
  {
    value: "sospecha",
    label: "Sospecha",
    description: "Creo que algo no está bien, pero no estoy seguro/a",
    icon: "🔍",
    borderClass:
      "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600",
    selectedBorderClass:
      "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900",
  },
];

type Step2SeverityProps = {
  selected: WizardSeverity | null;
  onSelect: (severity: WizardSeverity) => void;
};

export function Step2Severity({ selected, onSelect }: Step2SeverityProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          ¿Qué tan grave es?
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Elegí la que más se acerca a lo que viste.
        </p>
      </div>

      <ul className="space-y-3">
        {SEVERITY_CARDS.map((card) => {
          const isSelected = selected === card.value;
          return (
            <li key={card.value}>
              <label
                className={`flex items-start gap-3 rounded-xl border-2 px-4 py-4 cursor-pointer transition-colors ${
                  isSelected ? card.selectedBorderClass : card.borderClass
                }`}
              >
                {/* Visually hidden radio — semantics carried by the label */}
                <input
                  type="radio"
                  name="severityCard"
                  value={card.value}
                  checked={isSelected}
                  onChange={() => onSelect(card.value)}
                  className="sr-only"
                />
                <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                    {card.label}
                  </span>
                  <span className="block text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    {card.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center pt-2">
        No importa cuál elijas — todas las denuncias son revisadas por el equipo.
      </p>
    </section>
  );
}
