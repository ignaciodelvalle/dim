import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { approvalRequests, db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getActiveMemberships } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { OrgCreateForm } from "./OrgCreateForm";
import { VetUpgradeForm } from "./VetUpgradeForm";

export default async function UpgradePage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const memberships = await getActiveMemberships(user.id);
  const adminMembership = memberships.find((m) => m.membership.role === "admin");

  // Latest vet-upgrade request to drive the card state. Pending → show
  // "enviada"; rejected → surface the decision_notes and let the user
  // re-submit; otherwise show the form (no request yet).
  const [latestVetRequest] = await db
    .select({
      status: approvalRequests.status,
      decisionNotes: approvalRequests.decisionNotes,
      decidedAt: approvalRequests.decidedAt,
      jurisdictionProvince: approvalRequests.jurisdictionProvince,
      jurisdictionLocality: approvalRequests.jurisdictionLocality,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.applicantUserId, user.id),
        eq(approvalRequests.type, "role_upgrade_vet"),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);

  return (
    <div className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Tu rol en MiMAR</h1>
          <p className="text-sm text-gob-text-gray ">
            Ampliá tus permisos registrando tu matrícula profesional o creando una organización.
          </p>
        </header>

        {/* Soft prereq banner: shown when DNI is not yet verified */}
        {!profile?.dniVerified && (
          <div className="rounded-lg border border-gob-warning bg-gob-warning/10   px-4 py-3 flex items-start gap-3">
            <span className="text-gob-warning-text  text-sm mt-0.5" aria-hidden>
              ⚠
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gob-warning-text ">
                Te falta verificar tu DNI
              </p>
              <p className="text-xs text-gob-warning-text ">
                Necesitás verificar tu identidad antes de enviar cualquier solicitud de rol.{" "}
                <a
                  href="/cuenta/verificar-dni?next=/cuenta/upgrade"
                  className="underline underline-offset-2 hover:text-gob-warning-text "
                >
                  Verificar ahora →
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Card A — Profesional veterinario */}
        {profile?.role === "vet" ? (
          <section className="rounded-lg border border-gob-border  p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gob-text ">Profesional veterinario</h2>
            <p className="text-sm text-gob-text-gray ">Ya sos veterinario verificado en MiMAR.</p>
          </section>
        ) : (
          <section className="rounded-lg border border-gob-border  p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gob-text ">Profesional veterinario</h2>
              <p className="text-sm text-gob-text-gray ">
                Registrá tu matrícula para que la autoridad de tu localidad la verifique. Una vez
                aprobada, tu rol pasa a veterinario.
              </p>
            </div>

            {latestVetRequest?.status === "pending" ? (
              <p className="text-sm rounded border border-gob-warning bg-gob-warning/10 px-3 py-2 text-gob-warning-text   ">
                Solicitud enviada — pendiente de revisión.
                {profile?.matriculaNumber && (
                  <>
                    {" "}
                    Tu matrícula: <strong>{profile.matriculaNumber}</strong>
                  </>
                )}
              </p>
            ) : latestVetRequest?.status === "rejected" ? (
              <>
                <div className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger    space-y-1">
                  <p>
                    <strong>Tu última solicitud fue rechazada.</strong>
                  </p>
                  {latestVetRequest.decisionNotes && (
                    <p className="text-xs">Motivo: {latestVetRequest.decisionNotes}</p>
                  )}
                  <p className="text-xs">Corregí los datos y volvé a enviar.</p>
                </div>
                <VetUpgradeForm />
              </>
            ) : (
              <VetUpgradeForm />
            )}
          </section>
        )}

        {/* Card B — Crear Organización */}
        <section className="rounded-lg border border-gob-border  p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gob-text ">Crear Organización</h2>
            <p className="text-sm text-gob-text-gray ">
              Refugios, clínicas y redes de rescate pueden crear su panel organizacional en MiMAR.
            </p>
          </div>

          {adminMembership ? (
            <Link
              href={`/org/${adminMembership.organization.publicToken}`}
              className="flex items-center justify-between rounded border border-gob-border  p-4 hover:bg-gob-surface-alt  transition"
            >
              <div>
                <p className="text-sm font-semibold text-gob-text ">
                  Ya administrás una organización
                </p>
                <p className="text-xs text-gob-text-gray  mt-0.5">
                  {adminMembership.organization.displayName}
                </p>
              </div>
              <span className="text-gob-text-muted " aria-hidden>
                →
              </span>
            </Link>
          ) : (
            <OrgCreateForm />
          )}
        </section>

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
