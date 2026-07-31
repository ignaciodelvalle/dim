// Atender mascota — walk-in clinical signing ENTRY (#43, B1).
//
// A matriculated vet (or any org member with event.write) enters the DIM code
// printed on the physical credential the owner shows. On resolve, they are
// taken to the non-custody clinical signing surface. This closes the UX gate:
// the vet-home card previously linked to /mascotas (the custody list, EMPTY
// for a clinic) — a matriculated vet had no working entry to sign.

import Link from "next/link";

import { OpCallout, OpCard, OpCardBody, OpCardHead, OpCrumbs } from "@/components/ui/dashboard";

import { CodeEntryForm } from "./CodeEntryForm";
import { lookupAtenderPetAction } from "./actions";
import { resolveAtenderContext } from "./atender-access";

export default async function AtenderEntryPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const context = await resolveAtenderContext(orgToken);

  const boundLookup = lookupAtenderPetAction.bind(null, orgToken);

  return (
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="space-y-1">
          <OpCrumbs
            items={[{ label: "Inicio", href: `/org/${orgToken}` }, { label: "Atender mascota" }]}
          />
          <h1 className="text-title font-semibold text-ln-op-ink">Atender mascota</h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Registrá un evento clínico sobre la mascota que trae el dueño, sin necesidad de tenerla
            en custodia.
          </p>
        </header>

        {context.ok ? (
          <OpCard>
            <OpCardHead title="Credencial de la mascota" />
            <OpCardBody>
              <CodeEntryForm action={boundLookup} />
            </OpCardBody>
          </OpCard>
        ) : (
          <OpCard>
            <OpCardBody>
              <OpCallout title="Permiso requerido" body={context.error} />
              <div className="mt-4">
                <Link
                  href={`/org/${orgToken}`}
                  className="text-sm text-ln-op-mute underline hover:text-ln-op-ink"
                >
                  ← Volver al inicio
                </Link>
              </div>
            </OpCardBody>
          </OpCard>
        )}
      </div>
    </main>
  );
}
