"use client";

// Step 5 — Cerrar: anónima vs con contacto + submit.
// Two cards: "Anónima" (submit immediately) vs "Con contacto" (collect email/phone then submit).
// Evidence uploader deferred — TODO(M-followup): add optional evidence expander after
// contact choice is made (plan Step 5 / DenunciaStepEvidence.tsx).

import { inputClass, labelClass } from "@/lib/form-classes";

export type ContactMode = "anonymous" | "with_contact";

type Step5ContactProps = {
  contactMode: ContactMode | null;
  contactEmail: string;
  contactPhone: string;
  onContactModeChange: (mode: ContactMode) => void;
  onContactEmailChange: (email: string) => void;
  onContactPhoneChange: (phone: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string | null;
};

export function Step5Contact({
  contactMode,
  contactEmail,
  contactPhone,
  onContactModeChange,
  onContactEmailChange,
  onContactPhoneChange,
  onSubmit,
  isPending,
  error,
}: Step5ContactProps) {
  const canSubmitAnonymous = contactMode === "anonymous";
  const canSubmitWithContact =
    contactMode === "with_contact" &&
    (contactEmail.trim().length > 0 || contactPhone.trim().length > 0);

  const canSubmit = canSubmitAnonymous || canSubmitWithContact;

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
            <label htmlFor="reporterContactPhone" className={labelClass}>
              Teléfono (preferido)
            </label>
            <input
              id="reporterContactPhone"
              name="reporterContactPhone"
              type="tel"
              placeholder="+54 11 1234-5678"
              value={contactPhone}
              onChange={(e) => onContactPhoneChange(e.target.value)}
              className={inputClass}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reporterContactEmail" className={labelClass}>
              Email (alternativo)
            </label>
            <input
              id="reporterContactEmail"
              name="reporterContactEmail"
              type="email"
              placeholder="tu@email.com"
              value={contactEmail}
              onChange={(e) => onContactEmailChange(e.target.value)}
              className={inputClass}
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

      {/* Evidence uploader (handoff P4-2b). Multi-file, image/video.
          The wizard's FormData captures these via formRef + getAll('attachment');
          welfare.ts already calls uploadWelfareEvidence on those entries. */}
      <details className="rounded-xl border border-dashed border-gob-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-gob-text">
          📎 Sumar fotos o videos <span className="text-gob-text-muted">(opcional)</span>
        </summary>
        <div className="mt-3 space-y-2">
          <input
            type="file"
            name="attachment"
            multiple
            accept="image/*,video/*"
            capture="environment"
            className="block w-full text-xs text-gob-text-gray file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gob-surface-alt file:text-gob-text file:cursor-pointer"
          />
          <p className="text-xs text-gob-text-muted">
            Hasta 5 archivos, 25 MB cada uno. Fotos o videos de lo que viste.
          </p>
        </div>
      </details>

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
