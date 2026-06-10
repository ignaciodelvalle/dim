import Link from "next/link";

// CasesWidget — replaces the old "Mis mascotas" mini grid on /inicio.
//
// Shows the owner's open cases ("casos abiertos") across every kind the
// system tracks for personal accounts: lost-pet episodes, adoption
// applications, foster proposals, welfare denuncias, custody disputes,
// approval requests in flight.
//
// Why this and not a pet list:
//   - The pet picker in EventCatcher already enumerates the pets and
//     supports tap-twice to open a pet profile. A second pet list
//     below is redundant.
//   - What an owner needs at-a-glance is "what's happening with my
//     pets", not "which pets are mine". Cases are the happening.
//
// Data shape: this component accepts the existing `WorkflowItem` shape
// from `lib/owner-dashboard.ts` so the migration is a rename + a few
// visual tweaks — no new query. Each row has title, subtitle, ctaUrl,
// since, and a severity (`info | warning | danger | success`).
//
// Spec: docs/owner-home-plan-2026-05-20.md — v3 revision.

export type CaseRow = {
  /** Unique key for React. */
  id: string;
  /** First line — what happened, with the pet's name. */
  title: string;
  /** Second line — case ref + status. */
  subtitle: string;
  /** Where this row goes on click. Usually `/casos/{publicCode}` or `/mis-mascotas/{token}`. */
  ctaUrl: string;
  /** Open date. Drives "hace X días". */
  since: Date;
  /** Visual tone. */
  severity: "info" | "warning" | "danger" | "success";
  /** Optional case-kind icon (emoji ok in v1, swap for lucide later). */
  icon?: string;
};

const MAX_VISIBLE = 5;

export function CasesWidget({
  cases,
  totalCount,
}: {
  cases: CaseRow[];
  totalCount?: number;
}) {
  const visible = cases.slice(0, MAX_VISIBLE);
  const total = totalCount ?? cases.length;

  return (
    <section
      aria-labelledby="oh-cases-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="oh-cases-h" className="text-base font-semibold text-ln-ink ">
          Mis casos
          {total > 0 && (
            <span className="ml-2 text-xs font-normal text-ln-mute ">
              · {total} abierto{total === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <Link href="/cuenta/casos" className="text-xs font-medium text-ln-azul hover:underline">
          Ver historial →
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ln-line-strong p-6 text-center text-sm text-ln-mute ">
          Sin casos abiertos. Cualquier denuncia, postulación o pérdida que empieces va a aparecer
          acá.
        </p>
      ) : (
        <ul className="divide-y divide-ln-line ">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={c.ctaUrl}
                className="flex items-start gap-3 py-3 transition-colors hover:bg-ln-stripe "
              >
                <CaseIcon severity={c.severity} icon={c.icon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ln-ink ">{c.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ln-mute ">{c.subtitle}</p>
                </div>
                <p
                  className="shrink-0 text-[11px] text-ln-mute "
                  title={c.since.toLocaleString("es-AR")}
                >
                  {relativeShort(c.since)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > visible.length && (
        <p className="mt-2 text-right text-xs text-ln-mute ">
          Mostrando los {visible.length} más recientes
        </p>
      )}
    </section>
  );
}

function CaseIcon({
  severity,
  icon,
}: {
  severity: CaseRow["severity"];
  icon?: string;
}) {
  const tone =
    severity === "danger"
      ? "bg-[var(--color-ln-err-050)] text-ln-err  "
      : severity === "warning"
        ? "bg-[var(--color-ln-warn-050)] text-ln-warn  "
        : severity === "success"
          ? "bg-[var(--color-ln-ok-050)] text-ln-ok  "
          : "bg-ln-celeste/10 text-ln-azul  ";
  return (
    <span
      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${tone}`}
      aria-hidden
    >
      {icon ?? "•"}
    </span>
  );
}

function relativeShort(d: Date): string {
  const ms = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / day);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d.`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `hace ${m} m.`;
  }
  const y = Math.floor(days / 365);
  return `hace ${y} a.`;
}
