"use client";

import { useId, useState } from "react";

import { isoToArDateDisplay, maskArDateInput, parseArDateToIso } from "@/lib/utils/format";

/**
 * Browser-independent dd/mm/aaaa date input for operator filter forms.
 *
 * WHY THIS EXISTS: native `<input type="date">` renders its visible text per
 * the browser's OS locale. `lang="es-AR"` only works in Chromium — Safari and
 * Firefox ignore it and show mm/dd/yyyy on an en-US machine, so an es-AR
 * operator typing "03/07" (7-March) has it submitted as 3-July. This control
 * renders an author-owned TEXT input that displays and accepts `dd/mm/aaaa`
 * IDENTICALLY on every browser, while still emitting an ISO `yyyy-mm-dd` value
 * to the surrounding form via a hidden field.
 *
 * WIRING: the form reads `name` — that lives on the HIDDEN input carrying ISO.
 * The visible text input is intentionally NOT named, so it is never submitted
 * and the query still receives the exact same ISO value the native input did.
 * Drop-in for a `<input type="date" name=… defaultValue={iso}>` inside any GET
 * filter form.
 *
 * VALIDATION: on blur the text is parsed; an impossible date (32/13/2026) is
 * cleared (hidden ISO → "") and an inline es-AR hint is shown, so a wrong range
 * is never submitted. A valid date is normalized back to dd/mm/aaaa.
 *
 * A11Y: real text input with `inputMode="numeric"`, associated error via
 * `aria-describedby`/`aria-invalid`, fully keyboard-operable (no calendar
 * popup to trap focus). Provide either an `id` targeted by an external
 * `<label htmlFor>` or an `aria-label`.
 */

const PLACEHOLDER = "dd/mm/aaaa";
const INVALID_MESSAGE = "Fecha inválida (usá dd/mm/aaaa)";

export type DateInputArProps = {
  /** Submitted field name — carried by the hidden ISO input. */
  name: string;
  /** Initial ISO `yyyy-mm-dd` value (or null/empty for a blank field). */
  defaultValue?: string | null;
  /** Id for the visible text input, so an external `<label htmlFor>` binds it. */
  id?: string;
  /** Accessible name when there is no associated visible `<label>`. */
  ariaLabel?: string;
  /** Classes applied to the visible text input (preserves per-surface styling). */
  className?: string;
};

export function DateInputAr({ name, defaultValue, id, ariaLabel, className }: DateInputArProps) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-date`;
  const errorId = `${reactId}-error`;

  const initialDisplay = isoToArDateDisplay(defaultValue);
  const [display, setDisplay] = useState(initialDisplay);
  const [iso, setIso] = useState(initialDisplay ? (defaultValue ?? "") : "");
  const [invalid, setInvalid] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskArDateInput(event.target.value);
    setDisplay(masked);
    if (invalid) setInvalid(false);
    // Keep the submitted ISO in sync with an emptied field immediately.
    if (masked === "") setIso("");
  }

  function handleBlur() {
    const trimmed = display.trim();
    if (!trimmed) {
      setIso("");
      setInvalid(false);
      return;
    }
    const parsed = parseArDateToIso(trimmed);
    if (!parsed) {
      setIso("");
      setInvalid(true);
      return;
    }
    setIso(parsed);
    setDisplay(isoToArDateDisplay(parsed));
    setInvalid(false);
  }

  return (
    <>
      <input
        type="text"
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        placeholder={PLACEHOLDER}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
      />
      <input type="hidden" name={name} value={iso} />
      {invalid ? (
        <p id={errorId} role="alert" className="text-[var(--text-sm)] text-ln-op-danger">
          {INVALID_MESSAGE}
        </p>
      ) : null}
    </>
  );
}
