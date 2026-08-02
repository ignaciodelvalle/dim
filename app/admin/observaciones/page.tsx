import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import {
  CsvExportLink,
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  type OpFilterAxis,
  OpFilterBar,
  OpPill,
  ViewScopeCaption,
} from "@/components/ui/dashboard";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { db, ownerships, petEvents, profiles } from "@/db";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  type ObservacionesScope,
  fetchObservaciones,
  parseObservacionEstado,
} from "@/lib/metrics/observaciones-query";
import { observationDispositionChip } from "@/lib/ui/observation-disposition-chip";
import { surveillanceEyebrow } from "@/lib/ui/surveillance-eyebrow";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import { formatDateShort, formatDiasAgo, speciesLabel, todayIsoInAr } from "@/lib/utils/format";
import {
  RABIES_OBSERVATION_STATUSES,
  type RabiesObservationStatus,
  resolveObservationDeadline,
} from "@/src/modules/surveillance/domain/rabies-observation";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<RabiesObservationStatus, string> = {
  in_progress: "En curso",
  completed_negative: "Cerrada negativa",
  completed_positive_rabies: "Cerrada positiva",
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
  if (days < 30) return formatDiasAgo(days);
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

export default async function ObservacionesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; province?: string; locality?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const eyebrow = surveillanceEyebrow(profile.role);

  const header = <ScreenHeader eyebrow={eyebrow} title="Observaciones antirrábicas" />;

  // Govt with zero assignments has nothing to scope a filter bar over —
  // same early-return precedent as /gob/casos, /gob/vigilancia.
  if (profile.role === "govt" && jurisdictions.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <OpBreach
          title="Sin localidades asignadas"
          detail="Pedí a un administrador que te asigne al menos una localidad para operar."
        />
      </div>
    );
  }

  const sp = searchParams ? await searchParams : {};
  const statusFilter = parseObservacionEstado(sp.status);

  // THE FENCE — same resolver every other govt/admin scoped screen uses
  // (/gob/vigilancia, /gob/programa): govt narrowing only ever intersects
  // DOWN against the session's own jurisdiction assignments; admin gets a
  // universal scope with an optional province/locality drill.
  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });

  const scope: ObservacionesScope =
    profile.role === "admin"
      ? { role: "admin", province: adminSelectedProvince, locality: adminSelectedLocality }
      : { role: "govt", jurisdictions: filteredJurisdictions };

  // C3 disclosure: caption when this page's filters narrow below the mandate.
  const narrowedView = describeNarrowedView({
    role: profile.role,
    mandateJurisdictions: jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    adminProvince: adminSelectedProvince ?? undefined,
    adminLocality: adminSelectedLocality ?? undefined,
  });

  const rows = await fetchObservaciones(scope, { status: statusFilter });

  // Unified filter bar (F-migration 2026-07-21 — observaciones previously had
  // NO filter at all, PO: "observaciones directamente no tiene filtro").
  // Estado is a registered axis: the no-param default is the composite
  // in_progress+recent-completed view above, which IS genuinely "all
  // statuses" (not one specific status), so OpFilterBar's own injected blank
  // "Todas" option is honest here — no CasoEstadoFilter-style trap.
  // Jurisdiction reuses the same scoped allowedProvinces/localities every
  // other govt/admin screen wires through `jurisdiction`, preserving the
  // govt-fenced / admin-universal split.
  // Q1 (CSV export parity) — exactly the rendered rows (500-row query cap and
  // all). Owner names stay OUT of the file for the same travel-risk reason
  // /gob/perdidas excludes them: the screen shows them in context, the CSV
  // outlives the screen. Inicio/cierre are resolved later (per-pet event
  // lookups) only when rows exist — the export sticks to the row projection
  // the query itself returns, so the link can render from the bar in every
  // branch.
  const csvRows = rows.map((r) => [
    r.petName,
    speciesLabel(r.species),
    r.petPublicToken,
    [r.locality, r.province].filter(Boolean).join(", "),
    STATUS_LABEL[r.status],
  ]);

  const filterBar = (
    <OpFilterBar
      showPeriod={false}
      jurisdiction={{ allowedProvinces, localities }}
      actions={
        <CsvExportLink
          filename={`observaciones-antirrabicas-${todayIsoInAr()}`}
          columns={["Mascota", "Especie", "Token", "Jurisdicción", "Estado"]}
          rows={csvRows}
          contextLines={[
            "miMAR · Observaciones antirrábicas — sin datos de dueño/a: el archivo viaja fuera de pantalla",
          ]}
        />
      }
      axes={
        [
          {
            id: "status",
            label: "Estado",
            paramKey: "status",
            options: RABIES_OBSERVATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            current: statusFilter,
            allLabel: "Todas",
          },
        ] satisfies OpFilterAxis[]
      }
    />
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ViewScopeCaption scope={narrowedView} />
        {filterBar}
        {/* C4 (2026-07-22, §S4 / red-team #6 "690 mordeduras sin escalar"):
            an observation only exists here if a bite/exposure was escalated
            into one — an empty queue reads as "controlado" when it may mean
            "sin escalar". no-signal, pointing at the escalation-gap tile
            (Vigilancia) that carries the same reading. */}
        <OpCallout
          nature="no-signal"
          icon={<Icon name="eye-off" decorative />}
          title="Sin observaciones registradas en miMAR"
          body="La ausencia de observaciones no implica ausencia de casos por escalar — no hay observaciones que coincidan con estos filtros en tu cobertura. Revisá la brecha de escalamiento (mordeduras vs. observaciones) en Vigilancia."
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
  const startedByPet = new Map<string, { occurredAt: Date; observationUntil: Date }>();
  for (const e of startedEvents) {
    if (startedByPet.has(e.petId)) continue;
    const payload = e.payload as Record<string, unknown>;
    // T4.13 (2026-08-01): the payload's observation_until is missing for
    // older/seed observations — this used to render NO "Cierre estimado" at
    // all, an operator-visible gap on the exact date the law obligates.
    // resolveObservationDeadline is the SAME fallback
    // close-eligible-observations.ts relies on to keep the auto-close sweep
    // from stalling: derive the deadline from when the observation STARTED +
    // the legal window, so it is always computable.
    const observationUntil = resolveObservationDeadline(payload?.observation_until, e.occurredAt);
    startedByPet.set(e.petId, { occurredAt: e.occurredAt, observationUntil });
  }

  // Disposal facts for rows closed by death (S3, surveillance-disposal slice):
  // the latest death_recorded event carries disposition_method + the
  // during_rabies_observation flag — this is that flag's first consumer. The
  // chip logic lives in lib/ui/observation-disposition-chip.ts.
  const deadPetIds = rows.filter((r) => r.status === "completed_dead").map((r) => r.petId);
  const deathByPet = new Map<
    string,
    { dispositionMethod: string | null; duringRabiesObservation: boolean }
  >();
  if (deadPetIds.length > 0) {
    const deathEvents = await db
      .select({ petId: petEvents.petId, payload: petEvents.payload })
      .from(petEvents)
      .where(and(inArray(petEvents.petId, deadPetIds), eq(petEvents.eventType, "death_recorded")))
      .orderBy(desc(petEvents.occurredAt));
    for (const e of deathEvents) {
      if (deathByPet.has(e.petId)) continue; // desc order → latest wins
      const payload = e.payload as Record<string, unknown>;
      deathByPet.set(e.petId, {
        dispositionMethod:
          typeof payload?.disposition_method === "string" ? payload.disposition_method : null,
        duringRabiesObservation: payload?.during_rabies_observation === true,
      });
    }
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
      {header}
      <ViewScopeCaption scope={narrowedView} />
      <p className="text-[13px] text-ln-op-ink-2">
        Período de 10 días por Decreto 4669/1973 (PBA), Ord. CABA 41.831/1987. Las activas requieren
        cierre profesional cuando hubo síntomas escalables; las completadas se muestran como
        referencia (últimos 30 días) salvo que filtres por un estado específico.
      </p>
      {filterBar}

      <ul className="space-y-2">
        {rows.map((r) => {
          const started = startedByPet.get(r.petId);
          const status = r.status;
          const dispositionChip = observationDispositionChip(
            status,
            deathByPet.get(r.petId) ?? null,
          );
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
                      {dispositionChip && (
                        <OpPill tone={dispositionChip.tone}>{dispositionChip.label}</OpPill>
                      )}
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
