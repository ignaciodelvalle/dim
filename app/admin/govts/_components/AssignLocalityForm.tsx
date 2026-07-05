"use client";

// Assign a new locality to an active govt operator.
//
// State machine: idle → confirming → done | error
// Inline form (no modal wrapper) — designed to sit inside the govts detail page
// below the active-localities table, mirroring the RevokeLocalityRowActions pattern.

import { useState, useTransition } from "react";

import { assignGovtLocalityAction } from "@/app/actions/admin-institutional";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

type Mode = "idle" | "confirming" | "done";

type AssignedLocality = { province: string; locality: string };

export function AssignLocalityForm({
  targetUserId,
  onAssigned,
}: {
  targetUserId: string;
  onAssigned?: (locality: AssignedLocality) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  // provinceName is the canonical display name from ar_provincias, resolved
  // by LocalityPickerAcross when the user picks a result.
  const [provinceName, setProvinceName] = useState("");
  const [locality, setLocality] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAssigned, setLastAssigned] = useState<AssignedLocality | null>(null);
  const [pending, startTransition] = useTransition();

  const localityTrimmed = locality.trim();
  const canSubmit = provinceName.length > 0 && localityTrimmed.length > 0 && !pending;

  if (mode === "done" && lastAssigned) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ln-op-ok font-medium">
          Localidad asignada: {lastAssigned.locality}, {lastAssigned.province}
        </p>
        <button
          type="button"
          onClick={() => {
            setMode("idle");
            setProvinceName("");
            setLocality("");
            setLastAssigned(null);
          }}
          className="text-xs underline underline-offset-2 text-ln-op-mute hover:text-ln-op-ink-2"
        >
          Asignar otra
        </button>
      </div>
    );
  }

  if (mode === "confirming") {
    return (
      <div className="rounded-[var(--radius-md)] border border-ln-op-blue-bd bg-ln-op-blue-bg p-3 space-y-3">
        <p className="text-xs uppercase tracking-wider font-bold text-ln-op-azul">
          Asignar nueva localidad
        </p>

        <div className="space-y-1">
          <label
            htmlFor="assign-locality-locality"
            className="block text-xs uppercase tracking-wider text-ln-op-mute"
          >
            Localidad
          </label>
          <LocalityPickerAcross
            id="assign-locality-locality"
            onSelect={(r) => {
              setProvinceName(r?.provinceName ?? "");
              setLocality(r?.localityName ?? "");
            }}
          />
          {provinceName && <p className="text-xs text-ln-op-mute">Provincia: {provinceName}</p>}
        </div>

        {error && <p className="text-sm text-ln-op-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <OpButton
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            variant="primary"
            size="sm"
          >
            {pending ? "Asignando..." : "Confirmar asignacion"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={pending}
            variant="ghost"
            size="sm"
          >
            Cancelar
          </OpButton>
        </div>
      </div>
    );
  }

  return (
    <OpButton type="button" onClick={() => setMode("confirming")} variant="primary" size="sm">
      Asignar nueva localidad
    </OpButton>
  );

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await assignGovtLocalityAction({
        targetUserId,
        province: provinceName,
        locality: localityTrimmed,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      const assigned = { province: provinceName, locality: localityTrimmed };
      setLastAssigned(assigned);
      // Full document reload so the SSR institutional list reflects the
      // change immediately (router.refresh() is banned - see
      // lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
      setMode("done");
      onAssigned?.(assigned);
    });
  }
}
