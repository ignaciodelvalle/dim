// /pro/servicios/[offeringToken]/agenda — schedule rules CRUD for a vet-owned
// offering (Fase 2.5). Gated by requireVetProviderOrRedirect.

import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  createScheduleRuleForVetAction,
  deleteScheduleRuleForVetAction,
} from "@/app/actions/schedule-rules";
import { materializeOfferingNowAction } from "@/app/actions/slot-materialization";
import { db, serviceOfferings, serviceScheduleRules } from "@/db";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

import { MaterializeNowButton } from "./MaterializeNowButton";
import { VetAgendaRuleForm } from "./VetAgendaRuleForm";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

function formatDays(days: number[]): string {
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d] ?? d)
    .join(", ");
}

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { dateStyle: "medium" });
}

export default async function VetAgendaPage({
  params,
}: {
  params: Promise<{ offeringToken: string }>;
}) {
  const { offeringToken } = await params;
  const { user } = await requireVetProviderOrRedirect();

  const [offering] = await db
    .select()
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, offeringToken),
        eq(serviceOfferings.providerUserId, user.id),
      ),
    )
    .limit(1);

  if (!offering) notFound();

  if (offering.status !== "approved") {
    redirect(`/pro/servicios/${offeringToken}`);
  }

  const kind = findServiceKind(offering.serviceKind);

  const rules = await db
    .select()
    .from(serviceScheduleRules)
    .where(
      and(
        eq(serviceScheduleRules.serviceOfferingId, offering.id),
        eq(serviceScheduleRules.status, "active"),
      ),
    )
    .orderBy(serviceScheduleRules.effectiveFrom);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Portal profesional · {kind?.label ?? offering.serviceKind}
          </p>
          <h1 className="text-3xl font-semibold">Agenda</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Reglas de disponibilidad recurrente para <strong>{offering.displayName}</strong>.
          </p>
        </header>

        {/* Existing rules */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Reglas activas</h2>
          {rules.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              Todavía no hay reglas de agenda. Agregá una abajo.
            </p>
          ) : (
            <div className="rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Días</th>
                    <th className="px-4 py-2 text-left font-medium">Horario</th>
                    <th className="px-4 py-2 text-left font-medium">Desde</th>
                    <th className="px-4 py-2 text-left font-medium">Hasta</th>
                    <th className="px-4 py-2 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                      <td className="px-4 py-3">{formatDays(rule.daysOfWeek as number[])}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {rule.startTimeLocal} – {rule.endTimeLocal}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {formatDate(rule.effectiveFrom)}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {rule.effectiveUntil ? formatDate(rule.effectiveUntil) : "Abierto"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form
                          action={async () => {
                            "use server";
                            await deleteScheduleRuleForVetAction(rule.id, offeringToken);
                          }}
                        >
                          <button
                            type="submit"
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Eliminar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Add rule form */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Agregar regla</h2>
          <div className="rounded border border-neutral-200 dark:border-neutral-800 p-5">
            <VetAgendaRuleForm
              serviceOfferingId={offering.id}
              offeringPublicToken={offeringToken}
              createAction={createScheduleRuleForVetAction}
            />
          </div>
        </section>

        {/* Materialization — immediate preview */}
        {rules.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Materializar turnos</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Genera los turnos de los próximos 60 días a partir de las reglas activas. El cron lo
              hace automáticamente; este botón es para preview inmediato.
            </p>
            <MaterializeNowButton
              offeringToken={offeringToken}
              materializeAction={materializeOfferingNowAction}
            />
          </section>
        )}

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/pro/servicios/${offeringToken}`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al servicio
          </Link>
        </footer>
      </div>
    </main>
  );
}
