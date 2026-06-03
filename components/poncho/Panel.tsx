import type { ReactNode } from "react";

/**
 * Familia de componentes Panel para contenedores con identidad visual Poncho.
 *
 * Uso típico:
 * ```tsx
 * <Panel aria-labelledby="titulo-panel">
 *   <PanelHeader title={<span id="titulo-panel">Vacunas</span>} actions={<Button size="sm">Agregar</Button>} />
 *   <PanelBody>…contenido…</PanelBody>
 * </Panel>
 * ```
 *
 * Accesibilidad:
 *  - `Panel` usa el elemento `<section>`. Pasá `aria-labelledby` apuntando al id del título
 *    para que los lectores de pantalla anuncien la región correctamente.
 *  - `PanelHeader` renderiza el título como `<h2>` — asegurate de que el nivel jerárquico
 *    sea correcto en el contexto de la página.
 */

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export type PanelProps = {
  children: ReactNode;
  "aria-labelledby"?: string;
  className?: string;
};

export function Panel({ children, "aria-labelledby": ariaLabelledBy, className = "" }: PanelProps) {
  return (
    <section
      aria-labelledby={ariaLabelledBy}
      className={`rounded-[var(--radius-card)] border border-gob-border bg-gob-surface shadow-sm ${className}`.trim()}
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PanelHeader
// ---------------------------------------------------------------------------

export type PanelHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PanelHeader({ title, actions, className = "" }: PanelHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-gob-border ${className}`.trim()}
    >
      <h2 className="text-base font-semibold text-gob-text">{title}</h2>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelBody
// ---------------------------------------------------------------------------

export type PanelBodyProps = {
  children: ReactNode;
  className?: string;
};

export function PanelBody({ children, className = "" }: PanelBodyProps) {
  return <div className={`px-4 py-4 ${className}`.trim()}>{children}</div>;
}
