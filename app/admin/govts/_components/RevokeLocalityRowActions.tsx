"use client";

// Per-row locality revocation UI for the govt detail page.
//
// State machine: idle → confirming → submitting → done | error
// Mirrors RevokeUserActions.tsx structure — design §8.8.
//
// Wraps the existing revokeGovtLocalityAction from Fase 4 with the
// standard motivo + evidence upload pattern.

import { useRef, useState, useTransition } from "react";

import { revokeGovtLocalityAction } from "@/app/actions/admin-revocations";
import { uploadRevocationEvidence } from "@/app/actions/revocation-evidence";
import { Checkbox } from "@/components/poncho";
import { createClient } from "@/lib/supabase/client";

const MOTIVO_MIN = 30;

type UploadedFile = { name: string; attachmentId: string };

type Mode = "idle" | "confirming" | "done";

export function RevokeLocalityRowActions({
  assignmentId,
  localityLabel,
  actorUserId,
}: {
  assignmentId: string;
  localityLabel: string;
  actorUserId: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");

  if (mode === "done") {
    return <span className="text-[10px] text-gob-success ">Revocada</span>;
  }

  if (mode === "confirming") {
    return (
      <RevokeLocalityForm
        assignmentId={assignmentId}
        localityLabel={localityLabel}
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
      className="text-[10px] px-2 py-1 rounded border border-gob-warning  text-gob-warning-text  hover:opacity-90 transition-opacity"
    >
      Revocar
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

function RevokeLocalityForm({
  assignmentId,
  localityLabel,
  actorUserId,
  onDone,
  onCancel,
}: {
  assignmentId: string;
  localityLabel: string;
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
      } catch {
        setError(`Error inesperado subiendo ${file.name}.`);
        setUploading(false);
        return;
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(attachmentId: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.attachmentId !== attachmentId));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await revokeGovtLocalityAction({
        govtAssignmentId: assignmentId,
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
    <div className="rounded border border-gob-warning  p-3 space-y-3 bg-gob-warning/10  mt-2">
      <p className="text-xs uppercase tracking-wider text-gob-warning-text ">
        Revocar localidad — {localityLabel}
      </p>

      <MotivoField value={motivo} onChange={setMotivo} />

      <div className="space-y-1">
        <label
          htmlFor="revoke-locality-evidence"
          className="block text-[10px] uppercase tracking-wider text-gob-text-muted "
        >
          Evidencia (al menos 1 archivo)
        </label>
        <input
          id="revoke-locality-evidence"
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFilesChange}
          disabled={uploading || pending}
          className="text-xs text-gob-text-gray "
        />
        {uploading && <p className="text-[10px] text-gob-text-muted ">Subiendo...</p>}
        {uploadedFiles.length > 0 && (
          <ul className="space-y-0.5">
            {uploadedFiles.map((f) => (
              <li
                key={f.attachmentId}
                className="flex items-center gap-2 text-[10px] text-gob-text-gray "
              >
                <span className="truncate max-w-[200px]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.attachmentId)}
                  className="text-gob-danger hover:underline shrink-0"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Checkbox
        checked={confirm}
        onChange={(e) => setConfirm(e.target.checked)}
        labelClassName="text-xs! text-gob-warning-text!"
      >
        Confirmo que quiero revocar la localidad {localityLabel}. Esta accion genera un registro
        permanente en el audit log.
      </Checkbox>

      {error && <p className="text-xs text-gob-danger ">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="text-xs px-3 py-1.5 rounded-md bg-gob-warning  text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Revocando..." : "Revocar localidad"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md border border-gob-border  hover:bg-gob-surface-alt "
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form primitives
// ---------------------------------------------------------------------------

function MotivoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const len = value.trim().length;
  const tooShort = len < MOTIVO_MIN;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label
          htmlFor="revoke-locality-motivo"
          className="block text-[10px] uppercase tracking-wider text-gob-text-muted "
        >
          Motivo (minimo {MOTIVO_MIN} caracteres)
        </label>
        <span
          className={`text-[10px] tabular-nums ${tooShort ? "text-gob-danger " : "text-gob-text-muted "}`}
        >
          {len}/{MOTIVO_MIN}
        </span>
      </div>
      <textarea
        id="revoke-locality-motivo"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded-md border border-gob-border  bg-white  px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gob-primary "
      />
    </div>
  );
}
