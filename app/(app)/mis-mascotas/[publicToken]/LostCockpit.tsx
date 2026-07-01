// LostCockpit — Libreta Nacional redesign (handoff §6).
//
// Emergency cockpit rendered when pet.status === 'lost'.
// Layout: red-gradient banner + "EXPEDIENTE ABIERTO" seal →
//   2-col grid:
//     left: Última vez visto card (map placeholder + caption) + scan feed
//     right: Compartir credencial (QR + URL + buttons) + Datos visibles (disclosure toggles)
//   footer: link to normal profile
//
// ALL DATA: unchanged — same server actions, same ScanFeedItem type, same prefs.
// ONLY presentation changes.

import { setPetDisclosurePrefsAction } from "@/app/actions/lost-mode";
import {
  type DisclosurePrefs,
  LostDisclosureCard,
} from "@/components/pet-profile/LostDisclosureCard";
import { LostLastSeenCard } from "@/components/pet-profile/LostLastSeenCard";
import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { LostShareCard } from "@/components/pet-profile/LostShareCard";
import { type PetHeroPet, PetProfileHero } from "@/components/pet-profile/PetProfileHero";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSeal } from "@/components/ui/DocElements";
import { LnStatusFlag } from "@/components/ui/StatusFlag";
import type { LostEpisode } from "@/lib/infra/lost-mode";
import { foundParticiple, lostThirdPersonPhrase } from "@/lib/utils/format";
import { setPetFoundAction } from "@/src/modules/events/actions";
import Image from "next/image";
import Link from "next/link";
import { MarkFoundButton } from "./MarkFoundButton";

type Props = {
  pet: {
    id: string;
    name: string;
    publicToken: string;
    sex: string | null;
    discloseFirstNameWhenLost: boolean;
    disclosePhoneWhenLost: boolean;
    discloseEmailWhenLost: boolean;
    discloseLastLocationWhenLost: boolean;
    allowFinderFormWhenLost: boolean;
  };
  petHeroProps: PetHeroPet;
  photoUrl: string | null;
  episode: LostEpisode | null;
  scans: ScanFeedItem[];
  ownerFirstName: string;
};

