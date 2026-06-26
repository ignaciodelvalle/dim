import { db, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { OpCallout, OpCard, OpCardBody, OpCardHead, OpCrumbs } from "@/components/ui/dashboard";

import { ReplaceMicrochipForm } from "./ReplaceMicrochipForm";
import { replaceMicrochipAdminAction } from "./action";

export default async function ReplaceMicrochipAdminPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  await requireAdminOrRedirect();

  const [pet] = await db
    .select({ id: pets.id, name: pets.name, publicToken: pets.publicToken })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) notFound();

  const boundAction = replaceMicrochipAdminAction.bind(null, pet.publicToken);
  const canonicalIds = await fetchActiveIdentifications(pet.id);

  if (!canonicalIds.microchip) {
    return (
      <div className="space-y-6">
        <OpCrumbs
          items={[
            { label: "Observaciones", href: "/admin/observaciones" },
            { label: pet.name, href: `/admin/observaciones/${pet.publicToken}` },
            { label: "Reemplazar microchip" },
          ]}
        />
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            {"Admin · Microchip"}
          </p>
          <h1 className="text-[22px] font-semibold text-ln-op-ink">
            {"Reemplazar microchip — "}
            {pet.name}
          </h1>
        </header>
        <OpCallout
          title="Sin microchip registrado"
          body={`${pet.name} no tiene microchip registrado todavía.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OpCrumbs
        items={[
          { label: "Observaciones", href: "/admin/observaciones" },
          { label: pet.name, href: `/admin/observaciones/${pet.publicToken}` },
          { label: "Reemplazar microchip" },
        ]}
      />

      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {"Admin · Microchip"}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          {"Reemplazar microchip — "}
          {pet.name}
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {
            "Acción administrativa. Todas las razones están disponibles, incluidas fraude y duplicado. Quedará registrado en el log de auditoría."
          }
        </p>
      </header>

      <OpCard>
        <OpCardHead title="Datos del reemplazo" />
        <OpCardBody>
          <ReplaceMicrochipForm action={boundAction} currentChip={canonicalIds.microchip.code} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
