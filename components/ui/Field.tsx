"use client";

import { type ReactNode, useId } from "react";

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
 *  LnField     — wrapper (label + control slot + hint/error)
 *  LnInput     — <input> styled to spec; mono variant for codes/dates
 *  LnSelect    — <select> with custom chevron
 *  LnTextarea  — <textarea> resizable
 *  LnRow       — 2-column grid for field pairs
 *  LnSuffixWrap — input with appended unit label (e.g. "27.4 [kg]")
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
        className="mb-[6px] flex items-center gap-[5px] font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
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

// ---------- Shared control base classes -----------------------------------

const controlBase =
  "w-full rounded-[4px] border border-[var(--color-ln-line-strong)] " +
  "bg-[var(--color-ln-card)] px-[12px] py-[10px] " +
  "font-[var(--font-ln-sans)] text-[13.5px] text-[var(--color-ln-ink)] " +
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
    />
  );
}

// ---------- Row (2-column grid) -------------------------------------------

export function LnRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["grid grid-cols-2 gap-[12px]", className].filter(Boolean).join(" ")}>
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
      <span className="grid place-items-center border-l border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[13px] font-[var(--font-ln-mono)] text-[12px] text-[var(--color-ln-mute)]">
        {suffix}
      </span>
    </div>
  );
}
