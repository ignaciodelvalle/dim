import { db, welfareReports } from "@/db";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/lib/welfare";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

// Status badge color mapping — neutral by default; green for closed; muted for invalid/duplicate.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
    case "invalid":
    case "duplicate":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400";
    case "in_progress":
      return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
    case "triaged":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";
    default:
      // open
      return "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300";
  }
}

export default async function MisDenunciasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-neutral-700 dark:text-neutral-300">
            Necesitás iniciar sesión para ver tus denuncias.
          </p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <Link
            href="/mis-mascotas"
            className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← Mis mascotas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Mis denuncias
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {reports.length === 0
              ? "Sin denuncias enviadas."
              : `${reports.length} denuncia${reports.length === 1 ? "" : "s"} enviada${reports.length === 1 ? "" : "s"}.`}
          </p>
        </header>

        {reports.length === 0 ? (
          <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-10 text-center space-y-3">
            <p className="text-neutral-700 dark:text-neutral-300">Aún no enviaste denuncias.</p>
            <Link
              href="/denuncias/nueva"
              className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Enviar una
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => (
              <li
                key={report.id}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">
                    {welfareReportKindLabel(report.kind)}
                  </p>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(report.status)}`}
                  >
                    {welfareReportStatusLabel(report.status)}
                  </span>
                </div>

                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {welfareReportSeverityLabel(report.severity)}
                </p>

                <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-3">
                  {report.description.length > 200
                    ? `${report.description.slice(0, 200)}…`
                    : report.description}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-500">
                  <span>{formatDateTime(report.createdAt)}</span>
                  {(report.jurisdictionProvince || report.jurisdictionLocality) && (
                    <span>
                      {[report.jurisdictionLocality, report.jurisdictionProvince]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
