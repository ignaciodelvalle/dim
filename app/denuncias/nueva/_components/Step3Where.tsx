"use client";

// Step 3 — Dónde y cuándo + qué viste.
// - LocationFields (mode="l2") for address autocomplete + map pin + derived jurisdiction.
// - Three radio options for "cuándo" that resolve to an ISO date string for occurredAt.
// - Textarea for description (maps to welfareReports.description).

import { LocationFields } from "@/components/LocationFields";
import { inputClass, labelClass } from "@/lib/form-classes";

export type WhenOption = "now" | "today_yesterday" | "several_days_ago";

function resolveOccurredAt(when: WhenOption): string {
  const now = new Date();
  switch (when) {
    case "now":
      return now.toISOString().split("T")[0];
    case "today_yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split("T")[0];
    }
    case "several_days_ago": {
      const fiveDaysAgo = new Date(now);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      return fiveDaysAgo.toISOString().split("T")[0];
    }
  }
}

export { resolveOccurredAt };

const WHEN_OPTIONS: { value: WhenOption; label: string; sublabel: string }[] = [
  { value: "now", label: "Ahora mismo", sublabel: "Estoy viendo la situación en este momento" },
  {
    value: "today_yesterday",
    label: "Hoy o ayer",
    sublabel: "Lo vi en las últimas 24-48 horas",
  },
  {
    value: "several_days_ago",
    label: "Hace varios días",
    sublabel: "Lo vi hace más de dos días",
  },
];

type Step3WhereProps = {
  when: WhenOption | null;
  description: string;
  onWhenChange: (when: WhenOption) => void;
  onDescriptionChange: (description: string) => void;
  // LocationFields is uncontrolled — values are read at submit time via FormData.
  // We pass the error so the parent can show step-level validation.
  error?: string | null;
};

const DESCRIPTION_MAX = 2000;
const DESCRIPTION_TARGET = 500;

export function Step3Where({
  when,
  description,
  onWhenChange,
  onDescriptionChange,
  error,
}: Step3WhereProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gob-text">¿Dónde y cuándo?</h1>
        <p className="text-sm text-gob-text-muted">Contanos lo que viste y dónde pasó.</p>
      </div>

      {/* Description first — most important field */}
      <div className="space-y-1.5">
        <label htmlFor="description" className={labelClass}>
          Contanos lo que viste{" "}
          <span className="text-red-500 ml-0.5" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={DESCRIPTION_MAX}
          placeholder="Describí la situación: qué pasó, cómo estaba el animal, dónde exactamente…"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className={inputClass}
          aria-required="true"
          aria-describedby="description-hint"
        />
        <p
          id="description-hint"
          className={`text-xs ${description.length >= DESCRIPTION_TARGET ? "text-gob-text-muted" : "text-gob-text-muted"}`}
        >
          {description.length} caracteres
          {description.length < 20 && description.length > 0 && (
            <span className="text-gob-warning-text"> (mínimo 20)</span>
          )}
        </p>
      </div>

      {/* When */}
      <fieldset className="space-y-2">
        <legend className={`${labelClass} mb-1`}>
          ¿Cuándo pasó?{" "}
          <span className="text-red-500 ml-0.5" aria-hidden="true">
            *
          </span>
        </legend>
        {WHEN_OPTIONS.map((opt) => {
          const isSelected = when === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                isSelected
                  ? "border-gob-primary bg-gob-surface-alt"
                  : "border-gob-border hover:border-gob-border-strong"
              }`}
            >
              <input
                type="radio"
                name="occurredAtOption"
                value={opt.value}
                checked={isSelected}
                onChange={() => onWhenChange(opt.value)}
                className="mt-0.5 flex-shrink-0 accent-gob-primary"
              />
              <span>
                <span className="block text-sm font-medium text-gob-text">{opt.label}</span>
                <span className="block text-xs text-gob-text-muted mt-0.5">{opt.sublabel}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* Location — uses the shared LocationFields component in L2 mode
          (jurisdiction + postal address + map; see AGENTS.md "Design rules"
          rule #1). Fields are uncontrolled; the wizard reads them via
          FormData at submit. */}
      <div className="space-y-1.5">
        <p className={`${labelClass} mb-2`}>Lugar (opcional pero muy útil)</p>
        <LocationFields mode="l2" allowAnonymous />
      </div>

      {error && (
        <p
          className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
