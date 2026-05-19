"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  closeWelfareReportAction,
  startWelfareReportAction,
  triageWelfareReportAction,
} from "@/app/actions/welfare-triage";
import type { WelfareReportStatus } from "@/lib/welfare";

type Mode = "none" | "triage" | "invalid" | "duplicate" | "start" | "close";

export function TriageActions({
  welfareReportId,
  currentStatus,
}: {
  welfareReportId: string;
  currentStatus: WelfareReportStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("none");
    setNotes("");
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
    if (mode === "triage") {
      run(() => triageWelfareReportAction({ welfareReportId, decision: "triaged", notes }));
    } else if (mode === "invalid") {
      run(() => triageWelfareReportAction({ welfareReportId, decision: "invalid", notes }));
    } else if (mode === "duplicate") {
      run(() => triageWelfareReportAction({ welfareReportId, decision: "duplicate", notes }));
    } else if (mode === "start") {
      run(() => startWelfareReportAction({ welfareReportId, notes }));
    } else if (mode === "close") {
      run(() => closeWelfareReportAction({ welfareReportId, resolutionNotes: notes }));
    }
  }

  // Action set per current status. The server enforces the same matrix —
  // this just hides the buttons that the server would reject anyway.
  const canTriage = currentStatus === "open";
  const canMarkInvalidOrDuplicate = currentStatus === "open" || currentStatus === "triaged";
  const canStart = currentStatus === "open" || currentStatus === "triaged";
  const canClose =
    currentStatus === "open" || currentStatus === "triaged" || currentStatus === "in_progress";

  if (mode === "none") {
    return (
      <div className="flex flex-wrap gap-2">
        {canTriage && (
          <ActionButton onClick={() => setMode("triage")} tone="primary">
            Marcar revisada
          </ActionButton>
        )}
        {canStart && (
          <ActionButton onClick={() => setMode("start")} tone="primary">
            Iniciar seguimiento
          </ActionButton>
        )}
        {canClose && (
          <ActionButton onClick={() => setMode("close")} tone="success">
            Cerrar con resolución
          </ActionButton>
        )}
        {canMarkInvalidOrDuplicate && (
          <>
            <ActionButton onClick={() => setMode("invalid")} tone="muted">
              Sin sustento
            </ActionButton>
            <ActionButton onClick={() => setMode("duplicate")} tone="muted">
              Duplicada
            </ActionButton>
          </>
        )}
      </div>
    );
  }

  const titles: Record<Exclude<Mode, "none">, string> = {
    triage: "Marcar como revisada",
    start: "Iniciar seguimiento",
    close: "Cerrar con resolución",
    invalid: "Cerrar por falta de sustento",
    duplicate: "Marcar como duplicada",
  };

  const placeholders: Record<Exclude<Mode, "none">, string> = {
    triage: "Notas internas del triage (mínimo 10 caracteres)",
    start: "Notas del inicio del seguimiento (mínimo 10 caracteres)",
    close:
      "Resolución final — qué se hizo, a quién se derivó, cualquier acción institucional. Mínimo 10 caracteres.",
    invalid: "Motivo por el que la denuncia no tiene sustento (mínimo 10 caracteres)",
    duplicate:
      "Indicá qué denuncia previa la duplica (referencia, código, contexto). Mínimo 10 caracteres.",
  };

  return (
    <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-3">
      <p className="text-sm font-medium">{titles[mode]}</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={placeholders[mode]}
        className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
      />
      <p className="text-xs text-neutral-500 tabular-nums">{notes.trim().length} caracteres</p>
      {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || notes.trim().length < 10}
          className="px-4 py-2 rounded bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-sm"
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
  tone: "primary" | "success" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800"
      : tone === "success"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : "border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900";
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
