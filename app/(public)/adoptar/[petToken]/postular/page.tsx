import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { and, eq, isNull, sql } from "drizzle-orm";

import { attachments, db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import {
  APPLY_INTENT_COOKIE_NAME,
  APPLY_INTENT_PET_TOKEN_COOKIE_NAME,
  validateApplyIntentToken,
} from "@/lib/domain/apply-intent";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

import { ApplicationForm } from "./ApplicationForm";

// Gate page for the adoption application form (spec
// adoption-listing-public §8 + Fase 5). Five checks run in order:
//
//   1. Auth — anonymous → redirect to /login with returnTo so the loop
//      survives expired sessions.
//   2. Institutional reject — admin/govt cannot adopt; render a clear
//      message instead of a 403.
//   3. Listability — same predicate as queryAdoptionListing / ficha page /
//      startApplyIntentAction. If the pet went off-listing between CTA
//      and arrival, surface a friendly notice rather than 404'ing.
//   4. Apply-intent cookie — optional. Verify (signed against the
//      petToken so a pet-A cookie can't open pet-B's form), then clear.
//   5. Idempotency — if the applicant already has an unresolved
//      `_submitted` for this pet, render the "ya postulaste" message
//      instead of letting them re-submit. The submit action also blocks
//      double-writes, but checking here gives a clean UX.

export const dynamic = "force-dynamic";

export default async function PostularPage({
  params,
}: {
  params: Promise<{ petToken: string }>;
}) {
  const { petToken } = await params;
  const returnTo = `/adoptar/${petToken}/postular`;

  // 1) Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?intent=apply&returnTo=${encodeURIComponent(returnTo)}`);
  }

  // 2) Institutional reject.
  const [profile] = await db
    .select({
      accountType: profiles.accountType,
      displayName: profiles.displayName,
      phone: profiles.phone,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.accountType === "institutional") {
    return <InstitutionalBlocked petToken={petToken} />;
  }

  // 3) Listability.
  const [row] = await db
    .select({ pet: pets, org: organizations, primaryPhotoStoragePath: attachments.storagePath })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(
      and(
        eq(pets.publicToken, petToken),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const { pet, org } = row;
  const petPhotoUrlValue = petPhotoUrl(row.primaryPhotoStoragePath);
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
    return <NoLongerAvailable name={pet.name} />;
  }

  // 4) Apply-intent cookie — read only. Next 15 forbids cookie mutation in
  // Server Components; cleanup happens in submitAdoptionApplicationAction
  // (success path) and in dismissApplyIntentAction (banner X). The signed
  // cookie's 15min TTL also covers the "user bails forever" case.
  const cookieStore = await cookies();
  const intentCookie = cookieStore.get(APPLY_INTENT_COOKIE_NAME);
  const intentExpired = intentCookie
    ? !validateApplyIntentToken(petToken, intentCookie.value)
    : false;

  // 5) Idempotency — render "ya postulaste" if there's an unresolved
  // _submitted from this applicant for this pet.
  const pending = await db.execute<{ id: string; submitted_at: string }>(sql`
    SELECT e.id::text AS id,
           e.recorded_at AS submitted_at
    FROM ${petEvents} e
    WHERE e.pet_id = ${pet.id}
      AND e.event_type = 'adoption_application_submitted'
      AND e.payload->>'applicant_user_id' = ${user.id}
      AND NOT EXISTS (
        SELECT 1 FROM ${petEvents} d
        WHERE d.pet_id = e.pet_id
          AND d.event_type IN ('adoption_application_approved', 'adoption_application_rejected')
          AND d.payload->>'application_event_id' = e.id::text
      )
    LIMIT 1
  `);
  if (pending.length > 0) {
    return <AlreadyApplied name={pet.name} />;
  }

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      {/* Guilloché accent bar */}
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      <div className="max-w-2xl mx-auto px-[24px] py-[28px] space-y-[18px]">
        {/* Back link */}
        <Link
          href={`/adoptar/${petToken}`}
          className="inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] no-underline hover:text-[var(--color-ln-ink-2)]"
          style={{ color: "var(--color-ln-mute)" }}
        >
          ← Volver a la ficha
        </Link>

        {/* Pet context strip */}
        <div
          className="flex items-center gap-[14px] rounded-[8px] border px-[18px] py-[16px]"
          style={{
            background: "var(--color-ln-card)",
            borderColor: "var(--color-ln-line)",
          }}
        >
          {/* Pet thumbnail */}
          <div
            className="flex-shrink-0 w-[64px] h-[64px] rounded-[8px] overflow-hidden border"
            style={{
              background: "repeating-linear-gradient(135deg,#e7e2d6 0 7px,#f1eee5 7px 14px)",
              borderColor: "var(--color-ln-line)",
            }}
          >
            {petPhotoUrlValue ? (
              <Image
                src={petPhotoUrlValue}
                alt={pet.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div
                className="w-full h-full grid place-items-center font-[var(--font-ln-serif)] text-[22px] font-semibold"
                style={{ color: "var(--color-ln-mute)" }}
              >
                {pet.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p
              className="mb-[4px] font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.14em]"
              style={{ color: "var(--color-ln-mute)" }}
            >
              Postulación de adopción
            </p>
            <p
              className="m-0 font-[var(--font-ln-serif)] font-semibold text-[22px] tracking-[-0.015em]"
              style={{ color: "var(--color-ln-ink)" }}
            >
              Adoptar a {pet.name}
            </p>
            <p className="mt-[2px] text-sm" style={{ color: "var(--color-ln-mute)" }}>
              {org.displayName}
            </p>
          </div>
        </div>

        {/* Contact card — what the refugio will see */}
        <div
          className="rounded-[8px] border px-[18px] py-[14px]"
          style={{
            background: "var(--color-ln-stripe)",
            borderColor: "var(--color-ln-line-2)",
          }}
        >
          <p
            className="mb-[6px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em]"
            style={{ color: "var(--color-ln-mute)" }}
          >
            Lo que verá el refugio de vos
          </p>
          <div className="space-y-[3px]">
            <p className="text-[13px] font-semibold" style={{ color: "var(--color-ln-ink)" }}>
              {profile?.displayName ?? "(sin nombre)"}
            </p>
            <p className="text-sm" style={{ color: "var(--color-ln-ink-2)" }}>
              {user.email}
            </p>
            {profile?.phone && (
              <p className="text-sm" style={{ color: "var(--color-ln-ink-2)" }}>
                {profile.phone}
              </p>
            )}
          </div>
        </div>

        {intentExpired && (
          <output
            className="block rounded-[5px] border border-l-[4px] px-[16px] py-[14px] text-[13px]"
            style={{
              background: "var(--color-ln-celeste-050)",
              borderColor: "var(--color-ln-celeste-100)",
              borderLeftColor: "var(--color-ln-azul)",
              color: "var(--color-ln-ink-2)",
            }}
          >
            Tu intención de postulación expiró, pero tu cuenta sigue activa. Podés seguir desde acá
            sin problema.
          </output>
        )}

        <ApplicationForm
          petPublicToken={petToken}
          petName={pet.name}
          applicantEmail={user.email ?? ""}
        />
      </div>
    </main>
  );
}

function InstitutionalBlocked({ petToken }: { petToken: string }) {
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
      <div className="max-w-md mx-auto px-[24px] py-[64px] text-center space-y-[16px]">
        <h1
          className="font-[var(--font-ln-serif)] font-semibold text-[26px] tracking-[-0.02em]"
          style={{ color: "var(--color-ln-ink)" }}
        >
          Esta cuenta no puede postularse
        </h1>
        <p className="text-md" style={{ color: "var(--color-ln-ink-2)" }}>
          Las cuentas institucionales (admin y autoridades sanitarias) no pueden postularse para
          adoptar. Si querés adoptar a título personal, creá una cuenta personal con otro email.
        </p>
        <Link
          href={`/adoptar/${petToken}`}
          className="inline-block px-[20px] py-[11px] rounded-[5px] text-[13px] font-semibold text-white no-underline"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Volver a la ficha
        </Link>
      </div>
    </main>
  );
}

function NoLongerAvailable({ name }: { name: string }) {
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
      <div className="max-w-md mx-auto px-[24px] py-[64px] text-center space-y-[16px]">
        <h1
          className="font-[var(--font-ln-serif)] font-semibold text-[26px] tracking-[-0.02em]"
          style={{ color: "var(--color-ln-ink)" }}
        >
          {name} ya no está disponible
        </h1>
        <p className="text-md" style={{ color: "var(--color-ln-ink-2)" }}>
          La publicación cambió desde que entraste a esta página. Volvé al listado y elegí otra
          mascota.
        </p>
        <Link
          href="/adoptar"
          className="inline-block px-[20px] py-[11px] rounded-[5px] text-[13px] font-semibold text-white no-underline"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Ver otras en adopción
        </Link>
      </div>
    </main>
  );
}

function AlreadyApplied({ name }: { name: string }) {
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
      <div className="max-w-md mx-auto px-[24px] py-[64px] text-center space-y-[16px]">
        <h1
          className="font-[var(--font-ln-serif)] font-semibold text-[26px] tracking-[-0.02em]"
          style={{ color: "var(--color-ln-ink)" }}
        >
          Ya postulaste para {name}
        </h1>
        <p className="text-md" style={{ color: "var(--color-ln-ink-2)" }}>
          El refugio recibió tu postulación y la está revisando. Te van a contactar por email cuando
          tengan novedades.
        </p>
        <Link
          href="/mis-mascotas/postulaciones"
          className="inline-block px-[20px] py-[11px] rounded-[5px] text-[13px] font-semibold text-white no-underline"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Ver mis postulaciones
        </Link>
      </div>
    </main>
  );
}
