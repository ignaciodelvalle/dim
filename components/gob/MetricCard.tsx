import Link from "next/link";
import { useId } from "react";

import { Icon, type IconName } from "@/components/Icon";

/**
 * Tarjeta KPI (Key Performance Indicator) para dashboards de gobierno.
 *
 * Muestra un valor principal con label, unidad opcional, delta vs. período anterior y
 * una línea secundaria informativa. Cinco tonos semánticos controlan el fondo y borde.
 *
 * Variantes de tono (prop `tone`):
 *  - neutral  → fondo blanco / borde gris. Default. Para métricas sin carga semántica.
 *  - info     → fondo azul muy tenue / borde azul suave. Para métricas informativas.
 *  - success  → fondo verde muy tenue / borde verde suave. Para resultados positivos.
 *  - warning  → fondo amarillo tenue / borde amarillo. Para alertas moderadas.
 *  - danger   → fondo rojo muy tenue / borde rojo suave. Para métricas críticas.
 *
 * Accesibilidad:
 *  - Sin `href`: renderiza `<article>` con `aria-labelledby` apuntando al label.
 *  - Con `href`: el contenido queda dentro de un `<Link>` con focus ring visible.
 *  - El valor se lee por los lectores de pantalla junto al label de la región.
 *  - El delta y subline son elementos de apoyo, no el contenido principal del anuncio.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="Casos abiertos"
 *   value="1,247"
 *   unit="denuncias"
 *   delta="+12% vs mes anterior"
 *   tone="warning"
 * />
 * ```
 */

export type MetricCardTone = "neutral" | "info" | "success" | "warning" | "danger";

export type MetricCardProps = {
  /** Etiqueta corta. Ej: "Casos abiertos". */
  label: string;
  /** Valor principal pre-formateado. Ej: "1,247". El formateo ocurre en el call site. */
  value: string;
  /** Unidad opcional. Ej: "denuncias". Se renderiza más chica junto al valor. */
  unit?: string;
  /** Delta vs. período anterior. Ej: "+12% vs mes anterior". El tono determina el color. */
  delta?: string;
  /** Línea secundaria informativa. */
  subline?: string;
  /** Ícono icono-arg opcional. */
  icon?: IconName;
  /** Tono semántico del card. Default "neutral". */
  tone?: MetricCardTone;
  /** Si se provee, el card se renderiza como Link de Next.js con focus ring. */
  href?: string;
  className?: string;
};

const toneClasses: Record<MetricCardTone, string> = {
  neutral: "bg-ln-card border-ln-line",
  info: "bg-ln-celeste/5 border-ln-celeste/30",
  success: "bg-ln-ok/5 border-ln-ok/30",
  warning: "bg-[#e0a93e]/10 border-[#e0a93e]/40",
  danger: "bg-ln-seal/5 border-ln-seal/30",
};

// El color del delta sigue el tono del card (el caller decide el string; el tono decide el color).
const deltaColorClasses: Record<MetricCardTone, string> = {
  neutral: "text-ln-ink-2",
  info: "text-ln-celeste",
  success: "text-ln-ok",
  warning: "text-ln-warn",
  danger: "text-ln-seal",
};

const cardBase = "rounded-2xl border p-4 flex flex-col gap-2 transition-shadow hover:shadow-md";

type MetricCardContentProps = {
  label: string;
  labelId: string;
  value: string;
  unit?: string;
  delta?: string;
  subline?: string;
  icon?: IconName;
  tone: MetricCardTone;
};

function MetricCardContent({
  label,
  labelId,
  value,
  unit,
  delta,
  subline,
  icon,
  tone,
}: MetricCardContentProps) {
  return (
    <>
      {/* Header: label + ícono */}
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-xs font-semibold uppercase tracking-wide text-ln-ink-2">
          {label}
        </span>
        {icon && <Icon name={icon} size="1.1rem" className="text-ln-mute shrink-0" decorative />}
      </div>

      {/* Valor principal */}
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-3xl font-semibold text-ln-ink leading-tight">{value}</span>
        {unit && <span className="text-base text-ln-ink-2 ml-1">{unit}</span>}
      </div>

      {/* Delta */}
      {delta && <span className={`text-xs font-medium ${deltaColorClasses[tone]}`}>{delta}</span>}

      {/* Subline */}
      {subline && <span className="text-xs text-ln-mute">{subline}</span>}
    </>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  subline,
  icon,
  tone = "neutral",
  href,
  className = "",
}: MetricCardProps) {
  const labelId = useId();
  const containerClasses = `${cardBase} ${toneClasses[tone]} ${className}`.trim();

  if (href) {
    return (
      <Link
        href={href}
        className={`${containerClasses} focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-azul focus-visible:ring-offset-2`}
        aria-labelledby={labelId}
      >
        <MetricCardContent
          label={label}
          labelId={labelId}
          value={value}
          unit={unit}
          delta={delta}
          subline={subline}
          icon={icon}
          tone={tone}
        />
      </Link>
    );
  }

  return (
    <article className={containerClasses} aria-labelledby={labelId}>
      <MetricCardContent
        label={label}
        labelId={labelId}
        value={value}
        unit={unit}
        delta={delta}
        subline={subline}
        icon={icon}
        tone={tone}
      />
    </article>
  );
}
