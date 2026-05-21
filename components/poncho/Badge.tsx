import { Icon, type IconName } from "@/components/Icon";
import type { ReactNode } from "react";

/**
 * Insignia visual tipo pill. Comunica estado semántico con color y opcionalmente un ícono.
 *
 * Variantes:
 *  - info     → fondo azul tenue / texto azul. Para estados informativos neutros.
 *  - success  → fondo verde tenue / texto verde. Para estados exitosos o activos.
 *  - warning  → fondo amarillo tenue / texto cálido oscuro (AA sobre blanco).
 *  - danger   → fondo rojo tenue / texto rojo. Para errores o vencimientos críticos.
 *  - neutral  → fondo gris / texto gris. Default. Para estado desconocido o sin valor semántico.
 *
 * Accesibilidad:
 *  - Cuando se usa sin children (solo ícono), `aria-label` es obligatorio.
 *  - Si necesitás animación (pulse), envolvé el Badge: `<span className="animate-pulse"><Badge /></span>`.
 *    No se hornea animación en el componente — el consumidor decide.
 */

type BadgeVariant = "info" | "success" | "warning" | "danger" | "neutral";

export type BadgeProps = {
  variant?: BadgeVariant;
  icon?: IconName;
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
};

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

const variantClasses: Record<BadgeVariant, string> = {
  info: "bg-gob-info/10 text-gob-info",
  success: "bg-gob-success/10 text-gob-success",
  warning: "bg-gob-warning/20 text-gob-warning-text",
  danger: "bg-gob-danger/10 text-gob-danger",
  neutral: "bg-gob-surface-alt text-gob-text-gray",
};

export function Badge({
  variant = "neutral",
  icon,
  children,
  "aria-label": ariaLabel,
  className = "",
}: BadgeProps) {
  if (process.env.NODE_ENV !== "production" && !children && !ariaLabel) {
    console.warn("<Badge>: badge solo-ícono requiere aria-label");
  }

  return (
    <span
      className={`${base} ${variantClasses[variant]} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {icon && <Icon name={icon} size="0.9em" decorative />}
      {children}
    </span>
  );
}
