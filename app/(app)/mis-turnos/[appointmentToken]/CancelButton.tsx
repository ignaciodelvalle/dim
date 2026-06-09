"use client";

// Owner-side cancellation trigger for /mis-turnos/[appointmentToken].
// Uses URL state (?sheet=cancelar-turno) instead of browser confirm().

import { buildSheetUrl } from "@/lib/sheet-helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function CancelButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    router.push(buildSheetUrl(pathname, params, "cancelar-turno"));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-4 py-2 rounded-[3px] border border-[var(--color-ln-seal)] text-[var(--color-ln-seal)] text-sm font-medium hover:bg-[#fbe9e6] transition-colors"
    >
      Cancelar turno
    </button>
  );
}
