import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Script from "next/script";

import { Icon } from "@/components/Icon";
import { attachments, db, organizations, ownerships, petEvents, pets } from "@/db";
import { ageBucketLabel, energyLabel, sizeLabel } from "@/lib/infra/adoption-listing";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { petPhotoUrl } from "@/lib/infra/storage";
import {
  type PermanentCondition,
  isPermanentCondition,
  permanentConditionLabel,
} from "@/lib/reference/permanent-conditions";
import { createClient } from "@/lib/supabase/server";
import { sexLabel, speciesLabel } from "@/lib/utils/format";
import { serializeJsonLd } from "@/lib/utils/json-ld";
import { and, desc, eq, isNull } from "drizzle-orm";

import { AdoptionShareRow } from "./AdoptionShareRow";
import { ApplyButton } from "./ApplyButton";

const SITE_URL = resolveSiteUrl();

// Individual adoption ficha — mirrors the listing-visibility guards so a
// pet that's gone unlisted, paused, fell into a custody dispute, etc.,
// returns 404 instead of leaking. The exception (D7.2) is a gentle
// "ya fue adoptada" message when the pet has a recent adoption_finalized
// event, instead of a cold 404.
//
// Cache policy: ALWAYS LIVE. force-dynamic + `Cache-Control: no-store` (stamped
// in middleware for the /adoptar subtree — see lib/infra/public-cache-policy.ts)
// so an unlisted/paused/adopted pet stops resolving to the public ficha promptly.
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

  // Paused by org — soft "no disponible" screen instead of 404 so a visitor
  // with a stale share link gets a meaningful message (spec §2.1 CTA variants).
  // Mirrors EVERY isListable suppression guard except the pause itself:
  // custody disputes and rabies observations must keep returning 404, and a
  // recent finalization wins over the paused view (spec D7.2).
  const isPausedByOrg =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt !== null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified &&
    (org.orgType === "shelter" || org.orgType === "rescue_network");

  // Same listability guards as queryAdoptionListing. If any fails, fall
  // through to recently-adopted, then paused, else 404.
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
    if (isPausedByOrg) {
      return <PausedView name={pet.name} orgName={org.displayName} />;
    }
    notFound();
  }

  // Auth check — to surface the correct CTA label for anonymous visitors.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = user !== null;

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
  const canonicalIds = await fetchActiveIdentifications(pet.id);
  const hasMicrochip = canonicalIds.microchip !== null;
  const microchipMasked = canonicalIds.microchip
    ? `••••${canonicalIds.microchip.code.slice(-4)}`
    : null;

  const facts: string[] = [];
  if (pet.adoptionAgeBucket) facts.push(ageBucketLabel(pet.adoptionAgeBucket, pet.sex));
  if (pet.adoptionSizeEstimate) facts.push(sizeLabel(pet.adoptionSizeEstimate));
  if (pet.adoptionEnergyLevel) facts.push(energyLabel(pet.adoptionEnergyLevel, pet.sex));

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

  // Per-request CSP nonce (set by middleware, Item #64) so this inline JSON-LD
  // script is allowed under script-src 'nonce-…' / 'strict-dynamic'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <main
      className="min-h-screen pb-32 md:pb-10"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      <Script
        id="adoptar-jsonld"
        type="application/ld+json"
        nonce={nonce}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SEO JSON-LD needs raw <script> content; serializeJsonLd() neutralises <, >, & and U+2028/U+2029 so user-supplied pet fields (name, adoptionStory) cannot break out of the script.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {/* Guilloché accent bar */}
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      <div className="max-w-3xl mx-auto px-6 py-7 space-y-[18px]">
        {/* Back link — mono eyebrow style */}
        <Link
          href="/adoptar"
          className="inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] no-underline hover:text-[var(--color-ln-ink-2)]"
          style={{ color: "var(--color-ln-mute)" }}
        >
          ← Volver al listado
        </Link>

        {/* Gallery */}
        {galleryUrls.length > 0 ? (
          <div className="space-y-[8px]">
            {/* Hero — 4:3 aspect ratio */}
            <div
              className="relative overflow-hidden rounded-[var(--radius-input)] border"
              style={{
                aspectRatio: "4/3",
                borderColor: "var(--color-ln-line)",
                background: "repeating-linear-gradient(135deg,#e7e2d6 0 12px,#f1eee5 12px 24px)",
              }}
            >
              <Image
                src={galleryUrls[0]}
                alt={pet.name}
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover"
                priority
              />
              {/* "En adopción" status chip */}
              <span
                className="absolute top-[12px] left-[12px] inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-sm font-semibold"
                style={{
                  background: "var(--color-ln-ok-050)",
                  color: "var(--color-ln-ok)",
                  borderColor: "var(--color-ln-ok-100)",
                  boxShadow: "0 2px 6px rgba(0,0,0,.08)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full"
                  style={{ background: "var(--color-ln-ok)" }}
                />
                En adopción
              </span>
              {/* Health rollup chips overlay */}
              <div className="absolute bottom-[12px] left-[12px] flex gap-1.5 flex-wrap">
                {hasVaccinations && (
                  <span
                    className="inline-flex items-center gap-[5px] rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: "rgba(255,255,255,.95)", color: "var(--color-ln-ink)" }}
                  >
                    <Icon name="check" size="sm" decorative /> Vacunas al día
                  </span>
                )}
                {isSterilized && (
                  <span
                    className="inline-flex items-center gap-[5px] rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: "rgba(255,255,255,.95)", color: "var(--color-ln-ink)" }}
                  >
                    <Icon name="check" size="sm" decorative /> Castrada
                  </span>
                )}
                {hasMicrochip && (
                  <span
                    className="inline-flex items-center gap-[5px] rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: "rgba(255,255,255,.95)",
                      color: "var(--color-ln-azul)",
                    }}
                  >
                    Con chip
                  </span>
                )}
              </div>
            </div>
            {/* Thumbnails row */}
            {galleryUrls.length > 1 && (
              <div className="grid grid-cols-4 gap-1.5">
                {galleryUrls.slice(1, 5).map((url, idx) => (
                  <div
                    key={url}
                    className="overflow-hidden rounded-[var(--radius-md)] border"
                    style={{
                      aspectRatio: "1/1",
                      borderColor: idx === 0 ? "var(--color-ln-azul)" : "var(--color-ln-line)",
                      borderWidth: idx === 0 ? "2px" : "1px",
                    }}
                  >
                    <img
                      src={url}
                      alt={`${pet.name} foto ${idx + 2}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-[var(--radius-input)] border flex items-center justify-center"
            style={{
              aspectRatio: "4/3",
              maxWidth: 480,
              borderColor: "var(--color-ln-line)",
              background: "repeating-linear-gradient(135deg,#e7e2d6 0 12px,#f1eee5 12px 24px)",
            }}
          >
            <span
              className="font-[var(--font-ln-serif)] text-[72px] font-semibold"
              style={{ color: "var(--color-ln-mute)" }}
            >
              {pet.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Identity card */}
        <div
          className="rounded-[var(--radius-lg)] border px-[22px] py-5"
          style={{
            background: "var(--color-ln-card)",
            borderColor: "var(--color-ln-line)",
          }}
        >
          <h1
            className="m-0 font-[var(--font-ln-serif)] font-semibold leading-[1.04] tracking-[-0.025em]"
            style={{ fontSize: 34, color: "var(--color-ln-ink)" }}
          >
            {pet.name}
          </h1>
          {pet.breed && (
            <p
              className="mt-1 mb-2.5 text-md font-medium"
              style={{ color: "var(--color-ln-ink-2)" }}
            >
              {pet.breed}
            </p>
          )}
          {/* Meta chips */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className="rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm"
              style={{
                color: "var(--color-ln-ink-2)",
                background: "var(--color-ln-stripe)",
                borderColor: "var(--color-ln-line-2)",
              }}
            >
              {speciesLabel(pet.species)}
            </span>
            <span
              className="rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm"
              style={{
                color: "var(--color-ln-ink-2)",
                background: "var(--color-ln-stripe)",
                borderColor: "var(--color-ln-line-2)",
              }}
            >
              {sexLabel(pet.sex)}
            </span>
            {facts.map((f) => (
              <span
                key={f}
                className="rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm"
                style={{
                  color: "var(--color-ln-ink-2)",
                  background: "var(--color-ln-stripe)",
                  borderColor: "var(--color-ln-line-2)",
                }}
              >
                {f}
              </span>
            ))}
          </div>
          {(pet.color || pet.distinguishingFeatures) && (
            <p className="mt-2.5 text-sm" style={{ color: "var(--color-ln-mute)" }}>
              {[pet.color, pet.distinguishingFeatures].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Story — accent left-border card */}
        {pet.adoptionStory && (
          <div
            className="rounded-[var(--radius-lg)] border border-l-[3px] px-5 py-[18px]"
            style={{
              background: "var(--color-ln-card)",
              borderColor: "var(--color-ln-line)",
              borderLeftColor: "var(--color-ln-azul)",
            }}
          >
            <p
              className="mb-1.5 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.12em]"
              style={{ color: "var(--color-ln-mute)" }}
            >
              Su historia
            </p>
            <h2
              className="m-0 mb-3 font-[var(--font-ln-serif)] font-semibold text-lg tracking-[-0.01em]"
              style={{ color: "var(--color-ln-ink)" }}
            >
              Sobre {pet.name}
            </h2>
            <p
              className="m-0 text-md leading-[1.6] whitespace-pre-wrap"
              style={{ color: "var(--color-ln-ink-2)" }}
            >
              {pet.adoptionStory}
            </p>
          </div>
        )}

        {/* Health section */}
        <div
          className="rounded-[var(--radius-lg)] border px-5 py-[18px]"
          style={{ background: "var(--color-ln-card)", borderColor: "var(--color-ln-line)" }}
        >
          <p
            className="mb-1.5 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.12em]"
            style={{ color: "var(--color-ln-mute)" }}
          >
            Estado médico
          </p>
          <h2
            className="m-0 mb-3.5 font-[var(--font-ln-serif)] font-semibold text-lg tracking-[-0.01em]"
            style={{ color: "var(--color-ln-ink)" }}
          >
            Salud
          </h2>
          <ul
            className="grid grid-cols-1 sm:grid-cols-2 gap-1"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            <HealthRow label="Vacunación al día" ok={hasVaccinations} />
            <HealthRow
              label="Castración"
              ok={isSterilized}
              detail={isSterilized ? undefined : undefined}
            />
            <HealthRow
              label="Microchip MiMAR"
              ok={hasMicrochip}
              detail={microchipMasked ?? undefined}
            />
          </ul>
          <p className="mt-3.5 text-sm" style={{ color: "var(--color-ln-mute)" }}>
            El detalle clínico completo se comparte al finalizar la adopción.
          </p>
        </div>

        {/* Requirements + convivencia */}
        {(pet.adoptionRequirements || convivencia.some((c) => c.value !== null)) && (
          <div
            className="rounded-[var(--radius-lg)] border px-5 py-[18px]"
            style={{ background: "var(--color-ln-card)", borderColor: "var(--color-ln-line)" }}
          >
            <p
              className="mb-1.5 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.12em]"
              style={{ color: "var(--color-ln-mute)" }}
            >
              Cómo es en el día a día
            </p>
            <h2
              className="m-0 mb-3 font-[var(--font-ln-serif)] font-semibold text-lg tracking-[-0.01em]"
              style={{ color: "var(--color-ln-ink)" }}
            >
              Qué necesita su nuevo hogar
            </h2>
            {pet.adoptionRequirements && (
              <p
                className="mb-3 text-md leading-[1.6] whitespace-pre-wrap"
                style={{ color: "var(--color-ln-ink-2)" }}
              >
                {pet.adoptionRequirements}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {convivencia
                .filter((c) => c.value !== null)
                .map((c) => (
                  <ConvivenciaChip key={c.label} label={c.label} value={c.value} />
                ))}
            </div>
          </div>
        )}

        {/* Permanent conditions */}
        {pet.discloseConditionsPublicly && pet.permanentConditions.length > 0 && (
          <div
            className="rounded-[var(--radius-lg)] border px-5 py-[18px]"
            style={{ background: "var(--color-ln-card)", borderColor: "var(--color-ln-line)" }}
          >
            <p
              className="mb-1.5 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.12em]"
              style={{ color: "var(--color-ln-mute)" }}
            >
              A tener en cuenta
            </p>
            <h2
              className="m-0 mb-2 font-[var(--font-ln-serif)] font-semibold text-lg tracking-[-0.01em]"
              style={{ color: "var(--color-ln-ink)" }}
            >
              Necesidades especiales
            </h2>
            <p className="mb-3 text-sm" style={{ color: "var(--color-ln-mute)" }}>
              {pet.name} convive con condiciones permanentes que es importante que conozcas antes de
              postularte. El refugio puede contarte cómo cuidarla.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pet.permanentConditions
                .filter(isPermanentCondition)
                .map((code: PermanentCondition) => (
                  <span
                    key={code}
                    className="inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold"
                    style={{
                      background: "var(--color-ln-celeste-050)",
                      color: "var(--color-ln-azul-700)",
                      borderColor: "var(--color-ln-celeste-100)",
                    }}
                  >
                    {permanentConditionLabel(code)}
                  </span>
                ))}
            </div>
            {pet.permanentConditions.includes("otra") && pet.permanentConditionsOther && (
              <p className="mt-2.5 text-[13px] italic" style={{ color: "var(--color-ln-ink-2)" }}>
                {pet.permanentConditionsOther}
              </p>
            )}
          </div>
        )}

        {/* Shelter */}
        <div
          className="rounded-[var(--radius-lg)] border px-5 py-[18px]"
          style={{ background: "var(--color-ln-card)", borderColor: "var(--color-ln-line)" }}
        >
          <p
            className="mb-1.5 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.12em]"
            style={{ color: "var(--color-ln-mute)" }}
          >
            Refugio responsable
          </p>
          <div className="flex items-flex-start gap-3.5">
            <div
              className="flex-shrink-0 w-[56px] h-[56px] rounded-[var(--radius-lg)] grid place-items-center font-[var(--font-ln-serif)] text-2xl font-semibold text-white"
              style={{ background: "var(--color-ln-azul)" }}
            >
              {org.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p
                className="font-[var(--font-ln-serif)] text-[17px] font-semibold"
                style={{ color: "var(--color-ln-ink)" }}
              >
                {org.displayName}
              </p>
              {(org.jurisdictionLocality || org.jurisdictionProvince) && (
                <p className="mt-1 text-sm" style={{ color: "var(--color-ln-mute)" }}>
                  {[org.jurisdictionLocality, org.jurisdictionProvince].filter(Boolean).join(", ")}
                </p>
              )}
              <p
                className="mt-1.5 font-[var(--font-ln-mono)] text-[11px]"
                style={{ color: "var(--color-ln-mute)" }}
              >
                En custodia desde{" "}
                {new Date(row.ownerStartedAt).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <Link
                href={`/refugios/${org.publicToken}`}
                className="mt-2 inline-block text-sm font-semibold no-underline hover:underline"
                style={{ color: "var(--color-ln-azul)" }}
              >
                Ver perfil del refugio →
              </Link>
            </div>
          </div>
        </div>

        {/* Share row — WhatsApp + copy link */}
        <AdoptionShareRow fichaUrl={`${SITE_URL}/adoptar/${petToken}`} petName={pet.name} />

        {/* Fee */}
        {pet.adoptionFeeArs != null && pet.adoptionFeeArs > 0 && (
          <div
            className="rounded-[var(--radius-lg)] border px-5 py-4 space-y-[4px]"
            style={{
              background: "var(--color-ln-stripe)",
              borderColor: "var(--color-ln-line-2)",
            }}
          >
            <p className="text-md font-semibold" style={{ color: "var(--color-ln-ink)" }}>
              Adopción solidaria: ${pet.adoptionFeeArs.toLocaleString("es-AR")}
            </p>
            <p className="text-sm" style={{ color: "var(--color-ln-mute)" }}>
              Este aporte ayuda al refugio a cubrir vacunación, castración y atención veterinaria.
            </p>
          </div>
        )}

        {/* CTA — sticky on mobile, inline on desktop */}
        <section>
          <ApplyButton petToken={petToken} petName={pet.name} isAuthenticated={isAuthenticated} />
        </section>
      </div>
    </main>
  );
}

function HealthRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <li className="grid gap-2.5 py-2" style={{ gridTemplateColumns: "22px 1fr" }}>
      <span
        className="w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0"
        style={
          ok
            ? { background: "#dff5e3", color: "#1f7a3a" }
            : { background: "#fdecec", color: "#9c2b1d" }
        }
      >
        {ok ? <Icon name="check" size="sm" decorative /> : "—"}
      </span>
      <div>
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-ln-ink)" }}>
          {label}
        </span>
        {detail && (
          <span className="block text-[11px]" style={{ color: "var(--color-ln-mute)" }}>
            {detail}
          </span>
        )}
      </div>
    </li>
  );
}

function ConvivenciaChip({ label, value }: { label: string; value: boolean | null }) {
  if (value === null) return null;
  const tone = value === true ? "pos" : "warn";
  const style =
    tone === "pos"
      ? { background: "#e9f6ec", color: "#1e6f33", borderColor: "#bfe0c9" }
      : { background: "#fff4d6", color: "#8a5e00", borderColor: "#ffe39c" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold"
      style={style}
    >
      {value ? (
        <Icon name="check" size="sm" decorative />
      ) : (
        <Icon name="close" size="sm" decorative />
      )}
      {label}
    </span>
  );
}

function RecentlyAdopted({ name }: { name: string }) {
  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-[16px]">
        <h1
          className="font-[var(--font-ln-serif)] font-semibold text-[30px] tracking-[-0.02em]"
          style={{ color: "var(--color-ln-ink)" }}
        >
          ¡{name} ya encontró su hogar!
        </h1>
        <p className="text-md" style={{ color: "var(--color-ln-ink-2)" }}>
          Esta mascota fue adoptada hace pocos días. Hay muchas otras buscando su familia.
        </p>
        <Link
          href="/adoptar"
          className="inline-block px-5 py-[11px] rounded-[5px] text-[13px] font-semibold text-white no-underline"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Ver otras en adopción
        </Link>
      </div>
    </main>
  );
}

function PausedView({ name, orgName }: { name: string; orgName: string }) {
  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-[16px]">
        <div
          className="inline-block rounded-full px-4 py-[7px] text-[13px] font-semibold"
          style={{
            background: "var(--color-ln-warn-050)",
            color: "var(--color-ln-warn)",
            border: "1px solid var(--color-ln-warn-100)",
          }}
        >
          No disponible por ahora
        </div>
        <h1
          className="font-[var(--font-ln-serif)] font-semibold text-[28px] tracking-[-0.02em]"
          style={{ color: "var(--color-ln-ink)" }}
        >
          {name} no está disponible en este momento
        </h1>
        <p className="text-md" style={{ color: "var(--color-ln-ink-2)" }}>
          {orgName} pausó temporalmente la adopción de {name}. Podés volver más adelante o explorar
          otras mascotas en adopción.
        </p>
        <Link
          href="/adoptar"
          className="inline-block px-5 py-[11px] rounded-[5px] text-[13px] font-semibold text-white no-underline"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Ver otras en adopción
        </Link>
      </div>
    </main>
  );
}
