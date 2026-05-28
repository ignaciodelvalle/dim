// Input: text input Poncho con height 44px, radius 10px, border 1px
// gob-border-strong. Para usar dentro de <Field>. El consumidor pasa id +
// aria-describedby + invalid desde la render-prop de Field.
//
// El prop `invalid` setea `aria-invalid="true"` y cambia el color del border
// a danger. Combina con el aria-describedby que apunta al errorId de Field.

import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

const BASE_CLASSES =
  "block w-full px-4 py-1.5 text-[0.88em] text-gob-text bg-gob-surface " +
  "border rounded-[var(--radius-input)] " +
  "placeholder:text-gob-text-muted " +
  "disabled:bg-gob-surface-alt disabled:cursor-not-allowed disabled:text-gob-text-muted " +
  "transition-colors";

export function Input({ invalid, className, ...rest }: InputProps) {
  const borderCls = invalid
    ? "border-gob-danger focus:border-gob-danger"
    : "border-gob-border-strong focus:border-gob-primary";
  return (
    <input
      style={{ height: "44px" }}
      aria-invalid={invalid || undefined}
      className={`${BASE_CLASSES} ${borderCls} ${className ?? ""}`.trim()}
      {...rest}
    />
  );
}
