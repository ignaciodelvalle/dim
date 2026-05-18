"use client";

// Assign a new locality to an active govt operator.
//
// State machine: idle → confirming → done | error
// Inline form (no modal wrapper) — designed to sit inside the govts detail page
// below the active-localities table, mirroring the RevokeLocalityRowActions pattern.

import { useState, useTransition } from "react";

import { assignGovtLocalityAction } from "@/app/actions/admin-institutional";
import { LocalityCombobox } from "@/components/LocalityCombobox";
import { PROVINCES } from "@/lib/ar-provincias";

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
  // provinceCode is the ISO 3166-2:AR code (e.g. "AR-C"). It feeds the
  // combobox's scope and is mapped to the display name at submit time.
  const [provinceCode, setProvinceCode] = useState("");
  const [locality, setLocality] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAssigned, setLastAssigned] = useState<AssignedLocality | null>(null);
  const [pending, startTransition] = useTransition();

  const provinceName = PROVINCES.find((p) => p.code === provinceCode)?.name ?? "";
  const localityTrimmed = locality.trim();
  const canSubmit = provinceName.length > 0 && localityTrimmed.length > 0 && !pending;

  if (mode === "done" && lastAssigned) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Localidad asignada: {lastAssigned.locality}, {lastAssigned.province}
        </p>
        <button
          type="button"
          onClick={() => {
            setMode("idle");
            setProvinceCode("");
            setLocality("");
            setLastAssigned(null);
          }}
          className="text-[10px] underline underline-offset-2 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Asignar otra
        </button>
      </div>
    );
  }

  if (mode === "confirming") {
    return (
      <div className="rounded border border-blue-200 dark:border-blue-900 p-3 space-y-3 bg-blue-50 dark:bg-blue-950/20">
        <p className="text-xs uppercase tracking-wider text-blue-900 dark:text-blue-300">
          Asignar nueva localidad
        </p>

        <div className="space-y-2">
          <div className="space-y-1">
            <label
              htmlFor="assign-locality-province"
              className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500"
            >
              Provincia
            </label>
            <select
              id="assign-locality-province"
              value={provinceCode}
              onChange={(e) => {
                setProvinceCode(e.target.value);
                setLocality("");
              }}
              disabled={pending}
              className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-50"
            >
              <option value="">Elegí una provincia</option>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="assign-locality-locality"
              className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500"
            >
              Localidad
            </label>
            <LocalityCombobox
              provinceCode={provinceCode || null}
              defaultValue={{ localityName: locality }}
              name="assignLocalityName"
              onSelect={(r) => setLocality(r?.localityName ?? "")}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-700 dark:bg-blue-700 text-white hover:opacity-90 disabled:opacity-50"
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
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
      className="text-xs px-3 py-1.5 rounded-md border border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 hover:opacity-90 transition-opacity"
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
