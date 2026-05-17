"use client";

// Revocation UI for vet role downgrade.
//
// State machine: idle → confirming → submitting → done | error
// Mirrors ProposeUserActions.tsx structure — design ADR-3.
//
// Evidence upload flow (design §3, spec REQ-6):
//   1. User picks files via <input type="file">
//   2. Each file is uploaded to Supabase Storage by the parent (via uploadRevocationEvidence)
//      and the resulting attachment IDs are accumulated in state.
//   3. On submit, attachmentIds[] are passed to revokeVetRoleAction.
//
// Client-side canRevoke hides the button when the actor clearly has no scope
// (defense-in-depth; server is authoritative).

import { useRef, useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";
import { uploadRevocationEvidence } from "@/app/actions/revocation-evidence";
import { revokeVetRoleAction } from "@/app/actions/admin-revocations";
import { canRevoke } from "@/lib/revocation-scope";
import type { AdminOrGovtJurisdiction } from "@/lib/revocation-scope";

const MOTIVO_MIN = 30;

type Target = {
  id: string;
  displayName: string;
  matriculaJurisdiccion: string | null;
  role: "owner" | "vet" | "govt" | "admin";
};

type UploadedFile = { name: string; attachmentId: string };

type Mode = "idle" | "confirming" | "done";

export function RevokeUserActions({
  target,
  actorUserId,
  actorRole,
  jurisdictions,
}: {
  target: Target;
  actorUserId: string;
  actorRole: "admin" | "govt";
  jurisdictions: readonly AdminOrGovtJurisdiction[];
}) {
  // Client-side capability check — server always re-validates.
  const canAct = canRevoke(
    { id: actorUserId, role: actorRole },
    {
      type: "vet_role",
      matriculaJurisdiccion: target.matriculaJurisdiccion ?? "",
    },
    jurisdictions,
  );

  if (!canAct || target.role !== "vet") return null;

  const [mode, setMode] = useState<Mode>("idle");

  if (mode === "done") {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Rol vet revocado. {target.displayName} fue notificado.
      </p>
    );
  }

  if (mode === "confirming") {
    return (
      <RevokeVetForm
        target={target}
        actorUserId={actorUserId}
        onDone={() => setMode("done")}
        onCancel={() => setMode("idle")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMode("confirming")}
      className="text-xs px-3 py-1.5 rounded-md border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 hover:opacity-90 transition-opacity"
    >
      Revocar rol vet
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

function RevokeVetForm({
  target,
  actorUserId,
  onDone,
  onCancel,
}: {
  target: Target;
  actorUserId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const motivoTrimmed = motivo.trim();
  const motivoValid = motivoTrimmed.length >= MOTIVO_MIN;
  const canSubmit = motivoValid && uploadedFiles.length >= 1 && confirm && !pending && !uploading;

  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const newFiles: UploadedFile[] = [];

    for (const file of files) {
      try {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${actorUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from("revocations")
          .upload(path, file, { contentType: file.type });

        if (storageError) {
          setError(`Error al subir ${file.name}: ${storageError.message}`);
          setUploading(false);
          return;
        }

        const result = await uploadRevocationEvidence(actorUserId, {
          storagePath: path,
          mimeType: file.type,
          fileSize: file.size,
        });

        if ("error" in result) {
          setError(`Error al registrar ${file.name}: ${result.error}`);
          setUploading(false);
          return;
        }

        newFiles.push({ name: file.name, attachmentId: result.attachmentId });
      } catch (err) {
        setError(`Error inesperado subiendo ${file.name}.`);
        setUploading(false);
        return;
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setUploading(false);
    // Reset file input so the same file can be re-picked if removed.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(attachmentId: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.attachmentId !== attachmentId));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await revokeVetRoleAction({
        targetUserId: target.id,
        motivo: motivoTrimmed,
        attachmentIds: uploadedFiles.map((f) => f.attachmentId),
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <div className="rounded border border-red-200 dark:border-red-900 p-3 space-y-3 bg-red-50 dark:bg-red-950/20">
      <p className="text-xs uppercase tracking-wider text-red-900 dark:text-red-300">
        Revocar rol vet — {target.displayName}
      </p>
      <p className="text-[10px] text-red-800 dark:text-red-400">
        Esta accion es irreversible desde esta interfaz. El usuario quedarapor como dueno y recibira
        una notificacion con el motivo.
      </p>

      <MotivoField value={motivo} onChange={setMotivo} />

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
          Evidencia (al menos 1 archivo)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFilesChange}
          disabled={uploading || pending}
          className="text-xs text-neutral-700 dark:text-neutral-300"
        />
        {uploading && (
          <p className="text-[10px] text-neutral-500 dark:text-neutral-500">Subiendo...</p>
        )}
        {uploadedFiles.length > 0 && (
          <ul className="space-y-0.5">
            {uploadedFiles.map((f) => (
              <li key={f.attachmentId} className="flex items-center gap-2 text-[10px] text-neutral-600 dark:text-neutral-400">
                <span className="truncate max-w-[200px]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.attachmentId)}
                  className="text-red-500 hover:underline shrink-0"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <span className="text-xs text-red-900 dark:text-red-300">
          Confirmo que quiero revocar el rol veterinario de {target.displayName}. Esta accion
          genera un registro permanente en el audit log.
        </span>
      </label>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="text-xs px-3 py-1.5 rounded-md bg-red-700 dark:bg-red-700 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Revocando..." : "Revocar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form primitives (duplicated locally — design ADR refactor in Fase 5+)
// ---------------------------------------------------------------------------

function MotivoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const len = value.trim().length;
  const tooShort = len < MOTIVO_MIN;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
          Motivo (minimo {MOTIVO_MIN} caracteres)
        </label>
        <span
          className={`text-[10px] tabular-nums ${tooShort ? "text-red-500 dark:text-red-400" : "text-neutral-400 dark:text-neutral-600"}`}
        >
          {len}/{MOTIVO_MIN}
        </span>
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-50"
      />
    </div>
  );
}
