// Admin-scope case index - universal view across all jurisdictions.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForAdmin } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { newerHref, olderHref } from "@/lib/keyset-pagination";

const ADMIN_CASOS_PAGE_LIMIT = 500;

export default async function AdminCasosPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role !== "admin") redirect("/gob/casos");

  const { cursor: rawCursor } = await searchParams;

  // Fetch limit+1 to detect hasMore.
  const rawItems = await listCasesForAdmin({
    limit: ADMIN_CASOS_PAGE_LIMIT + 1,
    cursor: rawCursor,
  });
  const hasMore = rawItems.length > ADMIN_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, ADMIN_CASOS_PAGE_LIMIT) : rawItems;

  const lastItem = items.at(-1);
  const olderLink =
    hasMore && lastItem
      ? olderHref("/admin/casos", {}, { ts: lastItem.openedAt, id: lastItem.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/casos", {}) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Expedientes registrados en el sistema. Vista universal admin.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Sin casos registrados todavía.
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
