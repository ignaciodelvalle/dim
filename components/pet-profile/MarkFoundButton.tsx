"use client";

// MarkFoundButton — lightweight confirm wrapper for "Marcar encontrado/a".
//
// "Marcar encontrada/o" (revert lost) is reversible but consequential: it
// closes the emergency cockpit and stops active lost alerts. A single
// native-confirm step prevents accidental taps without heavy UI overhead
// (UX 3.5 item 7).

import type { ComponentProps } from "react";

type FormAction = NonNullable<ComponentProps<"form">["action"]>;

export function MarkFoundButton({
  action,
  label,
}: {
  action: FormAction;
  label: string;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Confirmar que ${label.toLowerCase()}? Esto cerrará el modo búsqueda.`)) {
      e.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="flex-shrink-0">
      <button
        type="submit"
        className="cursor-pointer rounded-[3px] border border-white bg-white px-[16px] py-[9px] font-[var(--font-ln-sans)] text-[12.5px] font-semibold text-[var(--color-ln-seal)] transition-colors hover:bg-white/90"
      >
        ✓ {label}
      </button>
    </form>
  );
}
