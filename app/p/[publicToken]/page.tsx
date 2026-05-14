// Public credential page — Tier 0 view. Visible to anyone with the URL or QR.
// Exposes the minimum needed to confirm "this is a real registered pet" plus
// a way to contact the owner (placeholder for now).
//
// Privacy posture: NO owner PII (name, phone, email), NO microchip number, NO
// medical details, NO scan history. See AGENTS.md → "Privacy tiers".

import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { attachments, db, petEvents, pets } from "@/db";
import { sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
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
    .where(
      and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")),
    );
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

  return (
    <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-950">
      <ScanLogger publicToken={publicToken} />
      <div className="max-w-md mx-auto pt-8 space-y-8">
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
            // biome-ignore lint/performance/noImgElement: switch to next/image later
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
        {isLost ? (
          <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 text-center space-y-2">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Esta mascota está marcada como perdida.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Si la encontraste, por favor contactá al dueño.
            </p>
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Próximamente"
            >
              Contactar al dueño (próximamente)
            </button>
          </div>
        ) : (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 text-center space-y-3">
            <p className="font-medium text-neutral-900 dark:text-neutral-50">
              ¿Encontraste a esta mascota?
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Avisale al dueño y devolvele su libreta digital.
            </p>
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Próximamente"
            >
              Avisar al dueño (próximamente)
            </button>
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
