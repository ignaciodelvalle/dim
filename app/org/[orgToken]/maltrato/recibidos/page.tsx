// Org inbox of welfare denuncias emitted by members of this org.
// Read-only summary — case lifecycle lives in /casos/[publicCode].

import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import {
  OpBreach,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCrumbs,
  OpPill,
} from "@/components/ui/dashboard";
import { cases, db, organizationMemberships, pets, welfareReports } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  triaged: "Triagueada",
  in_progress: "En seguimiento",
  closed: "Cerrada",
  duplicate: "Duplicada",
  invalid: "Inválida",
};

const STATUS_PILL_TONE: Record<string, "ok" | "open" | "danger" | "neutral" | "escalated"> = {
  open: "open",
  triaged: "escalated",
  in_progress: "escalated",
  closed: "neutral",
  duplicate: "neutral",
  invalid: "neutral",
};

const SEVERITY_PILL_TONE: Record<string, "danger" | "escalated" | "neutral"> = {
  critical: "danger",
  high: "escalated",
  medium: "escalated",
  low: "neutral",
};

// Welfare reports are sensitive — restrict the inbox to the same operative roles
// allowed to file one. Volunteer/foster members do NOT see the org's denuncia inbox.
const ALLOWED_ROLES = new Set(["admin", "coordinator", "member", "vet_individual"]);

export default async function OrgMaltratoRecibidosPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { user, organization } = await requireOrgAccessByToken(orgToken);

  const [membership] = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organization.id),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!membership || !ALLOWED_ROLES.has(membership.role)) {
    return (
      <div className="max-w-2xl space-y-6">
        <OpCrumbs
          items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Denuncias de maltrato" }]}
        />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Denuncias de maltrato — solo para roles institucionales
        </h1>
        <OpBreach
          title="Acceso restringido"
          detail={`Tu rol actual dentro de la organización (${membership?.role ?? "—"}) no habilita ver el registro de denuncias de la organización.`}
        />
      </div>
    );
  }

  const rows = await db
    .select({
      reportId: welfareReports.id,
      referenceCode: welfareReports.referenceCode,
      kind: welfareReports.kind,
      severity: welfareReports.severity,
      status: welfareReports.status,
      subjectKind: welfareReports.subjectKind,
      subjectDescription: welfareReports.subjectDescription,
      createdAt: welfareReports.createdAt,
      casePublicCode: cases.publicCode,
      petName: pets.name,
    })
    .from(welfareReports)
    .leftJoin(cases, eq(cases.id, welfareReports.caseId))
    .leftJoin(pets, eq(pets.id, welfareReports.subjectPetId))
    .where(eq(welfareReports.reporterOrganizationId, organization.id))
    .orderBy(desc(welfareReports.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <OpCrumbs
        items={[
          { label: "Panel", href: `/org/${orgToken}` },
          { label: "Investigaciones de maltrato" },
        ]}
      />

      <header className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Investigaciones de maltrato</h1>
          <p className="text-[13px] text-ln-op-mute">
            Reportes emitidos por miembros de {organization.displayName}.
          </p>
        </div>
        <Link
          href={`/org/${orgToken}/maltrato/nuevo`}
          className="inline-flex items-center rounded-[6px] bg-ln-op-danger px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity no-underline"
        >
          + Nueva denuncia
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-ln-op-line p-8 text-center text-[13px] text-ln-op-mute">
          Tu organización todavía no emitió denuncias profesionales.
        </p>
      ) : (
        <OpCard>
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {rows.map((r) => (
                <li key={r.reportId} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[13px] font-medium text-ln-op-ink">
                      {welfareReportKindLabel(r.kind)}{" "}
                      <OpPill
                        tone={
                          (SEVERITY_PILL_TONE[r.severity] ?? "neutral") as
                            | "danger"
                            | "escalated"
                            | "neutral"
                        }
                      >
                        {welfareReportSeverityLabel(r.severity)}
                      </OpPill>
                    </p>
                    <p className="text-[12px] text-ln-op-mute">
                      {welfareReportSubjectKindLabel(r.subjectKind)}
                      {r.petName ? ` · 🐾 ${r.petName}` : ""}
                      {!r.petName && r.subjectDescription
                        ? ` · ${r.subjectDescription.slice(0, 60)}`
                        : ""}
                    </p>
                    <p className="text-[12px] font-mono text-ln-op-mute">
                      {r.referenceCode} · creada el {formatDate(r.createdAt)}
                    </p>
                    {r.casePublicCode && (
                      <Link
                        href={`/casos/${r.casePublicCode}`}
                        className="inline-block text-[12px] text-ln-op-azul hover:underline no-underline"
                      >
                        Ver caso →
                      </Link>
                    )}
                  </div>
                  <OpPill tone={STATUS_PILL_TONE[r.status] ?? "neutral"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </OpPill>
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
