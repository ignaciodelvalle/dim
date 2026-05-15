import { attachments, db, ownerships, petEvents, pets } from "@/db";
import { eventPayloadSummary } from "@/lib/events";
import {
  ageFromDateOfBirth,
  eventTypeLabel,
  formatDate,
  formatDateTime,
  sexLabel,
  speciesLabel,
  statusLabel,
} from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

function trainingLevelLabel(level: string): string {
  switch (level) {
    case "none":
      return "Ninguno";
    case "basic":
      return "Básico";
    case "intermediate":
      return "Intermedio";
    case "advanced":
      return "Avanzado";
    case "professional":
      return "Profesional";
    default:
      return level;
  }
}

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch the pet + verify ownership in a single query. If the user doesn't
  // own this pet (or it doesn't exist) we 404 — same response either way, so
  // we don't leak the existence of pets the user can't access.
  const [result] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.userId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!result) {
    notFound();
  }

  const { pet, photo } = result;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // Event timeline, newest first.
  const events = await db
    .select()
    .from(petEvents)
    .where(eq(petEvents.petId, pet.id))
    .orderBy(desc(petEvents.occurredAt));

  const age = ageFromDateOfBirth(pet.dateOfBirth);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Mis mascotas
        </Link>

        {/* Hero: photo + name + key facts */}
        <section className="flex items-start gap-5">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-24 h-24 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-3xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
              {pet.name}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {speciesLabel(pet.species)} · {sexLabel(pet.sex)}
              {age && ` · ${age}`}
            </p>
            <p className="text-xs font-mono text-neutral-400 dark:text-neutral-600 tracking-wider">
              {pet.publicToken}
            </p>
          </div>
        </section>

        {/* Info grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Detail label="Estado" value={statusLabel(pet.status)} />
          <Detail
            label="Fecha de nacimiento"
            value={
              pet.dateOfBirth
                ? `${formatDate(pet.dateOfBirth)}${pet.birthDateIsEstimated ? " (aprox.)" : ""}`
                : null
            }
          />
          <Detail
            label="Raza"
            value={
              pet.breed ? `${pet.breed}${pet.potentiallyDangerousBreed ? " ⚠ PPP" : ""}` : null
            }
          />
          <Detail label="Color / marcas" value={pet.color} />
          <Detail
            label="Peso estimado"
            value={pet.estimatedWeightKg ? `${pet.estimatedWeightKg} kg` : null}
          />
          <Detail
            label="Nivel de entrenamiento"
            value={pet.trainingLevel ? trainingLevelLabel(pet.trainingLevel) : null}
          />
          <Detail label="Microchip" value={pet.microchipId} />
          <Detail
            label="Ubicación"
            value={
              [pet.jurisdictionLocality, pet.jurisdictionProvince].filter(Boolean).join(", ") ||
              null
            }
          />
          <Detail
            label="Comidas favoritas"
            value={pet.favouriteFoods?.length ? pet.favouriteFoods.join(", ") : null}
          />
          <Detail
            label="Alergias conocidas"
            value={pet.knownAllergies?.length ? pet.knownAllergies.join(", ") : null}
          />
          <Detail label="Aseguradora" value={pet.insuranceCompany} />
          <Detail label="N° de póliza" value={pet.insurancePolicyNumber} />
          {pet.distinguishingFeatures && (
            <div className="sm:col-span-2">
              <Detail label="Señas particulares" value={pet.distinguishingFeatures} />
            </div>
          )}
        </section>

        {pet.potentiallyDangerousBreed && (
          <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
            Esta mascota está marcada como raza potencialmente peligrosa (Ley CABA 4078, Ley
            Provincial 14.107). Recordá registrarla en el registro provincial correspondiente.
          </div>
        )}

        {/* Action buttons */}
        <section className="flex flex-wrap gap-3">
          <Link
            href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
            className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            + Agregar evento
          </Link>
          <Link
            href={`/mis-mascotas/${pet.publicToken}/editar`}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Editar mascota
          </Link>
          <Link
            href={`/p/${pet.publicToken}`}
            target="_blank"
            rel="noopener"
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Ver credencial pública ↗
          </Link>
        </section>

        {/* Event timeline */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Historial
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin eventos todavía.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => {
                const summary = eventPayloadSummary(event.eventType, event.payload);
                return (
                  <li
                    key={event.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">
                          {summary.primary ?? eventTypeLabel(event.eventType)}
                        </p>
                        {summary.secondary && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-500">
                            {summary.secondary}
                          </p>
                        )}
                      </div>
                      <time className="text-xs text-neutral-500 dark:text-neutral-500 shrink-0">
                        {formatDateTime(event.occurredAt)}
                      </time>
                    </div>
                    {event.notes && (
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">
                        {event.notes}
                      </p>
                    )}
                    <details className="text-xs text-neutral-500 dark:text-neutral-500">
                      <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">
                        Ver detalle técnico
                      </summary>
                      <pre className="mt-2 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 overflow-x-auto text-[11px] leading-relaxed">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </dt>
      <dd className="text-neutral-900 dark:text-neutral-50">{value || "—"}</dd>
    </div>
  );
}
