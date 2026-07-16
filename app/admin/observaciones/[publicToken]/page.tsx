import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCrumbs,
} from "@/components/ui/dashboard";
import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { jurisdictionScopeContains } from "@/lib/domain/jurisdiction-canonical";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { PET_OBSERVATION_SELECT } from "@/lib/infra/pet-projections";
import { formatDateShort, speciesLabel } from "@/lib/utils/format";
import { professionalCloseRabiesObservationAction } from "@/src/modules/surveillance/actions";
import { diseaseCodeToEnoCode, getEnoDisease } from "@/src/modules/surveillance/domain/eno-catalog";

import { CloseObservationForm } from "./CloseObservationForm";

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const [pet] = await db
    .select(PET_OBSERVATION_SELECT)
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) notFound();
  if (pet.rabiesObservationStatus !== "in_progress") {
    notFound();
  }

  // Govt scope check — admin sees universally. Subsumption-aware so a
  // whole-province operator (e.g. whole-CABA) opens an observation on a pet
  // geocoded to a barrio in that province. See jurisdictionScopeContains.
  if (profile.role === "govt") {
    const inScope = jurisdictionScopeContains(
      jurisdictions,
      pet.jurisdictionProvince,
      pet.jurisdictionLocality,
    );
    if (!inScope) notFound();
  }

  const [startedEvent] = await db
    .select({ id: petEvents.id, payload: petEvents.payload })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "rabies_observation_started")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  const startedPayload = (startedEvent?.payload ?? {}) as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;

  // Symptom events emitted during the observation period that flagged rabies.
  const escalatingSymptoms = startedEvent
    ? await db
        .select({ id: petEvents.id, occurredAt: petEvents.occurredAt, payload: petEvents.payload })
        .from(petEvents)
        .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "symptom_observed")))
        .orderBy(desc(petEvents.occurredAt))
    : [];

  const [ownerRow] = await db
    .select({ displayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);

  const boundAction = professionalCloseRabiesObservationAction.bind(null, pet.publicToken);

  return (
    <div className="space-y-6">
      <OpCrumbs
        items={[{ label: "Observaciones", href: "/admin/observaciones" }, { label: pet.name }]}
      />

      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {"Admin · Vigilancia · Cierre profesional"}
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          {"Cierre profesional — "}
          {pet.name}
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {"Como "}
          {profile.role === "admin" ? "administrador" : "autoridad sanitaria"}
          {", podés cerrar con cualquier outcome."}
        </p>
      </header>

      {/* Pet data card */}
      <OpCard>
        <OpCardHead title="Datos de la mascota" />
        <OpCardBody>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-ln-op-mute">Especie</dt>
              <dd className="text-[13px] text-ln-op-ink">{speciesLabel(pet.species)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-ln-op-mute">{"Jurisdicción"}</dt>
              <dd className="text-[13px] text-ln-op-ink">
                {pet.jurisdictionLocality ?? "—"}, {pet.jurisdictionProvince ?? "—"}
              </dd>
            </div>
            {ownerRow && (
              <div>
                <dt className="text-[11px] text-ln-op-mute">{"Dueño/a"}</dt>
                <dd className="text-[13px] text-ln-op-ink">{ownerRow.displayName}</dd>
              </div>
            )}
            <div>
              <dt className="text-[11px] text-ln-op-mute">{"Token público"}</dt>
              <dd className="font-mono text-[11px] text-ln-op-mute">{pet.publicToken}</dd>
            </div>
          </dl>
        </OpCardBody>
      </OpCard>

      {/* Active observation callout */}
      <OpCallout
        title="Observación activa"
        body={
          observationUntil
            ? `Cierre estimado: ${formatDateShort(observationUntil)}`
            : "Sin fecha de cierre."
        }
      />

      {/* Escalating symptoms */}
      {escalatingSymptoms.length > 0 && (
        <OpBreach
          title={`Síntomas registrados durante la observación (${escalatingSymptoms.length})`}
          detail={
            <ul className="mt-1 space-y-0.5">
              {escalatingSymptoms.map((s) => {
                const payload = s.payload as Record<string, unknown>;
                const alerted = ((payload.alerted_disease_codes as string[]) ?? []).map(
                  (code) => getEnoDisease(diseaseCodeToEnoCode(code))?.label ?? code,
                );
                const text = (payload.free_text as string) ?? "—";
                return (
                  <li key={s.id}>
                    {new Date(s.occurredAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {alerted.length > 0 && (
                      <span className="ml-2 text-xs uppercase tracking-wider">
                        {alerted.join(", ")}
                      </span>
                    )}
                    {" — "}
                    {text}
                  </li>
                );
              })}
            </ul>
          }
        />
      )}

      {/* Closure form */}
      <OpCard>
        <OpCardHead title="Cerrar observación" />
        <OpCardBody>
          <CloseObservationForm action={boundAction} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
