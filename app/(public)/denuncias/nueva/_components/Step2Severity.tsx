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
  // Base (unselected) classes
  baseClass: string;
  // Selected classes
  selectedClass: string;
};

const SEVERITY_CARDS: SeverityCard[] = [
  {
    value: "grave_urgente",
    label: "Grave / urgente",
    description: "El animal está en peligro inmediato o hay heridas visibles",
    icon: "🚨",
    baseClass:
      "border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)]",
    selectedClass:
      "border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)] shadow-[0_0_0_3px_rgba(162,58,44,.16)]",
  },
  {
    value: "moderado",
    label: "Moderado",
    description: "Condiciones de vida malas, abandono, descuido sostenido",
    icon: "⚠️",
    baseClass:
      "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] text-[var(--color-ln-warn)]",
    selectedClass:
      "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] text-[var(--color-ln-warn)] shadow-[0_0_0_3px_rgba(176,119,26,.16)]",
  },
  {
    value: "sospecha",
    label: "Sospecha",
    description: "Creo que algo no está bien, pero no estoy seguro/a",
    icon: "🔍",
    baseClass:
      "border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink)]",
    selectedClass:
      "border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink)] shadow-[0_0_0_3px_rgba(14,90,153,.12)]",
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
        <h1
          className="text-2xl font-semibold tracking-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          ¿Qué tan grave es?
        </h1>
        <p className="text-sm text-[var(--color-ln-mute)]">
          Es tu mejor estimación. El equipo prioriza y verifica.
        </p>
      </div>

      <fieldset className="border-0 m-0 p-0">
        <legend className="sr-only">Gravedad de la situación (obligatorio)</legend>
        <ul className="space-y-3">
          {SEVERITY_CARDS.map((card) => {
            const isSelected = selected === card.value;
            return (
              <li key={card.value}>
                <label
                  className={`block rounded-[7px] border-2 px-4 py-3.5 cursor-pointer transition-shadow ${
                    isSelected ? card.selectedClass : card.baseClass
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
                  <span className="text-xl leading-none" aria-hidden="true">
                    {card.icon}
                  </span>
                  <span className="block mt-1 text-sm font-semibold">{card.label}</span>
                  <span className="block text-xs mt-0.5 leading-relaxed opacity-80">
                    {card.description}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <p className="text-xs text-[var(--color-ln-mute)] text-center pt-2">
        No importa cuál elijas — todas las denuncias son revisadas por el equipo.
      </p>
    </section>
  );
}
