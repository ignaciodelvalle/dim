"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmWelfareAsSpamAction,
  passWelfareToTriageAction,
} from "@/app/actions/welfare-moderation";

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
          className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white font-medium hover:bg-emerald-700"
        >
          Pasar a triage
        </button>
        <button
          type="button"
          onClick={() => setMode("spam")}
          className="px-3 py-1.5 rounded text-sm border border-red-300 text-red-700 font-medium hover:bg-red-50"
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
  const buttonClass =
    mode === "pass"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : "bg-gob-primary text-white hover:opacity-90";

  return (
    <div className="rounded-lg border border-gob-border-strong p-4 space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
      />
      <p className="text-xs text-neutral-500 tabular-nums">{notes.trim().length} caracteres</p>
      {error && <output className="block text-sm text-gob-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || notes.trim().length < 10}
          className={`px-4 py-2 rounded text-sm font-medium disabled:opacity-50 ${buttonClass}`}
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
