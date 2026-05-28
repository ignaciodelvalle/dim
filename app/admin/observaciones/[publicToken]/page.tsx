import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { professionalCloseRabiesObservationAction } from "@/app/actions/bite";
import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

import { CloseObservationForm } from "./CloseObservationForm";

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!pet) notFound();
  if (pet.rabiesObservationStatus !== "in_progress") {
    notFound();
  }

  // Govt scope check — admin sees universally.
  if (profile.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === pet.jurisdictionProvince && j.locality === pet.jurisdictionLocality,
    );
    if (!inScope) notFound();
  }

  const [startedEvent] = await db
    .select()
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
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/admin/observaciones"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver al listado
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Cierre profesional — {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Como {profile.role === "admin" ? "administrador" : "autoridad sanitaria"}, podés cerrar
            con cualquier outcome.
          </p>
        </header>

        <section className="rounded-xl border border-gob-border  p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted ">
            Datos de la mascota
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-gob-text-muted">Especie</dt>
              <dd className="text-gob-text ">{pet.species}</dd>
            </div>
            <div>
              <dt className="text-xs text-gob-text-muted">Jurisdicción</dt>
              <dd className="text-gob-text ">
                {pet.jurisdictionLocality ?? "—"}, {pet.jurisdictionProvince ?? "—"}
              </dd>
            </div>
            {ownerRow && (
              <div>
                <dt className="text-xs text-gob-text-muted">Dueño/a</dt>
                <dd className="text-gob-text ">{ownerRow.displayName}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gob-text-muted">Token público</dt>
              <dd className="font-mono text-xs text-gob-text-gray ">{pet.publicToken}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-gob-warning  bg-gob-warning/10  p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-warning-text ">
            Observación activa
          </p>
          <p className="text-sm text-gob-warning-text ">
            {observationUntil
              ? `Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}`
              : "Sin fecha de cierre."}
          </p>
        </section>

        {escalatingSymptoms.length > 0 && (
          <section className="rounded-xl border border-gob-danger  bg-gob-danger/10  p-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-gob-danger ">
              Síntomas registrados durante la observación
            </p>
            <ul className="space-y-1 text-sm text-gob-danger ">
              {escalatingSymptoms.map((s) => {
                const payload = s.payload as Record<string, unknown>;
                const alerted = (payload.alerted_disease_codes as string[]) ?? [];
                const text = (payload.free_text as string) ?? "—";
                return (
                  <li key={s.id} className="space-y-0.5">
                    <p>
                      {new Date(s.occurredAt).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {alerted.length > 0 && (
                        <span className="ml-2 text-xs uppercase tracking-wider">
                          {alerted.join(", ")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs">{text}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <CloseObservationForm action={boundAction} />
      </div>
    </main>
  );
}
