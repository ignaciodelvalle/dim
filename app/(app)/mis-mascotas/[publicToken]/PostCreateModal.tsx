"use client";

// PostCreateModal — shown once after a successful pet create,
// when the URL has ?recienCreado=true.
//
// Closes via:
//   - "Guardar y terminar" button  → router.replace strips the query
//   - "Seguir cargando datos" link  → navigates to /editar
//   - Backdrop click               → same as "Guardar y terminar"
//   - Esc key                      → same as "Guardar y terminar"
//
// Stripping ?recienCreado on close prevents a refresh from re-opening.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

export function PostCreateModal({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const dismiss = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  // Close on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <>
      {/* Backdrop — click to dismiss */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={dismiss}
        className="fixed inset-0 z-[var(--z-overlay,50)] cursor-default bg-black/50"
      />

      {/* Dialog panel — above backdrop */}
      <dialog
        open
        aria-labelledby="post-create-title"
        className="fixed left-1/2 top-1/2 z-[calc(var(--z-overlay,50)+1)] m-0 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[28px] py-[28px] shadow-xl"
      >
        {/* Eyebrow */}
        <p className="mb-[6px] font-[var(--font-ln-mono)] text-xs uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
          Libreta creada
        </p>

        {/* Heading */}
        <h2
          id="post-create-title"
          className="m-0 mb-[8px] font-[var(--font-ln-serif)] text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]"
        >
          ¡Ya está registrada!
        </h2>

        {/* Body */}
        <p className="mb-[24px] text-md leading-[1.55] text-[var(--color-ln-ink-2)]">
          Podés agregar más datos ahora (raza, microchip, vacunas…) o hacerlo más tarde desde su
          perfil.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-[10px]">
          {/* Primary: navigate to editar */}
          <Link
            href={`/mis-mascotas/${publicToken}/editar`}
            className="inline-flex w-full items-center justify-center gap-[6px] rounded-[3px] border border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] px-[16px] py-[10px] text-[13px] font-semibold text-white no-underline transition-colors hover:border-[var(--color-ln-azul-700)] hover:bg-[var(--color-ln-azul-700)]"
          >
            Seguir cargando datos →
          </Link>

          {/* Secondary: dismiss */}
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[16px] py-[10px] text-[13px] font-semibold text-[var(--color-ln-ink-2)] transition-colors hover:bg-[var(--color-ln-stripe)]"
          >
            Guardar y terminar
          </button>
        </div>
      </dialog>
    </>
  );
}
