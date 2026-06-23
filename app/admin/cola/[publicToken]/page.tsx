import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { logRequestViewedForAuthority } from "@/app/actions/admin-decisions";
import { OpCard, OpCardBody, OpCardHead, OpCodeBadge } from "@/components/ui/dashboard";
import { approvalRequests, db, organizations, petServiceDog, pets, profiles } from "@/db";
import { buildPayloadRows } from "@/lib/approval-payload-view";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { ReviewActions } from "./ReviewActions";

const TYPE_LABELS: Record<string, string> = {
  role_upgrade_vet: "Matrícula veterinaria",
  organization_verification: "Verificación de organización",
  service_dog_credential_verification: "Credencial perro de asistencia (RUPGA)",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

export default async function AdminReviewRequestPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireAdminOrRedirect();

  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.publicToken, publicToken))
    .limit(1);
  if (!request) notFound();

  // Audit log: record the page view.
  await logRequestViewedForAuthority(user.id, publicToken);

  const [applicant] = await db
    .select({ id: profiles.id, displayName: profiles.displayName, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, request.applicantUserId))
    .limit(1);

  // Pull the service-dog row when this is a credential verification request.
  // The applicant has already filled out training center / RUPGA number /
  // categoria - render those inline so the reviewer doesn't have to bounce.
  let serviceDogContext: {
    pet: { name: string; species: string; publicToken: string };
    serviceDog: typeof petServiceDog.$inferSelect;
  } | null = null;
  if (request.type === "service_dog_credential_verification") {
    const payload = (request.payload ?? {}) as { pet_id?: string };
    if (payload.pet_id) {
      const [row] = await db
        .select({
          pet: pets,
          sd: petServiceDog,
        })
        .from(pets)
        .innerJoin(petServiceDog, eq(petServiceDog.petId, pets.id))
        .where(eq(pets.id, payload.pet_id))
        .limit(1);
      if (row) {
        serviceDogContext = {
          pet: {
            name: row.pet.name,
            species: row.pet.species,
            publicToken: row.pet.publicToken,
          },
          serviceDog: row.sd,
        };
      }
    }
  }

  let targetOrg: { displayName: string; legalName: string; orgType: string } | null = null;
  if (request.targetOrganizationId) {
    const [org] = await db
      .select({
        displayName: organizations.displayName,
        legalName: organizations.legalName,
        orgType: organizations.orgType,
      })
      .from(organizations)
      .where(eq(organizations.id, request.targetOrganizationId))
      .limit(1);
    targetOrg = org ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/cola"
          className="text-[12px] text-ln-op-mute underline underline-offset-4 hover:text-ln-op-ink"
        >
          {"←"} Volver a la cola
        </Link>
      </div>

      <header className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ln-op-mute">
          {STATUS_LABELS[request.status] ?? request.status}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          {TYPE_LABELS[request.type] ?? request.type}
        </h1>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ln-op-mute">
          <OpCodeBadge tone="neutral">{request.publicToken}</OpCodeBadge>
          <span>{"·"}</span>
          <span>
            {request.jurisdictionLocality}, {request.jurisdictionProvince}
          </span>
          <span>{"·"}</span>
          <span>
            creada{" "}
            {new Date(request.createdAt).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </p>
      </header>

      <Section title="Aplicante">
        <p className="text-[13px] text-ln-op-ink">{applicant?.displayName ?? "Usuario"}</p>
        <p className="text-[12px] text-ln-op-mute">Rol actual: {applicant?.role ?? "owner"}</p>
      </Section>

      {targetOrg && (
        <Section title="Organizacion a verificar">
          <p className="text-[13px] text-ln-op-ink">{targetOrg.displayName}</p>
          <p className="text-[12px] text-ln-op-mute">
            {targetOrg.legalName} {"·"} {targetOrg.orgType}
          </p>
        </Section>
      )}

      {serviceDogContext && (
        <Section title="Credencial de perro de asistencia">
          <div className="space-y-2 text-[13px]">
            <p>
              <span className="text-ln-op-mute">Mascota:</span>{" "}
              <strong>{serviceDogContext.pet.name}</strong>{" "}
              <span className="font-ln-mono text-[11px] text-ln-op-mute">
                ({serviceDogContext.pet.publicToken})
              </span>
            </p>
            <p>
              <span className="text-ln-op-mute">Tipo de servicio:</span>{" "}
              {serviceDogContext.serviceDog.serviceType}
              {serviceDogContext.serviceDog.serviceType === "otro" && (
                <span className="text-ln-op-warn">
                  {" "}
                  - categoria "otro" no habilita banner publico
                </span>
              )}
            </p>
            <p>
              <span className="text-ln-op-mute">Centro de entrenamiento:</span>{" "}
              {serviceDogContext.serviceDog.trainingCenter}
            </p>
            {serviceDogContext.serviceDog.rupgaCredential && (
              <p>
                <span className="text-ln-op-mute">N&#xBA; RUPGA:</span>{" "}
                <span className="font-ln-mono text-[11px]">
                  {serviceDogContext.serviceDog.rupgaCredential}
                </span>
              </p>
            )}
            {serviceDogContext.serviceDog.credentialExpiryDate && (
              <p>
                <span className="text-ln-op-mute">Vencimiento credencial:</span>{" "}
                {new Date(serviceDogContext.serviceDog.credentialExpiryDate).toLocaleDateString(
                  "es-AR",
                )}
              </p>
            )}
            {serviceDogContext.serviceDog.notes && (
              <p className="text-[12px] text-ln-op-mute">{serviceDogContext.serviceDog.notes}</p>
            )}
            <p className="mt-2 border-t border-ln-op-line pt-2 text-[11px] text-ln-op-mute">
              Verificar contra RUPGA (ANDIS, Res. 2588/2022). Centros validos: miembros IGDF o ADI.
              El aplicante debe tener CUD vigente - verificable fuera de MiMAR.
            </p>
          </div>
        </Section>
      )}

      <PayloadSection type={request.type} payload={request.payload} />

      {request.status === "pending" ? (
        <Section title="Decidir">
          <ReviewActions publicToken={request.publicToken} />
        </Section>
      ) : (
        <Section title="Decisión">
          <p className="text-[13px] text-ln-op-ink">
            {STATUS_LABELS[request.status]}
            {request.decidedAt &&
              ` el ${new Date(request.decidedAt).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}`}
          </p>
          {request.decisionNotes && (
            <p className="mt-1 text-[12px] text-ln-op-mute">Notas: {request.decisionNotes}</p>
          )}
        </Section>
      )}
    </div>
  );
}

function PayloadSection({ type, payload }: { type: string; payload: unknown }) {
  const rows = buildPayloadRows(type, payload);
  return (
    <Section title="Datos de la solicitud">
      {rows.length === 0 ? (
        <p className="text-[12px] text-ln-op-mute">Sin datos estructurados.</p>
      ) : (
        <dl className="space-y-2 text-[13px]">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-wrap gap-x-3">
              <dt className="text-ln-op-mute">{row.label}:</dt>
              <dd className="font-medium text-ln-op-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <OpCard>
      <OpCardHead title={title} />
      <OpCardBody>{children}</OpCardBody>
    </OpCard>
  );
}
