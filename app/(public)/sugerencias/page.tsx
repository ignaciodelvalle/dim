import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sugerencias — MiMAR",
  description: "Enviá tus sugerencias para mejorar MiMAR — Mi Mascota Argentina.",
};

/**
 * /sugerencias — not linked from the public footer (no feedback channel exists yet).
 * This route exists to avoid a 404 if someone navigates directly.
 */
export default function SugerenciasPage() {
  return (
    <div className="bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-2xl px-6 py-16 space-y-6">
        <h1
          className="text-[30px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          Hacer una sugerencia
        </h1>
        <div className="rounded-xl border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-6 py-8 space-y-3">
          <p className="text-[15px] font-semibold text-[var(--color-ln-ink)]">
            Canal de sugerencias en preparación.
          </p>
          <p className="text-md text-[var(--color-ln-ink-2)] leading-relaxed">
            Estamos preparando un espacio formal para recibir ideas y comentarios. Mientras tanto,
            si encontrás un error o una barrera de accesibilidad, podés reportarlo a través del{" "}
            <a
              href="https://github.com/galdoneudi/dim/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-ln-azul)] underline hover:no-underline"
            >
              repositorio público en GitHub
            </a>
            .
          </p>
        </div>
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
