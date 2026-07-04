"use client";

/**
 * Wave 2 Item 9 — mobile hardening applied to all LN form primitives:
 *  - font-size ≥ 16px on mobile (prevents iOS auto-zoom on focus)
 *  - min-height 44px on interactive controls (WCAG 2.5.5 touch-target)
 *  - inputMode / enterKeyHint forwarded from callers via standard HTML attrs
 */
import { type InputHTMLAttributes, type ReactNode, useId } from "react";

/**
 * Libreta Nacional Field / Input / Select / Textarea primitives.
 *
 * Field anatomy (from handoff):
 *  - mono uppercase label (gray)
 *  - red-seal `*` for required fields
 *  - "opcional" suffix for optional fields
 *  - mono hint below the control
 *  - focus: border ln-azul + box-shadow 0 0 0 3px ln-celeste-050
 *
 * Exports:
 *  LnField      — wrapper (label + control slot + hint/error)
 *  LnInput      — <input> styled to spec; mono variant for codes/dates
 *  LnSelect     — <select> with custom chevron
 *  LnTextarea   — <textarea> resizable
 *  LnRow        — 2-column grid for field pairs
 *  LnSuffixWrap — input with appended unit label (e.g. "27.4 [kg]")
 *  LnCheckbox   — native uncontrolled checkbox with LN styling
 *  LnRadio      — native uncontrolled radio with LN styling
 */

// ---------- Field wrapper -------------------------------------------------

export type LnFieldRenderProps = {
  id: string;
  describedBy?: string;
  invalid: boolean;
};

export type LnFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (api: LnFieldRenderProps) => ReactNode;
};

