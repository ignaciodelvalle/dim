"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addDisputePartyAction } from "@/app/actions/custody-disputes";

const ROLE_OPTIONS = [
  { value: "current_owner", label: "Dueño actual" },
  { value: "claimant_owner", label: "Reclamante (persona)" },
  { value: "current_org_custody", label: "Organización en custodia" },
  { value: "claimant_org", label: "Organización reclamante" },
  { value: "witness", label: "Testigo" },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

export function AddPartyForm({ disputeToken }: { disputeToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [partyKind, setPartyKind] = useState<"user" | "org">("user");
  const [partyUserId, setPartyUserId] = useState("");
  const [partyOrgId, setPartyOrgId] = useState("");
  const [partyRole, setPartyRole] = useState<RoleValue>("claimant_owner");
  const [positionSummary, setPositionSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const id = partyKind === "user" ? partyUserId.trim() : partyOrgId.trim();
    if (!id) {
      setError("Pegá el ID del usuario u organización.");
      return;
    }
    startTransition(async () => {
      const result = await addDisputePartyAction({
        disputeToken,
        partyUserId: partyKind === "user" ? id : null,
        partyOrgId: partyKind === "org" ? id : null,
        partyRole,
        positionSummary: positionSummary.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setPartyUserId("");
      setPartyOrgId("");
      setPositionSummary("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm underline text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
      >
        + Sumar parte
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 space-y-3">
      <p className="text-sm font-medium">Sumar parte a la disputa</p>

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setPartyKind("user")}
          className={`px-2 py-1 rounded border ${
            partyKind === "user"
              ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-50"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          Persona
        </button>
        <button
          type="button"
          onClick={() => setPartyKind("org")}
          className={`px-2 py-1 rounded border ${
            partyKind === "org"
              ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-50"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          Organización
        </button>
      </div>

      <div>
        <label htmlFor="party-id" className="block text-xs text-neutral-500 mb-1">
          {partyKind === "user" ? "User ID (UUID)" : "Organization ID (UUID)"}
        </label>
        <input
          id="party-id"
          type="text"
          value={partyKind === "user" ? partyUserId : partyOrgId}
          onChange={(e) =>
            partyKind === "user" ? setPartyUserId(e.target.value) : setPartyOrgId(e.target.value)
          }
          placeholder="00000000-0000-0000-0000-000000000000"
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm font-mono"
        />
      </div>

      <div>
        <label htmlFor="party-role" className="block text-xs text-neutral-500 mb-1">
          Rol en la disputa
        </label>
        <select
          id="party-role"
          value={partyRole}
          onChange={(e) => setPartyRole(e.target.value as RoleValue)}
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="party-summary" className="block text-xs text-neutral-500 mb-1">
          Posición / nota (opcional)
        </label>
        <textarea
          id="party-summary"
          value={positionSummary}
          onChange={(e) => setPositionSummary(e.target.value)}
          rows={2}
          placeholder="Resumen de la posición de esta parte"
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 disabled:opacity-50"
        >
          {pending ? "Sumando..." : "Sumar parte"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
