import Link from "next/link";

export const metadata = {
  title: "Acerca de MiMAR · Mi Mascota Argentina",
};

export default function AcercaPage() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-3xl font-bold font-ln-serif text-ln-ink">Acerca de MiMAR</h1>
      <p className="mt-4 text-ln-ink-2 leading-relaxed">Sección en preparación.</p>
      <Link
        href="/"
        className="mt-8 inline-block text-sm font-medium text-ln-azul hover:underline underline-offset-4"
      >
        ← Volver al inicio
      </Link>
    </main>
  );
}
