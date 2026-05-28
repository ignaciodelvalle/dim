"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { eraseMySubjectDataAction, exportMySubjectDataAction } from "@/app/actions/subject-rights";

export function PrivacyActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showErase, setShowErase] = useState(false);
  const [eraseReason, setEraseReason] = useState("");

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportMySubjectDataAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const json = JSON.stringify(result.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const filename = `mimar-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function handleErase() {
    setError(null);
    if (!confirm("Confirmás eliminar tu cuenta? Esta acción es irreversible.")) return;
    startTransition(async () => {
      const result = await eraseMySubjectDataAction(eraseReason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          className="rounded-lg border border-gob-danger/40 bg-gob-danger/10 px-4 py-3 text-sm text-gob-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="rounded-lg border border-gob-border p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gob-text">Descargar mis datos</h2>
          <p className="text-sm text-gob-text-muted mt-1">
            Bajás un JSON con tu perfil, tus mascotas, sus identificaciones y los eventos sanitarios
            asociados. Ley 25.326, art. 14 (derecho de acceso).
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={pending}
          className="rounded-lg bg-gob-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Generando…" : "Descargar JSON"}
        </button>
      </section>

      <section className="rounded-lg border border-gob-danger/30 bg-gob-danger/5 p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gob-text">Eliminar mi cuenta</h2>
          <p className="text-sm text-gob-text-gray mt-1">
            Soft-delete con hash de PII. Tu cuenta queda fuera del sistema; los eventos sanitarios
            de tus mascotas se preservan por norma (ver nota debajo). Ley 25.326, art. 16 (derecho
            de supresión).
          </p>
        </div>
        {showErase ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gob-text" htmlFor="erase-reason">
              Motivo (mínimo 5 caracteres)
            </label>
            <textarea
              id="erase-reason"
              rows={2}
              maxLength={500}
              value={eraseReason}
              onChange={(e) => setEraseReason(e.target.value)}
              className="w-full rounded-lg border border-gob-border bg-gob-surface px-3 py-2 text-sm text-gob-text focus:border-gob-primary focus:outline-none focus:ring-1 focus:ring-gob-primary"
              placeholder="Ya no uso MiMAR / migración a otra plataforma / ..."
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowErase(false)}
                className="flex-1 rounded-lg border border-gob-border bg-gob-surface px-3 py-2 text-sm font-medium text-gob-text"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleErase}
                disabled={pending || eraseReason.trim().length < 5}
                className="flex-1 rounded-lg bg-gob-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Procesando…" : "Confirmar borrado"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowErase(true)}
            className="rounded-lg border border-gob-danger/40 bg-gob-surface px-4 py-2.5 text-sm font-medium text-gob-danger hover:bg-gob-danger/5"
          >
            Quiero eliminar mi cuenta
          </button>
        )}
      </section>
    </div>
  );
}
