// Select: native <select> con look Poncho — height 44px, radius 10px, mismo
// border-color pattern. Chevron renderizado via background-image inline SVG
// para que el dropdown nativo se vea consistente cross-browser (Chrome/Safari/
// Firefox renderizan la flecha nativa con tamaños y tonos distintos).
//
// Las opciones se inyectan via `children` como `<option>` nativos — el
// componente no opina sobre data binding.

import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

// Inline SVG chevron — gob-text-muted #555. data-uri scheme keeps CSS in one
// shot without an extra HTTP request.
const CHEVRON_SVG =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2020%2020'%20fill='%23555'%3E%3Cpath%20d='M5.5%208l4.5%204.5L14.5%208z'/%3E%3C/svg%3E";

const BASE_CLASSES =
  "block w-full appearance-none pl-4 pr-10 py-1.5 text-[0.88em] text-gob-text bg-gob-surface " +
  "border rounded-[10px] " +
  "disabled:bg-gob-surface-alt disabled:cursor-not-allowed disabled:text-gob-text-muted " +
  "transition-colors bg-no-repeat";

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  const borderCls = invalid
    ? "border-gob-danger focus:border-gob-danger"
    : "border-gob-border-strong focus:border-gob-primary";
  return (
    <select
      style={{
        height: "44px",
        backgroundImage: `url("${CHEVRON_SVG}")`,
        backgroundPosition: "right 0.75rem center",
        backgroundSize: "1.25rem",
      }}
      aria-invalid={invalid || undefined}
      className={`${BASE_CLASSES} ${borderCls} ${className ?? ""}`.trim()}
      {...rest}
    >
      {children}
    </select>
  );
}
