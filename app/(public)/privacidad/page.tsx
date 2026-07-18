import { LEGAL_VERSION, LEGAL_VERSION_LABEL } from "@/lib/reference/legal-version";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad — miMAR",
  description:
    "Cómo miMAR recopila, usa y protege tus datos personales, en cumplimiento de la Ley 25.326.",
};

export default function PrivacidadPage() {
  return (
    <div className="bg-[var(--color-ln-paper)]">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-2">
          <h1
            className="text-[32px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
            style={{ fontFamily: "var(--font-ln-serif)" }}
          >
            Política de privacidad
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            Última actualización: {LEGAL_VERSION_LABEL}{" "}
            <span className="text-[var(--color-ln-mute)]">(v{LEGAL_VERSION})</span>
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">
            Marco legal aplicable
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)] leading-relaxed">
            miMAR trata los datos personales de sus usuarios conforme a la{" "}
            <strong>Ley 25.326 de Protección de Datos Personales</strong> de la República Argentina
            y su decreto reglamentario 1558/2001. miMAR cumple las obligaciones de registro ante la
            Agencia de Acceso a la Información Pública (AAIP) / Dirección Nacional de Protección de
            Datos Personales (DNPDP) conforme lo establece la normativa vigente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">
            Datos que recopilamos
          </h2>
          <ul className="text-sm text-[var(--color-ln-ink-2)] leading-relaxed space-y-2 list-disc list-inside">
            <li>
              <strong>Datos de cuenta:</strong> correo electrónico y nombre visible, necesarios para
              autenticar tu sesión.
            </li>
            <li>
              <strong>Datos de mascota:</strong> nombre, especie, raza, foto, microchip y eventos
              sanitarios que vos ingresás voluntariamente.
            </li>
            <li>
              <strong>Datos de ubicación:</strong> provincia y localidad del dueño, usados para
              enrutar denuncias y mejorar búsquedas. No recopilamos GPS en tiempo real.
            </li>
            <li>
              <strong>Denuncias anónimas:</strong> las denuncias de maltrato pueden enviarse sin
              sesión. Si dejás un contacto de seguimiento, se asocia únicamente al código de la
              denuncia y no a ningún perfil de usuario.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">
            Finalidad del tratamiento
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)] leading-relaxed">
            Los datos se usan exclusivamente para operar el servicio: gestionar credenciales de
            mascotas, facilitar el reencuentro de animales perdidos, enrutar denuncias de maltrato a
            la autoridad jurisdiccional competente y emitir recordatorios sanitarios. No
            comercializamos ni cedemos datos personales a terceros con fines publicitarios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">
            Tus derechos (Art. 14 Ley 25.326)
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)] leading-relaxed">
            Tenés derecho a acceder, rectificar, actualizar y suprimir tus datos personales. Desde
            tu cuenta podés{" "}
            <Link
              href="/cuenta/privacidad"
              className="underline underline-offset-4 hover:text-[var(--color-ln-azul)] transition-colors"
            >
              descargar una copia de tus datos o solicitar la eliminación de tu cuenta
            </Link>
            . Para otros ejercicios de derechos, escribinos a la dirección de contacto indicada más
            abajo. Respondemos dentro de los plazos que establece la ley.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">Contacto</h2>
          <p className="text-sm text-[var(--color-ln-ink-2)] leading-relaxed">
            Para consultas sobre privacidad o ejercicio de derechos de los titulares, podés
            escribirnos a{" "}
            <a
              href="mailto:privacidad@mimar.ar"
              className="underline underline-offset-4 hover:text-[var(--color-ln-azul)] transition-colors"
            >
              privacidad@mimar.ar
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
