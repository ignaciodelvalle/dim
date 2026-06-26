import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { logRequestViewedForAuthority } from "@/app/actions/admin-decisions";
import { OpCard, OpCardBody, OpCodeBadge, OpPill } from "@/components/ui/dashboard";
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

const STATUS_PILL_TONE: Record<string, "open" | "ok" | "danger" | "neutral"> = {
  pending: "open",
  approved: "ok",
  rejected: "danger",
  withdrawn: "neutral",
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
        {/* Back link */}
        <div>
          <Link
            href="/gob/cola"
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
          <h1 className="text-[22px] font-semibold tracking-tight text-ln-op-ink">
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
          <p className="text-sm text-ln-op-mute">Rol actual: {applicant?.role ?? "owner"}</p>
        </Section>

        {/* Target org */}
        {targetOrg && (
          <Section title="Organización a verificar">
            <p className="text-[13px] text-ln-op-ink">{targetOrg.displayName}</p>
            <p className="text-sm text-ln-op-mute">
              {targetOrg.legalName} · <OpCodeBadge tone="neutral">{targetOrg.orgType}</OpCodeBadge>
            </p>
          </Section>
        )}

        {/* Payload */}
        <Section title="Payload">
          <pre className="text-[11px] leading-relaxed rounded-[6px] bg-ln-op-stripe border border-ln-op-line p-3 overflow-x-auto text-ln-op-ink-2 font-mono">
            {JSON.stringify(request.payload, null, 2)}
          </pre>
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
