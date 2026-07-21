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
 * VALIDATION: the hidden ISO is kept in sync ON EVERY CHANGE — as soon as the
 * text forms a complete valid date it becomes the submitted value, so pressing
 * Enter (implicit GET-form submit, which does NOT blur first) submits the typed
 * date, not a stale/empty one. Blur normalizes the display and, for an
 * impossible/incomplete date (32/13/2026), clears the hidden ISO and shows an
 * inline es-AR hint so a wrong range is never submitted.
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
  /**
   * Fires with the current ISO value ONLY when it is COMMIT-WORTHY: a
   * complete, calendar-valid date, or the field was fully cleared (empty
   * string). Never fires for a partial/incomplete/invalid in-progress edit —
   * so a caller can wire this straight into a per-keystroke-unsafe action
   * (e.g. a URL-navigating filter commit) without debouncing or a submit
   * button; see DateRangeFilterFields for the canonical consumer.
   */
  onValueChange?: (iso: string) => void;
};

export function DateInputAr({
  name,
  defaultValue,
  id,
  ariaLabel,
  className,
  onValueChange,
}: DateInputArProps) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-date`;
  const errorId = `${reactId}-error`;

  // Only accept a CALENDAR-valid ISO default (round-trip through the parser), so a
  // tampered URL like ?from=2026-99-99 renders blank, not a nonsense "99/99/2026"
  // that would silently re-submit garbage on an unedited form.
  const initialIso = (() => {
    const display = isoToArDateDisplay(defaultValue);
    return display && parseArDateToIso(display) ? (defaultValue ?? "") : "";
  })();
  const [display, setDisplay] = useState(isoToArDateDisplay(initialIso));
  const [iso, setIso] = useState(initialIso);
  const [invalid, setInvalid] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskArDateInput(event.target.value);
    setDisplay(masked);
    if (invalid) setInvalid(false);
    // Keep the submitted ISO in sync on EVERY keystroke, not just on blur: an
    // implicit Enter submit does not fire blur, so the hidden field must already
    // hold the typed date. Empty → clear; a complete valid date → its ISO; an
    // incomplete/partial date → clear (blur will flag it invalid if the operator
    // leaves it that way).
    if (masked === "") {
      setIso("");
      onValueChange?.("");
      return;
    }
    const parsed = parseArDateToIso(masked);
    setIso(parsed ?? "");
    // Only a COMPLETE, calendar-valid date is commit-worthy — a partial or
    // impossible in-progress date (parsed === null) must not fire, or a
    // caller committing straight to a URL nav would navigate mid-keystroke.
    if (parsed) onValueChange?.(parsed);
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
