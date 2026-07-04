"use client";

import { useState, useTransition } from "react";

import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import {
  closeWelfareReportAction,
  startWelfareReportAction,
  triageWelfareReportAction,
} from "@/src/modules/welfare/actions";
import type { WelfareReportStatus } from "@/src/modules/welfare/domain/types";

type Mode = "none" | "triage" | "invalid" | "duplicate" | "start" | "close";

export function TriageActions({
  welfareReportId,
  currentStatus,
}: {
  welfareReportId: string;
  currentStatus: WelfareReportStatus;
}) {
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
      // Full document reload so the SSR page reflects the mutation
      // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
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
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">{titles[mode]}</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={placeholders[mode]}
        className="w-full px-3 py-2 rounded border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink"
      />
      <p className="text-[11px] text-ln-op-mute tabular-nums">{notes.trim().length} caracteres</p>
      {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <OpButton
          type="button"
          onClick={submit}
          disabled={pending || notes.trim().length < 10}
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
  tone: "primary" | "success" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-ln-op-azul text-white hover:opacity-90"
      : tone === "success"
        ? "bg-ln-op-ok text-white hover:opacity-90"
        : "border border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-[4px] text-sm font-medium ${toneClass}`}
    >
      {children}
    </button>
  );
}
