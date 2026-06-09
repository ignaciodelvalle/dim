import { db, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
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

  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!pet) notFound();

  const boundAction = replaceMicrochipAdminAction.bind(null, pet.publicToken);

  if (!pet.microchipId) {
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
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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
          <ReplaceMicrochipForm action={boundAction} currentChip={pet.microchipId} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
