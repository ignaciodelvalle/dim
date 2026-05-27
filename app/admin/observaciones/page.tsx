import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import type { RabiesObservationStatus } from "@/lib/rabies-observation";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<RabiesObservationStatus, string> = {
  in_progress: "En curso",
  completed_negative: "Cerrada negativa",
  completed_positive_rabies: "Cerrada POSITIVA",
  completed_dead: "Cerrada por fallecimiento",
  completed_lost_to_followup: "Sin seguimiento",
};

const STATUS_TONE: Record<RabiesObservationStatus, string> = {
  in_progress: "bg-gob-warning text-gob-warning-text",
  completed_negative: "bg-gob-success/10 text-gob-success",
  completed_positive_rabies: "bg-gob-danger/10 text-gob-danger",
  completed_dead: "bg-gob-danger/10 text-gob-danger",
  completed_lost_to_followup: "bg-gob-surface-alt text-gob-text-gray",
};

function formatRelative(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return hours <= 0 ? "hace minutos" : `hace ${hours} h`;
  }
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

export default async function ObservacionesPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Active observations + recently completed (last 30 days).
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const baseConditions = [
    sql`(
      ${pets.rabiesObservationStatus} = 'in_progress'
      OR EXISTS (
        SELECT 1 FROM ${petEvents}
        WHERE ${petEvents.petId} = ${pets.id}
          AND ${petEvents.eventType} = 'rabies_observation_ended'
          AND ${petEvents.occurredAt} >= ${since30.toISOString()}
      )
    )`,
  ];

  if (profile.role === "govt") {
    if (jurisdictions.length === 0) {
      return (
        <main className="px-6 py-8">
          <div className="max-w-5xl mx-auto space-y-4">
            <h1 className="text-3xl font-semibold text-gob-text">Observaciones antirrábicas</h1>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gob-warning-text">
              Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al
              menos una.
            </div>
          </div>
        </main>
      );
    }
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    baseConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const rows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      species: pets.species,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      status: pets.rabiesObservationStatus,
    })
    .from(pets)
    .where(and(...baseConditions))
    .limit(500);

  if (rows.length === 0) {
    return (
      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <h1 className="text-3xl font-semibold text-gob-text">Observaciones antirrábicas</h1>
          <p className="text-sm text-gob-text-muted">
            No hay observaciones activas ni cierres recientes en tu cobertura.
          </p>
        </div>
      </main>
    );
  }

  // Resolve started event + owner per pet for the in_progress rows.
  const petIds = rows.map((r) => r.petId);
  const startedEvents = await db
    .select({
      petId: petEvents.petId,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(
      and(inArray(petEvents.petId, petIds), eq(petEvents.eventType, "rabies_observation_started")),
    )
    .orderBy(desc(petEvents.occurredAt));
  const startedByPet = new Map<string, { occurredAt: Date; observationUntil: Date | null }>();
  for (const e of startedEvents) {
    if (startedByPet.has(e.petId)) continue;
    const payload = e.payload as Record<string, unknown>;
    const observationUntil = payload?.observation_until
      ? new Date(payload.observation_until as string)
      : null;
    startedByPet.set(e.petId, { occurredAt: e.occurredAt, observationUntil });
  }

  const ownerRows = await db
    .select({
      petId: ownerships.petId,
      displayName: profiles.displayName,
    })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        inArray(ownerships.petId, petIds),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );
  const ownerByPet = new Map<string, string>();
  for (const o of ownerRows) ownerByPet.set(o.petId, o.displayName);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Observaciones antirrábicas
          </h1>
          <p className="text-sm text-gob-text-gray">
            Período de 10 días por Decreto 4669/1973 (PBA), Ord. CABA 41.831/1987. Las activas
            requieren cierre profesional cuando hubo síntomas escalables; las completadas se
            muestran como referencia (últimos 30 días).
          </p>
        </header>

        <ul className="space-y-2">
          {rows.map((r) => {
            const started = startedByPet.get(r.petId);
            const status = (r.status ?? "in_progress") as RabiesObservationStatus;
            return (
              <li key={r.petId} className="rounded-lg border border-gob-border px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-gob-text">
                      {r.petName} <span className="text-xs text-gob-text-muted">· {r.species}</span>
                    </p>
                    <p className="text-xs text-gob-text-muted">
                      {r.locality ?? "—"}, {r.province ?? "—"}
                    </p>
                    {ownerByPet.get(r.petId) && (
                      <p className="text-xs text-gob-text-muted">
                        Dueño/a: {ownerByPet.get(r.petId)}
                      </p>
                    )}
                    <p className="text-xs text-gob-text-muted">
                      Inicio: {formatRelative(started?.occurredAt ?? null)}
                      {started?.observationUntil
                        ? ` · Cierre estimado: ${started.observationUntil.toLocaleDateString("es-AR")}`
                        : null}
                    </p>
                    <p className="text-[10px] font-mono text-gob-text-muted">{r.petPublicToken}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${STATUS_TONE[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                    {status === "in_progress" && (
                      <Link
                        href={`/admin/observaciones/${r.petPublicToken}`}
                        className="text-xs underline underline-offset-2 text-gob-text-gray hover:text-gob-text"
                      >
                        Cerrar profesionalmente
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
