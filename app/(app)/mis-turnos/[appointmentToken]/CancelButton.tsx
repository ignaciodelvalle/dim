"use client";

// Owner-side cancellation trigger for /mis-turnos/[appointmentToken].
// Uses URL state (?sheet=cancelar-turno) instead of browser confirm().

import { buildSheetUrl } from "@/components/poncho/Sheet.helpers";
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
      className="px-4 py-2 rounded-md border border-gob-danger text-gob-danger text-sm font-medium hover:bg-gob-danger/10 transition-colors"
    >
      Cancelar turno
    </button>
  );
}
