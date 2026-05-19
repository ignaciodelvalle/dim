import Link from "next/link";

import { db, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { welfareReportKindLabel, welfareReportSeverityLabel } from "@/lib/welfare";
import { type FlagReason, reasonLabel } from "@/lib/welfare-moderation";
import { and, desc, isNotNull, isNull } from "drizzle-orm";

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-red-700 dark:text-red-300",
  high: "text-orange-700 dark:text-orange-300",
  medium: "text-amber-700 dark:text-amber-300",
  low: "text-neutral-600 dark:text-neutral-400",
};

export default async function ModeracionListPage() {
  await requireAdminOrRedirect();

  // Flagged AND unresolved — that's the moderator's queue. Resolved rows
  // either disappear from here (passed to triage) or live in the regular
  // welfare history as status='invalid' (confirmed spam).
  const rows = await db
    .select()
    .from(welfareReports)
    .where(and(isNotNull(welfareReports.flaggedAt), isNull(welfareReports.moderationResolvedAt)))
    .orderBy(desc(welfareReports.flaggedAt))
    .limit(500);

  return (
    <main className="px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
            Moderación de denuncias
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Denuncias anónimas que las heurísticas marcaron para revisión antes de entrar a la cola
            de triage. Solo admin las ve. Resolvé pasándolas a triage normal o cerrándolas como
            spam.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">
            No hay denuncias pendientes de moderación.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const reasons = (r.flagReasons as string[]) ?? [];
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20"
                >
                  <Link
                    href={`/admin/moderacion/${r.id}`}
                    className="block px-4 py-3 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {welfareReportKindLabel(r.kind)}{" "}
                          <span className={`text-xs ${SEVERITY_TONE[r.severity] ?? ""}`}>
                            · {welfareReportSeverityLabel(r.severity)}
                          </span>
                        </p>
                        <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
                          {reasons.map((reason) => (
                            <li key={reason}>• {reasonLabel(reason as FlagReason)}</li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
                          {r.referenceCode} ·{" "}
                          {r.flaggedAt &&
                            new Date(r.flaggedAt).toLocaleString("es-AR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
