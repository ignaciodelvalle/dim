import { db, welfareReports } from "@/db";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

// Status badge color mapping — neutral by default; green for closed; muted for invalid/duplicate.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-gob-success/10  text-gob-success ";
    case "invalid":
    case "duplicate":
      return "bg-gob-surface-alt  text-gob-text-muted ";
    case "in_progress":
      return "bg-gob-info/10  text-gob-azul-link ";
    case "triaged":
      return "bg-gob-warning/10  text-gob-warning-text ";
    default:
      // open
      return "bg-gob-surface-alt  text-gob-text-gray ";
  }
}

export default async function MisDenunciasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gob-text-gray ">Necesitás iniciar sesión para ver tus denuncias.</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  const reports = await db
    .select()
    .from(welfareReports)
    .where(and(eq(welfareReports.reporterUserId, user.id)))
    .orderBy(desc(welfareReports.createdAt))
    .limit(50);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <Link
            href="/mis-mascotas"
            className="text-sm text-gob-text-muted  hover:text-gob-text  transition-colors"
          >
            ← Mis mascotas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">Mis denuncias</h1>
          <p className="text-sm text-gob-text-gray ">
            {reports.length === 0
              ? "Sin denuncias enviadas."
              : `${reports.length} denuncia${reports.length === 1 ? "" : "s"} enviada${reports.length === 1 ? "" : "s"}.`}
          </p>
        </header>

        {reports.length === 0 ? (
          <div className="border border-dashed border-gob-border-strong  rounded-xl p-10 text-center space-y-3">
            <p className="text-gob-text-gray ">Aún no enviaste denuncias.</p>
            <Link
              href="/denuncias/nueva"
              className="inline-block px-5 py-2.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
            >
              Enviar una
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/denuncias/${report.id}`}
                  className="block border border-gob-border  rounded-xl p-4 space-y-2 hover:bg-gob-surface-alt  transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-gob-text ">
                      {welfareReportKindLabel(report.kind)}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(report.status)}`}
                      >
                        {welfareReportStatusLabel(report.status)}
                      </span>
                      <span className="text-gob-text-muted  text-sm">›</span>
                    </div>
                  </div>

                  <p className="text-xs text-gob-text-muted ">
                    {welfareReportSeverityLabel(report.severity)}
                  </p>

                  <p className="text-xs font-mono tracking-wide text-gob-text-muted ">
                    Código {report.referenceCode}
                  </p>

                  <p className="text-sm text-gob-text-gray  line-clamp-3">
                    {report.description.length > 200
                      ? `${report.description.slice(0, 200)}…`
                      : report.description}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gob-text-muted ">
                    <span>{formatDateTime(report.createdAt)}</span>
                    {(report.jurisdictionProvince || report.jurisdictionLocality) && (
                      <span>
                        {[report.jurisdictionLocality, report.jurisdictionProvince]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
