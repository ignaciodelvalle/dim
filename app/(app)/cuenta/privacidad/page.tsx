// Privacy & subject-rights page — Libreta Nacional redesign.
// Two operations: descargar datos (Art. 14) + eliminar cuenta (Art. 16).
// PrivacyActions (client component) is unchanged.

import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { PrivacyActions } from "./PrivacyActions";

export const metadata = {
  title: "Privacidad y datos personales — miMAR",
};

export default async function PrivacidadPage() {
  await requireUserOrRedirect();

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-ln-mono text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-7">
        <h1 className="m-0 font-ln-serif text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Privacidad y datos personales
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Ejercé los derechos que te garantiza la Ley 25.326 de Protección de Datos Personales.
          Pedido y supresión quedan registrados en el audit log con la cita normativa.
        </p>
      </div>

      {/* Actions — client component unchanged */}
      <div className="mb-7">
        <PrivacyActions />
      </div>

      {/* Legal note */}
      <LnCard>
        <LnCardHead title="¿Qué se conserva si me borro?" />
        <LnCardBody>
          <p className="text-[13px] leading-[1.6] text-[var(--color-ln-ink-2)]">
            La supresión es <strong>soft-delete con hash de PII</strong>: nombre, teléfono y DNI
            quedan anonimizados; tu cuenta sale de las consultas habituales. Los eventos sanitarios
            de tus mascotas (libreta, vacunas, observaciones antirrábicas) se preservan porque su
            conservación es obligatoria por norma (Res. SENASA, Ord. CABA 41.831, Ley 14.072). Si
            necesitás el borrado de esos registros sanitarios, contactanos y lo evaluamos caso por
            caso bajo la base legal de auditoría.
          </p>
          <p className="mt-3 text-md leading-[1.6] text-[var(--color-ln-ink-2)]">
            Dentro de esos eventos preservados, el texto libre que hayas escrito vos (notas,
            descripciones, contexto del último avistaje) se reemplaza por un aviso de contenido
            eliminado — se conserva el registro sanitario, no el detalle identificable.
          </p>
        </LnCardBody>
      </LnCard>
    </div>
  );
}
