import { and, desc, eq, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LibretaIdentityHeader } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaIdentityHeader";
import { LibretaSanitariaView } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView";
import { LnCallout } from "@/components/ui/DocElements";
import { attachments, db, libretaShareTokens, petEvents, pets, profiles } from "@/db";
import { excludeSelfScansClause } from "@/lib/events/events";
import { overlayAmendments } from "@/lib/infra/amendment";
import { groupLibretaEvents, libretaSanitariaClause } from "@/lib/infra/libreta-sanitaria";
import { validateShareToken } from "@/lib/infra/libreta-share-token";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { PET_LIBRETA_SHARE_SELECT } from "@/lib/infra/pet-projections";
import { petPhotoUrl } from "@/lib/infra/storage";

import { ViewLogger } from "./ViewLogger";

export const dynamic = "force-dynamic";

// Common shape passed to the expired / revoked / deceased terminal views so
// each one can render the pet identity context (foto + nombre + raza) plus a
// link back to the public profile per AGENTS.md "Design rules" rule #4 + doc 10
// §3 punto 2 (sprint 5 PR-040).
//
// Item 24.2: expiresAtIso is included so ExpiredView can render the exact
// date ("venció el {fecha}") per the spec.
type TerminalPetContext = {
  name: string;
  species: string;
  publicToken: string;
  photoUrl: string | null;
  createdAtIso: string;
  expiresAtIso: string | null;
};

