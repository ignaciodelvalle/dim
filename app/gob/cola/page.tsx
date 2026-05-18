import { inArray } from "drizzle-orm";
import Link from "next/link";

import {
  APPROVAL_REQUEST_TYPES,
  type ApprovalRequestType,
  db,
  profiles,
} from "@/db";
import { fetchVisiblePendingRequests } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

const TYPE_LABELS: Record<ApprovalRequestType, string> = {
  role_upgrade_vet: "Matrículas veterinarias",
  organization_verification: "Verificación de organizaciones",
};

// Validate a raw searchParam value against the known enum.
function parseTypeParam(raw: string | undefined): ApprovalRequestType | null {
  if (!raw) return null;
  return (APPROVAL_REQUEST_TYPES as readonly string[]).includes(raw)
    ? (raw as ApprovalRequestType)
    : null;
}

export default async function ColaPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const { type: rawType } = await searchParams;
  const activeType = parseTypeParam(rawType);

  const all = await fetchVisiblePendingRequests(profile, jurisdictions);

  // Apply type filter when a valid ?type= is present.
  const pending = activeType ? all.filter((r) => r.type === activeType) : all;

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

  const pageTitle = activeType
    ? `Cola — ${TYPE_LABELS[activeType]}`
    : "Cola de solicitudes";

  const subtitle = pending.length === 0
    ? "No hay solicitudes pendientes en tu scope."
    : `${pending.length} solicitud${pending.length === 1 ? "" : "es"} pendiente${pending.length === 1 ? "" : "s"}.`;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          {/* Back link when viewing a filtered subset */}
          {activeType && (
            <Link
              href="/gob/cola"
              className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 underline underline-offset-4"
            >
              ← Ver todas las solicitudes
            </Link>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {pageTitle}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        </header>

        {pending.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            Cuando lleguen nuevas solicitudes vas a verlas acá.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((req) => (
              <li
                key={req.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
              >
                <Link
                  href={`/gob/cola/${req.publicToken}`}
                  className="flex items-start justify-between gap-3 group"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {TYPE_LABELS[req.type] ?? req.type}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      {namesById.get(req.applicantUserId) ?? "Usuario"} · {req.jurisdictionLocality}
                      , {req.jurisdictionProvince}
                    </p>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
                      {req.publicToken} · {new Date(req.createdAt).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <span
                    className="text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300"
                    aria-hidden
                  >
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
