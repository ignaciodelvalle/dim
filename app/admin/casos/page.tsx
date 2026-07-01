// Admin-scope case index - universal view across all jurisdictions.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { OpButton } from "@/components/ui/dashboard";
import { OpSelect } from "@/components/ui/dashboard/OpField";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForAdmin } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { newerHref, olderHref } from "@/lib/keyset-pagination";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { CASE_KINDS, type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const ADMIN_CASOS_PAGE_LIMIT = 500;

// Status options for the filter form.
// "all" is a UI sentinel that maps to statusFilter=null (no SQL filter).
// "open" is the default when no explicit status param is present.
const STATUS_OPTIONS = [
  { value: "open", label: "Abiertos" },
  { value: "all", label: "Todos los estados" },
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
  // WS-PERF P2: default to "open" when no explicit status param is present so
  // the triager's first paint is the actionable open-case view (fast + relevant)
  // rather than a 500-row full scan across all statuses. An explicit status=
  // (including the "all" sentinel value) overrides the default.
  const rawStatus = sp.status;
  const statusFilter: "open" | "closed" | null =
    rawStatus === "open" || rawStatus === "closed"
      ? rawStatus
      : rawStatus === "all"
        ? null
        : "open"; // default: show open cases
  const kindFilter =
    sp.kind && CASE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;
  const provinceFilter = sp.province?.trim() || null;

  // Whether the user explicitly changed from the default (open, no kind, no province).
  // Used to show/hide the "Limpiar filtros" link — the default open view is not
  // considered an active filter.
  const statusExplicitlyOverridden = rawStatus === "closed" || rawStatus === "all";
  const hasFilters = statusExplicitlyOverridden || kindFilter !== null || provinceFilter !== null;

  const filterParams: Record<string, string | undefined> = {
    // Carry status in pagination links only when it differs from the default (open).
    // For status=all (null filter), use the "all" sentinel so the paginator
    // preserves the user's explicit choice.
    ...(statusExplicitlyOverridden
      ? { status: rawStatus === "all" ? "all" : (statusFilter ?? undefined) }
      : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(provinceFilter ? { province: provinceFilter } : {}),
  };

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
          Expedientes abiertos en el sistema. Vista universal admin.{" "}
          {!statusExplicitlyOverridden && (
            <a
              href="/admin/casos?status=all"
              className="underline underline-offset-2 hover:text-ln-op-ink"
            >
              Ver todos
            </a>
          )}
        </p>
      </header>

      {/* Filter form */}
      <form action="/admin/casos" method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="casos-status" className="block text-xs font-medium text-ln-op-ink-2">
            Estado
          </label>
          <OpSelect
            id="casos-status"
            name="status"
            defaultValue={rawStatus === "all" ? "all" : (statusFilter ?? "open")}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </OpSelect>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="casos-kind" className="block text-xs font-medium text-ln-op-ink-2">
            Tipo
          </label>
          <OpSelect id="casos-kind" name="kind" defaultValue={kindFilter ?? ""}>
            <option value="">Todos los tipos</option>
            {CASE_KINDS.map((k) => (
              <option key={k} value={k}>
                {caseKindLabel(k)}
              </option>
            ))}
          </OpSelect>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="casos-province" className="block text-xs font-medium text-ln-op-ink-2">
            Provincia
          </label>
          <OpSelect id="casos-province" name="province" defaultValue={provinceFilter ?? ""}>
            <option value="">Todas las provincias</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.name}>
                {p.name}
              </option>
            ))}
          </OpSelect>
        </div>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>
        {hasFilters && (
          <a href="/admin/casos" className="text-sm text-ln-op-mute underline underline-offset-4">
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
              className="flex min-h-[44px] flex-col gap-2 rounded-[6px] border border-ln-op-line bg-ln-op-card p-3 md:min-h-0 md:flex-row md:items-center md:justify-between md:py-2"
            >
              <div className="flex flex-col gap-1">
                <CaseBadge
                  publicCode={c.publicCode}
                  caseKind={c.caseKind}
                  status={c.status}
                  size="sm"
                />
                <span className="text-sm text-ln-op-mute">
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
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
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
