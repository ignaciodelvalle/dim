import Link from "next/link";

// Branded, Spanish not-found for the (public) route group. It renders inside the
// citizen AppShell (masthead + footer), so a stranger who scans an invalid or
// expired credential QR — or mistypes a DIM-XXXX-XXXX code — lands on a friendly,
// branded page with a way forward, instead of Next.js's black English default
// 404 ("This page could not be found"). UX audit remediation — Fase 0 item 0.4.
//
// Catches notFound() from any public page, most importantly the unknown/expired
// token branch of app/(public)/p/[publicToken]/page.tsx.
export default function PublicNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div
        className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-ln-celeste-050)] text-3xl text-[var(--color-ln-azul)]"
        aria-hidden="true"
      >
        ?
      </div>
      <h1
        className="text-[26px] font-semibold tracking-[-0.015em] text-[var(--color-ln-ink)]"
        style={{ fontFamily: "var(--font-ln-serif)" }}
      >
        No encontramos esa credencial
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ln-ink-2)]">
        El código puede estar mal tipeado, o la credencial pudo haber expirado o haber sido dada de
        baja. Revisá el enlace o el QR e intentá de nuevo.
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <Link
          href="/perdidas"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[var(--color-ln-azul)] px-5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90"
        >
          Ver mascotas perdidas
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[var(--color-ln-line-strong)] bg-white px-5 text-sm font-semibold text-[var(--color-ln-ink)] no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
