// Mis denuncias — Libreta Nacional redesign.
// Presentation only; data fetching unchanged.

import Link from "next/link";

import { LnButton } from "@/components/ui/Button";
import { LnCallout, LnSectionHead } from "@/components/ui/DocElements";
import { db, welfareReports } from "@/db";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc, eq } from "drizzle-orm";

// Status badge class mapping using LN tokens.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]";
    case "invalid":
    case "duplicate":
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]";
    case "in_progress":
      return "border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]";
    case "triaged":
      return "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]";
    default:
      // open
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)]";
  }
}

export default async function MisDenunciasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
        <LnCallout tone="warn" title="Necesitás iniciar sesión">
          <Link href="/login" className="text-[var(--color-ln-azul)] no-underline hover:underline">
            Iniciar sesión →
          </Link>
        </LnCallout>
      </div>
    );
  }

  const reports = await db
    .select()
    .from(welfareReports)
    .where(and(eq(welfareReports.reporterUserId, user.id)))
    .orderBy(desc(welfareReports.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-[28px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Mis denuncias
          </h1>
          <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
            {reports.length === 0
              ? "Sin denuncias enviadas."
              : `${reports.length} denuncia${reports.length === 1 ? "" : "s"} enviada${reports.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <Link href="/denuncias/nueva" className="flex-shrink-0 mt-[4px]">
          <LnButton variant="primary" size="sm">
            Nueva denuncia
          </LnButton>
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)] px-[24px] py-[40px] text-center">
          <p className="font-[var(--font-ln-serif)] text-[16px] text-[var(--color-ln-ink-2)]">
            Aún no enviaste denuncias.
          </p>
          <p className="mt-[6px] text-[13px] text-[var(--color-ln-mute)]">
            Podés reportar maltrato, abandono u otras situaciones de riesgo para animales.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/denuncias/${report.id}`}
              className="flex items-start justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[16px] py-[14px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-[var(--font-ln-serif)] text-[14px] font-semibold text-[var(--color-ln-ink)]">
                  {welfareReportKindLabel(report.kind)}
                </p>
                <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                  {welfareReportSeverityLabel(report.severity)}
                  {" · "}
                  {report.referenceCode}
                </p>
                <p className="mt-[4px] text-[12.5px] text-[var(--color-ln-ink-2)] line-clamp-2">
                  {report.description.length > 150
                    ? `${report.description.slice(0, 150)}…`
                    : report.description}
                </p>
                <p className="mt-[4px] font-[var(--font-ln-mono)] text-[10px] text-[var(--color-ln-mute)]">
                  {formatDateTime(report.createdAt)}
                  {(report.jurisdictionLocality || report.jurisdictionProvince) && (
                    <>
                      {" · "}
                      {[report.jurisdictionLocality, report.jurisdictionProvince]
                        .filter(Boolean)
                        .join(", ")}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-[8px]">
                <span
                  className={`inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] ${statusBadgeClass(report.status)}`}
                >
                  {welfareReportStatusLabel(report.status)}
                </span>
                <span aria-hidden="true" className="text-[16px] text-[var(--color-ln-mute)]">
                  ›
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