export function LnField({
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: LnFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);
  const showOptional = optional ?? !required;

  return (
    <div className={["flex flex-col", className].filter(Boolean).join(" ")}>
      {/* mono uppercase label */}
      <label
        htmlFor={id}
        className="mb-[6px] flex items-center gap-[5px] font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
      >
        {label}
        {required && (
          <span className="text-[var(--color-ln-seal)]" aria-hidden="true">
            *
          </span>
        )}
        {showOptional && !required && (
          <span className="font-normal lowercase tracking-[.04em] text-[var(--color-ln-faint)]">
            opcional
          </span>
        )}
      </label>

      {children({ id, describedBy, invalid })}

      {hint && !error && (
        <p
          id={hintId}
          className="mt-[5px] font-[var(--font-ln-mono)] text-[10.5px] leading-[1.45] text-[var(--color-ln-mute)]"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="mt-[5px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-err)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- Localized native validation ------------------------------------
//
// Native HTML5 constraint bubbles ("Please fill out this field.") follow the
// BROWSER language, not the page's lang attribute — an es-AR product must not
// surface English validation (QA round 2 2026-07-03 #6). Every LN control
// localizes the bubble via setCustomValidity at `invalid` time and clears it
// on input so re-validation runs against the native constraints again.

type ValidatableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** es-AR message for the control's current ValidityState. Exported for tests. */
export function localizedValidationMessage(el: ValidatableControl): string {
  const v = el.validity;
  if (v.valueMissing) return "Completá este campo.";
  if (v.typeMismatch && el instanceof HTMLInputElement && el.type === "email")
    return "Ingresá una dirección de email válida.";
  if (v.typeMismatch && el instanceof HTMLInputElement && el.type === "url")
    return "Ingresá una URL válida.";
  if (v.patternMismatch) return "Revisá el formato de este campo.";
  if (v.tooShort && "minLength" in el && el.minLength > 0)
    return `Usá al menos ${el.minLength} caracteres.`;
  if (v.tooLong && "maxLength" in el && el.maxLength > 0)
    return `Usá como máximo ${el.maxLength} caracteres.`;
  if (v.rangeUnderflow && el instanceof HTMLInputElement)
    return `El valor debe ser ${el.min} o mayor.`;
  if (v.rangeOverflow && el instanceof HTMLInputElement)
    return `El valor debe ser ${el.max} o menor.`;
  if (v.stepMismatch || v.badInput) return "Ingresá un valor válido.";
  return "Revisá este campo.";
}

/**
 * Compose the caller's handlers with the localization ones. The `invalid`
 * handler must set the message synchronously so the bubble the browser is
 * about to display already carries the es-AR copy; clearing on input lets the
 * next validation pass re-evaluate the native constraints from scratch.
 */
function withLocalizedValidity<E extends ValidatableControl>(rest: {
  onInvalid?: React.FormEventHandler<E>;
  onInput?: React.FormEventHandler<E>;
}): { onInvalid: React.FormEventHandler<E>; onInput: React.FormEventHandler<E> } {
  return {
    onInvalid: (e) => {
      rest.onInvalid?.(e);
      if (!e.defaultPrevented) {
        e.currentTarget.setCustomValidity(localizedValidationMessage(e.currentTarget));
      }
    },
    onInput: (e) => {
      e.currentTarget.setCustomValidity("");
      rest.onInput?.(e);
    },
  };
}

// ---------- Mobile keyboard focus scroll ------------------------------------
//
// On phones the software keyboard can cover the focused control, especially
// under sticky sheet footers (native-mobile audit §8). Scroll the control to
// the center of the viewport shortly after focus — the delay lets the keyboard
// finish resizing the visual viewport first. Mobile-width only: desktop
// keyboards never cover inputs, and mid-page jumps there would be noise.

function scrollControlIntoView(el: ValidatableControl) {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  window.setTimeout(() => {
    if (el.isConnected) el.scrollIntoView({ block: "center", behavior });
  }, 250);
}

/** Compose the caller's onFocus with the mobile keyboard-avoidance scroll. */
function withMobileFocusScroll<E extends ValidatableControl>(rest: {
  onFocus?: React.FocusEventHandler<E>;
}): { onFocus: React.FocusEventHandler<E> } {
  return {
    onFocus: (e) => {
      rest.onFocus?.(e);
      scrollControlIntoView(e.currentTarget);
    },
  };
}

// ---------- Shared control base classes -----------------------------------

// Wave 2 Item 9: text-base on mobile prevents iOS Safari auto-zoom on focus;
// sm:text-[13.5px] restores the design-system size on wider viewports.
// min-h-[44px] ensures touch targets meet WCAG 2.5.5 (44×44 CSS px).
const controlBase =
  "w-full min-h-[44px] rounded-[4px] border border-[var(--color-ln-line-strong)] " +
  "bg-[var(--color-ln-card)] px-[12px] py-[10px] " +
  "font-[var(--font-ln-sans)] text-base sm:text-[13.5px] text-[var(--color-ln-ink)] " +
  "placeholder:text-[var(--color-ln-faint)] outline-none " +
  "focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)] " +
  "aria-[invalid=true]:border-[var(--color-ln-err)]";

// ---------- Input ---------------------------------------------------------

export type LnInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Mono variant for codes, dates, chip/passport numbers */
  mono?: boolean;
};

export function LnInput({ invalid = false, mono = false, className = "", ...rest }: LnInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={[controlBase, mono ? "font-[var(--font-ln-mono)] tracking-[.02em]" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
      {...withLocalizedValidity<HTMLInputElement>(rest)}
      {...withMobileFocusScroll<HTMLInputElement>(rest)}
    />
  );
}

// ---------- Select --------------------------------------------------------

export type LnSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  children: ReactNode;
};

export function LnSelect({ invalid = false, className = "", children, ...rest }: LnSelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={[
        controlBase,
        // Custom chevron via bg-image; hide native arrow
        "appearance-none pr-[30px]",
        // SVG chevron background
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236E7B84' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")] bg-no-repeat bg-[right_12px_center]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
      {...withLocalizedValidity<HTMLSelectElement>(rest)}
    >
      {children}
    </select>
  );
}

// ---------- Textarea ------------------------------------------------------

export type LnTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function LnTextarea({ invalid = false, className = "", ...rest }: LnTextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={[controlBase, "resize-y leading-[1.5]", className].filter(Boolean).join(" ")}
      {...rest}
      {...withLocalizedValidity<HTMLTextAreaElement>(rest)}
      {...withMobileFocusScroll<HTMLTextAreaElement>(rest)}
    />
  );
}

// ---------- Row (2-column grid) -------------------------------------------

export function LnRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={["grid grid-cols-1 sm:grid-cols-2 gap-[12px]", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

// ---------- Suffix wrap (e.g. "27.4 [kg]") --------------------------------

export type LnSuffixWrapProps = {
  suffix: string;
  children: ReactNode;
  className?: string;
};

export function LnSuffixWrap({ suffix, children, className = "" }: LnSuffixWrapProps) {
  return (
    <div
      className={[
        "flex items-stretch overflow-hidden rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)]",
        "focus-within:border-[var(--color-ln-azul)] focus-within:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Input child gets border:0 via class override */}
      <div className="min-w-0 flex-1 [&>input]:border-0 [&>input]:shadow-none [&>input]:focus:border-0 [&>input]:focus:shadow-none">
        {children}
      </div>
      <span className="grid place-items-center border-l border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[13px] font-[var(--font-ln-mono)] text-sm text-[var(--color-ln-mute)]">
        {suffix}
      </span>
    </div>
  );
}

// ---------- Checkbox -------------------------------------------------------

export type LnCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Sets aria-invalid="true" and applies error styling to the input. */
  invalid?: boolean;
  /** Label content. Omit for a label-less control (pass `aria-label` instead). */
  children?: ReactNode;
  /** Extra classes for the label text span. */
  labelClassName?: string;
};

export function LnCheckbox({
  invalid,
  children,
  className,
  labelClassName,
  id: idProp,
  ...rest
}: LnCheckboxProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const input = (
    <input
      id={id}
      type="checkbox"
      aria-invalid={invalid || undefined}
      className={[
        "mt-0.5 h-4 w-4 shrink-0 cursor-pointer",
        "accent-[var(--color-ln-azul)]",
        "rounded-[3px]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]",
        invalid ? "outline outline-[1.5px] outline-[var(--color-ln-err)]" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
      {...withLocalizedValidity<HTMLInputElement>(rest)}
    />
  );

  // Label-less: render just the input — caller supplies aria-label.
  if (children == null) return input;

  return (
    <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
      {input}
      <span
        className={["text-[13px] leading-tight text-[var(--color-ln-ink)]", labelClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </span>
    </label>
  );
}

// ---------- Radio ----------------------------------------------------------

export type LnRadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Sets aria-invalid="true" and applies error styling to the input. */
  invalid?: boolean;
  /** Label content. Omit for a label-less control (pass `aria-label` instead). */
  children?: ReactNode;
  /** Extra classes for the label text span. */
  labelClassName?: string;
};

export function LnRadio({
  invalid,
  children,
  className,
  labelClassName,
  id: idProp,
  ...rest
}: LnRadioProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const input = (
    <input
      id={id}
      type="radio"
      aria-invalid={invalid || undefined}
      className={[
        "mt-0.5 h-4 w-4 shrink-0 cursor-pointer",
        "accent-[var(--color-ln-azul)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]",
        invalid ? "outline outline-[1.5px] outline-[var(--color-ln-err)]" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
      {...withLocalizedValidity<HTMLInputElement>(rest)}
    />
  );

  // Label-less: render just the input — caller supplies aria-label.
  if (children == null) return input;

  return (
    <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
      {input}
      <span
        className={["text-[13px] leading-tight text-[var(--color-ln-ink)]", labelClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </span>
    </label>
  );
}
