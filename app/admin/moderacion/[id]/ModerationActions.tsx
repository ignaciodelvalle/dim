"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmWelfareAsSpamAction,
  passWelfareToTriageAction,
} from "@/src/modules/welfare/actions";

type Mode = "none" | "pass" | "spam";

export function ModerationActions({ welfareReportId }: { welfareReportId: string }) {
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

  function submit() {
    setError(null);
    const action =
      mode === "pass"
        ? () => passWelfareToTriageAction({ welfareReportId, notes })
        : () => confirmWelfareAsSpamAction({ welfareReportId, notes });
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      reset();
      router.push("/admin/moderacion");
      router.refresh();
    });
  }

  if (mode === "none") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("pass")}
          className="rounded-[6px] bg-ln-op-ok px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Pasar a triage
        </button>
        <button
          type="button"
          onClick={() => setMode("spam")}
          className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-1.5 text-[12px] font-semibold text-ln-op-danger transition-opacity hover:opacity-80"
        >
          Confirmar como spam
        </button>
      </div>
    );
  }

  const title = mode === "pass" ? "Pasar a triage" : "Confirmar como spam";
  const placeholder =
    mode === "pass"
      ? "Por qué considerás que es legítima a pesar del flag (mínimo 10 caracteres)."
      : "Por qué confirmás que es spam — pattern observado, frecuencia, etc. (mínimo 10).";

  const confirmClass =
    mode === "pass"
      ? "bg-ln-op-ok text-white hover:opacity-90"
      : "bg-ln-op-navy text-white hover:opacity-90";

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-semibold text-ln-op-ink">{title}</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 text-[12px] text-ln-op-ink placeholder:text-ln-op-faint focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
      />
      <p className="text-[11px] tabular-nums text-ln-op-mute">{notes.trim().length} caracteres</p>
      {error && <output className="block text-[12px] text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || notes.trim().length < 10}
          className={`rounded-[6px] px-4 py-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
        >
          {pending ? "Procesando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="rounded-[6px] border border-ln-op-line px-4 py-2 text-[12px] text-ln-op-ink-2 hover:bg-ln-op-stripe disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
