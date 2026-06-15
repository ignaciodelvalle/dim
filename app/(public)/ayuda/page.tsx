import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ayuda — MiMAR",
  description: "Centro de ayuda de MiMAR — Mi Mascota Argentina.",
};

export default function AyudaPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-2xl px-6 py-16 space-y-6">
        <h1
          className="text-[30px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          Ayuda
        </h1>
        <div className="rounded-xl border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-6 py-8 space-y-3">
          <p className="text-[15px] font-semibold text-[var(--color-ln-ink)]">
            Sección en preparación.
          </p>
          <p className="text-[14px] text-[var(--color-ln-ink-2)] leading-relaxed">
            Pronto encontrarás aquí preguntas frecuentes y guías para usar MiMAR.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block text-[13px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Volver al inicio
        </Link>
      </div>
    </main>
  );
}
