"use client";

import { useState, useTransition } from "react";

import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import {
  type InvestigationNoteEntryType,
  addInvestigationNoteAction,
  closeInvestigationAction,
  escalateInvestigationAction,
} from "@/src/modules/surveillance/actions";

type Mode =
  | "none"
  | "add_note"
  | "external_notification"
  | "escalate"
  | "close_resolved"
  | "close_dismissed";

const ENTRY_TYPES: { value: InvestigationNoteEntryType; label: string }[] = [
  { value: "classification", label: "Clasificacion de caso" },
  { value: "lab_result", label: "Resultado de laboratorio" },
  { value: "control_action", label: "Medida de control" },
  { value: "contact_tracing", label: "Rastreo de contactos" },
  { value: "final_report", label: "Informe epidemiologico final" },
  { value: "system", label: "Nota general" },
];

export function InvestigationActions({
  casePublicCode,
  currentStatus,
}: {
  casePublicCode: string;
  currentStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("none");
  const [notes, setNotes] = useState("");
  const [finalReport, setFinalReport] = useState("");
  const [entryType, setEntryType] = useState<InvestigationNoteEntryType>("system");
  // External notification (UI-7 B9) — date + channel + reference audit trail.
  const [extDate, setExtDate] = useState("");
  const [extChannel, setExtChannel] = useState("");
  const [extReference, setExtReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("none");
    setNotes("");
    setFinalReport("");
    setExtDate("");
    setExtChannel("");
    setExtReference("");
    setError(null);
  }

  function run(actionFn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await actionFn();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      reset();
      // Full document reload so the SSR page reflects the mutation
      // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
    });
  }

  function submit() {
    if (mode === "add_note") {
      run(() => addInvestigationNoteAction({ casePublicCode, entryType, notes }));
    } else if (mode === "external_notification") {
      run(() =>
        addInvestigationNoteAction({
          casePublicCode,
          entryType: "external_notification",
          notes,
          payload: {
            notified_at: extDate.trim() || null,
            channel: extChannel.trim() || null,
            reference: extReference.trim() || null,
          },
        }),
      );
    } else if (mode === "escalate") {
      run(() => escalateInvestigationAction({ casePublicCode, reason: notes }));
    } else if (mode === "close_resolved") {
      run(() =>
        closeInvestigationAction({
          casePublicCode,
          outcome: "resolved",
          finalReportText: finalReport.trim() || null,
          reason: notes,
        }),
      );
    } else if (mode === "close_dismissed") {
      run(() =>
        closeInvestigationAction({
          casePublicCode,
          outcome: "dismissed",
          reason: notes,
        }),
      );
    }
  }

  const canEscalate = currentStatus === "open";
  const canClose = currentStatus === "open" || currentStatus === "escalated";

  if (mode === "none") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => setMode("add_note")} tone="primary">
          Registrar dato / nota
        </ActionButton>
        <ActionButton onClick={() => setMode("external_notification")} tone="muted">
          Registrar notificación externa
        </ActionButton>
        {canEscalate && (
          <ActionButton onClick={() => setMode("escalate")} tone="warning">
            Escalar
          </ActionButton>
        )}
        {canClose && (
          <>
            <ActionButton onClick={() => setMode("close_resolved")} tone="success">
              Cerrar como resuelta
            </ActionButton>
            <ActionButton onClick={() => setMode("close_dismissed")} tone="muted">
              Cerrar como desestimada
            </ActionButton>
          </>
        )}
      </div>
    );
  }

  const titles: Record<Exclude<Mode, "none">, string> = {
    add_note: "Registrar dato epidemiológico o nota",
    external_notification: "Registrar notificación externa",
    escalate: "Escalar investigación",
    close_resolved: "Cerrar como resuelta",
    close_dismissed: "Cerrar como desestimada",
  };

  return (
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">{titles[mode]}</p>

      {mode === "add_note" && (
        <div className="space-y-1.5">
          <label htmlFor="entry-type" className="block text-sm font-medium text-ln-op-mute">
            Tipo de registro
          </label>
          <select
            id="entry-type"
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as InvestigationNoteEntryType)}
            className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
          >
            {ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "external_notification" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ext-date" className="block text-sm font-medium text-ln-op-mute">
              Fecha de notificación
            </label>
            <input
              id="ext-date"
              type="date"
              value={extDate}
              onChange={(e) => setExtDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ext-channel" className="block text-sm font-medium text-ln-op-mute">
              Canal
            </label>
            <input
              id="ext-channel"
              type="text"
              value={extChannel}
              onChange={(e) => setExtChannel(e.target.value)}
              placeholder="SNVS / SENASA / zoonosis…"
              className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ext-reference" className="block text-sm font-medium text-ln-op-mute">
              Referencia (opcional)
            </label>
            <input
              id="ext-reference"
              type="text"
              value={extReference}
              onChange={(e) => setExtReference(e.target.value)}
              placeholder="N.º de expediente / acta…"
              className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
            />
          </div>
        </div>
      )}

      {mode === "close_resolved" && (
        <div className="space-y-1.5">
          <label htmlFor="final-report" className="block text-sm font-medium text-ln-op-mute">
            Informe final (si no lo registraste antes)
          </label>
          <textarea
            id="final-report"
            value={finalReport}
            onChange={(e) => setFinalReport(e.target.value)}
            rows={3}
            placeholder="Texto del informe epidemiologico final (opcional si ya existe un registro previo)..."
            className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium text-ln-op-mute">
          {mode === "add_note"
            ? "Detalle (mínimo 5 caracteres)"
            : mode === "external_notification"
              ? "Detalle de la notificación (mínimo 5 caracteres)"
              : "Motivo (mínimo 10 caracteres)"}
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={
            mode === "add_note"
              ? "Describi el hallazgo, resultado o medida registrada..."
              : mode === "external_notification"
                ? "A quien y que se notifico por el canal externo..."
                : "Explica el motivo..."
          }
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
        />
        <p className="text-sm text-ln-op-mute tabular-nums">{notes.trim().length} caracteres</p>
      </div>

      {error && <output className="block text-[13px] text-ln-op-danger">{error}</output>}

      <div className="flex gap-2">
        <OpButton
          type="button"
          onClick={submit}
          disabled={
            pending ||
            (mode === "add_note" || mode === "external_notification"
              ? notes.trim().length < 5
              : notes.trim().length < 10)
          }
          variant="primary"
          className="px-4 py-2"
        >
          {pending ? "Procesando..." : "Confirmar"}
        </OpButton>
        <OpButton
          type="button"
          onClick={reset}
          disabled={pending}
          variant="ghost"
          className="px-4 py-2"
        >
          Cancelar
        </OpButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "primary" | "success" | "warning" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-ln-op-azul text-white hover:bg-ln-op-azul-700"
      : tone === "success"
        ? "bg-ln-op-ok text-white hover:opacity-90"
        : tone === "warning"
          ? "bg-ln-op-warn-bg text-ln-op-warn border border-ln-op-warn-bd hover:opacity-90"
          : "border border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors ${toneClass}`}
    >
      {children}
    </button>
  );
}
