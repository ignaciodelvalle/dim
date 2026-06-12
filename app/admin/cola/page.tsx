import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { BulkApprovalQueueList } from "@/components/BulkApprovalQueueList";
import {
  APPROVAL_REQUEST_TYPES,
  type ApprovalRequestType,
  approvalRequests,
  db,
  profiles,
} from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

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
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAdminOrRedirect();

  const { type: rawType } = await searchParams;
  const activeType = parseTypeParam(rawType);

  // Admin sees ALL pending requests - no jurisdiction filter.
  // Type filter is pushed into SQL (not JS) so the result set is not silently
  // capped at an intermediate LIMIT before filtering (P1-10).
  const typeClause = activeType ? eq(approvalRequests.type, activeType) : undefined;
  const pending = await db
    .select()
    .from(approvalRequests)
    .where(
      typeClause
        ? and(eq(approvalRequests.status, "pending"), typeClause)
        : eq(approvalRequests.status, "pending"),
    )
    .orderBy(desc(approvalRequests.createdAt));

  const applicantIds = Array.from(new Set(pending.map((r) => r.applicantUserId)));
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
    pending.length === 0
      ? "No hay solicitudes pendientes."
      : `${pending.length} solicitud${pending.length === 1 ? "" : "es"} pendiente${pending.length === 1 ? "" : "s"}.`;

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
        items={pending.map((req) => ({
          publicToken: req.publicToken,
          typeLabel: TYPE_LABELS[req.type] ?? req.type,
          applicantName: namesById.get(req.applicantUserId) ?? "Usuario",
          jurisdiction: `${req.jurisdictionLocality}, ${req.jurisdictionProvince}`,
          createdAt: new Date(req.createdAt).toLocaleDateString("es-AR"),
        }))}
      />
    </div>
  );
}
