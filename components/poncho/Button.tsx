import { Icon, type IconName } from "@/components/Icon";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botón Poncho-flavored.
 *
 * Variantes (alineadas con https://argob.github.io/poncho/componentes/botones/):
 *  - primary   → acción por defecto. Varios por página, no varios por grupo.
 *  - secondary → secundario neutro. Outline gris. Usar para "Cancelar".
 *  - success   → acción principal / avanzar. **Sólo uno por página.**
 *  - danger    → acción terminante o irreversible. Outline rojo.
 *  - link      → acción secundaria sin contenedor. Para "Cancelar" o "Volver".
 *  - tag       → etiqueta clickable. Uppercase, chico.
 *
 * Accesibilidad:
 *  - Touch target ≥44px en md (default).
 *  - Focus ring global (definido en globals.css).
 *  - Cuando loading=true, deshabilita y muestra spinner. aria-busy se setea.
 *  - Si el botón es solo ícono (sin children visibles), pasar ariaLabel.
 */

type Variant = "primary" | "secondary" | "success" | "danger" | "link" | "tag";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Nombre de un ícono icono-arg para mostrar a la izquierda del texto. */
  iconLeft?: IconName;
  /** Nombre de un ícono icono-arg para mostrar a la derecha. */
  iconRight?: IconName;
  /** Si el botón es solo ícono, este label es obligatorio. */
  ariaLabel?: string;
  children?: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-full " +
  "transition-colors transition-transform select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "active:translate-y-px";

const sizes: Record<Size, string> = {
  // Padding calibrado para llegar a 44px (md) y 48px (lg) de alto incluyendo borde.
  sm: "min-h-9 px-4 text-sm",
  md: "min-h-11 px-7 text-base",
  lg: "min-h-12 px-8 text-base",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-gob-primary text-white border-0 " +
    "hover:bg-gob-primary-hover active:bg-gob-primary-active",
  secondary:
    "bg-white text-gob-primary border-[3px] border-gob-border " + "hover:border-gob-border-strong",
  success: "bg-gob-success text-white border-0 " + "hover:bg-gob-success-hover",
  danger:
    "bg-transparent text-gob-danger border-[3px] border-gob-danger " +
    "hover:bg-gob-danger hover:text-white",
  link:
    "bg-transparent text-gob-azul-link border-0 underline-offset-4 " +
    "hover:underline hover:text-gob-azul-link-hover",
  tag:
    "bg-white text-gob-primary border-2 border-gob-border " +
    "rounded-full uppercase tracking-wide text-xs px-3 min-h-8 " +
    "hover:border-gob-border-strong",
};

function Spinner({ size }: { size: Size }) {
  const dim = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  return (
    <span
      aria-hidden="true"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: dim, height: dim }}
    />
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconLeft,
  iconRight,
  ariaLabel,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: Props) {
  const isIconOnly = !children && (iconLeft || iconRight);
  if (process.env.NODE_ENV !== "production" && isIconOnly && !ariaLabel) {
    console.warn("<Button>: botón solo-ícono requiere ariaLabel");
  }

  // Si la variante es 'tag', size queda forzado por la propia variante.
  const sizeClasses = variant === "tag" ? "" : sizes[size];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      className={`${base} ${sizeClasses} ${variants[variant]} ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} />
      ) : (
        iconLeft && <Icon name={iconLeft} size="1.1em" decorative />
      )}
      {children}
      {!loading && iconRight && <Icon name={iconRight} size="1.1em" decorative />}
    </button>
  );
}
