import { useId } from "react";
import type { ReactNode } from "react";

import type { ReminderVariant } from "@/lib/vaccine-reminder-state";
import { Badge } from "./Badge";
import { Panel, PanelBody, PanelHeader } from "./Panel";

/**
 * Tarjeta de recordatorio de vacuna. Cinco variantes según el estado del vencimiento.
 *
 * Variantes:
 *  - upcoming          → vence en 8+ días. Borde azul info.
 *  - due_soon          → vence en 1–7 días. Borde amarillo warning.
 *  - overdue           → vencida hace 0–30 días. Borde rojo danger.
 *  - overdue_critical  → vencida hace >30 días (vacuna reportable). Borde rojo + fondo
 *                        danger/5. Incluye role="alert" para que lectores de pantalla
 *                        lo prioricen.
 *  - success           → vacuna registrada que respondió a un recordatorio. Borde verde.
 *
 * Accesibilidad:
 *  - El wrapper es un `<article>` (no usamos Panel directamente como article porque
 *    Panel usa `<section>`). El Panel queda adentro para obtener el contenedor visual.
 *    Decisión: envolver Panel en <article> es la solución más directa sin modificar
 *    Panel ni crear una prop opcional `as`. Cada ReminderCard en una lista de recordatorios
 *    es semánticamente una unidad independiente → `<article>` es correcto.
 *  - `aria-labelledby` en el article apunta al `id` del título generado con `useId()`.
 *    useId() garantiza IDs estables y únicos cuando hay múltiples cards en la misma página.
 *  - `overdue_critical` agrega `role="alert"` al article para anuncio inmediato.
 *  - `dueAt`: acepta un string pre-formateado (ej: "18 de junio"). El formateo de fecha
 *    corresponde al call site donde ya están disponibles date-fns y el locale.
 *    NO se acepta ISO aquí — el componente no depende de ninguna librería de fechas.
 */

export type ReminderCardProps = {
  variant: ReminderVariant;
  /** Nombre de la vacuna, ej: "Antirrábica" o "Vacuna múltiple". */
  title: string;
  /** Nombre del pet. Se muestra como "{title} — {petName}" en el header. */
  petName: string;
  /**
   * Texto de estado pre-formateado. Ej: "Vence en 5 días" o "Vencida hace 8 días".
   * El call site es responsable de construir este string.
   */
  statusText: string;
  /**
   * Fecha de vencimiento pre-formateada para mostrar como contexto adicional.
   * Acepta un display string (ej: "18 de junio de 2026"), NO un ISO date.
   * El formateo de fecha corresponde al call site (date-fns + locale).
   * Opcional — si no se pasa, solo se muestra statusText.
   */
  dueAt?: string;
  /**
   * Slot de acciones (botones). Plan sugiere "Agendar", "Posponer", "Registrar".
   * En variant "success" se recomienda no pasar actions (auto-dismiss semántico).
   */
  actions?: ReactNode;
  className?: string;
};

// ---------------------------------------------------------------------------
// Mapeo de variante → tokens visuales
// ---------------------------------------------------------------------------

type VariantConfig = {
  /** Clases de borde izquierdo de 4px y fondo opcional. */
  border: string;
  /** Variante del Badge de estado. */
  badgeVariant: "info" | "success" | "warning" | "danger" | "neutral";
  /** Agrega role="alert" al article. Solo overdue_critical. */
  isAlert: boolean;
};

const VARIANT_CONFIG: Record<ReminderVariant, VariantConfig> = {
  upcoming: {
    border: "border-l-4 border-l-gob-info",
    badgeVariant: "info",
    isAlert: false,
  },
  due_soon: {
    border: "border-l-4 border-l-gob-warning",
    badgeVariant: "warning",
    isAlert: false,
  },
  overdue: {
    border: "border-l-4 border-l-gob-danger",
    badgeVariant: "danger",
    isAlert: false,
  },
  overdue_critical: {
    border: "border-l-4 border-l-gob-danger bg-gob-danger/5",
    badgeVariant: "danger",
    isAlert: true,
  },
  success: {
    border: "border-l-4 border-l-gob-success",
    badgeVariant: "success",
    isAlert: false,
  },
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ReminderCard({
  variant,
  title,
  petName,
  statusText,
  dueAt,
  actions,
  className = "",
}: ReminderCardProps) {
  const titleId = useId();
  const config = VARIANT_CONFIG[variant];

  const articleProps = {
    "aria-labelledby": titleId,
    ...(config.isAlert ? { role: "alert" as const } : {}),
  };

  return (
    <article {...articleProps} className={className}>
      <Panel className={config.border} aria-labelledby={titleId}>
        <PanelHeader
          title={
            <span id={titleId}>
              {title} — {petName}
            </span>
          }
          actions={actions}
        />
        <PanelBody>
          <div className="flex flex-col gap-1.5">
            <Badge variant={config.badgeVariant}>{statusText}</Badge>
            {dueAt && <p className="text-xs text-gob-text-gray">{dueAt}</p>}
          </div>
        </PanelBody>
      </Panel>
    </article>
  );
}
