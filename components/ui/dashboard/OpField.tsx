"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/**
 * Operator-tier (op) form primitives.
 *
 * These components centralize the ln-op-* token class strings used verbatim
 * across the attendance forms. They emit identical DOM to what the forms
 * previously hand-rolled — pure extraction, zero visual or behavioral change.
 *
 * Exports:
 *   OpField        — compound field wrapper (label + required * + hint + error + aria linkage)
 *   OpFormAlert    — role="alert" error banner (danger box)
 *   OpFieldLabel   — block label wrapper; pass full children including any asterisk
 *   OpFieldHint    — subdued hint line below a control
 *   OpInput        — <input> with op control classes
 *   OpSelect       — <select> with op control classes
 *   OpTextarea     — <textarea> with op control classes
 *   OpSubmitButton — full-width submit button with pending/idle label
 */

// ---------------------------------------------------------------------------
// OpField compound wrapper
// ---------------------------------------------------------------------------

export type OpFieldRenderProps = {
  /** Stable id for the control — wire to the control's id prop. */
  id: string;
  /**
   * Space-separated ids of the hint and/or error elements.
   * Wire to aria-describedby on the control. Undefined when there is neither
   * hint nor error, so spreading is safe.
   */
  describedBy: string | undefined;
  /** True when the field has an error — wire to aria-invalid on the control. */
  invalid: boolean;
};

export type OpFieldProps = {
  /** Visible label text. */
  label: string;
  /** Hint text rendered below the control. */
  hint?: string;
  /** Inline error message rendered below the control (replaces hint). */
  error?: string;
  /** When true, shows a red required asterisk and the control should carry required. */
  required?: boolean;
  /** Extra class names for the outer wrapper div. */
  className?: string;
  /** Render-prop — receives aria linkage props; return the form control. */
  children: (api: OpFieldRenderProps) => ReactNode;
};

/**
 * Compound field wrapper for operator-tier forms.
 *
 * Generates stable ids for the control, hint, and error elements, and exposes
 * them via a render-prop so the wrapped control can wire aria-describedby and
 * aria-invalid without any manual id management by the consumer.
 *
 * Usage:
 *   <OpField label="Número de matrícula" required error={state.fieldError?.matricula}>
 *     {({ id, describedBy, invalid }) => (
 *       <OpInput id={id} name="matriculaNumber" required
 *                aria-describedby={describedBy} aria-invalid={invalid || undefined} />
 *     )}
 *   </OpField>
 */
export function OpField({ label, hint, error, required, className, children }: OpFieldProps) {
  const uid = useId();
  const hintId = hint ? `${uid}-hint` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);

  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <label htmlFor={uid} className="block text-xs font-medium text-ln-op-ink-2">
        {label}
        {required && (
          <span className="ml-0.5 text-ln-op-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({ id: uid, describedBy, invalid })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-ln-op-mute">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error alert banner
// ---------------------------------------------------------------------------

type OpFormAlertProps = {
  children: ReactNode;
};

/**
 * Danger alert box rendered when a form has a top-level error.
 *
 * Emits:
 *   <p role="alert" className="rounded-[4px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-sm text-ln-op-danger">
 */
export function OpFormAlert({ children }: OpFormAlertProps) {
  return (
    <p
      role="alert"
      className="rounded-[4px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-sm text-ln-op-danger"
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Field label
// ---------------------------------------------------------------------------

type OpFieldLabelProps = {
  /** id of the form control this label is for. */
  htmlFor: string;
  /**
   * Label content — pass the full label text including any required asterisk span,
   * exactly as it would appear in the original form markup.
   */
  children: ReactNode;
};

/**
 * Block label for an op-tier form field.
 *
 * Emits:
 *   <label htmlFor={...} className="block text-xs font-medium text-ln-op-ink-2 mb-1">
 */
export function OpFieldLabel({ htmlFor, children }: OpFieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ln-op-ink-2 mb-1">
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Field hint
// ---------------------------------------------------------------------------

type OpFieldHintProps = {
  children: ReactNode;
};

/**
 * Subdued hint line rendered below a control.
 *
 * Emits:
 *   <p className="text-xs text-ln-op-mute mt-1">
 */
export function OpFieldHint({ children }: OpFieldHintProps) {
  return <p className="text-xs text-ln-op-mute mt-1">{children}</p>;
}

// ---------------------------------------------------------------------------
// Shared control class string (input / select / textarea)
// ---------------------------------------------------------------------------

const controlCls =
  "w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type OpInputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * <input> styled with op-tier control tokens.
 *
 * All standard input attributes (id, name, type, value, defaultValue,
 * onChange, required, placeholder, pattern, maxLength, inputMode, …)
 * are forwarded via spread.
 *
 * The className prop is appended after the base classes when provided.
 */
export function OpInput({ className, ...rest }: OpInputProps) {
  return <input className={className ? `${controlCls} ${className}` : controlCls} {...rest} />;
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

type OpSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

/**
 * <select> styled with op-tier control tokens.
 * Pass <option> elements as children.
 */
export function OpSelect({ className, children, ...rest }: OpSelectProps) {
  return (
    <select className={className ? `${controlCls} ${className}` : controlCls} {...rest}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

type OpTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * <textarea> styled with op-tier control tokens.
 */
export function OpTextarea({ className, ...rest }: OpTextareaProps) {
  return <textarea className={className ? `${controlCls} ${className}` : controlCls} {...rest} />;
}

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

type OpSubmitButtonProps = {
  /** Whether the form submission is in-flight. */
  pending: boolean;
  /** Label shown while pending. Defaults to "Guardando…". */
  pendingLabel?: string;
  /** Label shown in idle state. */
  children: ReactNode;
};

/**
 * Full-width submit button for op-tier attendance forms.
 *
 * Emits:
 *   <button type="submit" disabled={pending} className="w-full px-4 py-2 rounded-md bg-ln-op-ok text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
 */
export function OpSubmitButton({
  pending,
  pendingLabel = "Guardando…",
  children,
}: OpSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-2 rounded-md bg-ln-op-ok text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
