import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { attachments, db, petEvents, profiles } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { groupLibretaEvents, libretaSanitariaClause } from "@/lib/libreta-sanitaria";
import { requireOwnedPetByToken } from "@/lib/pets";
import { petPhotoUrl } from "@/lib/storage";

import { LibretaIdentityHeader } from "./LibretaIdentityHeader";
import { LibretaSanitariaView } from "./LibretaSanitariaView";
import "./libreta-print.css";

export default async function LibretaPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet, user } = session;

  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const ownerFirstName = profile?.displayName?.split(" ")[0] ?? null;

  let photoUrl: string | null = null;
  if (pet.primaryPhotoId) {
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, pet.primaryPhotoId))
      .limit(1);
    photoUrl = petPhotoUrl(row?.storagePath);
  }

  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause(), libretaSanitariaClause()))
    .orderBy(desc(petEvents.occurredAt));

  const grouped = groupLibretaEvents(events);
  const vista = sp.vista === "cronologica" ? "cronologica" : "agrupada";

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 print:p-0 print:bg-white">
      <div className="max-w-2xl mx-auto pt-6 pb-20 space-y-6 print:max-w-none print:pt-0">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href={`/mis-mascotas/${pet.publicToken}`}
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver a {pet.name}
          </Link>
          <ViewToggle publicToken={pet.publicToken} vista={vista} />
        </div>

        <LibretaIdentityHeader pet={pet} photoUrl={photoUrl} ownerFirstName={ownerFirstName} />

        <LibretaSanitariaView groupedEvents={grouped} publicToken={pet.publicToken} vista={vista} />

        <footer className="hidden print:block text-xs text-neutral-500 pt-8">
          Generada por DIM · {new Date().toLocaleString("es-AR")}
        </footer>
      </div>
    </main>
  );
}

function ViewToggle({
  publicToken,
  vista,
}: {
  publicToken: string;
  vista: "agrupada" | "cronologica";
}) {
  const baseClass = "px-2.5 py-1 rounded-md transition-colors";
  const activeClass = "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900";
  const inactiveClass =
    "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900";
  return (
    <div className="flex items-center gap-1 text-xs">
      <Link
        href={`/mis-mascotas/${publicToken}/libreta`}
        className={`${baseClass} ${vista === "agrupada" ? activeClass : inactiveClass}`}
      >
        Por sección
      </Link>
      <Link
        href={`/mis-mascotas/${publicToken}/libreta?vista=cronologica`}
        className={`${baseClass} ${vista === "cronologica" ? activeClass : inactiveClass}`}
      >
        Cronológica
      </Link>
    </div>
  );
}
