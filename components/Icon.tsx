// Minimal stub for the Poncho `icono-arg` webfont Icon component.
//
// `docs/poncho/PLAN.md` describes Fase 1 (completada) as including:
//   "852 íconos `icono-arg` como webfont + componente <Icon name="..." />"
//
// The PLAN doc and the Poncho components that import this file were rescued
// from a detached working tree (Cowork session writing to the old path), but
// the actual icon webfont assets (`public/fonts/icono-arg/*.woff2`) and the
// full IconName registry were never committed.
//
// This stub keeps the import surface stable so the rest of the Poncho code
// type-checks and builds. Each <Icon /> renders the icon name as text — a
// visible reminder to come back and wire up the real webfont. Replace this
// file when:
//   1. `public/fonts/icono-arg/*.{woff,woff2}` are committed
//   2. The 852-name registry is generated (script or static export)

import type { HTMLAttributes } from "react";

/**
 * Name of one of the 852 `icono-arg` glyphs. Today this is a free `string`;
 * tighten to a discriminated union once the registry lands.
 */
export type IconName = string;

/**
 * The full registry of available icon names. Empty in the stub so that
 * consumers like `IconSearch` render without crashing — replace with the
 * generated list.
 */
export const iconNames: ReadonlyArray<IconName> = [];

type IconProps = {
  name: IconName;
  /** Size token ("sm" | "md" | "lg"), pixel number, or any CSS length string
   *  (e.g. "1.1em"). Defaults to inheriting the parent's font-size. */
  size?: "sm" | "md" | "lg" | number | string;
  /** True when the icon is purely decorative (paired with adjacent text).
   *  Adds `aria-hidden`; consumers must not rely on it for semantics. */
  decorative?: boolean;
} & Omit<HTMLAttributes<HTMLSpanElement>, "aria-hidden">;

export function Icon({ name, size, decorative, className, style, ...rest }: IconProps) {
  const sizeStyle =
    typeof size === "number"
      ? { fontSize: `${size}px`, ...style }
      : size === "sm"
        ? { fontSize: "1rem", ...style }
        : size === "lg"
          ? { fontSize: "1.5rem", ...style }
          : size === "md"
            ? { fontSize: "1.25rem", ...style }
            : typeof size === "string"
              ? { fontSize: size, ...style }
              : style;
  return (
    <span
      className={`iconArg${className ? ` ${className}` : ""}`}
      data-icon-name={name}
      aria-hidden={decorative ? true : undefined}
      style={sizeStyle}
      {...rest}
    >
      {/* In the real component the webfont's ::before pseudo-element renders
          the glyph. Until then, the icon name shows as text so the layout is
          still inspectable. */}
      {name}
    </span>
  );
}
