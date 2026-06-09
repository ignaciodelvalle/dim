"use client";

// Assign a new locality to an active govt operator.
//
// State machine: idle → confirming → done | error
// Inline form (no modal wrapper) — designed to sit inside the govts detail page
// below the active-localities table, mirroring the RevokeLocalityRowActions pattern.

import { useState, useTransition } from "react";

import { assignGovtLocalityAction } from "@/app/actions/admin-institutional";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";

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
        <p className="text-[12px] text-ln-op-ok font-medium">
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
          className="text-[10px] underline underline-offset-2 text-ln-op-mute hover:text-ln-op-ink-2"
        >
          Asignar otra
        </button>
      </div>
    );
  }

  if (mode === "confirming") {
    return (
      <div className="rounded-[6px] border border-ln-op-blue-bd bg-ln-op-blue-bg p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-ln-op-azul">
          Asignar nueva localidad
        </p>

        <div className="space-y-1">
          <label
            htmlFor="assign-locality-locality"
            className="block text-[10px] uppercase tracking-wider text-ln-op-mute"
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
          {provinceName && <p className="text-[10px] text-ln-op-mute">Provincia: {provinceName}</p>}
        </div>

        {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-[12px] px-3 py-1.5 rounded-[6px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700 disabled:opacity-50"
          >
            {pending ? "Asignando..." : "Confirmar asignacion"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={pending}
            className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-line hover:bg-ln-op-stripe"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMode("confirming")}
      className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-blue-bd text-ln-op-azul hover:bg-ln-op-blue-bg transition-colors"
    >
      Asignar nueva localidad
    </button>
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
      setMode("done");
      onAssigned?.(assigned);
    });
  }
}
