"use client";

import { useState, useTransition } from "react";

import { addDisputePartyAction, lookupTransferTargetAction } from "@/app/actions/custody-disputes";
import { Icon } from "@/components/Icon";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

const ROLE_OPTIONS = [
  { value: "current_owner", label: "Dueño actual" },
  { value: "claimant_owner", label: "Reclamante (persona)" },
  { value: "current_org_custody", label: "Organizacion en custodia" },
  { value: "claimant_org", label: "Organizacion reclamante" },
  { value: "witness", label: "Testigo" },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

// Verify-before-submit (V9 usability fix): reuses the SAME dispute-scoped
// lookupTransferTargetAction ResolveDisputeForm already calls on this page —
// no new server code, same tenant-isolation gate (lookup-transfer-target.ts).
// This isn't a full search combobox (no org/user directory browse here), but
// it turns "paste a UUID and hope" into "paste an ID and see who it resolves
// to before submitting."
type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; displayName: string; active: boolean }
  | { status: "error"; message: string };

export function AddPartyForm({ disputeToken }: { disputeToken: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [partyKind, setPartyKind] = useState<"user" | "org">("user");
  const [partyUserId, setPartyUserId] = useState("");
  const [partyOrgId, setPartyOrgId] = useState("");
  const [partyRole, setPartyRole] = useState<RoleValue>("claimant_owner");
  const [positionSummary, setPositionSummary] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  const currentId = partyKind === "user" ? partyUserId : partyOrgId;

  function handleIdChange(value: string) {
    if (partyKind === "user") setPartyUserId(value);
    else setPartyOrgId(value);
    setVerifyState({ status: "idle" });
  }

  function handleKindChange(kind: "user" | "org") {
    setPartyKind(kind);
    setVerifyState({ status: "idle" });
  }

  function verify() {
    const id = currentId.trim();
    if (!id) return;
    setVerifyState({ status: "loading" });
    startTransition(async () => {
      const result = await lookupTransferTargetAction({ kind: partyKind, id, disputeToken });
      if (!result.found) {
        setVerifyState({ status: "error", message: result.error });
      } else {
        setVerifyState({ status: "ok", displayName: result.displayName, active: result.active });
      }
    });
  }

  function submit() {
    setError(null);
    const id = partyKind === "user" ? partyUserId.trim() : partyOrgId.trim();
    if (!id) {
      setError("Pega el ID del usuario u organizacion.");
      return;
    }
    if (verifyState.status !== "ok") {
      setError("Verificá el ID antes de sumar la parte.");
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
      setVerifyState({ status: "idle" });
      // Full document reload so the SSR page reflects the mutation
      // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
    });
  }

  if (!open) {
    return (
      <OpButton type="button" onClick={() => setOpen(true)} variant="primary" size="sm">
        {"+ Sumar parte"}
      </OpButton>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-ln-op-line p-3 space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">Sumar parte a la disputa</p>

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => handleKindChange("user")}
          className={`px-2 py-1 rounded-[var(--radius-sm)] border ${
            partyKind === "user"
              ? "bg-ln-op-azul text-white border-ln-op-azul"
              : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
          }`}
        >
          Persona
        </button>
        <button
          type="button"
          onClick={() => handleKindChange("org")}
          className={`px-2 py-1 rounded-[var(--radius-sm)] border ${
            partyKind === "org"
              ? "bg-ln-op-azul text-white border-ln-op-azul"
              : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
          }`}
        >
          Organizacion
        </button>
      </div>

      <div>
        <label htmlFor="party-id" className="block text-sm text-ln-op-mute mb-1">
          {partyKind === "user" ? "ID de usuario (UUID)" : "ID de organización (UUID)"}
        </label>
        <div className="flex gap-2">
          <input
            id="party-id"
            type="text"
            value={currentId}
            onChange={(e) => handleIdChange(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] font-mono text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
          />
          <OpButton
            type="button"
            onClick={verify}
            disabled={pending || !currentId.trim()}
            variant="ghost"
            className="px-3 py-2 whitespace-nowrap"
          >
            {verifyState.status === "loading" ? "Verificando..." : "Verificar"}
          </OpButton>
        </div>

        {verifyState.status === "ok" && (
          <p
            className={`text-sm mt-1 flex items-center gap-1 ${verifyState.active ? "text-ln-op-ok" : "text-ln-op-danger"}`}
          >
            <Icon name={verifyState.active ? "check" : "close"} size={14} decorative />
            <span>
              {verifyState.displayName}
              {!verifyState.active && " — desactivado"}
            </span>
          </p>
        )}
        {verifyState.status === "error" && (
          <p className="text-sm text-ln-op-danger mt-1">{verifyState.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="party-role" className="block text-sm text-ln-op-mute mb-1">
          Rol en la disputa
        </label>
        <select
          id="party-role"
          value={partyRole}
          onChange={(e) => setPartyRole(e.target.value as RoleValue)}
          className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="party-summary" className="block text-sm text-ln-op-mute mb-1">
          Posicion / nota (opcional)
        </label>
        <textarea
          id="party-summary"
          value={positionSummary}
          onChange={(e) => setPositionSummary(e.target.value)}
          rows={2}
          placeholder="Resumen de la posicion de esta parte"
          className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
      </div>

      {error && <output className="block text-[13px] text-ln-op-danger">{error}</output>}

      <div className="flex gap-2">
        <OpButton
          type="button"
          onClick={submit}
          disabled={pending || verifyState.status !== "ok"}
          variant="primary"
          size="sm"
        >
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
