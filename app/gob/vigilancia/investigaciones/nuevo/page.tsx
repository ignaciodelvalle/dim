import Link from "next/link";

import { Alert } from "@/components/poncho/Alert";
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
    <main className="px-6 py-8">
      <div className="max-w-xl mx-auto space-y-6">
        <Link
          href="/gob/vigilancia/investigaciones"
          className="text-sm text-gob-text-muted hover:text-gob-text"
        >
          &larr; Volver al listado
        </Link>

        <header>
          <h1 className="text-2xl font-semibold text-gob-text">Nueva investigacion de brote</h1>
          <p className="text-sm text-gob-text-gray mt-1">
            Apertura manual. La jurisdiccion se toma de tu asignacion activa.
          </p>
        </header>

        <Alert variant="warning" title="Notificacion externa no integrada">
          La notificacion obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64){" "}
          <strong>no esta integrada</strong> en esta version. Realizala a traves de los canales
          habituales de tu jurisdiccion antes o despues de registrar la investigacion en este
          sistema.
        </Alert>

        <OpenInvestigationForm
          diseases={ENO_DISEASES_AR}
          prefillDiseaseCode={sp.diseaseCode}
          prefillSignalId={sp.signalId}
        />
      </div>
    </main>
  );
}
