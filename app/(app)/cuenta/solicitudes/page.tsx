import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { approvalRequests, db } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { WithdrawButton } from "./WithdrawButton";

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
  pending: "bg-gob-warning/10  text-gob-warning-text  border-gob-warning ",
  approved: "bg-gob-success/10  text-gob-success  border-gob-success ",
  rejected: "bg-gob-danger/10  text-gob-danger  border-gob-danger ",
  withdrawn: "bg-gob-surface-alt  text-gob-text-muted  border-gob-border ",
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
    <div className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
              Mis solicitudes
            </h1>
            <span className="text-sm font-medium text-gob-text-muted ">
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
          <div className="rounded-lg border border-gob-border  p-8 text-center">
            <p className="text-sm text-gob-text-gray ">No mandaste solicitudes todavía.</p>
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
          <p className="text-sm text-gob-text-muted ">No hay solicitudes con ese filtro.</p>
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
                <li key={req.id} className="rounded-lg border border-gob-border  p-4 space-y-3">
                  {/* Top row — type badge + status badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gob-surface-alt  text-gob-text-gray  border-gob-border ">
                      {REQUEST_TYPE_LABELS[req.type] ?? req.type}
                    </span>
                    <StatusBadge status={statusVariant} />
                  </div>

                  {/* Dates */}
                  <div className="text-xs text-gob-text-muted  space-y-0.5">
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
                    <div className="rounded-md bg-gob-danger/10  border border-gob-danger  px-3 py-2">
                      <p className="text-xs text-gob-danger ">
                        <span className="font-medium">Motivo:</span> {req.decisionNotes}
                      </p>
                    </div>
                  )}

                  {/* Withdraw button — only for pending requests */}
                  {req.status === "pending" && <WithdrawButton requestId={req.id} />}
                </li>
              );
            })}
          </ul>
        )}

        {/* Back link */}
        <div className="pt-2">
          <Link
            href="/cuenta"
            className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text mb-4"
          >
            ← Volver a mi cuenta
          </Link>
        </div>
      </div>
    </div>
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
          ? "bg-gob-primary  text-white  border-transparent"
          : "bg-white  text-gob-text-gray  border-gob-border  hover:border-gob-border-strong "
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

