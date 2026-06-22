// Admin-scope case index - universal view across all jurisdictions.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { PROVINCES } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForAdmin } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { newerHref, olderHref } from "@/lib/keyset-pagination";
import { CASE_KINDS, type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const ADMIN_CASOS_PAGE_LIMIT = 500;

// Status options for the filter form.
const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
] as const;

export default async function AdminCasosPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    kind?: string;
    province?: string;
  }>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role !== "admin") redirect("/gob/casos");

  const sp = await searchParams;
  const { cursor: rawCursor } = sp;

  // Parse filters from searchParams — push them all into SQL, not JS.
  const statusFilter = sp.status === "open" || sp.status === "closed" ? sp.status : null;
  const kindFilter =
    sp.kind && CASE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;
  const provinceFilter = sp.province?.trim() || null;

  const filterParams: Record<string, string | undefined> = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(provinceFilter ? { province: provinceFilter } : {}),
  };
  const hasFilters = statusFilter !== null || kindFilter !== null || provinceFilter !== null;

  // Fetch limit+1 to detect hasMore.
  const rawItems = await listCasesForAdmin({
    limit: ADMIN_CASOS_PAGE_LIMIT + 1,
    cursor: rawCursor,
    filters: {
      status: statusFilter,
      kind: kindFilter,
      province: provinceFilter,
    },
  });
  const hasMore = rawItems.length > ADMIN_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, ADMIN_CASOS_PAGE_LIMIT) : rawItems;

  const lastItem = items.at(-1);
  const olderLink =
    hasMore && lastItem
      ? olderHref("/admin/casos", filterParams, { ts: lastItem.openedAt, id: lastItem.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/casos", filterParams) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Expedientes registrados en el sistema. Vista universal admin.
        </p>
      </header>

      {/* Filter form */}
      <form action="/admin/casos" method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="casos-status" className="text-[11px] font-medium text-ln-op-mute">
            Estado
          </label>
          <select
            id="casos-status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="casos-kind" className="text-[11px] font-medium text-ln-op-mute">
            Tipo
          </label>
          <select
            id="casos-kind"
            name="kind"
            defaultValue={kindFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todos los tipos</option>
            {CASE_KINDS.map((k) => (
              <option key={k} value={k}>
                {caseKindLabel(k)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="casos-province" className="text-[11px] font-medium text-ln-op-mute">
            Provincia
          </label>
          <select
            id="casos-province"
            name="province"
            defaultValue={provinceFilter ?? ""}
            className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todas las provincias</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>
        {hasFilters && (
          <a
            href="/admin/casos"
            className="text-[12px] text-ln-op-mute underline underline-offset-4"
          >
            Limpiar filtros
          </a>
        )}
      </form>

      {items.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Sin casos registrados para los filtros aplicados.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <CaseBadge
                  publicCode={c.publicCode}
                  caseKind={c.caseKind}
                  status={c.status}
                  size="sm"
                />
                <span className="text-[12px] text-ln-op-mute">
                  {c.jurisdictionLocality && c.jurisdictionProvince
                    ? `${c.jurisdictionLocality}, ${c.jurisdictionProvince} · `
                    : ""}
                  Abierto el {formatDate(c.openedAt)}
                  {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                </span>
              </div>
              {c.primaryPetPublicToken && c.primaryPetName ? (
                <Link
                  href={`/p/${c.primaryPetPublicToken}`}
                  className="inline-flex items-center rounded-full bg-ln-op-stripe px-3 py-1.5 text-[13px] text-ln-op-ink-2 no-underline transition-colors hover:bg-ln-op-line"
                >
                  &#128062; {c.primaryPetName}
                </Link>
              ) : (
                <span className="text-[13px] text-ln-op-mute">Caso sin mascota registrada</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de casos"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-[12px] font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-[12px] font-medium text-ln-op-azul no-underline hover:underline"
              >
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
