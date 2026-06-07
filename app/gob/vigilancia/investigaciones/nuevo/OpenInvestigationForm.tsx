"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { openOutbreakInvestigationAction } from "@/src/modules/surveillance/actions";
import type { EnoDisease } from "@/src/modules/surveillance/domain/eno-catalog";

export function OpenInvestigationForm({
  diseases,
  prefillDiseaseCode,
  prefillSignalId,
}: {
  diseases: readonly EnoDisease[];
  prefillDiseaseCode?: string;
  prefillSignalId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diseaseCode, setDiseaseCode] = useState(prefillDiseaseCode ?? "");
  const [reason, setReason] = useState("");
  const [signalId, setSignalId] = useState(prefillSignalId ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await openOutbreakInvestigationAction({
        diseaseCode,
        reason,
        linkedSignalEventId: signalId.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/gob/vigilancia/investigaciones/${result.publicCode}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="diseaseCode" className="block text-sm font-medium text-gob-text">
          Enfermedad (ENO)
        </label>
        <select
          id="diseaseCode"
          value={diseaseCode}
          onChange={(e) => setDiseaseCode(e.target.value)}
          required
          className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm"
        >
          <option value="">Seleccionar enfermedad...</option>
          {diseases.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label} â€” {d.severity === "critical" ? "critica" : "alta"} ({d.notifyHours}h)
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reason" className="block text-sm font-medium text-gob-text">
          Motivo de apertura (minimo 10 caracteres)
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          required
          minLength={10}
          placeholder="Describe la situacion epidemiologica que motiva la apertura..."
          className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm"
        />
        <p className="text-xs text-gob-text-muted tabular-nums">
          {reason.trim().length} caracteres
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signalId" className="block text-sm font-medium text-gob-text">
          Signal vinculada (opcional)
        </label>
        <input
          id="signalId"
          type="text"
          value={signalId}
          onChange={(e) => setSignalId(e.target.value)}
          placeholder="ID del outbreak_signal event (si existe)"
          className="w-full px-3 py-2 rounded border border-gob-border bg-white text-sm font-mono"
        />
      </div>

      {error && <output className="block text-sm text-gob-danger">{error}</output>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !diseaseCode || reason.trim().length < 10}
          className="px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {pending ? "Abriendo..." : "Abrir investigacion"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={pending}
          className="px-4 py-2 rounded-lg border border-gob-border text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
