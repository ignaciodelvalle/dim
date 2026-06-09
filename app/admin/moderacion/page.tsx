import Link from "next/link";

import { OpCallout, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { type FlagReason, reasonLabel } from "@/lib/welfare-moderation";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc, isNotNull, isNull } from "drizzle-orm";

type SeverityTone = "danger" | "open" | "neutral";

const SEVERITY_PILL: Record<string, SeverityTone> = {
  critical: "danger",
  high: "open",
  medium: "open",
  low: "neutral",
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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {"Admin · Moderación"}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{"Moderación de denuncias"}</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Denuncias anónimas que las heurísticas marcaron para revisión antes de entrar a la cola de
          triage. Solo admin las ve. Resolvé pasándolas a triage normal o cerrándolas como spam.
        </p>
      </header>

      {rows.length === 0 ? (
        <OpCallout title="Cola vacía" body="No hay denuncias pendientes de moderación." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const reasons = (r.flagReasons as string[]) ?? [];
            const severityTone: SeverityTone = SEVERITY_PILL[r.severity] ?? "neutral";
            return (
              <li key={r.id}>
                <OpCard accent="warn">
                  <Link
                    href={`/admin/moderacion/${r.id}`}
                    className="block no-underline transition-colors hover:bg-ln-op-stripe"
                  >
                    <OpCardBody>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-semibold text-ln-op-ink">
                              {welfareReportKindLabel(r.kind)}
                            </p>
                            <OpPill tone={severityTone}>
                              {welfareReportSeverityLabel(r.severity)}
                            </OpPill>
                          </div>
                          <ul className="space-y-0.5">
                            {reasons.map((reason) => (
                              <li key={reason} className="text-[12px] text-ln-op-warn">
                                {"• "}
                                {reasonLabel(reason as FlagReason)}
                              </li>
                            ))}
                          </ul>
                          <p className="font-mono text-[10px] text-ln-op-faint">
                            {r.referenceCode}
                            {" · "}
                            {r.flaggedAt &&
                              new Date(r.flaggedAt).toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                          </p>
                        </div>
                        <span className="text-[12px] font-semibold text-ln-op-azul">{"->"}</span>
                      </div>
                    </OpCardBody>
                  </Link>
                </OpCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
