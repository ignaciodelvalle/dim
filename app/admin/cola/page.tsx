import { desc, eq, inArray } from "drizzle-orm";
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
  role_upgrade_vet: "Matrículas veterinarias",
  organization_verification: "Verificación de organizaciones",
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

  // Admin sees ALL pending requests — no jurisdiction filter.
  const all = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.status, "pending"))
    .orderBy(desc(approvalRequests.createdAt));

  const pending = activeType ? all.filter((r) => r.type === activeType) : all;

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
      ? "No hay solicitudes pendientes."
      : `${pending.length} solicitud${pending.length === 1 ? "" : "es"} pendiente${pending.length === 1 ? "" : "s"}.`;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          {activeType && (
            <Link
              href="/admin/cola"
              className="inline-flex items-center gap-1 text-xs text-gob-text-muted  hover:text-gob-text  underline underline-offset-4"
            >
              ← Ver todas las solicitudes
            </Link>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">{pageTitle}</h1>
          <p className="text-sm text-gob-text-gray ">{subtitle}</p>
          <p className="text-xs text-gob-text-muted ">
            Vista universal — todas las jurisdicciones.
          </p>
        </header>

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
    </main>
  );
}
