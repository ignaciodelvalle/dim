// Atender mascota — walk-in clinical SIGNING surface (#43, B1).
//
// Resolves the pet by its DIM credential token with NO custody requirement
// (resolveAtenderPet). Authorization is event.write on this org + knowledge of
// the high-entropy DIM code (≈ physical possession of the credential). The
// surface exposes ONLY clinical event capture and ONLY pet identity — no owner
// PII (name/phone/DNI/address), no custody/transfer/adoption actions.
//
// The signed event carries the #43 provenance tier resolved by
// resolveAtenderPet: `verified_professional` when the signer holds a validated
// matrícula, else `org_registered`.

import Link from "next/link";
import { Suspense } from "react";

import { OpCard, OpCardBody, OpCardHead, OpCodeBadge, OpCrumbs } from "@/components/ui/dashboard";
import { speciesLabel } from "@/lib/utils/format";

import { resolveAtenderPet } from "../atender-access";
import { AtenderCaptureMounter } from "./AtenderCaptureMounter";
import { ATENDER_EVENTOS } from "./atender-eventos";

export default async function AtenderSignPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
  searchParams: Promise<{ evento?: string; firmado?: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const sp = await searchParams;
  const access = await resolveAtenderPet(orgToken, publicToken);

  if (!access.ok) {
    return (
      <main className="min-h-screen bg-ln-op-page p-6">
        <div className="max-w-lg mx-auto space-y-6">
          <OpCrumbs
            items={[
              { label: "Inicio", href: `/org/${orgToken}` },
              { label: "Atender mascota", href: `/org/${orgToken}/atender` },
              { label: "No encontrada" },
            ]}
          />
          <OpCard>
            <OpCardBody>
              <p className="text-[13px] text-ln-op-ink-2">{access.error}</p>
              <div className="mt-4">
                <Link
                  href={`/org/${orgToken}/atender`}
                  className="text-sm text-ln-op-mute underline hover:text-ln-op-ink"
                >
                  ← Ingresar otro código
                </Link>
              </div>
            </OpCardBody>
          </OpCard>
        </div>
      </main>
    );
  }

  const { pet, signer } = access;
  const activeEvento = sp.evento ?? null;
  const justSigned = sp.firmado === "1";

  return (
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="space-y-1">
          <OpCrumbs
            items={[
              { label: "Inicio", href: `/org/${orgToken}` },
              { label: "Atender mascota", href: `/org/${orgToken}/atender` },
              { label: pet.name },
            ]}
          />
          <h1 className="text-[22px] font-semibold text-ln-op-ink">
            Atendiendo a {pet.name} · {speciesLabel(pet.species)}
          </h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Firmás como <strong>{signer.label}</strong>
            {signer.matriculaVerified ? " · verificado por profesional" : "."}
          </p>
          {!signer.matriculaVerified && (
            <p className="text-[var(--text-sm)] text-ln-op-mute">
              Queda registrado a nombre de la organización: es un registro válido, pero el sello
              “verificado por profesional” requiere un firmante con matrícula validada.
            </p>
          )}
          <div className="pt-1">
            <OpCodeBadge tone="neutral">{pet.publicToken}</OpCodeBadge>
          </div>
        </header>

        {justSigned && !activeEvento && (
          <output className="block rounded-[var(--radius-sm)] border border-ln-op-ok bg-ln-op-card px-3 py-2 text-sm text-ln-op-ink">
            Evento clínico firmado. Podés registrar otro o volver al inicio.
          </output>
        )}

        <OpCard>
          <OpCardHead title="¿Qué querés registrar?" />
          <OpCardBody>
            <nav className="grid grid-cols-2 gap-2">
              {ATENDER_EVENTOS.map((e) => {
                const isActive = activeEvento === e.key;
                return (
                  <Link
                    key={e.key}
                    href={`/org/${orgToken}/atender/${pet.publicToken}?evento=${e.key}`}
                    className={[
                      "block rounded-[var(--radius-sm)] border px-3 py-2 text-sm no-underline transition-colors",
                      isActive
                        ? "border-ln-op-azul bg-ln-op-stripe text-ln-op-ink"
                        : "border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe",
                    ].join(" ")}
                  >
                    {e.label}
                  </Link>
                );
              })}
            </nav>
          </OpCardBody>
        </OpCard>

        <Suspense>
          <AtenderCaptureMounter
            orgToken={orgToken}
            publicToken={pet.publicToken}
            species={pet.species}
          />
        </Suspense>

        <footer className="pt-2">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-ln-op-mute underline hover:text-ln-op-ink"
          >
            ← Volver al inicio
          </Link>
        </footer>
      </div>
    </main>
  );
}
