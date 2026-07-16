import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { BulkApprovalQueueList } from "@/components/BulkApprovalQueueList";
import {
  APPROVAL_REQUEST_TYPES,
  type ApprovalRequestType,
  approvalRequests,
  db,
  profiles,
} from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/infra/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { portalBase } from "@/lib/ui/portal-base";

const TYPE_LABELS: Record<ApprovalRequestType, string> = {
  role_upgrade_vet: "Matrículas veterinarias",
  organization_verification: "Verificación de organizaciones",
  service_dog_credential_verification: "Credenciales de perro de asistencia (RUPGA)",
};

// Validate a raw searchParam value against the known enum.
function parseTypeParam(raw: string | undefined): ApprovalRequestType | null {
  if (!raw) return null;
  return (APPROVAL_REQUEST_TYPES as readonly string[]).includes(raw)
    ? (raw as ApprovalRequestType)
    : null;
}

const COLA_PAGE_LIMIT = 200;

export default async function ColaPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cursor?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

  const { type: rawType, cursor: rawCursor } = await searchParams;
  const activeType = parseTypeParam(rawType);

  // Fetch limit+1 to detect hasMore for keyset pagination (PERF-5).
  const rawPending = await fetchVisiblePendingRequests(
    profile,
    jurisdictions,
    activeType ?? undefined,
    { limit: COLA_PAGE_LIMIT + 1, cursor: rawCursor },
  );

  const hasMore = rawPending.length > COLA_PAGE_LIMIT;
  const pending = hasMore ? rawPending.slice(0, COLA_PAGE_LIMIT) : rawPending;

  // Resolve applicant display names in one batched query so the list
  // renders human-readable instead of UUIDs.
  const applicantIds = Array.from(new Set(pending.map((r) => r.applicantUserId)));
  const namesById = new Map<string, string>();
  if (applicantIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, applicantIds));
    for (const r of rows) namesById.set(r.id, r.displayName);
  }

  const pageTitle = activeType ? `Cola — ${TYPE_LABELS[activeType]}` : "Cola de solicitudes";

  const subtitle =
    pending.length === 0
      ? "No hay solicitudes pendientes en tu scope."
      : `${pending.length}${hasMore ? "+" : ""} solicitud${pending.length === 1 ? "" : "es"} pendiente${pending.length === 1 ? "" : "s"}.`;

  // Pagination links — filter params exclude cursor so changing a filter resets to page 1.
  const filterParams: Record<string, string | undefined> = activeType ? { type: activeType } : {};
  const lastReq = pending.at(-1);
  const olderLink =
    hasMore && lastReq
      ? olderHref(`${base}/cola`, filterParams, { ts: lastReq.createdAt, id: lastReq.id })
      : null;
  const newerLink = rawCursor ? newerHref(`${base}/cola`, filterParams) : null;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-[var(--text-title)] font-semibold tracking-tight text-ln-op-ink">
            {pageTitle}
          </h1>
          <p className="text-[13px] text-ln-op-mute">{subtitle}</p>
        </header>

        {/* Type filter chips — links drop ?cursor so filters reset to page 1 */}
        <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          <Link
            href={`${base}/cola`}
            className={[
              "inline-flex items-center rounded-full border px-3.5 py-1 text-sm font-medium no-underline transition-colors",
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
              href={`${base}/cola?type=${t}`}
              className={[
                "inline-flex items-center rounded-full border px-3.5 py-1 text-sm font-medium no-underline transition-colors",
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
          detailUrlPrefix={`${base}/cola`}
          items={pending.map((req) => ({
            publicToken: req.publicToken,
            type: req.type,
            typeLabel: TYPE_LABELS[req.type] ?? req.type,
            applicantName: namesById.get(req.applicantUserId) ?? "Usuario",
            jurisdiction: `${req.jurisdictionLocality}, ${req.jurisdictionProvince}`,
            createdAt: new Date(req.createdAt).toLocaleDateString("es-AR"),
          }))}
        />

        {/* Pagination footer */}
        {(newerLink || olderLink) && (
          <nav
            aria-label="Paginación de cola"
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
    </main>
  );
}
