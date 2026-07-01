"use client";

// WelfareReportForm — legacy form used by the org-side welfare denuncia page
// at /org/[orgToken]/maltrato/nuevo.
//
// The PUBLIC /denuncias/nueva route now uses DenunciaWizard instead of this form.
// This component is kept alive for the org flow (createOrgWelfareReportAction)
// which has different UX requirements (min 100-char description, mandatory evidence,
// severity auto-overridden to critical) that don't fit the public wizard.
//
// TODO(M-followup): build a dedicated org-side wizard and retire this form.

import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnRadio, LnSelect, LnTextarea } from "@/components/ui/Field";
import type { WelfareReportFormState } from "@/src/modules/welfare/actions";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_SUBJECT_KINDS,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";

const initialState: WelfareReportFormState = { error: null };

type FormAction = (
  prev: WelfareReportFormState,
  formData: FormData,
) => Promise<WelfareReportFormState>;

const MAX_EVIDENCE_FILES = 5;
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
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

type EvidenceFile = {
  file: File;
  objectUrl: string | null; // null for videos
};

export function WelfareReportForm({
  action,
  isAnonymous,
}: {
  action: FormAction;
  isAnonymous: boolean;
}) {
  const [subjectKind, setSubjectKind] = useState<string>("unowned_animal");
  const [description, setDescription] = useState("");
  const [showContact, setShowContact] = useState(false);

  // Evidence files state
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const evidenceFilesRef = useRef<EvidenceFile[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep ref in sync with state so the action closure always reads latest files.
  evidenceFilesRef.current = evidenceFiles;

  // Wrap the action to inject evidence files from the ref (stable reference,
  // reads current files at submit time without recreating the action).
  const actionRef = useRef(action);
  actionRef.current = action;

  function boundAction(prev: WelfareReportFormState, formData: FormData) {
    for (const entry of evidenceFilesRef.current) {
      formData.append("attachment", entry.file);
    }
    return actionRef.current(prev, formData);
  }

  // useActionState receives boundAction which reads from refs (evidenceFilesRef,
  // actionRef) that are always current — so the first-render closure stays valid
  // across the component lifetime even as files are added/removed.
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEvidenceError(null);

    const incoming = Array.from(files);
    const combined = [...evidenceFilesRef.current.map((e) => e.file), ...incoming];

    if (combined.length > MAX_EVIDENCE_FILES) {
      setEvidenceError(`Solo podés adjuntar hasta ${MAX_EVIDENCE_FILES} archivos en total.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (const f of incoming) {
      if (!ALLOWED_EVIDENCE_MIME.has(f.type)) {
        setEvidenceError(
          `Tipo de archivo no soportado: "${f.name}". Solo imágenes (JPG, PNG, WebP, HEIC, GIF) y videos (MP4, WebM, MOV).`,
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (f.size > MAX_EVIDENCE_BYTES) {
        setEvidenceError(`El archivo "${f.name}" supera el límite de 25 MB.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const newEntries: EvidenceFile[] = incoming.map((f) => ({
      file: f,
      objectUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    }));

    setEvidenceFiles((prev) => [...prev, ...newEntries]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeEvidence(index: number) {
    setEvidenceFiles((prev) => {
      const entry = prev[index];
      if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
    setEvidenceError(null);
  }

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="clientIdempotencyKey"
        value={idempotencyKey}
        suppressHydrationWarning
      />
      {isAnonymous && (
        <p className="text-sm text-ln-ink-2 bg-ln-stripe rounded-lg px-4 py-3">
          Estás denunciando de forma anónima. Si querés seguimiento, podés{" "}
          <Link href="/login" className="underline underline-offset-2 hover:text-ln-ink">
            iniciar sesión
          </Link>{" "}
          o dejar un contacto opcional abajo.
        </p>
      )}

      {/* Kind */}
      <LnField label="Tipo de situación" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect id={id} name="kind" required aria-describedby={describedBy} invalid={invalid}>
            <option value="">Seleccioná una opción</option>
            {WELFARE_REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {welfareReportKindLabel(k)}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      {/* Severity */}
      <LnField label="Gravedad" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="severity"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">Seleccioná una opción</option>
            {WELFARE_REPORT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {welfareReportSeverityLabel(s)}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      {/* Description */}
      <LnField label="¿Qué pasó?" required hint={`${description.length} caracteres (mínimo 20)`}>
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="description"
            rows={5}
            required
            minLength={20}
            placeholder="Contá lo que viste con detalle: cuándo, dónde, quiénes están involucrados, qué condición está el animal…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {/* Subject kind */}
      <fieldset className="mb-7">
        <legend className="mb-2.5 text-[0.88em] font-semibold text-ln-mute">
          ¿Sobre quién?
          <span className="ml-1 text-ln-err" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="space-y-2 mt-1">
          {WELFARE_REPORT_SUBJECT_KINDS.map((sk) => (
            <LnRadio
              key={sk}
              name="subjectKind"
              value={sk}
              checked={subjectKind === sk}
              onChange={() => setSubjectKind(sk)}
            >
              {welfareReportSubjectKindLabel(sk)}
            </LnRadio>
          ))}
        </div>
      </fieldset>

      {/* Conditional subject fields */}
      {subjectKind === "registered_pet" && (
        <LnField label="Código MiMAR de la mascota">
          {({ id, describedBy }) => (
            <LnInput
              id={id}
              name="subjectPetToken"
              type="text"
              placeholder="Ej: DIM-XXXX-XXXX"
              aria-describedby={describedBy}
            />
          )}
        </LnField>
      )}

      {subjectKind !== "registered_pet" && (
        <LnField
          label={
            subjectKind === "unowned_animal"
              ? "Descripción del animal"
              : subjectKind === "location"
                ? "Descripción del lugar"
                : "Descripción de la situación"
          }
          required
        >
          {({ id, describedBy, invalid }) => (
            <LnTextarea
              id={id}
              name="subjectDescription"
              rows={3}
              required
              placeholder={
                subjectKind === "unowned_animal"
                  ? "Describí al animal: especie aproximada, color, tamaño…"
                  : subjectKind === "location"
                    ? "Describí el lugar: dirección, características…"
                    : "Describí la situación…"
              }
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </LnField>
      )}

      {/* Observed symptoms (optional) */}
      <LnField label="¿Notaste síntomas en el animal?">
        {({ id, describedBy }) => (
          <LnTextarea
            id={id}
            name="observedSymptoms"
            rows={3}
            placeholder="Ej: baboso, agresivo, débil, cojeando, con heridas, etc."
            aria-describedby={describedBy}
          />
        )}
      </LnField>

      {/* Location */}
      <LocationFields mode="l2" />

      {/* Occurred at */}
      <LnField label="¿Cuándo pasó o desde cuándo viene pasando?">
        {({ id, describedBy }) => (
          <LnInput id={id} name="occurredAt" type="date" aria-describedby={describedBy} />
        )}
      </LnField>

      {/* Evidence (multimedia) — file input stays native (file:* classes), LnField
          handles label/id/hint wiring; evidenceError surfaces as the field error. */}
      <LnField
        label="Evidencia"
        hint={`Hasta ${MAX_EVIDENCE_FILES} archivos, 25 MB cada uno. Imágenes (JPG, PNG, WebP, HEIC, GIF) y videos (MP4, WebM, MOV).`}
        error={evidenceError ?? undefined}
      >
        {({ id }) => (
          <>
            <input
              ref={fileInputRef}
              id={id}
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm,video/quicktime,image/heic,image/heif"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="text-sm text-ln-ink-2 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-ln-line-strong file:bg-ln-card file:text-ln-ink-2 file:text-sm file:cursor-pointer hover:file:bg-ln-stripe"
            />

            {evidenceFiles.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs text-ln-mute">
                  {evidenceFiles.length} de {MAX_EVIDENCE_FILES} archivos seleccionados
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {evidenceFiles.map((entry, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable list, no reordering
                    <div key={i} className="relative group">
                      {entry.objectUrl ? (
                        <img
                          src={entry.objectUrl}
                          alt={entry.file.name}
                          className="w-full aspect-square object-cover rounded-lg border border-ln-line"
                        />
                      ) : (
                        <div className="w-full aspect-square rounded-lg border border-ln-line bg-ln-stripe flex flex-col items-center justify-center gap-1 p-2">
                          <span className="text-2xl select-none">▶</span>
                          <p className="text-xs text-ln-mute text-center truncate w-full">
                            {entry.file.name}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeEvidence(i)}
                        aria-label={`Quitar ${entry.file.name}`}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ln-azul text-white text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </LnField>

      {/* Optional contact (collapsible) */}
      <div className="border border-ln-line rounded-lg">
        <button
          type="button"
          onClick={() => setShowContact((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ln-ink-2 hover:bg-ln-stripe rounded-lg transition-colors"
        >
          <span>Contacto opcional</span>
          <span className="text-ln-mute">{showContact ? "▲" : "▼"}</span>
        </button>
        {showContact && (
          <div className="px-4 pb-4 space-y-4 border-t border-ln-line pt-4">
            <p className="text-xs text-ln-mute">
              No es obligatorio. Dejás tus datos solo si querés que te contactemos sobre esta
              denuncia.
            </p>
            <LnField label="Email de contacto">
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="reporterContactEmail"
                  type="email"
                  placeholder="tu@email.com"
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
            <LnField label="Teléfono de contacto">
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="reporterContactPhone"
                  type="tel"
                  placeholder="+54 11 1234-5678"
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-ln-err" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-ln-azul text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Enviar denuncia"}
      </button>
    </form>
  );
}
