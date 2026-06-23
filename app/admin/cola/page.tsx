import { inArray } from "drizzle-orm";
import Link from "next/link";

import { BulkApprovalQueueList } from "@/components/BulkApprovalQueueList";
import { APPROVAL_REQUEST_TYPES, type ApprovalRequestType, db, profiles } from "@/db";
import { fetchPendingApprovalsPage } from "@/lib/admin-approval-queue";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { newerHref, olderHref } from "@/lib/keyset-pagination";

const TYPE_LABELS: Record<ApprovalRequestType, string> = {
  role_upgrade_vet: "Matriculas veterinarias",
  organization_verification: "Verificacion de organizaciones",
  service_dog_credential_verification: "Credenciales de perro de asistencia (RUPGA)",
};

function parseTypeParam(raw: string | undefined): ApprovalRequestType | null {
  if (!raw) return null;
  return (APPROVAL_REQUEST_TYPES as readonly string[]).includes(raw)
    ? (raw as ApprovalRequestType)
    : null;
}

export default async function AdminColaPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cursor?: string }>;
}) {
  await requireAdminOrRedirect();

  const { type: rawType, cursor: rawCursor } = await searchParams;
  const activeType = parseTypeParam(rawType);

  // Admin sees ALL pending requests — no jurisdiction filter. Both the type
  // filter and the keyset cursor are pushed into SQL; the total is a separate
  // count(*) so the header stays accurate while the page stays bounded (C1).
  const { items, total, hasMore } = await fetchPendingApprovalsPage({
    type: activeType,
    cursor: rawCursor,
  });

  const applicantIds = Array.from(new Set(items.map((r) => r.applicantUserId)));
  const namesById = new Map<string, string>();
  if (applicantIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, applicantIds));
    for (const r of rows) namesById.set(r.id, r.displayName);
  }

  const pageTitle = activeType ? `Cola - ${TYPE_LABELS[activeType]}` : "Cola de solicitudes";
  const subtitle =
    total === 0
      ? "No hay solicitudes pendientes."
      : `${total} solicitud${total === 1 ? "" : "es"} pendiente${total === 1 ? "" : "s"}.`;

  // Pagination links — preserve the active type filter, reset cursor on page 1.
  const filterParams: Record<string, string | undefined> = activeType ? { type: activeType } : {};
  const lastRow = items.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/admin/cola", filterParams, { ts: lastRow.createdAt, id: lastRow.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/cola", filterParams) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{pageTitle}</h1>
        <p className="text-[13px] text-ln-op-ink-2">{subtitle}</p>
        <p className="text-[12px] text-ln-op-mute">Vista universal - todas las jurisdicciones.</p>
      </header>

      {/* Type filter chips — searchParam-driven, server component pattern */}
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        <Link
          href="/admin/cola"
          className={[
            "inline-flex items-center rounded-full border px-3.5 py-1 text-[12px] font-medium no-underline transition-colors",
            !activeType
              ? "border-ln-op-azul bg-ln-op-azul text-white"
              : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-ink-2",
          ].join(" ")}
        >
          Todas
        </Link>
        {(APPROVAL_REQUEST_TYPES as readonly ApprovalRequestType[]).map((t) => (
          <Link
            key={t}
            href={`/admin/cola?type=${t}`}
            className={[
              "inline-flex items-center rounded-full border px-3.5 py-1 text-[12px] font-medium no-underline transition-colors",
              activeType === t
                ? "border-ln-op-azul bg-ln-op-azul text-white"
                : "border-ln-op-line bg-ln-op-card text-ln-op-ink-2 hover:border-ln-op-ink-2",
            ].join(" ")}
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </nav>

      <BulkApprovalQueueList
        detailUrlPrefix="/admin/cola"
        items={items.map((req) => ({
          publicToken: req.publicToken,
          type: req.type,
          typeLabel: TYPE_LABELS[req.type] ?? req.type,
          applicantName: namesById.get(req.applicantUserId) ?? "Usuario",
          jurisdiction: `${req.jurisdictionLocality}, ${req.jurisdictionProvince}`,
          createdAt: new Date(req.createdAt).toLocaleDateString("es-AR"),
        }))}
      />

      {/* Pagination footer — keyset, preserves the type filter. */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de la cola"
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
                Ver más antiguas →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
