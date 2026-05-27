import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LibretaIdentityHeader } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaIdentityHeader";
import { LibretaSanitariaView } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView";
import { attachments, db, libretaShareTokens, petEvents, pets } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { groupLibretaEvents, libretaSanitariaClause } from "@/lib/libreta-sanitaria";
import { validateShareToken } from "@/lib/libreta-share-token";
import { petPhotoUrl } from "@/lib/storage";

import { ViewLogger } from "./ViewLogger";

export const dynamic = "force-dynamic";

// Common shape passed to the expired / revoked / deceased terminal views so
// each one can render the pet identity context (foto + nombre + raza) plus a
// link back to the public profile per AGENTS.md "Design rules" rule #4 + doc 10
// §3 punto 2 (sprint 5 PR-040).
type TerminalPetContext = {
  name: string;
  species: string;
  publicToken: string;
  photoUrl: string | null;
  createdAtIso: string;
};

export default async function PublicLibretaPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  // Resolve share token via Drizzle (bypasses RLS by design — see D7 in plan).
  const [share] = await db
    .select({
      id: libretaShareTokens.id,
      petId: libretaShareTokens.petId,
      expiresAt: libretaShareTokens.expiresAt,
      revokedAt: libretaShareTokens.revokedAt,
      createdAt: libretaShareTokens.createdAt,
    })
    .from(libretaShareTokens)
    .where(eq(libretaShareTokens.shareToken, shareToken))
    .limit(1);

  if (!share) notFound();

  // Always load the pet so terminal views (revoked / expired / deceased) can
  // show context. If the pet row vanished (cascade or hard delete), fall back
  // to a 404 since the share token is meaningless without it.
  const [pet] = await db.select().from(pets).where(eq(pets.id, share.petId)).limit(1);
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
  };

  const status = validateShareToken(share);
  if (status === "revoked") return <RevokedView context={context} />;
  if (status === "expired") return <ExpiredView context={context} />;
  if (pet.status === "deceased") return <DeceasedView context={context} />;

  // Libreta events (same filter as the owner view).
  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause(), libretaSanitariaClause()))
    .orderBy(desc(petEvents.occurredAt));

  const grouped = groupLibretaEvents(events);

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto pt-6 pb-20 space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden">
          Estas viendo la libreta sanitaria de <strong>{pet.name}</strong> con permiso del dueno/a.
          {share.expiresAt &&
            ` Este enlace vence el ${share.expiresAt.toLocaleDateString("es-AR")}.`}
        </div>

        <LibretaIdentityHeader pet={pet} photoUrl={photoUrl} ownerFirstName={null} />

        <LibretaSanitariaView
          groupedEvents={grouped}
          publicToken={pet.publicToken}
          vista="agrupada"
        />

        <footer className="text-xs text-neutral-500 pt-8 border-t border-neutral-200">
          <p>Generada por MiMAR · {new Date().toLocaleString("es-AR")}</p>
          {share.expiresAt && <p>El enlace vence el {share.expiresAt.toLocaleString("es-AR")}.</p>}
          <p className="font-mono text-[10px] mt-1">Token: {shareToken}</p>
        </footer>

        <ViewLogger shareToken={shareToken} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Terminal views (sprint 5 PR-040)
//
// Each gets the pet context so the user knows WHAT they were looking at, and
// gets a CTA back to the public profile (Tier 0) so they can contact the
// owner to request a fresh share link.
// ---------------------------------------------------------------------------

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
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto inline-block">
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-4 ring-neutral-200">
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

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          <p className="text-sm text-neutral-700">
            Era un resumen médico temporal de <strong>{context.name}</strong> ({speciesLabel})
            compartido el {createdAt}.
          </p>
          <p className="text-sm text-neutral-600">{description}</p>
        </div>

        <Link
          href={`/p/${context.publicToken}`}
          className="inline-block px-5 py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
        >
          Ver el perfil público de {context.name}
        </Link>

        <p className="text-xs text-neutral-500">
          Desde el perfil público podés escribirle a la dueña para pedir un acceso nuevo.
        </p>
      </div>
    </main>
  );
}

function RevokedView({ context }: { context: TerminalPetContext }) {
  return (
    <TerminalShell
      title="Este link fue revocado por la dueña"
      description="Si necesitás un acceso nuevo, contactá a través del perfil público de la mascota."
      context={context}
    />
  );
}

function ExpiredView({ context }: { context: TerminalPetContext }) {
  return (
    <TerminalShell
      title="Este link expiró"
      description="Era un compartido temporal y ya pasó su fecha. Pedile a la dueña un acceso nuevo a través del perfil público."
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
