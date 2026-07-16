"use client";

// Step 3 — Dónde y cuándo + qué viste.
// - LocationFields (mode="l2") for address autocomplete + map pin + derived jurisdiction.
// - Three radio options for "cuándo" that resolve to an ISO date string for occurredAt.
// - Textarea for description (maps to welfareReports.description).

import { useState } from "react";

import { LocationFields, type LocationFieldsChange } from "@/components/LocationFields";
import { LnTextarea } from "@/components/ui/Field";
import { parseDateInput, todayIsoInAr } from "@/lib/utils/format";

export type WhenOption = "now" | "today_yesterday" | "several_days_ago";

// Anchors on the Argentine calendar day, not the UTC day (a UTC anchor is
// silently off by one near midnight in Argentina — see todayIsoInAr in
// lib/utils/format.ts). todayAr is parsed back into a Date pinned at noon
// UTC of that AR calendar day (parseDateInput), so the day-arithmetic below
// stays correct in any timezone the code happens to run in.
function resolveOccurredAt(when: WhenOption): string {
  if (when === "now") return todayIsoInAr();

  const todayAr = parseDateInput(todayIsoInAr());
  if (!todayAr) return todayIsoInAr(); // unreachable: todayIsoInAr() is always well-formed

  switch (when) {
    case "today_yesterday": {
      const yesterday = new Date(todayAr);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      return yesterday.toISOString().slice(0, 10);
    }
    case "several_days_ago": {
      const fiveDaysAgo = new Date(todayAr);
      fiveDaysAgo.setUTCDate(fiveDaysAgo.getUTCDate() - 5);
      return fiveDaysAgo.toISOString().slice(0, 10);
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
  // Notifies the wizard whether an exact map point is marked. The wizard gates
  // advancing on it — a denuncia must carry an exact location so the canonical
  // locality can be inferred from the point (FIX #3A).
  onPointPresenceChange: (hasPoint: boolean) => void;
  // Lifts LocationFields' derived value into the wizard so it owns the location
  // data (M-followup) instead of reading uncontrolled hidden inputs at submit.
  onLocationChange: (value: LocationFieldsChange) => void;
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
  onPointPresenceChange,
  onLocationChange,
  error,
}: Step3WhereProps) {
  // The exact map point is REQUIRED (FIX #3A): a denuncia can only be routed to
  // the right authority when it carries a precise location, and the canonical
  // locality is inferred from that point. Track it locally to show the inline
  // requirement, and forward it so the wizard can block advancing.
  const [hasPoint, setHasPoint] = useState(false);

  function handlePointPresence(present: boolean) {
    setHasPoint(present);
    onPointPresenceChange(present);
  }

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
          className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
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
          className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)] mb-2"
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
              className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-2.5 cursor-pointer transition-colors ${
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
          className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)] mb-2"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          Marcá el lugar exacto en el mapa{" "}
          <span className="text-[var(--color-ln-seal)] ml-0.5" aria-hidden="true">
            *
          </span>
        </p>
        <LocationFields
          mode="l2"
          allowAnonymous
          useMyLocationVariant="primary"
          onPointPresenceChange={handlePointPresence}
          onChange={onLocationChange}
        />
        {!hasPoint && (
          <output className="mt-2 block rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] px-3 py-2 text-[12.5px] text-[var(--color-ln-warn)] leading-snug">
            Marcá el lugar exacto tocando el mapa, arrastrando el pin o con “Usar mi ubicación”. La
            denuncia necesita un punto preciso para llegar a la autoridad de esa zona.
          </output>
        )}
      </div>

      {error && (
        <p
          className="text-sm text-[var(--color-ln-seal)] rounded-[var(--radius-sm)] bg-[var(--color-ln-err-050)] border border-[var(--color-ln-err-100)] px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
