"use client";

// Step 3 — Dónde y cuándo + qué viste.
// - LocationFields (mode="l2") for address autocomplete + map pin + derived jurisdiction.
// - Three radio options for "cuándo" that resolve to an ISO date string for occurredAt.
// - Textarea for description (maps to welfareReports.description).

import { LocationFields } from "@/components/LocationFields";
import { LnTextarea } from "@/components/ui/Field";

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
        <h1
          className="text-2xl font-semibold tracking-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          ¿Dónde y cuándo?
        </h1>
        <p className="text-sm text-[var(--color-ln-mute)]">Contanos lo que viste y dónde pasó.</p>
      </div>

      {/* Description first — most important field */}
      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          Contanos lo que viste{" "}
          <span className="text-[var(--color-ln-seal)] ml-0.5" aria-hidden="true">
            *
          </span>
        </label>
        <LnTextarea
          id="description"
          name="description"
          rows={5}
          maxLength={DESCRIPTION_MAX}
          placeholder="Describí la situación: qué pasó, cómo estaba el animal, dónde exactamente…"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          aria-required="true"
          aria-describedby="description-hint"
        />
        <p
          id="description-hint"
          className="text-[10.5px] text-right text-[var(--color-ln-faint)]"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          {description.length} / {DESCRIPTION_MAX}
          {description.length < 20 && description.length > 0 && (
            <span className="text-[var(--color-ln-warn)] ml-1">(mínimo 20)</span>
          )}
        </p>
      </div>

      {/* When */}
      <fieldset className="space-y-2">
        <legend
          className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)] mb-2"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          ¿Cuándo pasó?{" "}
          <span className="text-[var(--color-ln-seal)] ml-0.5" aria-hidden="true">
            *
          </span>
        </legend>
        {WHEN_OPTIONS.map((opt) => {
          const isSelected = when === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 rounded-[6px] border px-4 py-2.5 cursor-pointer transition-colors ${
                isSelected
                  ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)]"
                  : "border-[var(--color-ln-line)] bg-[var(--color-ln-card)] hover:border-[var(--color-ln-line-strong)]"
              }`}
            >
              <span
                className={`flex-shrink-0 w-4 h-4 rounded-full border-2 ${
                  isSelected
                    ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] shadow-[inset_0_0_0_3px_white]"
                    : "border-[var(--color-ln-line-strong)]"
                }`}
                aria-hidden="true"
              />
              <input
                type="radio"
                name="occurredAtOption"
                value={opt.value}
                checked={isSelected}
                onChange={() => onWhenChange(opt.value)}
                className="sr-only"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-ln-ink)]">
                  {opt.label}
                </span>
                <span className="block text-xs text-[var(--color-ln-mute)] mt-0.5">
                  {opt.sublabel}
                </span>
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
        <p
          className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)] mb-2"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          Lugar (opcional pero muy útil)
        </p>
        <LocationFields mode="l2" allowAnonymous />
      </div>

      {error && (
        <p
          className="text-sm text-[var(--color-ln-seal)] rounded-[4px] bg-[#fbe9e6] border border-[#f1c6bf] px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
