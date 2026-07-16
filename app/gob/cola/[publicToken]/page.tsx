import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpCard, OpCardBody, OpCodeBadge, OpPill } from "@/components/ui/dashboard";
import { approvalRequests, db, organizations, profiles } from "@/db";
import { summarizeApprovalPayload } from "@/lib/infra/approval-payload-summary";
import { canDecideRequest } from "@/lib/infra/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { portalBase } from "@/lib/ui/portal-base";
import { logRequestViewedForAuthority } from "@/src/modules/organizations/application/admin-decisions/log-request-viewed";

import { ReviewActions } from "./ReviewActions";

const TYPE_LABELS: Record<string, string> = {
  role_upgrade_vet: "Matrícula veterinaria",
  role_upgrade_govt: "Rol de gobierno",
  role_upgrade_admin: "Rol de administrador",
  organization_verification: "Verificación de organización",
  govt_assignment_grant: "Nueva localidad para govt",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

const STATUS_PILL_TONE: Record<string, "open" | "ok" | "danger" | "neutral"> = {
  pending: "open",
  approved: "ok",
  rejected: "danger",
  withdrawn: "neutral",
};

// es-AR labels for the applicant's role and the target organization type.
// Mirrors the maps used on /gob/usuarios and /gob/organizaciones so the raw
// English enum values never reach the operator.
const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Gobierno",
  admin: "Administrador/a",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Otro",
};

export default async function ReviewRequestPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

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

  // Curated, allowlisted projection of the payload — NEVER the raw JSON. See
  // lib/infra/approval-payload-summary.ts (AGENTS.md: no raw payload dumps).
  const payloadRows = summarizeApprovalPayload(request.type, request.payload);

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
        {/* Back link */}
        <div>
          <Link
            href={`${base}/cola`}
            className="text-[13px] text-ln-op-mute hover:text-ln-op-ink underline underline-offset-4 no-underline"
          >
            ← Volver a la cola
          </Link>
        </div>

        {/* Page header */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <OpPill tone={STATUS_PILL_TONE[request.status] ?? "neutral"}>
              {STATUS_LABELS[request.status] ?? request.status}
            </OpPill>
          </div>
          <h1 className="text-[var(--text-title)] font-semibold tracking-tight text-ln-op-ink">
            {TYPE_LABELS[request.type] ?? request.type}
          </h1>
          <p className="text-sm text-ln-op-mute flex flex-wrap gap-x-2 gap-y-1 items-center">
            <OpCodeBadge tone="neutral">{request.publicToken}</OpCodeBadge>
            <span>·</span>
            <span>
              {request.jurisdictionLocality}, {request.jurisdictionProvince}
            </span>
            <span>·</span>
            <span>
              creada{" "}
              {new Date(request.createdAt).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </p>
        </header>

        {/* Applicant */}
        <Section title="Aplicante">
          <p className="text-[13px] text-ln-op-ink">{applicant?.displayName ?? "Usuario"}</p>
          <p className="text-sm text-ln-op-mute">
            Rol actual: {ROLE_LABELS[applicant?.role ?? "owner"] ?? applicant?.role ?? "Dueño/a"}
          </p>
        </Section>

        {/* Target org */}
        {targetOrg && (
          <Section title="Organización a verificar">
            <p className="text-[13px] text-ln-op-ink">{targetOrg.displayName}</p>
            <p className="text-sm text-ln-op-mute">
              {targetOrg.legalName} ·{" "}
              <OpCodeBadge tone="neutral">
                {ORG_TYPE_LABELS[targetOrg.orgType] ?? targetOrg.orgType}
              </OpCodeBadge>
            </p>
          </Section>
        )}

        {/* Detalle de la solicitud — curated fields only (no raw payload). */}
        <Section title="Detalle de la solicitud">
          {payloadRows.length === 0 ? (
            <p className="text-sm text-ln-op-mute">
              Esta solicitud no tiene datos estructurados adicionales.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {payloadRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-sm text-ln-op-mute">{row.label}</dt>
                  <dd className="text-[13px] text-ln-op-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        {/* Decision section */}
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
              <p className="text-sm text-ln-op-mute mt-1">Notas: {request.decisionNotes}</p>
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
      <h2 className="text-xs uppercase tracking-[0.18em] font-bold text-ln-op-mute">{title}</h2>
      <OpCard>
        <OpCardBody className="space-y-1">{children}</OpCardBody>
      </OpCard>
    </section>
  );
}
