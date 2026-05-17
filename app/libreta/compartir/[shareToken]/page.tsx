import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { LibretaIdentityHeader } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaIdentityHeader";
import { LibretaSanitariaView } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/LibretaSanitariaView";
import { attachments, db, libretaShareTokens, petEvents, pets } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { groupLibretaEvents, libretaSanitariaClause } from "@/lib/libreta-sanitaria";
import { petPhotoUrl } from "@/lib/storage";

import { ViewLogger } from "./ViewLogger";

export const dynamic = "force-dynamic";

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
    })
    .from(libretaShareTokens)
    .where(eq(libretaShareTokens.shareToken, shareToken))
    .limit(1);

  if (!share || share.revokedAt) return <RevokedView />;
  if (share.expiresAt && share.expiresAt < new Date()) return <ExpiredView />;

  // Load pet and apply deceased guard (D8).
  const [pet] = await db.select().from(pets).where(eq(pets.id, share.petId)).limit(1);
  if (!pet) notFound();
  if (pet.status === "deceased") return <DeceasedView />;

  // Photo.
  let photoUrl: string | null = null;
  if (pet.primaryPhotoId) {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, pet.primaryPhotoId))
      .limit(1);
    photoUrl = petPhotoUrl(attachment?.storagePath);
  }

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
          <p>Generada por DIM · {new Date().toLocaleString("es-AR")}</p>
          {share.expiresAt && <p>El enlace vence el {share.expiresAt.toLocaleString("es-AR")}.</p>}
          <p className="font-mono text-[10px] mt-1">Token: {shareToken}</p>
        </footer>

        <ViewLogger shareToken={shareToken} />
      </div>
    </main>
  );
}

function RevokedView() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Este enlace fue revocado</h1>
        <p className="text-sm text-neutral-600">
          El dueno/a desactivo este compartido. Si lo necesitas de nuevo, pedle uno nuevo.
        </p>
      </div>
    </main>
  );
}

function ExpiredView() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Este enlace vencio</h1>
        <p className="text-sm text-neutral-600">
          El compartido tenia fecha de expiracion y ya paso. Pedle al dueno/a uno nuevo.
        </p>
      </div>
    </main>
  );
}

function DeceasedView() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Libreta no disponible</h1>
        <p className="text-sm text-neutral-600">
          Esta libreta sanitaria ya no se comparte publicamente.
        </p>
      </div>
    </main>
  );
}
