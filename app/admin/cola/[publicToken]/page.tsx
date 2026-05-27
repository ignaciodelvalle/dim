import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { logRequestViewedForAuthority } from "@/app/actions/admin-decisions";
import { approvalRequests, db, organizations, petServiceDog, pets, profiles } from "@/db";
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
  // categoría — render those inline so the reviewer doesn't have to bounce.
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
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            href="/admin/cola"
            className="text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
          >
            ← Volver a la cola
          </Link>
        </div>

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">
            {STATUS_LABELS[request.status] ?? request.status}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            {TYPE_LABELS[request.type] ?? request.type}
          </h1>
          <p className="text-xs text-gob-text-muted">
            <span className="font-mono">{request.publicToken}</span> ·{" "}
            {request.jurisdictionLocality}, {request.jurisdictionProvince} · creada{" "}
            {new Date(request.createdAt).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </header>

        <Section title="Aplicante">
          <p className="text-sm text-gob-text">{applicant?.displayName ?? "Usuario"}</p>
          <p className="text-xs text-gob-text-muted">Rol actual: {applicant?.role ?? "owner"}</p>
        </Section>

        {targetOrg && (
          <Section title="Organización a verificar">
            <p className="text-sm text-gob-text">{targetOrg.displayName}</p>
            <p className="text-xs text-gob-text-muted">
              {targetOrg.legalName} · {targetOrg.orgType}
            </p>
          </Section>
        )}

        {serviceDogContext && (
          <Section title="Credencial de perro de asistencia">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-neutral-500">Mascota:</span>{" "}
                <strong>{serviceDogContext.pet.name}</strong>{" "}
                <span className="text-neutral-500 font-mono text-xs">
                  ({serviceDogContext.pet.publicToken})
                </span>
              </p>
              <p>
                <span className="text-neutral-500">Tipo de servicio:</span>{" "}
                {serviceDogContext.serviceDog.serviceType}
                {serviceDogContext.serviceDog.serviceType === "otro" && (
                  <span className="text-gob-warning-text">
                    {" "}
                    — categoría "otro" no habilita banner público
                  </span>
                )}
              </p>
              <p>
                <span className="text-neutral-500">Centro de entrenamiento:</span>{" "}
                {serviceDogContext.serviceDog.trainingCenter}
              </p>
              {serviceDogContext.serviceDog.rupgaCredential && (
                <p>
                  <span className="text-neutral-500">Nº RUPGA:</span>{" "}
                  <span className="font-mono text-xs">
                    {serviceDogContext.serviceDog.rupgaCredential}
                  </span>
                </p>
              )}
              {serviceDogContext.serviceDog.credentialExpiryDate && (
                <p>
                  <span className="text-neutral-500">Vencimiento credencial:</span>{" "}
                  {new Date(serviceDogContext.serviceDog.credentialExpiryDate).toLocaleDateString(
                    "es-AR",
                  )}
                </p>
              )}
              {serviceDogContext.serviceDog.notes && (
                <p className="text-xs text-gob-text-gray">{serviceDogContext.serviceDog.notes}</p>
              )}
              <p className="text-xs text-gob-text-muted mt-2 pt-2 border-t border-gob-border">
                Verificar contra RUPGA (ANDIS, Res. 2588/2022). Centros válidos: miembros IGDF o
                ADI. El aplicante debe tener CUD vigente — verificable fuera de MiMAR.
              </p>
            </div>
          </Section>
        )}

        <Section title="Payload">
          <pre className="text-[11px] leading-relaxed rounded-md bg-gob-surface-alt p-3 overflow-x-auto text-gob-text-gray">
            {JSON.stringify(request.payload, null, 2)}
          </pre>
        </Section>

        {request.status === "pending" ? (
          <Section title="Decidir">
            <ReviewActions publicToken={request.publicToken} />
          </Section>
        ) : (
          <Section title="Decisión">
            <p className="text-sm text-gob-text">
              {STATUS_LABELS[request.status]}
              {request.decidedAt &&
                ` el ${new Date(request.decidedAt).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`}
            </p>
            {request.decisionNotes && (
              <p className="text-xs text-gob-text-gray mt-1">Notas: {request.decisionNotes}</p>
            )}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">{title}</h2>
      <div className="rounded-lg border border-gob-border p-4 space-y-1">{children}</div>
    </section>
  );
}
