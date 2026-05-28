// Privacy & subject-rights page (compliance handoff PR 1, Ley 25.326).
//
// Two operations:
//   1. Descargar mis datos — Art. 14, derecho de acceso.
//   2. Eliminar mi cuenta   — Art. 16, derecho de supresión.
// Both invoke the RPCs declared in migration 0059 via wrappers in
// app/actions/subject-rights.ts.

import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { PrivacyActions } from "./PrivacyActions";

export const metadata = {
  title: "Privacidad y datos personales — MiMAR",
};

export default async function PrivacidadPage() {
  await requireUserOrRedirect();

  return (
    <main className="min-h-screen p-6 bg-gob-surface">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <Link
          href="/cuenta"
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
        >
          ← Mi cuenta
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Privacidad y datos personales
          </h1>
          <p className="text-sm text-gob-text-muted">
            Ejercé los derechos que te garantiza la Ley 25.326 de Protección de Datos Personales.
            Pedido y supresión quedan registrados en el audit log con la cita normativa.
          </p>
        </header>

        <PrivacyActions />

        <section className="rounded-lg border border-gob-border bg-gob-surface-alt p-5 text-sm text-gob-text-gray space-y-2">
          <h2 className="text-base font-semibold text-gob-text">¿Qué se conserva si me borro?</h2>
          <p>
            La supresión es <strong>soft-delete con hash de PII</strong>: nombre, teléfono y DNI
            quedan anonimizados; tu cuenta sale de las consultas habituales. Los eventos sanitarios
            de tus mascotas (libreta, vacunas, observaciones antirrábicas) se preservan porque su
            conservación es obligatoria por norma (Res. SENASA, Ord. CABA 41.831, Ley 14.072). Si
            necesitás el borrado de esos registros sanitarios, contactanos y lo evaluamos caso por
            caso bajo la base legal de auditoría.
          </p>
        </section>
      </div>
    </main>
  );
}
