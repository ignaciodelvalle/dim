"use client";

import { Icon, type IconName } from "@/components/Icon";
import type { ReactNode } from "react";

/**
 * Alerta informativa con variantes semánticas y soporte de dismiss.
 *
 * Variantes:
 *  - info    → aviso informativo neutro (default).
 *  - success → confirmación de operación exitosa.
 *  - warning → advertencia; requiere atención pero no es bloqueante.
 *  - danger  → error o condición crítica.
 *
 * Accesibilidad:
 *  - Usa `role="alert"` para que los lectores de pantalla anuncien el contenido
 *    de inmediato cuando se monta o aparece dinámicamente.
 *  - El botón de dismiss tiene `aria-label="Cerrar"`.
 *  - El ícono es decorativo (aria-hidden); el contexto semántico lo da el texto.
 */

type AlertVariant = "info" | "success" | "warning" | "danger";

export type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  icon?: IconName;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
};

const containerVariants: Record<AlertVariant, string> = {
  info: "bg-gob-info/5 border-gob-info/30 text-gob-text",
  success: "bg-gob-success/5 border-gob-success/30 text-gob-text",
  warning: "bg-gob-warning/10 border-gob-warning/40 text-gob-text",
  danger: "bg-gob-danger/5 border-gob-danger/30 text-gob-text",
};

/** Íconos por defecto razonables según variante (ajustables por el consumidor). */
const defaultIcons: Record<AlertVariant, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "warning",
  danger: "error",
};

const iconColors: Record<AlertVariant, string> = {
  info: "text-gob-info",
  success: "text-gob-success",
  warning: "text-gob-warning-text",
  danger: "text-gob-danger",
};

export function Alert({
  variant = "info",
  title,
  icon,
  children,
  onDismiss,
  className = "",
}: AlertProps) {
  const resolvedIcon = icon ?? defaultIcons[variant];

  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-xl border p-4 ${containerVariants[variant]} ${className}`.trim()}
    >
      {/* Ícono */}
      <Icon
        name={resolvedIcon}
        size="1.25rem"
        className={`mt-0.5 shrink-0 ${iconColors[variant]}`}
        decorative
      />

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="shrink-0 self-start text-gob-text-gray hover:text-gob-text transition-colors"
        >
          <Icon name="close" size="1.1rem" decorative />
        </button>
      )}
    </div>
  );
}
