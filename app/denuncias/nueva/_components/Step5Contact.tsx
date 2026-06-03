"use client";

// Step 5 — Cerrar: anónima vs con contacto + evidencia + submit.
// Two cards: "Anónima" (submit immediately) vs "Con contacto" (collect email/phone then submit).
// Evidence uploader: optional multi-file input with client-side mime/size/count validation
// and image preview thumbnails. Files are lifted into WizardState (evidenceFiles) so the
// wizard's handleSubmit can append them to FormData before calling createWelfareReportAction.

import { useRef } from "react";

import { Input } from "@/components/poncho";

export type ContactMode = "anonymous" | "with_contact";

export type EvidenceFile = {
  file: File;
  /** Object URL for image previews; null for video files. */
  objectUrl: string | null;
};

const MAX_EVIDENCE_FILES = 5;
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EVIDENCE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

type Step5ContactProps = {
  contactMode: ContactMode | null;
  contactEmail: string;
  contactPhone: string;
  evidenceFiles: EvidenceFile[];
  evidenceError: string | null;
  onContactModeChange: (mode: ContactMode) => void;
  onContactEmailChange: (email: string) => void;
  onContactPhoneChange: (phone: string) => void;
  onEvidenceFilesChange: (files: EvidenceFile[]) => void;
  onEvidenceErrorChange: (error: string | null) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string | null;
};

