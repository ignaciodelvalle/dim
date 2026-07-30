"use client";

// Owner→owner transfer sender form — opens inside SheetMounter (P3-2).

import { useState, useTransition } from "react";

import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import {
  type InitiatePetTransferInput as InitiateTransferInput,
  initiatePetTransferAction,
} from "@/src/modules/transfers/actions";

const REASONS: Array<{ value: InitiateTransferInput["reason"]; label: string }> = [
  { value: "sale", label: "Venta" },
  { value: "gift", label: "Regalo" },
  { value: "inheritance", label: "Herencia" },
  { value: "other", label: "Otro" },
];

export function TransferSenderForm({
  petName,
  petToken,
}: {
  petName: string;
  petToken: string;
}) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<InitiateTransferInput["reason"]>("gift");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await initiatePetTransferAction({
            petToken,
            toEmail: email,
            reason,
            note: note.trim() || null,
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          // Full document navigation to the transfer detail page — the soft
          // push + router.refresh() pair rides the client-router transition
          // machinery with the silent-drop defect (see
          // lib/ui/full-page-action-nav.ts).
          navigateAfterActionSuccess(`/transferencias/${result.transferToken}`);
        });
      }}
      className="space-y-4"
    >
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        Le traspasás la titularidad de {petName} a otro usuario. El receptor recibe una invitación y
        debe aceptarla — la libreta sanitaria viaja con la mascota.
      </p>

      <LnField
        label="Email del receptor"
        hint="Si todavía no tiene cuenta en miMAR, le enviamos un link de signup."
        required
        error={error ?? undefined}
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="receptor@ejemplo.com"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Motivo" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            value={reason}
            onChange={(e) => setReason(e.target.value as InitiateTransferInput["reason"])}
            aria-describedby={describedBy}
            invalid={invalid}
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      <LnField label="Comentario">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {/* C.2 — this said "Mientras esté pendiente podés cancelarla" and the
          sender could not. CancelTransferAction exists ONLY under app/org/: a
          citizen has no cancel control on /transferencias, none on the transfer
          detail (where `cancelled` is just a status LABEL), and no action to
          call. The screen promised a capability that belongs to organizations.
          Corrected to what is actually true — expiry is the sender's only exit
          today. Giving citizens a real cancel is a product decision, raised for
          the PO rather than half-built here. */}
      <p className="text-xs text-[var(--color-ln-mute)]">
        La propuesta vence en 7 días. Si no la aceptan antes, caduca sola y la mascota sigue siendo
        tuya.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar propuesta"}
      </button>
    </form>
  );
}
