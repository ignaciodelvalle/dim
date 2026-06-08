"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Checkbox } from "@/components/poncho";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import {
  acceptFosterProposalAction,
  rejectFosterProposalAction,
} from "@/src/modules/foster/actions";

const REJECTION_REASONS = [
  { value: "capacity", label: "No tengo capacity ahora" },
  { value: "health_mismatch", label: "No me siento preparado/a para esta condición" },
  { value: "timing", label: "Mal momento" },
  { value: "distance", label: "Muy lejos" },
  { value: "household", label: "Razones del hogar" },
  { value: "other", label: "Otro" },
] as const;

type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export function ProposalActions({
  proposalPublicToken,
  petName,
  orgName,
}: {
  proposalPublicToken: string;
  petName: string;
  orgName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [acceptedRemaining, setAcceptedRemaining] = useState<number | null>(null);
  const [mode, setMode] = useState<"none" | "accept" | "reject">("none");

  // Accept state
  const [allowCoFoster, setAllowCoFoster] = useState(false);
  const [acceptNotes, setAcceptNotes] = useState("");

  // Reject state
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("capacity");
  const [rejectNotes, setRejectNotes] = useState("");

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptFosterProposalAction({
        proposalPublicToken,
        allowCoFoster,
        responseNotes: acceptNotes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAcceptedRemaining(result.remainingSlots);
      if (result.cascadeCancelledProposals.length > 0) {
        // Surface the cascade-cancel side effect alongside the success
        // screen's description so the user knows what else happened.
        setOkMessage(
          `${result.cascadeCancelledProposals.length} propuesta(s) pendiente(s) se cancelaron por falta de capacity.`,
        );
      }
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectFosterProposalAction({
        proposalPublicToken,
        rejectionReason,
        responseNotes: rejectNotes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(`Rechazaste la propuesta de ${orgName}.`);
      router.refresh();
    });
  }

  // Acceptance success → render full SuccessScreen with cascade detail in
  // the description when applicable (sprint 6 PR-053).
  if (acceptedRemaining !== null) {
    const baseDescription = `Aceptaste el tránsito de ${petName}. Te quedan ${acceptedRemaining} slot(s) disponibles para nuevas propuestas.`;
    return (
      <SuccessScreen
        title={`Tránsito aceptado: ${petName}`}
        description={okMessage ? `${baseDescription} ${okMessage}` : baseDescription}
        next={[
          { label: "Ver mis tránsitos", href: "/cuenta/transitos/activos" },
          { label: "Ver el perfil de la mascota", href: "/mis-mascotas", variant: "secondary" },
        ]}
      />
    );
  }

  // Rejection path keeps the lightweight inline confirmation — no follow-up
  // actions to surface beyond the message itself.
  if (okMessage) {
    return (
      <p className="text-sm rounded border border-gob-success bg-gob-success/10 px-3 py-2 text-gob-success   ">
        {okMessage}
      </p>
    );
  }

  if (mode === "accept") {
    return (
      <div className="rounded-lg border border-gob-success bg-gob-success/10/50   p-4 space-y-3">
        <h3 className="font-medium text-gob-success ">Aceptar tránsito de {petName}</h3>
        <Checkbox checked={allowCoFoster} onChange={(e) => setAllowCoFoster(e.target.checked)}>
          Permito que la organización asigne otro co-foster mientras yo lo cuide. Podés cambiarlo
          después.
        </Checkbox>
        <textarea
          value={acceptNotes}
          onChange={(e) => setAcceptNotes(e.target.value)}
          rows={2}
          placeholder="Notas para el refugio (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
        />
        {error && <output className="block text-sm text-gob-danger ">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-gob-success text-white font-medium hover:bg-gob-success disabled:opacity-50"
          >
            {pending ? "Aceptando..." : "Confirmar aceptación"}
          </button>
          <button
            type="button"
            onClick={() => setMode("none")}
            disabled={pending}
            className="px-4 py-2 rounded-lg border border-gob-border-strong "
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="rounded-lg border border-gob-border-strong  p-4 space-y-3">
        <h3 className="font-medium text-gob-text ">Rechazar propuesta</h3>
        <div>
          <label htmlFor="reject-reason" className="block text-sm font-medium text-gob-text mb-1">
            Motivo
          </label>
          <select
            id="reject-reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
            className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
          rows={2}
          placeholder="Notas (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
        />
        {error && <output className="block text-sm text-gob-danger ">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary disabled:opacity-50"
          >
            {pending ? "Enviando..." : "Confirmar rechazo"}
          </button>
          <button
            type="button"
            onClick={() => setMode("none")}
            disabled={pending}
            className="px-4 py-2 rounded-lg border border-gob-border-strong "
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setMode("accept")}
        className="px-4 py-2 rounded-lg bg-gob-success text-white font-medium hover:bg-gob-success"
      >
        Aceptar propuesta
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="px-4 py-2 rounded-lg border border-gob-border-strong  hover:bg-gob-surface-alt "
      >
        Rechazar
      </button>
    </div>
  );
}