export async function LostCockpit({
  pet,
  petHeroProps,
  photoUrl,
  episode,
  scans,
  ownerFirstName,
}: Props) {
  const markFoundAction = setPetFoundAction.bind(null, pet.publicToken);
  const toggleAction = setPetDisclosurePrefsAction.bind(null, pet.publicToken);

  const prefs: DisclosurePrefs = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.ar"}/p/${pet.publicToken}`;
  const shareText = `🚨 ${pet.name} ${lostThirdPersonPhrase(pet.sex)}. Si la ves, por favor escanea su QR o contactanos.`;
  const posterHref = `/mis-mascotas/${pet.publicToken}/cartel`;
  const publicHref = `/p/${pet.publicToken}`;
  const editLastSeenHref = `/mis-mascotas/${pet.publicToken}/perdida`;
  const caseHref = episode ? `/casos/${episode.publicCode}` : `/mis-mascotas/${pet.publicToken}`;

  const sightingsCount = episode?.sightingsCount ?? 0;
  const scanCount = scans.filter((s) => s.kind === "scan").length;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      {/* Guilloché */}
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      {/* Sub-bar */}
      <div
        className="flex items-center gap-[10px] border-b border-[var(--color-ln-line)] px-[24px] py-[9px]"
        style={{ background: "var(--color-ln-card)" }}
      >
        <span className="font-[var(--font-ln-sans)] text-[13px] text-[var(--color-ln-ink-2)]">
          <Link
            href="/mis-mascotas"
            className="no-underline hover:underline"
            style={{ color: "var(--color-ln-mute)" }}
          >
            Mis mascotas
          </Link>
          {" › "}
          <span>{pet.name}</span>
          {" › "}
        </span>
        <LnStatusFlag status="lost" />
        {episode && (
          <span className="ml-auto font-[var(--font-ln-mono)] text-[11px] tracking-[.04em] text-[var(--color-ln-faint)]">
            {episode.publicCode} · /p/{pet.publicToken}
          </span>
        )}
      </div>

      <div className="mx-auto max-w-4xl px-[16px] py-[24px] pb-[48px] md:px-[32px]">
        {/* Back link */}
        <Link
          href="/mis-mascotas"
          className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
        >
          ← Mis mascotas
        </Link>

        {/* ---------------------------------------------------------------- */}
        {/* Emergency banner                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="relative mb-[20px] overflow-hidden rounded-[5px]"
          style={{
            background: "linear-gradient(135deg, #8f2417, #a23a2c)",
          }}
        >
          {/* Diagonal danger stripes */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(0,0,0,.14) 0 14px, transparent 14px 28px)",
            }}
          />

          {/* EXPEDIENTE ABIERTO rotated seal */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[18px] top-1/2 hidden -translate-y-1/2 md:block"
          >
            <div
              className="grid h-[80px] w-[80px] place-items-center rounded-full border-2 border-white/70 text-center font-[var(--font-ln-mono)] text-[7px] uppercase leading-[1.3] tracking-[.08em] text-white/70"
              style={{ transform: "rotate(-9deg)", opacity: 0.7 }}
            >
              <span>
                EXPEDIENTE
                <br />
                ABIERTO
              </span>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-[16px] px-[22px] py-[20px]">
            {/* Avatar */}
            <div className="relative h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-white/20">
              {photoUrl ? (
                <Image src={photoUrl} alt={pet.name} fill sizes="52px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-[var(--font-ln-serif)] text-[22px] font-bold text-white">
                  {pet.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Title + meta */}
            <div className="min-w-0 flex-1">
              <h2 className="m-0 font-[var(--font-ln-serif)] text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white">
                {pet.name} {lostThirdPersonPhrase(pet.sex)}
              </h2>
              <p className="mt-[3px] text-[12.5px] text-white/80">
                Credencial pública en modo emergencia
                {scanCount > 0 && ` · ${scanCount} escaneos`}
                {sightingsCount > 0 && ` · ${sightingsCount} avistamientos`}
              </p>
            </div>

            {/* Mark-found button — wrapped in MarkFoundButton for a lightweight
                confirm step (UX 3.5 item 7). */}
            <MarkFoundButton
              action={markFoundAction}
              label={`Marcar ${foundParticiple(pet.sex)}`}
            />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 2-col grid                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid gap-[20px] lg:grid-cols-[1fr_300px]">
          {/* LEFT column */}
          <div className="flex flex-col gap-[20px]">
            {/* Última vez visto */}
            {episode && (
              <LnCard>
                <LnCardHead
                  title="Última vez visto"
                  label={
                    <Link
                      href={editLastSeenHref}
                      className="text-[var(--color-ln-azul)] no-underline hover:underline"
                    >
                      actualizar
                    </Link>
                  }
                />
                <LostLastSeenCard
                  placeName={episode.placeName ?? "Ubicación no especificada"}
                  localityLabel={episode.jurisdictionLocality ?? "—"}
                  at={episode.openedAt}
                  note={episode.ownerNote}
                  editHref={editLastSeenHref}
                  publicUrl={publicUrl}
                  sightingsCount={episode.sightingsCount}
                  lastSeenLat={episode.lastSeenLat}
                  lastSeenLng={episode.lastSeenLng}
                />
              </LnCard>
            )}

            {/* Avistamientos y escaneos */}
            <LnCard>
              <LnCardHead
                title="Avistamientos y escaneos"
                label={
                  <span style={{ color: "var(--color-ln-seal)" }}>
                    {sightingsCount + scanCount} total
                    {scans.some((s) => s.kind === "sighting" && !("seen" in s)) && " · nuevos"}
                  </span>
                }
              />
              <LnCardBody>
                <LostScanFeed
                  items={scans}
                  totalScans={scanCount}
                  totalSightings={episode?.sightingsCount ?? 0}
                  caseHref={caseHref}
                />
              </LnCardBody>
            </LnCard>
          </div>

          {/* RIGHT column */}
          <div className="flex flex-col gap-[20px]">
            {/* Compartir credencial */}
            <LnCard>
              <LnCardHead title="Compartir credencial" />
              <LnCardBody>
                <LostShareCard
                  publicUrl={publicUrl}
                  shareText={shareText}
                  posterHref={posterHref}
                />
              </LnCardBody>
            </LnCard>

            {/* Datos visibles */}
            <LnCard>
              <LnCardHead title="Datos visibles" />
              <LnCardBody>
                <LostDisclosureCard
                  prefs={prefs}
                  toggleAction={toggleAction}
                  publicHref={publicHref}
                  ownerFirstName={ownerFirstName}
                />
              </LnCardBody>
            </LnCard>
          </div>
        </div>

        {/* Footer — the cockpit is the priority while lost, but it is NOT a
              dead end (v2.1, spec §3 D9): the owner keeps full access to the
              normal profile to log events / view the libreta. We surface both
              the public credential (what a finder sees) and a link back to the
              full profile. */}
        <div className="mt-[24px] flex flex-col items-center gap-[6px] text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-[16px] gap-y-[6px]">
            <Link
              href={`/mis-mascotas/${pet.publicToken}?fromLost=1`}
              data-section="full-profile-link"
              className="font-[var(--font-ln-sans)] text-[13px] font-semibold text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              Ver perfil completo →
            </Link>
            <Link
              href={publicHref}
              className="font-[var(--font-ln-sans)] text-[13px] font-semibold text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              Ver credencial pública →
            </Link>
          </div>
          <p className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
            Seguís pudiendo registrar eventos y ver la libreta. Cuando lo marques como{" "}
            {foundParticiple(pet.sex)} volvés acá automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
