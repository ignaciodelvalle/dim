"use client";

// Owner→owner transfer sender form — opens inside SheetMounter (P3-2).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, Input, Select, Textarea } from "@/components/poncho";
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
  const router = useRouter();
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
          router.push(`/transferencias/${result.transferToken}`);
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <p className="text-sm text-gob-text-gray ">
        Le traspasás la titularidad de {petName} a otro usuario. El receptor recibe una invitación y
        debe aceptarla — la libreta sanitaria viaja con la mascota.
      </p>

      <Field
        label="Email del receptor"
        help="Si todavía no tiene cuenta en MiMAR, le enviamos un link de signup."
        required
        error={error ?? undefined}
      >
        {({ id, describedBy, invalid }) => (
          <Input
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
      </Field>

      <Field label="Motivo" required>
        {({ id, describedBy, invalid }) => (
          <Select
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
          </Select>
        )}
      </Field>

      <Field label="Comentario">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <p className="text-xs text-gob-text-muted ">
        La propuesta vence en 7 días. Mientras esté pendiente podés cancelarla.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-gob-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar propuesta"}
      </button>
    </form>
  );
}
