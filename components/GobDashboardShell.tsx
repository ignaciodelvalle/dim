import type { ReactNode } from "react";

// Three-zone dashboard shell for /gob.
//
// Layout:
//   ┌─ header (title + breadcrumb + actions)
//   ├─ filters row
//   ├─ kpiStrip (full width)
//   └─ main + aside (2/3 + 1/3 desktop, stacked on mobile)
//
// All slots are optional — pass `null` to omit a zone (e.g. no aside).
// The shell does NOT fetch data; the page that uses it does. The shell
// is a pure layout primitive so it's easy to test visually and reuse
// from /gob/indicadores or any future jurisdiction-scoped view.
//
// Spec: docs/gob-dashboard-plan-2026-05-20.md — Phase 1.

interface Props {
  title: string;
  /** Small text above the title (e.g. breadcrumb or org). */
  eyebrow?: ReactNode;
  /** Short paragraph below the title. */
  description?: ReactNode;
  /** Right-aligned action area in the header (buttons, dropdowns). */
  actions?: ReactNode;
  /** Filters row immediately under the header — usually `<JurisdictionFilterBar />`. */
  filters?: ReactNode;
  /** Full-width KPI strip. Recommended: `<KpiTileGrid>…</KpiTileGrid>`. */
  kpiStrip?: ReactNode;
  /** Left/main column. Cards, maps, kanban. */
  main: ReactNode;
  /** Right-side column. Lists, summaries, drill-downs. Optional. */
  aside?: ReactNode;
}

export function GobDashboardShell({
  title,
  eyebrow,
  description,
  actions,
  filters,
  kpiStrip,
  main,
  aside,
}: Props) {
  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.18em] text-gob-text-muted ">{eyebrow}</p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">{title}</h1>
            {description && <p className="text-sm text-gob-text-gray ">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>

        {filters && <section aria-label="Filtros">{filters}</section>}

        {kpiStrip && <section aria-label="Indicadores clave">{kpiStrip}</section>}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">{main}</div>
          {aside && <aside className="space-y-6 lg:col-span-1">{aside}</aside>}
        </div>
      </div>
    </main>
  );
}

// Generic card wrapper to keep main/aside children consistent.
export function DashboardCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gob-border bg-white p-4   ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-gob-text ">{title}</h2>}
          {action && <div className="text-sm">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
