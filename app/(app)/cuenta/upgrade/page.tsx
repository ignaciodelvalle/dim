// Tu rol en MiMAR — Libreta Nacional redesign.

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { approvalRequests, db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { getActiveMemberships } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { OrgCreateForm } from "./OrgCreateForm";
import { VetUpgradeForm } from "./VetUpgradeForm";

export default async function UpgradePage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      role: profiles.role,
      dniVerified: profiles.dniVerified,
      matriculaNumber: profiles.matriculaNumber,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const memberships = await getActiveMemberships(user.id);
  const adminMembership = memberships.find((m) => m.membership.role === "admin");

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
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-7">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Tu rol en MiMAR
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Ampliá tus permisos registrando tu matrícula profesional o creando una organización.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Card A — Profesional veterinario */}
        <LnCard>
          <LnCardHead title="Profesional veterinario" />
          <LnCardBody>
            {profile?.role === "vet" ? (
              <p className="text-[13px] text-[var(--color-ln-mute)]">
                Ya sos veterinario/a verificado/a en MiMAR.
              </p>
            ) : (
              <>
                <p className="mb-4 text-[13px] text-[var(--color-ln-ink-2)]">
                  Registrá tu matrícula para que la autoridad de tu localidad la verifique. Una vez
                  aprobada, tu rol pasa a veterinario.
                </p>

                {latestVetRequest?.status === "pending" ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-3 py-2.5 text-[13px] text-[var(--color-ln-warn)]">
                    Solicitud enviada — pendiente de revisión.
                    {profile?.matriculaNumber && (
                      <>
                        {" "}
                        Tu matrícula: <strong>{profile.matriculaNumber}</strong>
                      </>
                    )}
                  </div>
                ) : latestVetRequest?.status === "approved" ? (
                  // Approved but profile.role not yet "vet" — role update may be in-flight
                  // (e.g. session cache stale). Show a success state instead of the blank form.
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-3 py-2.5">
                    <p className="text-[13px] font-semibold text-[var(--color-ln-ok)]">
                      ¡Solicitud aprobada!
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--color-ln-ok)]">
                      Tu matrícula fue verificada. Tu cuenta va a reflejar el rol veterinario en tu
                      próxima sesión.{" "}
                      <a href="/cuenta" className="underline hover:no-underline">
                        Volver a mi cuenta →
                      </a>
                    </p>
                  </div>
                ) : latestVetRequest?.status === "rejected" ? (
                  <>
                    <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] px-3 py-2.5">
                      <p className="text-[13px] font-semibold text-[var(--color-ln-err)]">
                        Tu última solicitud fue rechazada.
                      </p>
                      {latestVetRequest.decisionNotes && (
                        <p className="mt-0.5 text-sm text-[var(--color-ln-err)]">
                          Motivo: {latestVetRequest.decisionNotes}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-[var(--color-ln-err)]">
                        Corregí los datos y volvé a enviar.
                      </p>
                    </div>
                    <VetUpgradeForm dniVerified={profile?.dniVerified ?? false} />
                  </>
                ) : (
                  <VetUpgradeForm dniVerified={profile?.dniVerified ?? false} />
                )}
              </>
            )}
          </LnCardBody>
        </LnCard>

        {/* Card B — Crear Organización */}
        <LnCard>
          <LnCardHead title="Crear Organización" />
          <LnCardBody>
            <p className="mb-4 text-[13px] text-[var(--color-ln-ink-2)]">
              Refugios, clínicas y redes de rescate pueden crear su panel organizacional en MiMAR.
            </p>

            {adminMembership ? (
              <Link
                href={`/org/${adminMembership.organization.publicToken}`}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] px-3.5 py-3 no-underline hover:bg-[var(--color-ln-stripe)] transition-colors"
              >
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-ln-ink)]">
                    Ya administrás una organización
                  </p>
                  <p className="mt-[1px] text-sm text-[var(--color-ln-mute)]">
                    {adminMembership.organization.displayName}
                  </p>
                </div>
                <span aria-hidden="true" className="text-base text-[var(--color-ln-mute)]">
                  ›
                </span>
              </Link>
            ) : (
              <OrgCreateForm dniVerified={profile?.dniVerified ?? false} />
            )}
          </LnCardBody>
        </LnCard>
      </div>
    </div>
  );
}
