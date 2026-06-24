"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addDisputePartyAction } from "@/app/actions/custody-disputes";
import { OpButton } from "@/components/ui/dashboard";

const ROLE_OPTIONS = [
  { value: "current_owner", label: "Dueño actual" },
  { value: "claimant_owner", label: "Reclamante (persona)" },
  { value: "current_org_custody", label: "Organizacion en custodia" },
  { value: "claimant_org", label: "Organizacion reclamante" },
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
      setError("Pega el ID del usuario u organizacion.");
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
        className="text-[13px] underline text-ln-op-azul hover:text-ln-op-azul-700"
      >
        {"+ Sumar parte"}
      </button>
    );
  }

  return (
    <div className="rounded-[6px] border border-ln-op-line p-3 space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">Sumar parte a la disputa</p>

      <div className="flex gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => setPartyKind("user")}
          className={`px-2 py-1 rounded-[4px] border ${
            partyKind === "user"
              ? "bg-ln-op-azul text-white border-ln-op-azul"
              : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
          }`}
        >
          Persona
        </button>
        <button
          type="button"
          onClick={() => setPartyKind("org")}
          className={`px-2 py-1 rounded-[4px] border ${
            partyKind === "org"
              ? "bg-ln-op-azul text-white border-ln-op-azul"
              : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
          }`}
        >
          Organizacion
        </button>
      </div>

      <div>
        <label htmlFor="party-id" className="block text-[12px] text-ln-op-mute mb-1">
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
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-mono text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
      </div>

      <div>
        <label htmlFor="party-role" className="block text-[12px] text-ln-op-mute mb-1">
          Rol en la disputa
        </label>
        <select
          id="party-role"
          value={partyRole}
          onChange={(e) => setPartyRole(e.target.value as RoleValue)}
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="party-summary" className="block text-[12px] text-ln-op-mute mb-1">
          Posicion / nota (opcional)
        </label>
        <textarea
          id="party-summary"
          value={positionSummary}
          onChange={(e) => setPositionSummary(e.target.value)}
          rows={2}
          placeholder="Resumen de la posicion de esta parte"
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
      </div>

      {error && <output className="block text-[13px] text-ln-op-danger">{error}</output>}

      <div className="flex gap-2">
        <OpButton type="button" onClick={submit} disabled={pending} variant="primary" size="sm">
          {pending ? "Sumando..." : "Sumar parte"}
        </OpButton>
        <OpButton
          type="button"
          onClick={() => setOpen(false)}
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
