// Tu rol en MiMAR — Libreta Nacional redesign.
// Data fetching, VetUpgradeForm, OrgCreateForm all unchanged.

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
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
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Tu rol en MiMAR
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Ampliá tus permisos registrando tu matrícula profesional o creando una organización.
        </p>
      </div>

      {/* DNI prereq banner */}
      {!profile?.dniVerified && (
        <div className="mb-[24px]">
          <LnCallout tone="warn" title="Te falta verificar tu DNI">
            Necesitás verificar tu identidad antes de enviar cualquier solicitud de rol.{" "}
            <a
              href="/cuenta/verificar-dni?next=/cuenta/upgrade"
              className="text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              Verificar ahora →
            </a>
          </LnCallout>
        </div>
      )}

      <div className="flex flex-col gap-[20px]">
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
                <p className="mb-[16px] text-[13px] text-[var(--color-ln-ink-2)]">
                  Registrá tu matrícula para que la autoridad de tu localidad la verifique. Una vez
                  aprobada, tu rol pasa a veterinario.
                </p>

                {latestVetRequest?.status === "pending" ? (
                  <div className="rounded-[4px] border border-[#f0dcb4] bg-[#fdf2e0] px-[12px] py-[10px] text-[13px] text-[var(--color-ln-warn)]">
                    Solicitud enviada — pendiente de revisión.
                    {profile?.matriculaNumber && (
                      <>
                        {" "}
                        Tu matrícula: <strong>{profile.matriculaNumber}</strong>
                      </>
                    )}
                  </div>
                ) : latestVetRequest?.status === "rejected" ? (
                  <>
                    <div className="mb-[16px] rounded-[4px] border border-[#f1c6bf] bg-[#fbe9e6] px-[12px] py-[10px]">
                      <p className="text-[13px] font-semibold text-[var(--color-ln-err)]">
                        Tu última solicitud fue rechazada.
                      </p>
                      {latestVetRequest.decisionNotes && (
                        <p className="mt-[2px] text-[12px] text-[var(--color-ln-err)]">
                          Motivo: {latestVetRequest.decisionNotes}
                        </p>
                      )}
                      <p className="mt-[2px] text-[12px] text-[var(--color-ln-err)]">
                        Corregí los datos y volvé a enviar.
                      </p>
                    </div>
                    <VetUpgradeForm />
                  </>
                ) : (
                  <VetUpgradeForm />
                )}
              </>
            )}
          </LnCardBody>
        </LnCard>

        {/* Card B — Crear Organización */}
        <LnCard>
          <LnCardHead title="Crear Organización" />
          <LnCardBody>
            <p className="mb-[16px] text-[13px] text-[var(--color-ln-ink-2)]">
              Refugios, clínicas y redes de rescate pueden crear su panel organizacional en MiMAR.
            </p>

            {adminMembership ? (
              <Link
                href={`/org/${adminMembership.organization.publicToken}`}
                className="flex items-center justify-between rounded-[4px] border border-[var(--color-ln-line)] px-[14px] py-[12px] no-underline hover:bg-[var(--color-ln-stripe)] transition-colors"
              >
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-ln-ink)]">
                    Ya administrás una organización
                  </p>
                  <p className="mt-[1px] text-[12px] text-[var(--color-ln-mute)]">
                    {adminMembership.organization.displayName}
                  </p>
                </div>
                <span aria-hidden="true" className="text-[16px] text-[var(--color-ln-mute)]">
                  ›
                </span>
              </Link>
            ) : (
              <OrgCreateForm />
            )}
          </LnCardBody>
        </LnCard>
      </div>
    </div>
  );
}
