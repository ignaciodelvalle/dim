// Org inbox of welfare denuncias emitted by members of this org.
// Read-only summary — case lifecycle lives in /casos/[publicCode].

import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

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

const SEVERITY_TONES: Record<string, string> = {
  critical: "text-gob-danger ",
  high: "text-gob-warning-text ",
  medium: "text-gob-warning-text ",
  low: "text-gob-text-gray ",
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
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-10 space-y-6">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-gob-text-muted hover:text-gob-text "
          >
            ← Volver al panel
          </Link>
          <h1 className="text-2xl font-semibold text-gob-text ">
            Denuncias de maltrato — solo para roles institucionales
          </h1>
          <p className="rounded-lg border border-gob-warning bg-gob-warning/10 p-4 text-sm text-gob-warning-text ">
            Tu rol actual dentro de la organización (<strong>{membership?.role ?? "—"}</strong>) no
            habilita ver el registro de denuncias de la organización.
          </p>
        </div>
      </main>
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}`}
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver al panel
        </Link>

        <header className="flex items-baseline justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
              Investigaciones de maltrato
            </h1>
            <p className="text-sm text-gob-text-gray ">
              Reportes emitidos por miembros de {organization.displayName}.
            </p>
          </div>
          <Link
            href={`/org/${orgToken}/maltrato/nuevo`}
            className="inline-flex items-center rounded-md bg-gob-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-gob-danger"
          >
            + Nueva denuncia
          </Link>
        </header>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gob-border-strong  p-8 text-center text-sm text-gob-text-muted">
            Tu organización todavía no emitió denuncias profesionales.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.reportId} className="rounded-lg border border-gob-border  p-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gob-text ">
                      {welfareReportKindLabel(r.kind)}{" "}
                      <span className={`text-xs ${SEVERITY_TONES[r.severity] ?? ""}`}>
                        · {welfareReportSeverityLabel(r.severity)}
                      </span>
                    </p>
                    <p className="text-xs text-gob-text-muted ">
                      {welfareReportSubjectKindLabel(r.subjectKind)}
                      {r.petName ? ` · 🐾 ${r.petName}` : ""}
                      {!r.petName && r.subjectDescription
                        ? ` · ${r.subjectDescription.slice(0, 60)}`
                        : ""}
                    </p>
                    <p className="text-[10px] font-mono text-gob-text-muted ">
                      {r.referenceCode} · creada el {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-gob-surface-alt text-gob-text-gray  ">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                {r.casePublicCode && (
                  <Link
                    href={`/casos/${r.casePublicCode}`}
                    className="inline-block text-xs underline text-gob-text-gray  hover:text-gob-text"
                  >
                    Ver caso →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
