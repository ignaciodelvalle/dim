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
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al listado
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Cierre profesional — {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Como {profile.role === "admin" ? "administrador" : "autoridad sanitaria"}, podés cerrar
            con cualquier outcome.
          </p>
        </header>

        <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
            Datos de la mascota
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-neutral-500">Especie</dt>
              <dd className="text-neutral-900 dark:text-neutral-50">{pet.species}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Jurisdicción</dt>
              <dd className="text-neutral-900 dark:text-neutral-50">
                {pet.jurisdictionLocality ?? "—"}, {pet.jurisdictionProvince ?? "—"}
              </dd>
            </div>
            {ownerRow && (
              <div>
                <dt className="text-xs text-neutral-500">Dueño/a</dt>
                <dd className="text-neutral-900 dark:text-neutral-50">{ownerRow.displayName}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-neutral-500">Token público</dt>
              <dd className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {pet.publicToken}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Observación activa
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {observationUntil
              ? `Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}`
              : "Sin fecha de cierre."}
          </p>
        </section>

        {escalatingSymptoms.length > 0 && (
          <section className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-red-800 dark:text-red-300">
              Síntomas registrados durante la observación
            </p>
            <ul className="space-y-1 text-sm text-red-900 dark:text-red-200">
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
