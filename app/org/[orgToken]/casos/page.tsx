// Org-scope case index. Lists every case where the org is the opener
// OR holds an active ownership row on the subject pet.
//
// Filters via searchParams: ?kind=<caseKind> and ?status=open|closed
// Each row links to /casos/[publicCode]. The "Ver mascota" link is
// independent of the row link — separate tap target per Fase E spec.

// ---------------------------------------------------------------------------
// WIRED (sprint 5 PR-047 — 2026-05-27)
//
// Reachable from the org dashboard "Casos abiertos" count card. The previous
// DEFERRED-BY-DESIGN audit comment is retired; nav presets remain a future
// improvement (the link from the dashboard is the canonical entry today).
// ---------------------------------------------------------------------------

import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { listCaseKindDistributionForOrg, listCasesForOrg } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { type CaseKind, caseKindLabel, isCaseKind } from "@/src/modules/cases/domain/case-kinds";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
] as const;

function filterChipCls(active: boolean) {
  return [
    "rounded-full border px-3 py-[5px] text-[12px] no-underline transition-colors",
    active
      ? "border-ln-op-azul bg-ln-op-azul text-white"
      : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe",
  ].join(" ");
}

interface PageProps {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ kind?: string; status?: string }>;
}

export default async function OrgCasosPage({ params, searchParams }: PageProps) {
  const { orgToken } = await params;
  const { kind: kindParam, status: statusParam } = await searchParams;

  const { organization } = await requireOrgAccessByToken(orgToken);

  const activeKind: CaseKind | null = isCaseKind(kindParam ?? "") ? (kindParam as CaseKind) : null;
  const activeStatus: "open" | "closed" | null =
    statusParam === "open" || statusParam === "closed" ? statusParam : null;

  // Filters are pushed into SQL — no in-memory filtering.
  const [{ items, truncated }, presentKinds] = await Promise.all([
    listCasesForOrg(organization.id, { kind: activeKind, status: activeStatus }),
    listCaseKindDistributionForOrg(organization.id),
  ]);

  // Build filter href helper — preserves the other filter.
  function kindHref(k: CaseKind | null) {
    const p = new URLSearchParams();
    if (k) p.set("kind", k);
    if (activeStatus) p.set("status", activeStatus);
    const qs = p.toString();
    return `/org/${orgToken}/casos${qs ? `?${qs}` : ""}`;
  }

  function statusHref(s: "open" | "closed" | null) {
    const p = new URLSearchParams();
    if (activeKind) p.set("kind", activeKind);
    if (s) p.set("status", s);
    const qs = p.toString();
    return `/org/${orgToken}/casos${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Expedientes donde {organization.displayName} es la organización que abrió el caso o
          actualmente tiene custodia activa.
        </p>
      </header>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(({ value, label }) => {
          const s = value === "" ? null : (value as "open" | "closed");
          const active = activeStatus === s;
          return (
            <Link key={value} href={statusHref(s)} className={filterChipCls(active)}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Kind filter chips — only show kinds present in the full list */}
      {presentKinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link href={kindHref(null)} className={filterChipCls(activeKind === null)}>
            Todos los tipos
          </Link>
          {presentKinds.map((k) => (
            <Link key={k} href={kindHref(k)} className={filterChipCls(activeKind === k)}>
              {caseKindLabel(k)}
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <LnEmptyState
          icon="solicitud"
          title={
            presentKinds.length === 0 && !activeKind && !activeStatus
              ? "Sin casos abiertos ni cerrados por ahora."
              : "Ningún caso coincide con los filtros seleccionados."
          }
        />
      ) : (
        <OpCard>
          <OpCardHead
            title="Expedientes"
            actions={`${items.length} caso${items.length !== 1 ? "s" : ""}${truncated ? "+" : ""}`}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <CaseBadge
                      publicCode={c.publicCode}
                      caseKind={c.caseKind}
                      status={c.status}
                      size="sm"
                    />
                    <span className="text-[12px] text-ln-op-mute">
                      Abierto el {formatDate(c.openedAt)}
                      {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                    </span>
                  </div>
                  {c.primaryPetPublicToken && c.primaryPetName ? (
                    <Link
                      href={`/org/${orgToken}/mascotas/${c.primaryPetPublicToken}`}
                      className="inline-flex items-center rounded-full bg-ln-op-stripe px-3 py-1.5 text-[12px] text-ln-op-ink transition hover:bg-ln-op-line no-underline"
                    >
                      🐾 {c.primaryPetName}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-ln-op-mute">Caso sin mascota registrada</span>
                  )}
                </li>
              ))}
            </ul>
            {truncated && (
              <p className="border-t border-ln-op-line px-4 py-3 text-[12px] text-ln-op-mute">
                Mostrando los primeros {items.length} resultados. Usá los filtros para acotar la
                búsqueda.
              </p>
            )}
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