export default async function PublicLibretaPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  // Resolve share token via Drizzle (bypasses RLS by design — see D7 in plan).
  // Join profiles to get the owner's first name for the "Compartido por" chip.
  // We surface first name only (PII-minimised — same pattern as LostPublicCredential).
  const [share] = await db
    .select({
      id: libretaShareTokens.id,
      petId: libretaShareTokens.petId,
      expiresAt: libretaShareTokens.expiresAt,
      revokedAt: libretaShareTokens.revokedAt,
      createdAt: libretaShareTokens.createdAt,
      ownerDisplayName: profiles.displayName,
    })
    .from(libretaShareTokens)
    .leftJoin(profiles, eq(profiles.id, libretaShareTokens.createdByUserId))
    .where(eq(libretaShareTokens.shareToken, shareToken))
    .limit(1);

  if (!share) notFound();

  // Always load the pet so terminal views (revoked / expired / deceased) can
  // show context. If the pet row vanished (cascade or hard delete), fall back
  // to a 404 since the share token is meaningless without it.
  const [pet] = await db
    .select(PET_LIBRETA_SHARE_SELECT)
    .from(pets)
    .where(eq(pets.id, share.petId))
    .limit(1);
  if (!pet) notFound();

  let photoUrl: string | null = null;
  if (pet.primaryPhotoId) {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, pet.primaryPhotoId))
      .limit(1);
    photoUrl = petPhotoUrl(attachment?.storagePath);
  }

  const context: TerminalPetContext = {
    name: pet.name,
    species: pet.species,
    publicToken: pet.publicToken,
    photoUrl,
    createdAtIso: share.createdAt.toISOString(),
    expiresAtIso: share.expiresAt ? share.expiresAt.toISOString() : null,
  };

  // PII-minimised owner first name: split on first whitespace, never expose full name.
  const ownerFirstName = share.ownerDisplayName
    ? share.ownerDisplayName.trim().split(/\s+/)[0]
    : null;

  // Relative expiry label: "Expira en X días/horas" for the active view chip.
  const relativeExpiry = share.expiresAt ? formatRelativeExpiry(share.expiresAt) : null;

  const status = validateShareToken(share);
  if (status === "revoked") return <RevokedView context={context} />;
  if (status === "expired") return <ExpiredView context={context} />;
  if (pet.status === "deceased") return <DeceasedView context={context} />;

  // Libreta events and canonical identifiers in parallel.
  const [events, identifications] = await Promise.all([
    db
      // full row deliberate: payload is rendered by LibretaSanitariaView per event type
      .select()
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, pet.id),
          excludeSelfScansClause(),
          // event_amended rows are fetched alongside libreta entries so
          // overlayAmendments can project corrections below. They never render:
          // groupLibretaEvents drops them (no libreta group).
          or(libretaSanitariaClause(), eq(petEvents.eventType, "event_amended")),
        ),
      )
      .orderBy(desc(petEvents.occurredAt)),
    fetchActiveIdentifications(pet.id),
  ]);

  // Project corrections BEFORE grouping (D2 at the read boundary — same
  // pattern as get-libreta-face-data.ts). Without this, the vet-facing shared
  // libreta showed RAW pre-correction payloads (event-sourcing integrity
  // review 2026-07-04 item 1).
  const grouped = groupLibretaEvents(overlayAmendments(events));

  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="bg-[var(--color-ln-paper)] p-6">
      <div className="mx-auto max-w-2xl space-y-6 pb-20 pt-6">
        {/* Read-only notice — this share link has no write UI; it's a shared
            view of the owner's libreta. See docs/audits for the tracked
            follow-up on a vet write flow. */}
        <div
          role="note"
          className="print:hidden rounded-[var(--radius-sm)] border px-4 py-3"
          style={{
            background: "var(--color-ln-celeste-050)",
            borderColor: "var(--color-ln-celeste-100)",
            borderLeft: "3px solid var(--color-ln-azul)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--color-ln-ink-2)" }}>
            <strong style={{ color: "var(--color-ln-ink)" }}>Vista de solo lectura.</strong> Estás
            viendo la libreta sanitaria compartida por el dueño/a. Para sumar nuevos eventos,
            contactá al dueño/a.
          </p>
        </div>

        <LnCallout tone="warn" className="print:hidden">
          Estás viendo la libreta sanitaria de <strong>{pet.name}</strong> con permiso del dueño/a.
          {share.expiresAt &&
            ` Este enlace vence el ${share.expiresAt.toLocaleDateString("es-AR")}.`}
        </LnCallout>

        {/* "Compartido por" chip + relative expiry chip */}
        {(ownerFirstName || relativeExpiry) && (
          <div className="print:hidden flex flex-wrap items-center gap-2">
            {ownerFirstName && (
              <span
                className="inline-flex items-center gap-[5px] rounded-full border px-2.5 py-1 text-sm font-medium"
                style={{
                  background: "var(--color-ln-stripe)",
                  borderColor: "var(--color-ln-line-2)",
                  color: "var(--color-ln-ink-2)",
                }}
              >
                Compartido por{" "}
                <strong style={{ color: "var(--color-ln-ink)" }}>{ownerFirstName}</strong>
              </span>
            )}
            {relativeExpiry && (
              <span
                className="inline-flex items-center gap-[5px] rounded-full border px-2.5 py-1 text-sm font-medium"
                style={{
                  background: "var(--color-ln-warn-025)",
                  borderColor: "var(--color-ln-warn-050)",
                  color: "var(--color-ln-warn)",
                }}
              >
                {relativeExpiry}
              </span>
            )}
          </div>
        )}

        <LibretaIdentityHeader
          pet={{
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            sex: pet.sex,
            microchipId: identifications.microchip?.code ?? null,
            tattooCode: identifications.tattoo?.code ?? null,
            tattooLocation: identifications.tattoo?.tattooLocation ?? null,
            publicToken: pet.publicToken,
          }}
          photoUrl={photoUrl}
          ownerFirstName={null}
        />

        <LibretaSanitariaView
          groupedEvents={grouped}
          publicToken={pet.publicToken}
          vista="agrupada"
        />

        <footer className="border-t border-[var(--color-ln-line-2)] pt-8 font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
          <p>Generada por MiMAR · {new Date().toLocaleString("es-AR")}</p>
          {share.expiresAt && <p>El enlace vence el {share.expiresAt.toLocaleString("es-AR")}.</p>}
          <p className="mt-1 text-xs">Token: {shareToken}</p>
        </footer>

        <ViewLogger shareToken={shareToken} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal views (sprint 5 PR-040)
