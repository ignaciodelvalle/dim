import Link from "next/link";
import { notFound } from "next/navigation";
import Script from "next/script";

import { attachments, db, organizations, ownerships, petEvents, pets } from "@/db";
import { ageBucketLabel, energyLabel, sizeLabel } from "@/lib/adoption-listing";
import { sexLabel, speciesLabel } from "@/lib/format";
import {
  type PermanentCondition,
  isPermanentCondition,
  permanentConditionLabel,
} from "@/lib/permanent-conditions";
import { petPhotoUrl } from "@/lib/storage";
import { and, desc, eq, isNull } from "drizzle-orm";

import { ApplyButton } from "./ApplyButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mimar.gob.ar";

// Individual adoption ficha — mirrors the listing-visibility guards so a
// pet that's gone unlisted, paused, fell into a custody dispute, etc.,
// returns 404 instead of leaking. The exception (D7.2) is a gentle
// "ya fue adoptada" message when the pet has a recent adoption_finalized
// event, instead of a cold 404.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ petToken: string }>;
}) {
  const { petToken } = await params;
  const [row] = await db
    .select({
      name: pets.name,
      species: pets.species,
      story: pets.adoptionStory,
      jurisdictionLocality: pets.jurisdictionLocality,
      primaryPhotoStoragePath: attachments.storagePath,
    })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, petToken))
    .limit(1);
  if (!row) return { title: "Adopción — MiMAR" };
  const title = `Adoptá a ${row.name} — MiMAR`;
  const desc =
    row.story?.slice(0, 150) ??
    `Conocé a ${row.name}, ${speciesLabel(row.species).toLowerCase()} en adopción${
      row.jurisdictionLocality ? ` en ${row.jurisdictionLocality}` : ""
    }.`;
  const ogImage = petPhotoUrl(row.primaryPhotoStoragePath) ?? undefined;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, images: ogImage ? [ogImage] : [] },
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdoptarFichaPage({
  params,
}: {
  params: Promise<{ petToken: string }>;
}) {
  const { petToken } = await params;

  const [row] = await db
    .select({
      pet: pets,
      org: organizations,
      ownerStartedAt: ownerships.startedAt,
      primaryPhotoStoragePath: attachments.storagePath,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, petToken))
    .limit(1);

  // No row at all → 404. We don't differentiate "doesn't exist" vs "exists
  // under a non-shelter ownership" because either way it's not a public
  // adoption surface.
  if (!row) notFound();
  const { pet, org } = row;

  // D7.2 — if a recent adoption_finalized exists, render a soft "ya
  // encontró hogar" instead of 404. Captures the case of someone clicking
  // a stale share link.
  const [recentFinalize] = await db
    .select({ recordedAt: petEvents.recordedAt })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "adoption_finalized")))
    .orderBy(desc(petEvents.recordedAt))
    .limit(1);
  const recentlyAdopted =
    recentFinalize && Date.now() - recentFinalize.recordedAt.getTime() < SEVEN_DAYS_MS;

  // Same listability guards as queryAdoptionListing. If any fails, fall
  // through to the recently-adopted screen when applicable, else 404.
  const isListable =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt === null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified &&
    (org.orgType === "shelter" || org.orgType === "rescue_network");

  if (!isListable) {
    if (recentlyAdopted) {
      return <RecentlyAdopted name={pet.name} />;
    }
    notFound();
  }

  const photoUrl = petPhotoUrl(row.primaryPhotoStoragePath);

  // Gallery: any additional pet-scoped attachments that aren't the primary.
  // We don't sign these URLs — pet-photos bucket is public per the v1 setup.
  const extraPhotos = await db
    .select({ id: attachments.id, storagePath: attachments.storagePath })
    .from(attachments)
    .where(and(eq(attachments.petId, pet.id), isNull(attachments.eventId)))
    .limit(8);
  const galleryUrls = [photoUrl, ...extraPhotos.map((a) => petPhotoUrl(a.storagePath))]
    .filter((u): u is string => u !== null)
    .filter((u, i, arr) => arr.indexOf(u) === i);

  // Health rollup — booleans only; the full libreta is not exposed on the
  // adoption ficha.
  const [vaccinationsRow] = await db
    .select({ count: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
    .limit(1);
  const hasVaccinations = Boolean(vaccinationsRow);
  const [sterilizationRow] = await db
    .select({ count: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "sterilization_performed")))
    .limit(1);
  const isSterilized = Boolean(sterilizationRow);
  const hasMicrochip = Boolean(pet.microchipId);
  const microchipMasked = pet.microchipId ? `••••${pet.microchipId.slice(-4)}` : null;

  const facts: string[] = [];
  if (pet.adoptionAgeBucket) facts.push(ageBucketLabel(pet.adoptionAgeBucket, pet.sex));
  if (pet.adoptionSizeEstimate) facts.push(sizeLabel(pet.adoptionSizeEstimate));
  if (pet.adoptionEnergyLevel) facts.push(energyLabel(pet.adoptionEnergyLevel));

  const convivencia: Array<{ label: string; value: boolean | null }> = [
    { label: "Con chicos", value: pet.adoptionGoodWithKids },
    { label: "Con otros perros", value: pet.adoptionGoodWithDogs },
    { label: "Con gatos", value: pet.adoptionGoodWithCats },
    { label: "Necesita patio", value: pet.adoptionNeedsYard },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Animal",
    name: pet.name,
    description:
      pet.adoptionStory ??
      `Conocé a ${pet.name}, ${speciesLabel(pet.species).toLowerCase()} en adopción${
        pet.jurisdictionLocality ? ` en ${pet.jurisdictionLocality}` : ""
      }.`,
    image: petPhotoUrl(row.primaryPhotoStoragePath) ?? undefined,
    additionalType: speciesLabel(pet.species),
    gender: sexLabel(pet.sex),
    url: `${SITE_URL}/adoptar/${petToken}`,
  };

  return (
    <main className="bg-white">
      <Script
        id="adoptar-jsonld"
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SEO JSON-LD needs raw <script> content. The input is JSON.stringify of a controlled object, not user data.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-4xl mx-auto px-6 py-10 pb-32 md:pb-10 space-y-8">
        <Link href="/adoptar" className="text-sm text-gob-text-muted hover:text-gob-text">
          ← Volver a /adoptar
        </Link>

        {/* Gallery */}
        {galleryUrls.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="aspect-square rounded-xl overflow-hidden bg-gob-surface-alt md:col-span-2 md:row-span-2">
              <img src={galleryUrls[0]} alt={pet.name} className="w-full h-full object-cover" />
            </div>
            {galleryUrls.slice(1, 5).map((url) => (
              <div
                key={url}
                className="aspect-square rounded-lg overflow-hidden bg-gob-surface-alt"
              >
                <img src={url} alt={`${pet.name} foto`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="aspect-square max-w-md rounded-xl bg-gob-surface-alt flex items-center justify-center text-6xl text-gob-text-muted">
            {pet.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Identity */}
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-gob-text">{pet.name}</h1>
          <p className="text-sm text-gob-text-gray">
            {speciesLabel(pet.species)}
            {pet.breed && ` · ${pet.breed}`} · {sexLabel(pet.sex)}
            {facts.length > 0 && ` · ${facts.join(" · ")}`}
          </p>
          {(pet.color || pet.distinguishingFeatures) && (
            <p className="text-xs text-gob-text-muted">
              {[pet.color, pet.distinguishingFeatures].filter(Boolean).join(" · ")}
            </p>
          )}
        </header>

        {/* Shelter */}
        <section className="rounded-lg border border-gob-border p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            Refugio responsable
          </p>
          <p className="text-sm font-medium text-gob-text">{org.displayName}</p>
          {(org.jurisdictionLocality || org.jurisdictionProvince) && (
            <p className="text-xs text-gob-text-gray">
              {[org.jurisdictionLocality, org.jurisdictionProvince].filter(Boolean).join(", ")}
            </p>
          )}
          <p className="text-[11px] text-gob-text-muted pt-1">
            En custodia desde{" "}
            {new Date(row.ownerStartedAt).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </section>

        {/* Story */}
        {pet.adoptionStory && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gob-text">La historia de {pet.name}</h2>
            <p className="text-sm text-gob-text-gray whitespace-pre-wrap leading-relaxed">
              {pet.adoptionStory}
            </p>
          </section>
        )}

        {/* Requirements + convivencia */}
        {(pet.adoptionRequirements || convivencia.some((c) => c.value !== null)) && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gob-text">Qué necesita su nuevo hogar</h2>
            {pet.adoptionRequirements && (
              <p className="text-sm text-gob-text-gray whitespace-pre-wrap">
                {pet.adoptionRequirements}
              </p>
            )}
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {convivencia.map((c) => (
                <li key={c.label} className="flex items-baseline gap-2">
                  <span className="text-gob-text-muted">{c.label}:</span>
                  <span
                    className={
                      c.value === true
                        ? "text-gob-success font-medium"
                        : c.value === false
                          ? "text-gob-text-gray"
                          : "text-gob-text-muted"
                    }
                  >
                    {c.value === true ? "Sí" : c.value === false ? "No" : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Permanent conditions — only if the caregiver opted to disclose */}
        {pet.discloseConditionsPublicly && pet.permanentConditions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-gob-text">Necesidades especiales</h2>
            <p className="text-xs text-gob-text-gray">
              {pet.name} convive con condiciones permanentes que es importante que conozcas antes de
              postularte. El refugio puede contarte cómo cuidarla.
            </p>
            <ul className="flex flex-wrap gap-2">
              {pet.permanentConditions
                .filter(isPermanentCondition)
                .map((code: PermanentCondition) => (
                  <li
                    key={code}
                    className="text-sm font-medium px-3 py-1 rounded-full bg-indigo-100 text-indigo-900"
                  >
                    {permanentConditionLabel(code)}
                  </li>
                ))}
            </ul>
            {pet.permanentConditions.includes("otra") && pet.permanentConditionsOther && (
              <p className="text-sm text-gob-text-gray">{pet.permanentConditionsOther}</p>
            )}
          </section>
        )}

        {/* Health rollup */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gob-text">Salud</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <HealthBadge label="Vacunación" ok={hasVaccinations} />
            <HealthBadge label="Castración" ok={isSterilized} />
            <HealthBadge
              label="Microchip"
              ok={hasMicrochip}
              detail={microchipMasked ?? undefined}
            />
          </ul>
          <p className="text-xs text-gob-text-muted pt-1">
            El detalle clínico completo se comparte al finalizar la adopción.
          </p>
        </section>

        {/* Fee */}
        {pet.adoptionFeeArs != null && pet.adoptionFeeArs > 0 && (
          <section className="rounded-lg border border-gob-border p-4 space-y-1">
            <p className="text-sm font-medium text-gob-text">
              Adopción solidaria: ${pet.adoptionFeeArs.toLocaleString("es-AR")}
            </p>
            <p className="text-xs text-gob-text-gray">
              Este aporte ayuda al refugio a cubrir vacunación, castración y atención veterinaria.
            </p>
          </section>
        )}

        {/* CTA */}
        <section className="rounded-xl border-2 border-gob-success/30 bg-gob-success/10 p-6 space-y-3">
          <ApplyButton petToken={petToken} petName={pet.name} />
          <p className="text-xs text-gob-text text-center">
            Tu postulación inicia un proceso con {org.displayName}. Ellos coordinan visita,
            evaluación y, si todo encaja, la finalización de la adopción.
          </p>
        </section>
      </div>
    </main>
  );
}

function HealthBadge({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <li className="rounded-lg border border-gob-border px-3 py-2 flex items-baseline justify-between gap-2">
      <span className="text-xs text-gob-text-muted">{label}</span>
      <span className={`text-sm font-medium ${ok ? "text-gob-success" : "text-gob-text-muted"}`}>
        {ok ? `Sí${detail ? ` · ${detail}` : ""}` : "—"}
      </span>
    </li>
  );
}

function RecentlyAdopted({ name }: { name: string }) {
  return (
    <main className="bg-white">
      <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
        <p className="text-6xl">🎉</p>
        <h1 className="text-3xl font-semibold text-gob-text">¡{name} ya encontró su hogar!</h1>
        <p className="text-sm text-gob-text-gray">
          Esta mascota fue adoptada hace pocos días. Hay muchas otras buscando su familia.
        </p>
        <Link
          href="/adoptar"
          className="inline-block px-5 py-2.5 rounded-lg bg-gob-primary text-white text-sm font-medium"
        >
          Ver otras en adopción
        </Link>
      </div>
    </main>
  );
}
