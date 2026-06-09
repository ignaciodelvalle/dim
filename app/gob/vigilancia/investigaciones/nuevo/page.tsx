import Link from "next/link";

import { OpBreach } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { ENO_DISEASES_AR } from "@/src/modules/surveillance/domain/eno-catalog";

import { OpenInvestigationForm } from "./OpenInvestigationForm";

export default async function NuevaInvestigacionPage({
  searchParams,
}: {
  searchParams: Promise<{ diseaseCode?: string; signalId?: string }>;
}) {
  await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <Link
        href="/gob/vigilancia/investigaciones"
        className="text-[13px] text-ln-op-mute hover:text-ln-op-ink no-underline"
      >
        &larr; Volver al listado
      </Link>

      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Investigaciones · Nueva
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink mt-1">
          Nueva investigacion de brote
        </h1>
        <p className="text-[13px] text-ln-op-mute mt-1">
          Apertura manual. La jurisdiccion se toma de tu asignacion activa.
        </p>
      </header>

      <OpBreach
        title="Notificacion externa no integrada"
        detail="La notificacion obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64) no esta integrada en esta version. Realizala a traves de los canales habituales de tu jurisdiccion antes o despues de registrar la investigacion en este sistema."
        icon="⚠"
      />

      <OpenInvestigationForm
        diseases={ENO_DISEASES_AR}
        prefillDiseaseCode={sp.diseaseCode}
        prefillSignalId={sp.signalId}
      />
    </div>
  );
}
