import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Acerca de MiMAR",
  description: "Información institucional sobre MiMAR — Mi Mascota Argentina.",
};

export default function AcercaPage() {
  return (
    <div className="bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-2xl px-6 py-16 space-y-8">
        <h1
          className="text-[30px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          Acerca de MiMAR
        </h1>

        <section aria-labelledby="que-es-heading" className="space-y-3">
          <h2 id="que-es-heading" className="text-[17px] font-semibold text-[var(--color-ln-ink)]">
            ¿Qué es MiMAR?
          </h2>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            <strong>MiMAR (Mi Mascota Argentina)</strong> es un sistema de credencial digital
            sanitaria para mascotas. El nombre interno del proyecto es{" "}
            <strong>DIM — Documento de Identificación para Mascotas</strong>, y surge como evolución
            de un proyecto universitario de la UTN iniciado en 2021.
          </p>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            Cada mascota registrada recibe un identificador único (con formato{" "}
            <code>DIM-XXXX-XXXX</code>) vinculado a un código QR verificable. Ese QR permite acceder
            a su credencial pública desde cualquier dispositivo, sin necesidad de instalar nada.
          </p>
        </section>

        <section aria-labelledby="para-quien-heading" className="space-y-3">
          <h2
            id="para-quien-heading"
            className="text-[17px] font-semibold text-[var(--color-ln-ink)]"
          >
            ¿Para quién es?
          </h2>
          <ul className="text-md text-[var(--color-ln-ink-2)] leading-relaxed space-y-2 list-disc pl-5">
            <li>
              <strong>Dueños de mascotas:</strong> registran a sus animales, mantienen su historial
              clínico (vacunas, medicaciones, visitas al veterinario, peso), y cuentan con
              herramientas para el caso de que su mascota se pierda.
            </li>
            <li>
              <strong>Refugios y organizaciones:</strong> gestionan adopciones y el seguimiento de
              animales bajo su cuidado.
            </li>
            <li>
              <strong>Autoridades sanitarias:</strong> acceden a proyecciones y datos agregados (con
              protección de privacidad) para el seguimiento de la salud animal a nivel poblacional.
            </li>
          </ul>
        </section>

        <section aria-labelledby="que-hace-heading" className="space-y-3">
          <h2
            id="que-hace-heading"
            className="text-[17px] font-semibold text-[var(--color-ln-ink)]"
          >
            ¿Qué hace?
          </h2>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            MiMAR funciona como una <strong>libreta sanitaria digital portable</strong>: cada evento
            en la vida de la mascota (vacuna, desparasitación, visita al vet, cambio de estado)
            queda registrado de forma inmutable y ordenada. El objetivo es que cualquier
            veterinario, refugio o autoridad pueda ver el historial de un animal escaneando su QR,
            sin depender de papeles que se pierden o datos que se olvidan.
          </p>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            El proyecto está diseñado para integrarse en el futuro con <strong>Mi Argentina</strong>
            , la plataforma de identidad digital del gobierno argentino. Esa integración es la
            premisa central de la arquitectura, no un complemento opcional.
          </p>
        </section>

        <section aria-labelledby="codigo-heading" className="space-y-3">
          <h2 id="codigo-heading" className="text-[17px] font-semibold text-[var(--color-ln-ink)]">
            Código abierto
          </h2>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            MiMAR es un proyecto de código abierto, publicado bajo licencia MIT. El repositorio está
            disponible en GitHub. La apertura del código no es solo un detalle técnico: es parte de
            la estrategia de confianza necesaria para una eventual integración con organismos
            públicos.
          </p>
        </section>

        <Link
          href="/"
          className="inline-block text-[13px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}
