// Spec 2026-05-19-pregnancy-tracking-design §5.3.
// Rendered above the identity header when pet.pregnancyStatus='in_progress'.

import Link from "next/link";

import { formatDate } from "@/lib/format";

export function PregnancyInProgressCard({
  petPublicToken,
  pregnancyStartedAt,
  weeksAtDiagnosis,
  expectedBirthAt,
  lastClinicalAt,
}: {
  petPublicToken: string;
  pregnancyStartedAt: Date;
  weeksAtDiagnosis: number | null;
  expectedBirthAt: Date;
  lastClinicalAt: Date | null;
}) {
  const now = new Date();
  const weeksElapsed = Math.floor((now.getTime() - pregnancyStartedAt.getTime()) / (7 * 86400000));
  const currentWeeks = (weeksAtDiagnosis ?? 0) + Math.max(weeksElapsed, 0);

  return (
    <section
      aria-label="Embarazo en seguimiento"
      className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100 space-y-3"
    >
      <header className="flex items-center gap-2">
        <span aria-hidden className="text-xl">
          🌸
        </span>
        <h2 className="text-base font-semibold">Embarazo en seguimiento</h2>
      </header>

      <dl className="text-sm space-y-1">
        <Row label="Iniciado">{formatDate(pregnancyStartedAt)}</Row>
        <Row label="Semanas estimadas">~{currentWeeks}</Row>
        <Row label="Estimación de parto">~{formatDate(expectedBirthAt)}</Row>
        {lastClinicalAt && <Row label="Último registro clínico">{formatDate(lastClinicalAt)}</Row>}
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/mis-mascotas/${petPublicToken}/eventos/nuevo/embarazo?phase=ended`}
          className="px-3 py-1.5 rounded-lg bg-rose-900 text-white dark:bg-rose-100 dark:text-rose-950 text-sm font-medium hover:bg-rose-800 dark:hover:bg-rose-200 transition-colors"
        >
          Registrar parto / cierre
        </Link>
        <Link
          href={`/mis-mascotas/${petPublicToken}/eventos/nuevo/clinico`}
          className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-sm font-medium hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
        >
          Anotar control veterinario
        </Link>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-rose-700 dark:text-rose-300">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
