import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { withdrawApprovalRequestAction } from "@/app/actions/approval-requests";
import { approvalRequests, db } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

const REQUEST_TYPE_LABELS: Record<string, string> = {
  role_upgrade_vet: "Upgrade a veterinario/a",
  role_upgrade_govt: "Upgrade a gobierno",
  role_upgrade_admin: "Upgrade a administrador/a",
  organization_verification: "Verificación de organización",
  govt_assignment_grant: "Asignación de localidad",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

type StatusVariant = "pending" | "approved" | "rejected" | "withdrawn";

const STATUS_CLASSES: Record<StatusVariant, string> = {
  pending:
    "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  approved:
    "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  rejected:
    "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  withdrawn:
    "bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { filter } = await searchParams;

  const allRequests = await db
    .select({
      id: approvalRequests.id,
      type: approvalRequests.type,
      status: approvalRequests.status,
      createdAt: approvalRequests.createdAt,
      decidedAt: approvalRequests.decidedAt,
      decisionNotes: approvalRequests.decisionNotes,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.applicantUserId, user.id))
    .orderBy(desc(approvalRequests.createdAt));

  // Filter pills
  const activeFilter = filter ?? "all";
  const filtered = allRequests.filter((r) => {
    if (activeFilter === "all") return true;
    return r.status === activeFilter;
  });

  const totalCount = allRequests.length;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Mis solicitudes
            </h1>
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-500">
              {totalCount === 0
                ? "ninguna"
                : totalCount === 1
                  ? "1 solicitud"
                  : `${totalCount} solicitudes`}
            </span>
          </div>
        </header>

        {/* Empty state — no requests at all */}
        {totalCount === 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No mandaste solicitudes todavía.
            </p>
          </div>
        )}

        {/* Filter pills */}
        {totalCount > 0 && (
          <fieldset className="flex flex-wrap gap-2 border-0 p-0 m-0">
            <legend className="sr-only">Filtrar solicitudes</legend>
            <FilterPill href="/cuenta/solicitudes" label="Todas" active={activeFilter === "all"} />
            <FilterPill
              href="/cuenta/solicitudes?filter=pending"
              label="Pendientes"
              active={activeFilter === "pending"}
            />
            <FilterPill
              href="/cuenta/solicitudes?filter=approved"
              label="Aprobadas"
              active={activeFilter === "approved"}
            />
            <FilterPill
              href="/cuenta/solicitudes?filter=rejected"
              label="Rechazadas"
              active={activeFilter === "rejected"}
            />
          </fieldset>
        )}

        {/* Requests list */}
        {totalCount > 0 && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            No hay solicitudes con ese filtro.
          </p>
        )}

        {filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((req) => {
              const statusVariant = (
                ["pending", "approved", "rejected", "withdrawn"].includes(req.status)
                  ? req.status
                  : "pending"
              ) as StatusVariant;

              return (
                <li
                  key={req.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3"
                >
                  {/* Top row — type badge + status badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700">
                      {REQUEST_TYPE_LABELS[req.type] ?? req.type}
                    </span>
                    <StatusBadge status={statusVariant} />
                  </div>

                  {/* Dates */}
                  <div className="text-xs text-neutral-500 dark:text-neutral-500 space-y-0.5">
                    <p>
                      Enviada el{" "}
                      {req.createdAt.toLocaleDateString("es-AR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    {req.decidedAt && (
                      <p>
                        Decidida el{" "}
                        {req.decidedAt.toLocaleDateString("es-AR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>

                  {/* Rejection reason */}
                  {req.status === "rejected" && req.decisionNotes && (
                    <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2">
                      <p className="text-xs text-red-700 dark:text-red-400">
                        <span className="font-medium">Motivo:</span> {req.decisionNotes}
                      </p>
                    </div>
                  )}

                  {/* Withdraw button — only for pending requests */}
                  {req.status === "pending" && <WithdrawForm requestId={req.id} />}
                </li>
              );
            })}
          </ul>
        )}

        {/* Back link */}
        <div className="pt-2">
          <Link
            href="/cuenta"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← Volver a mi cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: StatusVariant }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-transparent"
          : "bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

function WithdrawForm({ requestId }: { requestId: string }) {
  async function handleWithdraw() {
    "use server";
    await withdrawApprovalRequestAction(requestId);
  }

  return (
    <form action={handleWithdraw}>
      <button
        type="submit"
        className="inline-flex items-center px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        Retirar solicitud
      </button>
    </form>
  );
}
