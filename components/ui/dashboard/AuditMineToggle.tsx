"use client";

// AuditMineToggle — the "Ver solo mi actividad" control shared by the audit-
// history twins (/gob/historial, /admin/historial), F-migration
// 2026-07-21 cluster 2.
//
// BEFORE: a one-way `<a href="?actor={userId}">Ver solo mi actividad</a>` link
// — it could SET the actor filter to the viewer but never toggle it back off
// from itself (only re-picking a different actor in the dropdown, or
// "Limpiar filtros", cleared it).
//
// AFTER: a real checkbox in OpFilterBar's `children` slot. Checked ⇄
// actor=<userId>; unchecked ⇄ no actor param (the page's genuine "todos los
// actores" default) — so this is a TOGGLE, not an axis: the Actor dropdown is
// already a registered `axis` with the correct "all" default, and this
// control writes the SAME `actor` param via the SAME serverNavCommit
// primitive, exactly mirroring the pre-migration page's two affordances
// (dropdown + quick link) over one param. Uses `defaultChecked` (uncontrolled,
// same as VerifiedFilterCheckbox on /gob/vigilancia/brotes) — every commit is
// a full-document navigation, so the server-rendered checked state is always
// fresh on the next paint.
import { useSearchParams } from "next/navigation";

import { OpCheckbox } from "@/components/ui/dashboard/OpField";
import { serverNavCommit } from "@/lib/ui/filter-commit";

export type AuditMineToggleProps = {
  /** The viewer's own user id — the value written to `actor` when checked. */
  userId: string;
  /** Whether the CURRENT actor filter already equals the viewer (checked state). */
  isMine: boolean;
  /** Extra searchParam keys to drop on commit (e.g. a keyset `cursor`). */
  resetParamsOnChange?: readonly string[];
};

export function AuditMineToggle({
  userId,
  isMine,
  resetParamsOnChange = [],
}: AuditMineToggleProps) {
  const searchParams = useSearchParams();

  return (
    <OpCheckbox
      defaultChecked={isMine}
      onChange={(e) => {
        serverNavCommit(searchParams.toString())(
          { actor: e.currentTarget.checked ? userId : null },
          resetParamsOnChange,
        );
      }}
    >
      Ver solo mi actividad
    </OpCheckbox>
  );
}
