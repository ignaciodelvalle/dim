"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveDisputeAction } from "@/app/actions/custody-disputes";

const OUTCOMES = [
  { value: "ownership_confirmed", label: "Confirma al dueño actual" },
  { value: "ownership_transferred", label: "Transfiere a otra parte" },
  { value: "case_dismissed", label: "Caso desestimado" },
  { value: "other", label: "Otro" },
] as const;

type Outcome = (typeof OUTCOMES)[number]["value"];

export function ResolveDisputeForm({ disputeToken }: { disputeToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>("ownership_confirmed");
  const [transferKind, setTransferKind] = useState<"user" | "org">("user");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferToOrgId, setTransferToOrgId] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function submit() {
    setError(null);
    setOkMessage(null);
    if (resolutionSummary.trim().length < 100) {
      setError("El resumen tiene que tener al menos 100 caracteres.");
      return;
    }
    startTransition(async () => {
      const result = await resolveDisputeAction({
        disputeToken,
        resolution: outcome,
        resolutionSummary,
        transferToUserId:
          outcome === "ownership_transferred" && transferKind === "user"
            ? transferToUserId.trim() || null
            : null,
        transferToOrgId:
          outcome === "ownership_transferred" && transferKind === "org"
            ? transferToOrgId.trim() || null
            : null,
        notes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Disputa resuelta.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gob-border-strong  p-4">
      <div>
        <label htmlFor="outcome" className="block text-xs text-gob-text-muted mb-1">
          Resolución
        </label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome)}
          className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
        >
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {outcome === "ownership_transferred" && (
        <div className="space-y-2 rounded border border-gob-border  p-3">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setTransferKind("user")}
              className={`px-2 py-1 rounded border ${
                transferKind === "user"
                  ? "bg-gob-primary  text-white  border-gob-border-strong "
                  : "border-gob-border-strong "
              }`}
            >
              A persona
            </button>
            <button
              type="button"
              onClick={() => setTransferKind("org")}
              className={`px-2 py-1 rounded border ${
                transferKind === "org"
                  ? "bg-gob-primary  text-white  border-gob-border-strong "
                  : "border-gob-border-strong "
              }`}
            >
              A organización
            </button>
          </div>
          <div>
            <label htmlFor="transfer-target" className="block text-xs text-gob-text-muted mb-1">
              {transferKind === "user"
                ? "User ID destino (UUID)"
                : "Organization ID destino (UUID)"}
            </label>
            <input
              id="transfer-target"
              type="text"
              value={transferKind === "user" ? transferToUserId : transferToOrgId}
              onChange={(e) =>
                transferKind === "user"
                  ? setTransferToUserId(e.target.value)
                  : setTransferToOrgId(e.target.value)
              }
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm font-mono"
            />
            <p className="text-xs text-gob-text-muted mt-1">
              La transferencia cierra todas las ownerships activas y abre una nueva al destino.
            </p>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="resolution-summary" className="block text-xs text-gob-text-muted mb-1">
          Resumen de la resolución (mínimo 100 caracteres)
        </label>
        <textarea
          id="resolution-summary"
          value={resolutionSummary}
          onChange={(e) => setResolutionSummary(e.target.value)}
          rows={5}
          placeholder="Explicá el fundamento, evidencia considerada y decisión tomada."
          className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
        />
        <p className="text-xs text-gob-text-muted mt-1 tabular-nums">
          {resolutionSummary.trim().length} / 100
        </p>
      </div>

      <div>
        <label htmlFor="resolution-notes" className="block text-xs text-gob-text-muted mb-1">
          Notas internas (opcional)
        </label>
        <textarea
          id="resolution-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notas que quedan en el payload del evento"
          className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
        />
      </div>

      {error && <output className="block text-sm text-gob-danger ">{error}</output>}
      {okMessage && <output className="block text-sm text-gob-success ">{okMessage}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 rounded bg-gob-primary  text-white  text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Resolviendo..." : "Resolver disputa"}
        </button>
      </div>
    </div>
  );
}