export function Step5Contact({
  contactMode,
  contactEmail,
  contactPhone,
  evidenceFiles,
  evidenceError,
  onContactModeChange,
  onContactEmailChange,
  onContactPhoneChange,
  onEvidenceFilesChange,
  onEvidenceErrorChange,
  onSubmit,
  isPending,
  error,
}: Step5ContactProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmitAnonymous = contactMode === "anonymous";
  const canSubmitWithContact =
    contactMode === "with_contact" &&
    (contactEmail.trim().length > 0 || contactPhone.trim().length > 0);

  const canSubmit = canSubmitAnonymous || canSubmitWithContact;

  function handleFilesSelected(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    onEvidenceErrorChange(null);

    const newFiles = Array.from(incoming);
    const combined = [...evidenceFiles.map((e) => e.file), ...newFiles];

    if (combined.length > MAX_EVIDENCE_FILES) {
      onEvidenceErrorChange(`Solo podés adjuntar hasta ${MAX_EVIDENCE_FILES} archivos en total.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (const f of newFiles) {
      if (!ALLOWED_EVIDENCE_MIME.has(f.type)) {
        onEvidenceErrorChange(
          `Tipo de archivo no soportado: "${f.name}". Solo imágenes (JPG, PNG, WebP, HEIC, GIF) y videos (MP4, WebM, MOV).`,
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (f.size > MAX_EVIDENCE_BYTES) {
        onEvidenceErrorChange(`El archivo "${f.name}" supera el límite de 25 MB.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const added: EvidenceFile[] = newFiles.map((f) => ({
      file: f,
      objectUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    }));
    onEvidenceFilesChange([...evidenceFiles, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeEvidence(index: number) {
    const entry = evidenceFiles[index];
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    onEvidenceFilesChange(evidenceFiles.filter((_, i) => i !== index));
    onEvidenceErrorChange(null);
  }

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gob-text">
          ¿Cómo querés enviarla?
        </h1>
        <p className="text-sm text-gob-text-muted">Podés enviar sin dar ningún dato personal.</p>
      </div>

      {/* Mode cards */}
      <div className="space-y-3">
        {/* Anonymous card */}
        <button
          type="button"
          onClick={() => onContactModeChange("anonymous")}
          className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-colors ${
            contactMode === "anonymous"
              ? "border-gob-primary bg-gob-surface-alt"
              : "border-gob-border hover:border-gob-border-strong"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
              🕵️
            </span>
            <span>
              <span className="block text-sm font-semibold text-gob-text">Enviar anónima</span>
              <span className="block text-xs text-gob-text-muted mt-0.5">
                Sin datos de contacto. El código DEN-XXXX es tu única forma de seguimiento.
              </span>
            </span>
          </span>
        </button>

        {/* With contact card */}
        <button
          type="button"
          onClick={() => onContactModeChange("with_contact")}
          className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-colors ${
            contactMode === "with_contact"
              ? "border-gob-primary bg-gob-surface-alt"
              : "border-gob-border hover:border-gob-border-strong"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
              📞
            </span>
            <span>
              <span className="block text-sm font-semibold text-gob-text">
                Sumar mi contacto (más útil)
              </span>
              <span className="block text-xs text-gob-text-muted mt-0.5">
                Email o teléfono. Sin DNI. El equipo puede contactarte para más info.
              </span>
            </span>
          </span>
        </button>
      </div>

      {/* Contact fields — shown when mode is with_contact */}
      {contactMode === "with_contact" && (
        <div className="rounded-xl border border-gob-border p-4 space-y-4">
          <p className="text-xs text-gob-text-gray leading-relaxed">
            Tu contacto es anónimo en el sentido de que no pedimos DNI ni nombre. Solo para que
            podamos avisarte si avanza la denuncia.
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="reporterContactPhone"
              className="block text-sm font-medium text-gob-text"
            >
              Teléfono (preferido)
            </label>
            <Input
              id="reporterContactPhone"
              name="reporterContactPhone"
              type="tel"
              placeholder="+54 11 1234-5678"
              value={contactPhone}
              onChange={(e) => onContactPhoneChange(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="reporterContactEmail"
              className="block text-sm font-medium text-gob-text"
            >
              Email (alternativo)
            </label>
            <Input
              id="reporterContactEmail"
              name="reporterContactEmail"
              type="email"
              placeholder="tu@email.com"
              value={contactEmail}
              onChange={(e) => onContactEmailChange(e.target.value)}
              autoComplete="email"
            />
          </div>
          {contactMode === "with_contact" &&
            contactEmail.trim().length === 0 &&
            contactPhone.trim().length === 0 && (
              <p className="text-xs text-gob-warning-text">
                Completá al menos un dato de contacto, o cambiá a "Enviar anónima".
              </p>
            )}
        </div>
      )}

      {/* Evidence uploader — multi-file with client-side validation.
          Files are lifted into WizardState.evidenceFiles and appended to FormData
          in DenunciaWizard.handleSubmit. The file input is cleared after each
          selection to allow incremental adds (same pattern as WelfareReportForm). */}
      <div className="space-y-3 rounded-xl border border-dashed border-gob-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gob-text">
            📎 Sumar fotos o videos{" "}
            <span className="font-normal text-gob-text-muted">(opcional)</span>
          </span>
          {evidenceFiles.length > 0 && (
            <span className="text-xs text-gob-text-muted">
              {evidenceFiles.length}/{MAX_EVIDENCE_FILES}
            </span>
          )}
        </div>

        <p className="text-xs text-gob-text-muted">
          Hasta {MAX_EVIDENCE_FILES} archivos, 25 MB cada uno. Imágenes (JPG, PNG, WebP, HEIC, GIF)
          y videos (MP4, WebM, MOV).
        </p>

        {/* File input — cleared after each selection to allow incremental adds */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,image/heic,image/heif"
          capture="environment"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="block w-full text-xs text-gob-text-gray file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gob-surface-alt file:text-gob-text file:cursor-pointer"
        />

        {evidenceError && (
          <p className="text-xs text-gob-danger" role="alert">
            {evidenceError}
          </p>
        )}

        {evidenceFiles.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {evidenceFiles.map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable list, no reordering
              <div key={i} className="relative group">
                {entry.objectUrl ? (
                  <img
                    src={entry.objectUrl}
                    alt={entry.file.name}
                    className="w-full aspect-square object-cover rounded-lg border border-gob-border"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg border border-gob-border bg-gob-surface-alt flex flex-col items-center justify-center gap-1 p-2">
                    <span className="text-2xl select-none" aria-hidden="true">
                      ▶
                    </span>
                    <p className="text-xs text-gob-text-muted text-center truncate w-full">
                      {entry.file.name}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeEvidence(i)}
                  aria-label={`Quitar ${entry.file.name}`}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p
          className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Submit button */}
      {contactMode && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isPending}
          className="w-full px-4 py-4 rounded-xl bg-gob-primary text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Enviando denuncia…" : "Enviar denuncia →"}
        </button>
      )}

      <p className="text-xs text-gob-text-muted text-center leading-relaxed">
        Al enviar confirmás que lo que describiste es lo que viste. No se requiere certeza — solo
        buena fe.
      </p>
    </section>
  );
}