//
// Each gets the pet context so the user knows WHAT they were looking at, and
// gets a CTA back to the public profile (Tier 0) so they can contact the
// owner to request a fresh share link.
// ---------------------------------------------------------------------------

// Item 24.2: TerminalShell — dedicated state for expired / revoked / deceased
// share tokens. Shows pet identity context plus a keyboard-operable CTA to
// the public profile so the visitor can request a fresh link.
function TerminalShell({
  title,
  description,
  context,
}: {
  title: string;
  description: string;
  context: TerminalPetContext;
}) {
  const speciesLabel =
    context.species === "dog" ? "Canino" : context.species === "cat" ? "Felino" : "Mascota";
  const createdAt = new Date(context.createdAtIso).toLocaleDateString("es-AR");
  return (
    // Landing shell owns #main-content + min-height; this is centered content.
    <div className="flex min-h-[70vh] items-center justify-center bg-[var(--color-ln-paper)] p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto inline-block">
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ln-stripe)] ring-4 ring-[var(--color-ln-line-strong)]">
            {context.photoUrl ? (
              <img
                src={context.photoUrl}
                alt={`Foto de ${context.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="text-3xl">
                🐾
              </span>
            )}
          </span>
        </div>

        {/* a11y: h1 is the first meaningful content; focus lands here
            naturally since it's the page heading (no JS focus-trap needed). */}
        <div className="space-y-2">
          <h1 className="font-[var(--font-ln-serif)] text-[28px] font-semibold text-[var(--color-ln-ink)]">
            {title}
          </h1>
          <p className="text-[13px] text-[var(--color-ln-mute)]">
            Era un resumen médico temporal de <strong>{context.name}</strong> ({speciesLabel})
            compartido el {createdAt}.
          </p>
          <p className="text-[13px] text-[var(--color-ln-mute)]">{description}</p>
        </div>

        {/* Primary CTA — keyboard-operable Link with visible focus ring. */}
        <Link
          href={`/p/${context.publicToken}`}
          className="inline-block rounded-[3px] bg-[var(--color-ln-azul)] px-5 py-3 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-[var(--color-ln-azul-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2"
        >
          Ver el perfil público de {context.name}
        </Link>

        <p className="text-[11px] text-[var(--color-ln-mute)]">
          Desde el perfil público podés escribirle al dueño para pedir un acceso nuevo.
        </p>
      </div>
    </div>
  );
}

function RevokedView({ context }: { context: TerminalPetContext }) {
  return (
    <TerminalShell
      title="Este enlace fue revocado por el dueño"
      description="Si necesitás ver la libreta de nuevo, pedile al dueño que genere un nuevo enlace."
      context={context}
    />
  );
}

function ExpiredView({ context }: { context: TerminalPetContext }) {
  // Item 24.2: show the exact expiry date per spec ("venció el {fecha}").
  const expiryLabel = context.expiresAtIso
    ? `venció el ${new Date(context.expiresAtIso).toLocaleDateString("es-AR")}`
    : "ya venció";

  return (
    <TerminalShell
      title="Este enlace venció"
      description={`El enlace de la libreta ${expiryLabel}. Pedile al dueño uno nuevo.`}
      context={context}
    />
  );
}

function DeceasedView({ context }: { context: TerminalPetContext }) {
  return (
    <TerminalShell
      title="Libreta no disponible"
      description="Esta libreta sanitaria ya no se comparte públicamente."
      context={context}
    />
  );
}

// ---------------------------------------------------------------------------
// Relative expiry helper — "Expira en X días / X horas / menos de 1 hora"
// ---------------------------------------------------------------------------

function formatRelativeExpiry(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "Vencido";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Expira en menos de 1 hora";
  if (hours < 24) return `Expira en ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `Expira en ${days} ${days === 1 ? "día" : "días"}`;
}
