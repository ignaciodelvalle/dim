"use client";

// Step 4 — Sobre quién (opcional pero recomendado).
// Two main cards: "Una mascota" / "Animal sin dueño / no lo sé".
// Tertiary option: "Edificio / persona / lugar" → subjectKind='location'.
// Microchip lookup deferred — accepts free text token only.
// TODO(M-followup): wire subjectPetToken to a real MiMAR chip lookup that
// returns boolean matched/not-matched without leaking the pet record (plan §Open decisions #3).

import { inputClass, labelClass } from "@/lib/form-classes";

export type SubjectKindWizard = "registered_pet" | "unowned_animal" | "location";

const SUBJECT_CARDS = [
  {
    value: "registered_pet" as SubjectKindWizard,
    label: "Una mascota",
    description: "El animal tiene o puede tener dueño",
    icon: "🐾",
  },
  {
    value: "unowned_animal" as SubjectKindWizard,
    label: "Animal sin dueño / no lo sé",
    description: "Callejero, abandonado, o no sé si tiene dueño",
    icon: "🐕",
  },
];

type Step4SubjectProps = {
  subjectKind: SubjectKindWizard | null;
  subjectPetToken: string;
  subjectDescription: string;
  onSubjectKindChange: (kind: SubjectKindWizard) => void;
  onSubjectPetTokenChange: (token: string) => void;
  onSubjectDescriptionChange: (desc: string) => void;
  error?: string | null;
};

export function Step4Subject({
  subjectKind,
  subjectPetToken,
  subjectDescription,
  onSubjectKindChange,
  onSubjectPetTokenChange,
  onSubjectDescriptionChange,
  error,
}: Step4SubjectProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          ¿Sobre quién?
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Opcional — nos ayuda a actuar más rápido.
        </p>
      </div>

      {/* Main two cards */}
      <ul className="space-y-2">
        {SUBJECT_CARDS.map((card) => {
          const isSelected = subjectKind === card.value;
          return (
            <li key={card.value}>
              <label
                className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900"
                    : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
                }`}
              >
                {/* Visually hidden radio — semantics carried by the label */}
                <input
                  type="radio"
                  name="subjectKindCard"
                  value={card.value}
                  checked={isSelected}
                  onChange={() => onSubjectKindChange(card.value)}
                  className="sr-only"
                />
                <span className="text-2xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {card.label}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {card.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Tertiary: location / building */}
      <button
        type="button"
        onClick={() => onSubjectKindChange("location")}
        className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
          subjectKind === "location"
            ? "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900 font-medium text-neutral-900 dark:text-neutral-50"
            : "border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600"
        }`}
      >
        🏢 Edificio / persona / lugar específico
      </button>

      {/* Conditional fields */}
      {subjectKind === "registered_pet" && (
        <div className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="space-y-1.5">
            <label htmlFor="subjectPetToken" className={labelClass}>
              Código MiMAR de la mascota (opcional)
            </label>
            {/* TODO(M-followup): replace with a live chip lookup that returns
                boolean matched/not-matched without leaking the pet record. */}
            <input
              id="subjectPetToken"
              name="subjectPetToken"
              type="text"
              placeholder="Ej: DIM-XXXX-XXXX"
              value={subjectPetToken}
              onChange={(e) => onSubjectPetTokenChange(e.target.value)}
              className={`${inputClass} font-mono uppercase`}
              autoCapitalize="characters"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              Si no lo sabés, no es obligatorio. Dejalo vacío.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="subjectDescription" className={labelClass}>
              Descripción del animal
            </label>
            <textarea
              id="subjectDescription"
              name="subjectDescription"
              rows={3}
              placeholder="Especie, color, tamaño, señas particulares…"
              value={subjectDescription}
              onChange={(e) => onSubjectDescriptionChange(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {subjectKind === "unowned_animal" && (
        <div className="space-y-1.5">
          <label htmlFor="subjectDescription" className={labelClass}>
            Describí al animal
          </label>
          <textarea
            id="subjectDescription"
            name="subjectDescription"
            rows={3}
            placeholder="Especie, color, tamaño, señas particulares…"
            value={subjectDescription}
            onChange={(e) => onSubjectDescriptionChange(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {subjectKind === "location" && (
        <div className="space-y-1.5">
          <label htmlFor="subjectDescription" className={labelClass}>
            Describí el lugar o situación
          </label>
          <textarea
            id="subjectDescription"
            name="subjectDescription"
            rows={3}
            placeholder="Dirección, edificio, características…"
            value={subjectDescription}
            onChange={(e) => onSubjectDescriptionChange(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {error && (
        <p
          className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center">
        Podés saltear este paso. Tus datos anteriores ya son suficientes.
      </p>
    </section>
  );
}
