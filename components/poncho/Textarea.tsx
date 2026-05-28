// Textarea: multi-line input Poncho. Mismo patrón que <Input> pero sin height
// fija — usa min-h-24 (96px ≈ 3 líneas) y permite resize vertical para que el
// usuario expanda cuando escribe párrafos largos. Para usar dentro de <Field>.

import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

const BASE_CLASSES =
  "block w-full px-4 py-2 text-[0.88em] text-gob-text bg-gob-surface " +
  "border rounded-[var(--radius-input)] min-h-24 resize-y " +
  "placeholder:text-gob-text-muted " +
  "disabled:bg-gob-surface-alt disabled:cursor-not-allowed disabled:text-gob-text-muted " +
  "transition-colors";

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const borderCls = invalid
    ? "border-gob-danger focus:border-gob-danger"
    : "border-gob-border-strong focus:border-gob-primary";
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${BASE_CLASSES} ${borderCls} ${className ?? ""}`.trim()}
      {...rest}
    />
  );
}
