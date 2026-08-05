// Mis chapas — owner panel for physical tags (physical-tag-lifecycle D8).
//
// Account-scoped (not per-pet): a blank tag has no pet until activation binds
// one, and /cuenta already hosts the cross-pet surfaces. Lists every tag the
// user can manage (activated by them, or on a pet they currently own) with a
// revoke action for the active ones.
//
// Jurisdiction gating is DISCOVERY-ONLY (design D6): this page stays reachable
// even when engraved_plate is disabled — only the nav entry hides.

import Link from "next/link";

import { db, ownerships, petTags, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { LnBadge } from "@/components/ui/Badge";
import { LnButton } from "@/components/ui/Button";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";

import { RevokeTagDialog } from "./_components/RevokeTagDialog";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  unactivated: "Sin activar",
  active: "Activa",
  revoked: "Dada de baja",
};

async function loadTags(userId: string) {
  const ownedPetIds = (
    await db
      .select({ petId: ownerships.petId })
      .from(ownerships)
      .where(and(eq(ownerships.ownerUserId, userId), isNull(ownerships.endedAt)))
  ).map((r) => r.petId);

  return db
    .select({
      id: petTags.id,
      serial: petTags.serial,
      status: petTags.status,
      activatedAt: petTags.activatedAt,
      revokedAt: petTags.revokedAt,
      petName: pets.name,
      petToken: pets.publicToken,
    })
    .from(petTags)
    .leftJoin(pets, eq(pets.id, petTags.petId))
    .where(
      ownedPetIds.length > 0
        ? or(eq(petTags.activatedByUserId, userId), inArray(petTags.petId, ownedPetIds))
        : eq(petTags.activatedByUserId, userId),
    )
    .orderBy(petTags.createdAt);
}

export default async function ChapasPage() {
  const { user } = await requireUserOrRedirect("/cuenta/chapas");
  const tags = await loadTags(user.id);

  return (
    <div className="mx-auto max-w-4xl px-8 py-7 pb-12">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-ln-serif text-4xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Mis chapas
          </h1>
          <p className="mt-1.5 text-md text-[var(--color-ln-mute)]">
            Chapas físicas con QR vinculadas a la credencial de tus mascotas.
          </p>
        </div>
        <LnButton href="/cuenta/chapas/activar" size="md">
          Activar una chapa
        </LnButton>
      </div>

      {tags.length === 0 ? (
        <LnCard>
          <LnCardHead title="Todavía no tenés chapas" />
          <LnCardBody>
            <p className="text-sm text-[var(--color-ln-ink-2)]">
              Cuando recibas una chapa física, activala con el código impreso en el envoltorio para
              vincularla a una de tus mascotas.
            </p>
          </LnCardBody>
        </LnCard>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)]">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[var(--space-sheet)] py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-md font-medium leading-tight text-[var(--color-ln-ink)]">
                  <span className="font-ln-mono">{tag.serial}</span>
                  <LnBadge
                    variant={
                      tag.status === "active"
                        ? "success"
                        : tag.status === "revoked"
                          ? "neutral"
                          : "info"
                    }
                  >
                    {STATUS_LABELS[tag.status] ?? tag.status}
                  </LnBadge>
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-ln-mute)]">
                  {tag.status === "active" && tag.petName && tag.petToken ? (
                    <>
                      Vinculada a{" "}
                      <Link
                        href={`/mis-mascotas/${tag.petToken}`}
                        className="text-[var(--color-ln-azul)]"
                      >
                        {tag.petName}
                      </Link>
                    </>
                  ) : tag.status === "revoked" ? (
                    <>Dada de baja{tag.petName ? ` — era de ${tag.petName}` : ""}</>
                  ) : (
                    "Sin activar"
                  )}
                </p>
              </div>
              {tag.status === "active" && <RevokeTagDialog serial={tag.serial} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
