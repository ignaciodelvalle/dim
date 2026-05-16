// Public credential page — Tier 0 view by default. When pet.status === 'lost'
// the page promotes to Tier 1: owner first name + direct contact + last-known
// location, per AGENTS.md → "Privacy tiers".
//
// Privacy posture (active pets): NO owner PII, NO microchip number, NO medical
// details, NO scan history.

import { attachments, db, ownerships, petEvents, pets, profiles } from "@/db";
import { sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { petPhotoUrl } from "@/lib/storage";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FoundPetForm } from "./FoundPetForm";
import { ScanLogger } from "./ScanLogger";

export default async function PublicCredentialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const [result] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, publicToken))
    .limit(1);

  if (!result) notFound();
  const { pet, photo } = result;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // Tier 0 rollups — boolean indicators, never the raw data.
  const vaccinations = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")));
  const hasVaccinations = vaccinations.length > 0;
  const hasMicrochip = !!pet.microchipId;

  // Approximate age — year only (Tier 0 doesn't expose exact DOB).
  const ageYears = pet.dateOfBirth
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(pet.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        ),
      )
    : null;

  const isLost = pet.status === "lost";

  // Tier 1 reveal: only when the pet is marked lost. Otherwise leave undefined
  // so we don't leak PII on active pets.
  let lostContext: {
    ownerFirstName: string | null;
    phone: string | null;
    lastKnownLocation: string | null;
  } | null = null;

  if (isLost) {
    const [ownerRow] = await db
      .select({ profile: profiles })
      .from(ownerships)
      .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
      .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
      .limit(1);

    // Last-known location from the most recent status_changed → lost event.
    // Filtering on payload->>'to_status' = 'lost' so a later "found" event
    // (to_status='active') does not eclipse the actual lost-event payload.
    const [latestLostEvent] = await db
      .select({
        payload: petEvents.payload,
        locationLat: petEvents.locationLat,
        locationLng: petEvents.locationLng,
      })
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, pet.id),
          eq(petEvents.eventType, "status_changed"),
          sql`${petEvents.payload}->>'to_status' = 'lost'`,
        ),
      )
      .orderBy(desc(petEvents.occurredAt))
      .limit(1);
    const payload = (latestLostEvent?.payload ?? {}) as Record<string, unknown>;
    const textLocation =
      typeof payload.last_known_location === "string" && payload.last_known_location.length > 0
        ? payload.last_known_location
        : null;
    // Fallback: precise lat/lng captured on the event row itself. setPetLostAction
    // does not write these today, but the schema supports them — when the
    // marker-pin UI lands they will be populated and surface here automatically.
    const eventPoint = latestLostEvent ? readPoint(latestLostEvent) : null;
    const geoLocation =
      !textLocation && eventPoint
        ? `${eventPoint.lat.toFixed(6)}, ${eventPoint.lng.toFixed(6)}`
        : null;

    // Split display_name on first whitespace to get just the first name. We
    // never expose the full legal name on a public credential.
    const firstName = ownerRow?.profile.displayName
      ? ownerRow.profile.displayName.trim().split(/\s+/)[0]
      : null;

    lostContext = {
      ownerFirstName: firstName ?? null,
      phone: ownerRow?.profile.phone ?? null,
      lastKnownLocation: textLocation ?? geoLocation,
    };
  }

  return (
    <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-950">
      <ScanLogger publicToken={publicToken} />
      <div className="max-w-md mx-auto pt-8 space-y-6">
        {/* Calm lost banner — only when pet.status === 'lost'. Sits above the
            credential card. Intentionally low-saturation; the contact info
            below carries the urgency. */}
        {isLost && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-center">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Esta mascota está perdida
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Si la encontraste, contactá al dueño cuanto antes.
            </p>
          </div>
        )}

        {/* Tier 0+ emergency-info banner — owner-toggled. No PII beyond the
            banner text itself. No drug names, no owner name, no contact. */}
        {pet.emergencyInfoVisible && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-center">
            <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
              Esta mascota requiere atención médica
            </p>
            <p className="mt-0.5 text-xs text-rose-800 dark:text-rose-300">
              Por favor contactá al dueño escaneando el QR mientras la cuidás.
            </p>
          </div>
        )}

        {/* Credential header */}
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            DIM · Credencial digital
          </p>
          <p className="text-xs font-mono text-neutral-400 dark:text-neutral-600">
            {pet.publicToken}
          </p>
        </div>

        {/* Photo */}
        <div className="flex justify-center">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-44 h-44 rounded-2xl object-cover ring-4 ring-white dark:ring-neutral-900 shadow-lg"
            />
          ) : (
            <div className="w-44 h-44 rounded-2xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-5xl font-semibold text-neutral-400 dark:text-neutral-600 ring-4 ring-white dark:ring-neutral-900 shadow-lg">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Pet identity */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {speciesLabel(pet.species)}
            {pet.breed && ` · ${pet.breed}`} · {sexLabel(pet.sex)}
            {ageYears !== null && ` · ${ageYears} año${ageYears === 1 ? "" : "s"}`}
          </p>
        </div>

        {/* Status badges */}
        <div className="grid grid-cols-2 gap-3">
          <Badge
            label="Credencial"
            value={pet.status === "active" ? "Válida ✓" : statusLabel(pet.status)}
            tone={pet.status === "active" ? "good" : "warning"}
          />
          <Badge
            label="Vacunación"
            value={hasVaccinations ? "Con registros ✓" : "Sin registros"}
            tone={hasVaccinations ? "good" : "warning"}
          />
          <Badge label="Microchip" value={hasMicrochip ? "Sí" : "No"} />
          <Badge label="Estado" value={statusLabel(pet.status)} />
        </div>

        {/* Found / lost actions */}
        {isLost && lostContext ? (
          <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-5 space-y-4">
            {lostContext.ownerFirstName && (
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <span className="font-medium">Dueño:</span> {lostContext.ownerFirstName}
              </p>
            )}
            {lostContext.phone ? (
              <a
                href={`tel:${lostContext.phone}`}
                className="block w-full text-center px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
              >
                📞 Llamar al dueño · {lostContext.phone}
              </a>
            ) : (
              <FoundPetForm publicToken={publicToken} />
            )}
            {lostContext.lastKnownLocation && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-medium">Última ubicación conocida:</span>{" "}
                {lostContext.lastKnownLocation}
              </p>
            )}
          </div>
        ) : (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="text-center space-y-1">
              <p className="font-medium text-neutral-900 dark:text-neutral-50">
                ¿Encontraste a esta mascota?
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Avisale al dueño y devolvele su libreta digital.
              </p>
            </div>
            <FoundPetForm publicToken={publicToken} />
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-600">
          Documento de Identificación para Mascotas
        </p>
      </div>
    </main>
  );
}

function Badge({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warning" | "neutral";
}) {
  const toneClasses = {
    good: "text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900",
    warning:
      "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
    neutral:
      "text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800",
  };
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
