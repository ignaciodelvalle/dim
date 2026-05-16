"use client";

import type { WelfareReportFormState } from "@/app/actions/welfare";
import { PROVINCIAS } from "@/lib/ar-provincias";
import {
  WELFARE_REPORT_KINDS,
  WELFARE_REPORT_SEVERITIES,
  WELFARE_REPORT_SUBJECT_KINDS,
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportSubjectKindLabel,
} from "@/lib/welfare";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

const initialState: WelfareReportFormState = { error: null };

type FormAction = (
  prev: WelfareReportFormState,
  formData: FormData,
) => Promise<WelfareReportFormState>;

const LABEL_CLASS = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";
const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";
const FIELD_CLASS = "space-y-1.5";

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

  // Geolocation state
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  function handleGeoClick() {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización. Cargá las coordenadas a mano.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLat(position.coords.latitude.toFixed(6));
        setLocationLng(position.coords.longitude.toFixed(6));
        setGeoLoading(false);
      },
      () => {
        setGeoError(
          "No pudimos obtener tu ubicación. Permitilo en el navegador o cargá las coordenadas a mano.",
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

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
      {isAnonymous && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 rounded-lg px-4 py-3">
          Estás denunciando de forma anónima. Si querés seguimiento, podés{" "}
          <Link
            href="/login"
            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            iniciar sesión
          </Link>{" "}
          o dejar un contacto opcional abajo.
        </p>
      )}

      {/* Kind */}
      <div className={FIELD_CLASS}>
        <label htmlFor="kind" className={LABEL_CLASS}>
          Tipo de situación<span className="text-red-500 ml-0.5">*</span>
        </label>
        <select id="kind" name="kind" required className={INPUT_CLASS}>
          <option value="">Seleccioná una opción</option>
          {WELFARE_REPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {welfareReportKindLabel(k)}
            </option>
          ))}
        </select>
      </div>

      {/* Severity */}
      <div className={FIELD_CLASS}>
        <label htmlFor="severity" className={LABEL_CLASS}>
          Gravedad<span className="text-red-500 ml-0.5">*</span>
        </label>
        <select id="severity" name="severity" required className={INPUT_CLASS}>
          <option value="">Seleccioná una opción</option>
          {WELFARE_REPORT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {welfareReportSeverityLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className={FIELD_CLASS}>
        <label htmlFor="description" className={LABEL_CLASS}>
          ¿Qué pasó?<span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          minLength={20}
          placeholder="Contá lo que viste con detalle: cuándo, dónde, quiénes están involucrados, qué condición está el animal…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          {description.length} caracteres (mínimo 20)
        </p>
      </div>

      {/* Subject kind */}
      <fieldset className={FIELD_CLASS}>
        <legend className={LABEL_CLASS}>
          ¿Sobre quién?<span className="text-red-500 ml-0.5">*</span>
        </legend>
        <div className="space-y-2 mt-1">
          {WELFARE_REPORT_SUBJECT_KINDS.map((sk) => (
            <label
              key={sk}
              className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <input
                type="radio"
                name="subjectKind"
                value={sk}
                checked={subjectKind === sk}
                onChange={() => setSubjectKind(sk)}
                className="accent-neutral-900 dark:accent-neutral-50"
              />
              {welfareReportSubjectKindLabel(sk)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Conditional subject fields */}
      {subjectKind === "registered_pet" && (
        <div className={FIELD_CLASS}>
          <label htmlFor="subjectPetToken" className={LABEL_CLASS}>
            Código DIM de la mascota
          </label>
          <input
            id="subjectPetToken"
            name="subjectPetToken"
            type="text"
            placeholder="Ej: DIM-XXXX-XXXX"
            className={INPUT_CLASS}
          />
        </div>
      )}

      {subjectKind !== "registered_pet" && (
        <div className={FIELD_CLASS}>
          <label htmlFor="subjectDescription" className={LABEL_CLASS}>
            {subjectKind === "unowned_animal"
              ? "Descripción del animal"
              : subjectKind === "location"
                ? "Descripción del lugar"
                : "Descripción de la situación"}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <textarea
            id="subjectDescription"
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
            className={INPUT_CLASS}
          />
        </div>
      )}

      {/* Location */}
      <div className={FIELD_CLASS}>
        <label htmlFor="locationAddress" className={LABEL_CLASS}>
          Dirección / referencia del lugar
        </label>
        <input
          id="locationAddress"
          name="locationAddress"
          type="text"
          placeholder="Dirección, esquina, barrio, referencia…"
          className={INPUT_CLASS}
        />
      </div>

      {/* Jurisdiction */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={FIELD_CLASS}>
          <label htmlFor="jurisdictionProvince" className={LABEL_CLASS}>
            Provincia
          </label>
          <select id="jurisdictionProvince" name="jurisdictionProvince" className={INPUT_CLASS}>
            <option value="">Seleccioná</option>
            {PROVINCIAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="jurisdictionLocality" className={LABEL_CLASS}>
            Localidad
          </label>
          <input
            id="jurisdictionLocality"
            name="jurisdictionLocality"
            type="text"
            placeholder="Localidad o barrio"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Coordinates + geolocation button */}
      <div className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>Coordenadas (opcional)</span>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGeoClick}
            disabled={geoLoading}
            className="self-start px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {geoLoading ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
          </button>
          {geoError && (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
              {geoError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={FIELD_CLASS}>
              <label
                htmlFor="locationLat"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Latitud
              </label>
              <input
                id="locationLat"
                name="locationLat"
                type="text"
                inputMode="decimal"
                placeholder="-34.603722"
                value={locationLat}
                onChange={(e) => setLocationLat(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className={FIELD_CLASS}>
              <label
                htmlFor="locationLng"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Longitud
              </label>
              <input
                id="locationLng"
                name="locationLng"
                type="text"
                inputMode="decimal"
                placeholder="-58.381592"
                value={locationLng}
                onChange={(e) => setLocationLng(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Occurred at */}
      <div className={FIELD_CLASS}>
        <label htmlFor="occurredAt" className={LABEL_CLASS}>
          ¿Cuándo pasó o desde cuándo viene pasando?
        </label>
        <input id="occurredAt" name="occurredAt" type="date" className={INPUT_CLASS} />
      </div>

      {/* Evidence (multimedia) */}
      <div className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>Evidencia (opcional)</span>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Hasta {MAX_EVIDENCE_FILES} archivos, 25 MB cada uno. Imágenes (JPG, PNG, WebP, HEIC, GIF)
          y videos (MP4, WebM, MOV).
        </p>

        {/* File input — cleared after each selection to allow incremental adds */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,image/heic,image/heif"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-neutral-300 dark:file:border-neutral-700 file:bg-white dark:file:bg-neutral-950 file:text-neutral-700 dark:file:text-neutral-300 file:text-sm file:cursor-pointer hover:file:bg-neutral-50 dark:hover:file:bg-neutral-900"
        />

        {evidenceError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {evidenceError}
          </p>
        )}

        {evidenceFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
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
                      className="w-full aspect-square object-cover rounded-lg border border-neutral-200 dark:border-neutral-800"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex flex-col items-center justify-center gap-1 p-2">
                      <span className="text-2xl select-none">▶</span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center truncate w-full">
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
          </div>
        )}
      </div>

      {/* Optional contact (collapsible) */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg">
        <button
          type="button"
          onClick={() => setShowContact((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg transition-colors"
        >
          <span>Contacto opcional</span>
          <span className="text-neutral-400">{showContact ? "▲" : "▼"}</span>
        </button>
        {showContact && (
          <div className="px-4 pb-4 space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              No es obligatorio. Dejás tus datos solo si querés que te contactemos sobre esta
              denuncia.
            </p>
            <div className={FIELD_CLASS}>
              <label htmlFor="reporterContactEmail" className={LABEL_CLASS}>
                Email de contacto
              </label>
              <input
                id="reporterContactEmail"
                name="reporterContactEmail"
                type="email"
                placeholder="tu@email.com"
                className={INPUT_CLASS}
              />
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="reporterContactPhone" className={LABEL_CLASS}>
                Teléfono de contacto
              </label>
              <input
                id="reporterContactPhone"
                name="reporterContactPhone"
                type="tel"
                placeholder="+54 11 1234-5678"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Enviar denuncia"}
      </button>
    </form>
  );
}
