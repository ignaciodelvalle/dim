import Link from "next/link";

import { db, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_STATUSES,
  type WelfareReportKind,
  type WelfareReportSeverity,
  type WelfareReportStatus,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/lib/welfare";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200",
  triaged: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200",
  in_progress: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200",
  closed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200",
  invalid: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
  duplicate: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-red-700 dark:text-red-300",
  high: "text-orange-700 dark:text-orange-300",
  medium: "text-amber-700 dark:text-amber-300",
  low: "text-neutral-600 dark:text-neutral-400",
};

function parseStatus(raw: string | undefined): WelfareReportStatus | null {
  if (!raw) return null;
  return (WELFARE_REPORT_STATUSES as readonly string[]).includes(raw)
    ? (raw as WelfareReportStatus)
    : null;
}
function parseKind(raw: string | undefined): WelfareReportKind | null {
  if (!raw) return null;
  return (WELFARE_REPORT_KINDS as readonly string[]).includes(raw)
    ? (raw as WelfareReportKind)
    : null;
}
function parseSeverity(raw: string | undefined): WelfareReportSeverity | null {
  if (!raw) return null;
  return (WELFARE_REPORT_SEVERITIES as readonly string[]).includes(raw)
    ? (raw as WelfareReportSeverity)
    : null;
}

export default async function GobMaltratoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; severity?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const filters = await searchParams;
  const activeStatus = parseStatus(filters.status);
  const activeKind = parseKind(filters.kind);
  const activeSeverity = parseSeverity(filters.severity);

  // No (province, locality) ANY shortcut in Drizzle for tuples, so we
  // filter client-side after the status pre-filter (default to "active"
  // means anything that's not terminal). Volume is bounded — admin sees
  // everything; govt sees only their scope.
  // Exclude rows that are flagged AND not yet resolved by a moderator —
  // those live in /admin/moderacion and shouldn't pollute the triage queue.
  // Resolved-flagged rows DO appear here (moderator already cleared them
  // and passed them down).
  const notUnderModeration = or(
    isNull(welfareReports.flaggedAt),
    isNotNull(welfareReports.moderationResolvedAt),
  );

  let rows = await db
    .select()
    .from(welfareReports)
    .where(
      activeStatus
        ? and(eq(welfareReports.status, activeStatus), notUnderModeration)
        : notUnderModeration,
    )
    .orderBy(desc(welfareReports.createdAt))
    .limit(500);

  if (profile.role === "govt") {
    rows = rows.filter((r) =>
      jurisdictions.some(
        (j) => j.province === r.jurisdictionProvince && j.locality === r.jurisdictionLocality,
      ),
    );
  }
  if (activeKind) rows = rows.filter((r) => r.kind === activeKind);
  if (activeSeverity) rows = rows.filter((r) => r.severity === activeSeverity);

  // Counts per status for the header. Computed off the scoped+filtered set
  // before the status filter was applied — that means the count chips
  // always show "how many are there at each step" within the user's
  // scope. We pull a separate query for that to avoid weird interplay.
  let countingRows = await db
    .select({ status: welfareReports.status })
    .from(welfareReports)
    .limit(2000);
  if (profile.role === "govt") {
    // Cannot pre-filter at SQL level (tuple match), so a second fetch
    // with province+locality columns is cheaper than re-loading the
    // full rows.
    countingRows = await db
      .select({
        status: welfareReports.status,
        province: welfareReports.jurisdictionProvince,
        locality: welfareReports.jurisdictionLocality,
      })
      .from(welfareReports)
      .limit(2000)
      .then((rs) =>
        rs
          .filter((r) =>
            jurisdictions.some((j) => j.province === r.province && j.locality === r.locality),
          )
          .map((r) => ({ status: r.status })),
      );
  }
  const statusCounts = new Map<string, number>();
  for (const r of countingRows) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
            Denuncias de maltrato
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cola de triage bajo Ley Nacional 14.346.{" "}
            {profile.role === "admin"
              ? "Vista universal — todas las jurisdicciones."
              : "Filtradas por tu jurisdicción."}
          </p>
        </header>

        <div className="flex flex-wrap gap-2 text-sm">
          <StatusChip
            label={`Todas (${countingRows.length})`}
            href="/gob/maltrato"
            active={!activeStatus}
          />
          {(WELFARE_REPORT_STATUSES as readonly WelfareReportStatus[]).map((s) => (
            <StatusChip
              key={s}
              label={`${welfareReportStatusLabel(s)} (${statusCounts.get(s) ?? 0})`}
              href={`/gob/maltrato?status=${s}`}
              active={activeStatus === s}
            />
          ))}
        </div>

        <form action="/gob/maltrato" method="GET" className="flex flex-wrap gap-3 items-end">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          <div>
            <label htmlFor="kind" className="block text-xs text-neutral-500 mb-1">
              Tipo
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue={activeKind ?? ""}
              className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            >
              <option value="">Todos</option>
              {WELFARE_REPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {welfareReportKindLabel(k)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="severity" className="block text-xs text-neutral-500 mb-1">
              Gravedad
            </label>
            <select
              id="severity"
              name="severity"
              defaultValue={activeSeverity ?? ""}
              className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            >
              <option value="">Todas</option>
              {WELFARE_REPORT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {welfareReportSeverityLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium"
          >
            Filtrar
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">
            No hay denuncias en estos filtros.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800"
              >
                <Link
                  href={`/gob/maltrato/${r.id}`}
                  className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {welfareReportKindLabel(r.kind)}{" "}
                        <span className={`text-xs font-medium ${SEVERITY_TONE[r.severity] ?? ""}`}>
                          · {welfareReportSeverityLabel(r.severity)}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {r.jurisdictionLocality && r.jurisdictionProvince
                          ? `${r.jurisdictionLocality}, ${r.jurisdictionProvince}`
                          : "Sin jurisdicción declarada"}
                        {" · "}
                        {new Date(r.createdAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
                        {r.referenceCode}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_TONE[r.status] ?? ""
                      } shrink-0`}
                    >
                      {welfareReportStatusLabel(r.status)}
                    </span>
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

function StatusChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full border text-xs ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      }`}
    >
      {label}
    </Link>
  );
}
