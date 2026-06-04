"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  type InvestigationNoteEntryType,
  addInvestigationNoteAction,
  closeInvestigationAction,
  escalateInvestigationAction,
} from "@/app/actions/outbreak-investigation";

type Mode = "none" | "add_note" | "escalate" | "close_resolved" | "close_dismissed";

const ENTRY_TYPES: { value: InvestigationNoteEntryType; label: string }[] = [
  { value: "dataset_classification", label: "Clasificacion de caso" },
  { value: "lab_result", label: "Resultado de laboratorio" },
  { value: "control_action", label: "Medida de control" },
  { value: "contact_tracing", label: "Rastreo de contactos" },
  { value: "final_report", label: "Informe epidemiologico final" },
  { value: "general_note", label: "Nota general" },
];

export function InvestigationActions({
  casePublicCode,
  currentStatus,
}: {
  casePublicCode: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("none");
  const [notes, setNotes] = useState("");
  const [finalReport, setFinalReport] = useState("");
  const [entryType, setEntryType] = useState<InvestigationNoteEntryType>("general_note");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("none");
    setNotes("");
    setFinalReport("");
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
      router.refresh();
    });
  }

  function submit() {
    if (mode === "add_note") {
      run(() => addInvestigationNoteAction({ casePublicCode, entryType, notes }));
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
    add_note: "Registrar dato epidemiologico o nota",
    escalate: "Escalar investigacion",
    close_resolved: "Cerrar como resuelta",
    close_dismissed: "Cerrar como desestimada",
  };

  return (
    <div className="rounded-lg border border-gob-border-strong p-4 space-y-3">
      <p className="text-sm font-medium">{titles[mode]}</p>

      {mode === "add_note" && (
        <div className="space-y-1.5">
          <label htmlFor="entry-type" className="block text-xs font-medium text-gob-text-muted">
            Tipo de registro
          </label>
          <select
            id="entry-type"
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as InvestigationNoteEntryType)}
            className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm"
          >
            {ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "close_resolved" && (
        <div className="space-y-1.5">
          <label htmlFor="final-report" className="block text-xs font-medium text-gob-text-muted">
            Informe final (si no lo registraste antes)
          </label>
          <textarea
            id="final-report"
            value={finalReport}
            onChange={(e) => setFinalReport(e.target.value)}
            rows={3}
            placeholder="Texto del informe epidemiologico final (opcional si ya existe un registro previo)..."
            className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-xs font-medium text-gob-text-muted">
          {mode === "add_note" ? "Detalle (minimo 5 caracteres)" : "Motivo (minimo 10 caracteres)"}
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={
            mode === "add_note"
              ? "Describi el hallazgo, resultado o medida registrada..."
              : "Explica el motivo..."
          }
          className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm"
        />
        <p className="text-xs text-gob-text-muted tabular-nums">{notes.trim().length} caracteres</p>
      </div>

      {error && <output className="block text-sm text-gob-danger">{error}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={
            pending || (mode === "add_note" ? notes.trim().length < 5 : notes.trim().length < 10)
          }
          className="px-4 py-2 rounded bg-gob-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="px-4 py-2 rounded border border-gob-border-strong text-sm"
        >
          Cancelar
        </button>
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
      ? "bg-gob-primary text-white"
      : tone === "success"
        ? "bg-gob-success text-white"
        : tone === "warning"
          ? "bg-gob-warning/20 text-gob-warning-text border border-gob-warning/30"
          : "border border-gob-border-strong text-gob-text-gray hover:bg-gob-surface-alt";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium ${toneClass}`}
    >
      {children}
    </button>
  );
}
