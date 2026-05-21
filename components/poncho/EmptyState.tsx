import { Icon, type IconName } from "@/components/Icon";
import type { ReactNode } from "react";

/**
 * Estado vacío genérico para listas, paneles y secciones sin contenido.
 *
 * Estructura vertical centrada:
 *  [ícono grande muted]
 *  [title — text-lg font-semibold]
 *  [description — text-sm muted, opcional]
 *  [action — slot para un <Button> u otro CTA, opcional]
 *
 * Accesibilidad:
 *  - Es un estado estático; no usa aria-live (no cambia dinámicamente).
 *  - El ícono es decorativo (aria-hidden).
 */

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-4 gap-3 ${className}`.trim()}
    >
      {icon && <Icon name={icon} size="3rem" className="text-gob-text-muted" decorative />}
      <p className="text-lg font-semibold text-gob-text">{title}</p>
      {description && <p className="text-sm text-gob-text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
