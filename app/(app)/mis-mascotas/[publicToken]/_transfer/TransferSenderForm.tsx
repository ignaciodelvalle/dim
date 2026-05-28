"use client";

// Owner→owner transfer sender form — opens inside SheetMounter (P3-2).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { type InitiateTransferInput, initiatePetTransferAction } from "@/app/actions/pet-transfer";

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
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Le traspasás la titularidad de {petName} a otro usuario. El receptor recibe una invitación y
        debe aceptarla — la libreta sanitaria viaja con la mascota.
      </p>

      <div className="space-y-1">
        <label
          htmlFor="transfer-email"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Email del receptor
        </label>
        <input
          id="transfer-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="receptor@ejemplo.com"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-gob-primary focus:outline-none focus:ring-1 focus:ring-gob-primary dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Si todavía no tiene cuenta en MiMAR, le enviamos un link de signup.
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="transfer-reason"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Motivo
        </label>
        <select
          id="transfer-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as InitiateTransferInput["reason"])}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="transfer-note"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Comentario (opcional)
        </label>
        <textarea
          id="transfer-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        La propuesta vence en 7 días. Mientras esté pendiente podés cancelarla.
      </p>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

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
