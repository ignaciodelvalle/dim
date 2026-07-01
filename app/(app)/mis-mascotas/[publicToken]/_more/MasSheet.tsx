"use client";

// MasSheet — "⋯ Más" sheet (design ADR-7). Groups everything that used to be
// standalone Resumen sections or a full PetActionsMenu list into one sheet:
// Editar · Transferir · Buscar hogar · Perro de asistencia · Confirmar
// devolución (conditional) · Documentos de viaje · Ficha · Contactos.

import Link from "next/link";
import { type MasSheetInput, deriveMasSheetItems } from "./MasSheet.helpers";

export function MasSheet(props: MasSheetInput) {
  const items = deriveMasSheetItems(props);

  if (items.length === 0) {
    return <p className="text-sm text-[var(--color-ln-mute)]">No hay más acciones disponibles.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex min-h-11 w-full items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-4 py-3 text-sm font-medium text-[var(--color-ln-ink-2)] no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
          >
            {item.label}
            <span aria-hidden className="shrink-0 text-xs opacity-60">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
