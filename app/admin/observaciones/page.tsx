import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpCallout, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { surveillanceEyebrow } from "@/lib/ui/surveillance-eyebrow";
import { formatDateShort, speciesLabel } from "@/lib/utils/format";
import type { RabiesObservationStatus } from "@/src/modules/surveillance/domain/rabies-observation";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<RabiesObservationStatus, string> = {
  in_progress: "En curso",
  completed_negative: "Cerrada negativa",
  completed_positive_rabies: "Cerrada POSITIVA",
  completed_dead: "Cerrada por fallecimiento",
  completed_lost_to_followup: "Sin seguimiento",
};

type PillTone = "open" | "ok" | "danger" | "neutral";

const STATUS_PILL: Record<RabiesObservationStatus, PillTone> = {
  in_progress: "open",
  completed_negative: "ok",
  completed_positive_rabies: "danger",
  completed_dead: "danger",
  completed_lost_to_followup: "neutral",
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
  const eyebrow = surveillanceEyebrow(profile.role);

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
        <div className="space-y-6">
          <header className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
              {eyebrow}
            </p>
            <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
              Observaciones antirrábicas
            </h1>
          </header>
          <OpBreach
            title="Sin localidades asignadas"
            detail="Pedí a un administrador que te asigne al menos una localidad para operar."
          />
        </div>
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
    // W1: the single "En curso" observation must LEAD — it is the only row that
    // needs a professional cierre. Recently-completed rows are reference only, so
    // they sort AFTER the active ones (the badge counts in_progress; the list
    // must not bury it under ~20 "Cerrada negativa"). Name is a stable tiebreak.
    .orderBy(sql`(${pets.rabiesObservationStatus} = 'in_progress') DESC`, pets.name)
    .limit(500);

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            {"Admin · Vigilancia"}
          </p>
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Observaciones antirrábicas
          </h1>
        </header>
        <OpCallout
          title="Sin observaciones activas"
          body="No hay observaciones activas ni cierres recientes en tu cobertura."
        />
      </div>
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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {"Admin · Vigilancia"}
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Observaciones antirrábicas
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Período de 10 días por Decreto 4669/1973 (PBA), Ord. CABA 41.831/1987. Las activas
          requieren cierre profesional cuando hubo síntomas escalables; las completadas se muestran
          como referencia (últimos 30 días).
        </p>
      </header>

      <ul className="space-y-2">
        {rows.map((r) => {
          const started = startedByPet.get(r.petId);
          const status = (r.status ?? "in_progress") as RabiesObservationStatus;
          return (
            <li key={r.petId}>
              <OpCard>
                <OpCardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-semibold text-ln-op-ink">
                        {r.petName}{" "}
                        <span className="text-sm font-normal text-ln-op-mute">
                          {"· "}
                          {speciesLabel(r.species)}
                        </span>
                      </p>
                      <p className="text-sm text-ln-op-mute">
                        {r.locality ?? "—"}, {r.province ?? "—"}
                      </p>
                      {ownerByPet.get(r.petId) && (
                        <p className="text-sm text-ln-op-mute">
                          {"Dueño/a: "}
                          {ownerByPet.get(r.petId)}
                        </p>
                      )}
                      <p className="text-sm text-ln-op-mute">
                        {"Inicio: "}
                        {formatRelative(started?.occurredAt ?? null)}
                        {started?.observationUntil
                          ? ` · Cierre estimado: ${formatDateShort(started.observationUntil)}`
                          : null}
                      </p>
                      <p className="font-mono text-xs text-ln-op-faint">{r.petPublicToken}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                      <OpPill tone={STATUS_PILL[status]}>{STATUS_LABEL[status]}</OpPill>
                      {status === "in_progress" && (
                        <Link
                          href={`/admin/observaciones/${r.petPublicToken}`}
                          className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                        >
                          {"Cerrar profesionalmente ->"}
                        </Link>
                      )}
                    </div>
                  </div>
                </OpCardBody>
              </OpCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
