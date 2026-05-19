import { and, desc, eq, gte, inArray } from "drizzle-orm";
import Link from "next/link";

import {
  APPROVAL_REQUEST_TYPES,
  type ApprovalRequest,
  type ApprovalRequestType,
  auditLog,
  db,
  profiles,
} from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

const ACTION_LABELS: Record<string, string> = {
  request_viewed: "Vio una solicitud",
  evidence_viewed: "Vio evidencia",
  request_approved: "Aprobó una solicitud",
  request_rejected: "Rechazó una solicitud",
  pii_queried: "Buscó por PII",
  admin_seeded: "Admin inicializado",
};

// Human-readable labels per approval type (Spanish, Rioplatense).
const TYPE_LABELS: Record<ApprovalRequestType, string> = {
  role_upgrade_vet: "Matrículas veterinarias",
  organization_verification: "Verificación de organizaciones",
  service_dog_credential_verification: "Credenciales de perro de asistencia (RUPGA)",
};

export default async function GobiernoDashboardPage() {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const pending = await fetchVisiblePendingRequests(profile, jurisdictions);

  // Resolve applicant display names for the per-type preview cards (one
  // batched query matching the pattern in cola/page.tsx).
  const applicantIds = Array.from(new Set(pending.map((r) => r.applicantUserId)));
  const resolvedNames = new Map<string, string>();
  if (applicantIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, applicantIds));
    for (const r of rows) resolvedNames.set(r.id, r.displayName);
  }

  // Decisions visible to this authority in the last 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDecisions = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      performedAt: auditLog.performedAt,
      approvalRequestId: auditLog.approvalRequestId,
      payload: auditLog.payload,
    })
    .from(auditLog)
    .where(and(eq(auditLog.actorUserId, user.id), gte(auditLog.performedAt, sevenDaysAgo)))
    .orderBy(desc(auditLog.performedAt))
    .limit(10);

  const scopeLabel =
    profile.role === "admin"
      ? "universal"
      : jurisdictions.length === 0
        ? "sin localidades asignadas"
        : jurisdictions.map((j) => `${j.locality}, ${j.province}`).join(" · ");

  // Group pending items by type for the per-type grid.
  const pendingByType = new Map<ApprovalRequestType, ApprovalRequest[]>();
  for (const type of APPROVAL_REQUEST_TYPES) pendingByType.set(type, []);
  for (const req of pending) {
    pendingByType.get(req.type)?.push(req);
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Panel de gobierno
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Aprobá y rechazá solicitudes de verificación. Tu scope:{" "}
            <span className="font-mono text-xs">{scopeLabel}</span>.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card
            label="Solicitudes pendientes"
            value={String(pending.length)}
            cta={pending.length > 0 ? { href: "/gob/cola", label: "Ir a la cola" } : null}
          />
          <Card label="Decisiones (últimos 7 días)" value={String(recentDecisions.length)} />
          <Card
            label="Mi rol"
            value={profile.role}
            sublabel={
              profile.role === "admin"
                ? "Acceso universal"
                : `${jurisdictions.length} localidad${jurisdictions.length === 1 ? "" : "es"}`
            }
          />
        </section>

        {/* Regional surfaces — Fase 11 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            label="Vigilancia"
            value="Señales de zoonosis"
            sublabel="Outbreak signals filtrados a tu cobertura"
            cta={{ href: "/gob/vigilancia", label: "Ver vigilancia" }}
          />
          <Card
            label="Pérdidas"
            value="Mascotas perdidas"
            sublabel="Pets en status='lost' en tu cobertura"
            cta={{ href: "/gob/perdidas", label: "Ver pérdidas" }}
          />
        </section>

        {/* Per-type breakdown grid */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Solicitudes por tipo
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {APPROVAL_REQUEST_TYPES.map((type) => {
              const items = pendingByType.get(type) ?? [];
              return (
                <TypeCard
                  key={type}
                  type={type}
                  label={TYPE_LABELS[type]}
                  items={items}
                  namesById={resolvedNames}
                />
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Actividad reciente
          </h2>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              No tenés acciones registradas en los últimos 7 días.
            </p>
          ) : (
            <ul className="space-y-1">
              {recentDecisions.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-900 dark:text-neutral-50">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                  </div>
                  <time className="text-xs text-neutral-500 dark:text-neutral-500 tabular-nums whitespace-nowrap">
                    {new Date(entry.performedAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// Single per-type card: shows pending count, up to 3 preview items, and a
// "Ver todos" link that pre-filters the cola page.
function TypeCard({
  type,
  label,
  items,
  namesById,
}: {
  type: ApprovalRequestType;
  label: string;
  items: ApprovalRequest[];
  namesById: Map<string, string>;
}) {
  const isEmpty = items.length === 0;
  const preview = items.slice(0, 3);

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 flex flex-col ${
        isEmpty
          ? "border-neutral-100 dark:border-neutral-800/50 bg-neutral-50 dark:bg-neutral-900/30"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      {/* Header */}
      <div className="space-y-1">
        <p
          className={`text-xs uppercase tracking-wider ${
            isEmpty
              ? "text-neutral-400 dark:text-neutral-600"
              : "text-neutral-500 dark:text-neutral-500"
          }`}
        >
          {label}
        </p>
        <p
          className={`text-2xl font-semibold ${
            isEmpty
              ? "text-neutral-300 dark:text-neutral-700"
              : "text-neutral-900 dark:text-neutral-50"
          }`}
        >
          {items.length}
        </p>
      </div>

      {/* Preview items or empty state */}
      {isEmpty ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-600 flex-1">
          Sin solicitudes pendientes
        </p>
      ) : (
        <ul className="space-y-1 flex-1">
          {preview.map((req) => (
            <li key={req.id}>
              <Link
                href={`/gob/cola/${req.publicToken}`}
                className="block rounded px-2 py-1.5 -mx-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 group"
              >
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-900 dark:group-hover:text-neutral-50">
                  {namesById.get(req.applicantUserId) ?? "Usuario"}
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-500 truncate">
                  {req.jurisdictionLocality}, {req.jurisdictionProvince} ·{" "}
                  {new Date(req.createdAt).toLocaleDateString("es-AR")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Footer link */}
      {!isEmpty && (
        <Link
          href={`/gob/cola?type=${type}`}
          className="text-xs text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          Ver todos ({items.length}) →
        </Link>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  sublabel,
  cta,
}: {
  label: string;
  value: string;
  sublabel?: string;
  cta?: { href: string; label: string } | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </p>
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      {sublabel && <p className="text-xs text-neutral-500 dark:text-neutral-500">{sublabel}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="inline-block text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
