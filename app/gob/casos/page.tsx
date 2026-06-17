// Govt-scope case index. Lists every case whose jurisdiction matches
// the govt's active assignments (province + locality). Admins see the
// same view but redirected via /admin/casos.

import Link from "next/link";
import { redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listCasesForGovt } from "@/lib/case-queries";
import { formatDate } from "@/lib/format";
import { newerHref, olderHref } from "@/lib/keyset-pagination";

const GOVT_CASOS_PAGE_LIMIT = 300;

export default async function GovtCasosPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role === "admin") redirect("/admin/casos");

  const { cursor: rawCursor } = await searchParams;

  // Fetch limit+1 to detect hasMore.
  const rawItems = await listCasesForGovt(session.jurisdictions, {
    limit: GOVT_CASOS_PAGE_LIMIT + 1,
    cursor: rawCursor,
  });
  const hasMore = rawItems.length > GOVT_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, GOVT_CASOS_PAGE_LIMIT) : rawItems;

  const lastItem = items.at(-1);
  const olderLink =
    hasMore && lastItem
      ? olderHref("/gob/casos", {}, { ts: lastItem.openedAt, id: lastItem.id })
      : null;
  const newerLink = rawCursor ? newerHref("/gob/casos", {}) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Casos regulatorios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">Expedientes en tu jurisdicción asignada.</p>
      </header>

      {session.jurisdictions.length === 0 ? (
        <LnEmptyState
          icon="usuarios"
          title="No tenés jurisdicciones asignadas todavía."
          description="Pedile a un administrador que te asigne una jurisdicción."
        />
      ) : items.length === 0 ? (
        <LnEmptyState icon="solicitud" title="Sin casos en tu jurisdicción por ahora." />
      ) : (
        <OpCard>
          <OpCardHead title={`${items.length} caso${items.length === 1 ? "" : "s"}`} />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 odd:bg-ln-op-stripe md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <CaseBadge
                      publicCode={c.publicCode}
                      caseKind={c.caseKind}
                      status={c.status}
                      size="sm"
                    />
                    <span className="text-[12px] text-ln-op-mute">
                      {c.jurisdictionLocality}, {c.jurisdictionProvince} · Abierto el{" "}
                      {formatDate(c.openedAt)}
                      {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                    </span>
                  </div>
                  {c.primaryPetPublicToken && c.primaryPetName ? (
                    <Link
                      href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                      className="inline-flex items-center rounded-full bg-ln-op-stripe border border-ln-op-line px-3 py-1.5 text-[13px] text-ln-op-ink transition hover:bg-ln-op-line no-underline"
                    >
                      🐾 {c.primaryPetName}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-ln-op-mute">Caso sin mascota registrada</span>
                  )}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
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
    </main>
  );
}
