import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { logRequestViewedForAuthority } from "@/app/actions/admin-decisions";
import { approvalRequests, db, organizations, profiles } from "@/db";
import { canDecideRequest } from "@/lib/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

import { ReviewActions } from "./ReviewActions";

const TYPE_LABELS: Record<string, string> = {
  role_upgrade_vet: "Matrícula veterinaria",
  role_upgrade_govt: "Rol govt",
  role_upgrade_admin: "Rol admin",
  organization_verification: "Verificación de organización",
  govt_assignment_grant: "Nueva localidad para govt",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

export default async function ReviewRequestPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.publicToken, publicToken))
    .limit(1);
  if (!request) notFound();

  // Authoritative scope check (mirrors the queue filter). Out-of-scope
  // requests 404 — no info leakage about their existence.
  if (!canDecideRequest(profile, request, jurisdictions)) notFound();

  // Audit log: record the page view. Fires per render (acceptable noise
  // for an admin tool; spec §7.4 says auto-log on detail open).
  await logRequestViewedForAuthority(user.id, publicToken);

  const [applicant] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, request.applicantUserId))
    .limit(1);

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
            href="/gob/cola"
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
