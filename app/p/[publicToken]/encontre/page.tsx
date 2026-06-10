// "La tengo conmigo" public route — heavier finder flow.
// The finder claims physical custody of the pet and the owner needs to arrange
// pickup. Only reachable when pet.status === 'lost' AND
// pet.allowFinderFormWhenLost === true.
//
// Gate hierarchy:
//   1. Pet not found                 → notFound() (hard 404).
//   2. Pet not lost                  → degraded "no está perdida" view.
//   3. allowFinderFormWhenLost=false → explanatory view with tel:/mailto: links
//      (respects disclosePhoneWhenLost / discloseEmailWhenLost prefs).
//   4. Happy path                    → header + FinderInPossessionForm.
//
// Logged-in prefill: getUser() without redirect. If logged in, prefill
// name/phone/email from the profile row.

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { attachments, db, ownerships, petEvents, pets, profiles } from "@/db";
import { petPhotoUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { FinderInPossessionForm } from "./FinderInPossessionForm";

export const dynamic = "force-dynamic";

export default async function FinderInPossessionPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  // Resolve the pet + primary photo in one join.
  const [petRow] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!petRow) notFound();

  const { pet, photo } = petRow;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // Gate 1: not lost.
  if (pet.status !== "lost") {
    return (
      <main className="min-h-screen bg-[var(--color-ln-paper)] px-4 py-10">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-ln-ink)]">
            Esta mascota no está perdida
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            El formulario de "la tengo conmigo" sólo está disponible mientras la mascota está
            marcada como perdida.
          </p>
          <Link
            href={`/p/${publicToken}`}
            className="inline-block px-4 py-2 rounded-lg bg-[var(--color-ln-azul)] text-white text-sm"
          >
            Ver el perfil público
          </Link>
        </div>
      </main>
    );
  }

  // Gate 2: owner disabled the finder form.
  if (!pet.allowFinderFormWhenLost) {
    // Resolve disclosed contact info when the owner opted in.
    let ownerPhone: string | null = null;
    let ownerEmail: string | null = null;

    if (pet.disclosePhoneWhenLost || pet.discloseEmailWhenLost) {
      const [ownerRow] = await db
        .select({ profile: profiles, ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
        .limit(1);

      if (ownerRow) {
        if (pet.disclosePhoneWhenLost) {
          ownerPhone = ownerRow.profile?.phone ?? null;
        }
        if (pet.discloseEmailWhenLost && ownerRow.ownerUserId) {
          try {
            const admin = createAdminClient();
            const { data } = await admin.auth.admin.getUserById(ownerRow.ownerUserId);
            ownerEmail = data?.user?.email ?? null;
          } catch {
            // Non-fatal — render without email.
          }
        }
      }
    }

    return (
      <main className="min-h-screen bg-[var(--color-ln-paper)] px-4 py-10">
        <div className="mx-auto max-w-md space-y-5">
          <header className="space-y-1">
            <Link
              href={`/p/${publicToken}`}
              className="text-sm text-[var(--color-ln-ink)] underline underline-offset-4"
            >
              ← Volver al perfil
            </Link>
            <h1 className="text-xl font-semibold text-[var(--color-ln-ink)] mt-2">
              El dueño/a prefiere ser contactado/a directamente
            </h1>
            <p className="text-sm text-[var(--color-ln-mute)]">
              Para avisarle que encontraste a {pet.name}, comunicate por los medios que el dueño/a
              habilitó:
            </p>
          </header>

          {ownerPhone || ownerEmail ? (
            <ul className="space-y-3">
              {ownerPhone && (
                <li>
                  <a
                    href={`tel:${ownerPhone}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-ln-line)] px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] transition-colors"
                  >
                    <span aria-hidden="true">📞</span>
                    Llamar al {ownerPhone}
                  </a>
                </li>
              )}
              {ownerEmail && (
                <li>
                  <a
                    href={`mailto:${ownerEmail}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-ln-line)] px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] transition-colors"
                  >
                    <span aria-hidden="true">✉️</span>
                    Escribir a {ownerEmail}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-ln-mute)]">
              El dueño/a no habilitó información de contacto pública. Mirá el perfil para ver si hay
              otro medio de contacto.
            </p>
          )}

          <Link
            href={`/p/${publicToken}`}
            className="block text-center text-sm text-[var(--color-ln-azul)] underline underline-offset-4"
          >
            Ver el perfil de {pet.name}
          </Link>
        </div>
      </main>
    );
  }

  // Happy path: pet is lost + allowFinderFormWhenLost.
  // Prefill: check if there's a logged-in user without redirecting.
  let prefill:
    | {
        name?: string;
        phone?: string;
        email?: string;
        displayName?: string;
      }
    | undefined;
  let loggedIn = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      loggedIn = true;
      const [profile] = await db
        .select({
          displayName: profiles.displayName,
          phone: profiles.phone,
        })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);

      prefill = {
        name: profile?.displayName ?? undefined,
        phone: profile?.phone ?? undefined,
        email: user.email ?? undefined,
        displayName: profile?.displayName ?? undefined,
      };
    }
  } catch {
    // Non-fatal — anonymous path.
  }

  // Resolve owner first name (for the header copy "X está esperando que la encuentren").
  const [ownerRow] = await db
    .select({ displayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);

  const ownerFirstName = ownerRow?.displayName ? ownerRow.displayName.trim().split(/\s+/)[0] : null;

  return (
    <main className="min-h-screen bg-[var(--color-ln-warn-050)] px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-2">
          <Link
            href={`/p/${publicToken}`}
            className="text-sm text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            ← Volver al perfil
          </Link>

          {/* Pet mini-header: small photo + name */}
          <div className="flex items-center gap-3 pt-1">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={pet.name}
                className="w-14 h-14 rounded-xl object-cover ring-2 ring-white shadow"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[var(--color-ln-stripe)] flex items-center justify-center text-2xl font-semibold text-[var(--color-ln-mute)] ring-2 ring-white shadow">
                {pet.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-[var(--color-ln-ink)]">
                La tengo conmigo: {pet.name}
              </h1>
              {ownerFirstName && (
                <p className="text-xs text-[var(--color-ln-mute)] mt-0.5">
                  {ownerFirstName} está esperando que la encuentren.
                </p>
              )}
            </div>
          </div>

          <p className="text-sm text-[var(--color-ln-mute)]">
            Completá el formulario y le avisamos al dueño/a al instante para que coordinen el
            encuentro.
          </p>
        </header>

        <section className="rounded-2xl bg-[var(--color-ln-card)] p-4">
          <FinderInPossessionForm
            publicToken={publicToken}
            petName={pet.name}
            biasProvince={pet.jurisdictionProvince}
            biasLocality={pet.jurisdictionLocality}
            prefill={prefill}
            loggedIn={loggedIn}
          />
        </section>
      </div>
    </main>
  );
}
