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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          ¿Cómo querés enviarla?
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Podés enviar sin dar ningún dato personal.
        </p>
      </div>

      {/* Mode cards */}
      <div className="space-y-3">
        {/* Anonymous card */}
        <button
          type="button"
          onClick={() => onContactModeChange("anonymous")}
          className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-colors ${
            contactMode === "anonymous"
              ? "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900"
              : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
              🕵️
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Enviar anónima
              </span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
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
              ? "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900"
              : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
              📞
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Sumar mi contacto (más útil)
              </span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Email o teléfono. Sin DNI. El equipo puede contactarte para más info.
              </span>
            </span>
          </span>
        </button>
      </div>

      {/* Contact fields — shown when mode is with_contact */}
      {contactMode === "with_contact" && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
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
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Completá al menos un dato de contacto, o cambiá a "Enviar anónima".
              </p>
            )}
        </div>
      )}

      {/* TODO(M-followup): add optional evidence file uploader here.
          Plan calls for a drop zone with camera capture (`accept="image/*,video/*"`
          `capture="environment"`). Defer until after the UI shell ships. */}

      {error && (
        <p
          className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2"
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
          className="w-full px-4 py-4 rounded-xl bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-semibold text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Enviando denuncia…" : "Enviar denuncia →"}
        </button>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center leading-relaxed">
        Al enviar confirmás que lo que describiste es lo que viste. No se requiere certeza — solo
        buena fe.
      </p>
    </section>
  );
}
