"use client";

import type { DisclosurePrefsInput, EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

// Toggle descriptor — one entry per disclosure preference field.
const DISCLOSURE_TOGGLES: Array<{
  name: keyof DisclosurePrefsInput;
  formName: string;
  label: string;
  description: string;
}> = [
  {
    name: "discloseFirstNameWhenLost",
    formName: "disclose_first_name_when_lost",
    label: "Tu nombre",
    description: "Quienes encuentren a tu mascota verán tu nombre de pila.",
  },
  {
    name: "disclosePhoneWhenLost",
    formName: "disclose_phone_when_lost",
    label: "Tu teléfono",
    description: "La credencial pública mostrará un botón directo para llamarte.",
  },
  {
    name: "discloseEmailWhenLost",
    formName: "disclose_email_when_lost",
    label: "Tu email",
    description: "Se mostrará un enlace de contacto por correo electrónico.",
  },
  {
    name: "discloseLastLocationWhenLost",
    formName: "disclose_last_location_when_lost",
    label: "Última ubicación conocida",
    description: "Ayuda a orientar la búsqueda en el barrio correcto.",
  },
  {
    name: "allowFinderFormWhenLost",
    formName: "allow_finder_form_when_lost",
    label: "Formulario de quien la encontró",
    description:
      "Permite que alguien te avise a través de la credencial sin necesitar tu contacto.",
  },
];

// Shared input class for the enriched section fields.
const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

export function MarkLostForm({
  action,
  disclosureDefaults,
  petHasMicrochip,
  petColor,
  petDistinguishingFeatures,
  petJurisdictionProvince,
  petJurisdictionLocality,
}: {
  action: FormAction;
  disclosureDefaults: DisclosurePrefsInput;
  /** When true, the enriched-description section is hidden (chip = already identifiable). */
  petHasMicrochip: boolean;
  /** Pre-fill value for the color field. */
  petColor: string | null;
  /** Pre-fill value for the distinguishing features field. */
  petDistinguishingFeatures: string | null;
  /** Bias hints for the geocoder so "Plaza Italia" maps to the pet's city. */
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {/* LocationFields mode="point" integrates the address text with the map
          pin: typing geocodes forward, dragging the pin reverse-geocodes. The
          input name is mapped to lastKnownLocation so setPetLostAction reads
          the same FormData key it has always read. */}
      <LocationFields
        mode="point"
        biasProvince={petJurisdictionProvince}
        biasLocality={petJurisdictionLocality}
        inputNames={{ description: "lastKnownLocation" }}
      />

      <div className="space-y-1.5">
        <label
          htmlFor="reason"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Detalles
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          placeholder="Cualquier detalle que pueda ayudar (collar, comportamiento, hora aproximada)"
          className={INPUT_CLASS}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Opcional. Guardado en el historial para tu referencia.
        </p>
      </div>

      {/* Enriched description section — only shown when pet has no microchip.
          Three sub-groups: identity fields (update pets row), incident snapshot
          (event payload), and optional retroactive chip capture. */}
      {!petHasMicrochip && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-5">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Informacion adicional para ayudar a identificar a tu mascota
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Sin microchip, estos detalles son clave para que alguien pueda reconocerla. Completá
              todo lo que puedas.
            </p>
          </div>

          {/* Group A: Identity fields (update pets row) */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Identidad
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="enriched_color"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Color y pelaje
              </label>
              <input
                id="enriched_color"
                name="enriched_color"
                type="text"
                defaultValue={petColor ?? ""}
                placeholder="Ej: marrón con manchas blancas en el pecho"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Actualiza el color guardado en su perfil.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="enriched_distinguishing_features"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Marcas o características distintivas
              </label>
              <textarea
                id="enriched_distinguishing_features"
                name="enriched_distinguishing_features"
                rows={2}
                defaultValue={petDistinguishingFeatures ?? ""}
                placeholder="Ej: mancha negra en la oreja derecha, cola corta, cicatriz en el lomo"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Se guarda en su perfil permanentemente.
              </p>
            </div>
          </div>

          {/* Group B: Incident snapshot fields (event payload) */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Al momento de perderse
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="enriched_accessories_when_lost"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Accesorios que llevaba
              </label>
              <input
                id="enriched_accessories_when_lost"
                name="enriched_accessories_when_lost"
                type="text"
                placeholder="Ej: collar rojo con placa, campera azul"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Aparece en la credencial pública como ayuda para identificarla.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="enriched_behavior_notes"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Comportamiento y temperamento
              </label>
              <textarea
                id="enriched_behavior_notes"
                name="enriched_behavior_notes"
                rows={2}
                placeholder="Ej: se asusta de los autos, es cariñosa, responde a su nombre"
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="enriched_last_seen_context"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Contexto del último avistaje
              </label>
              <textarea
                id="enriched_last_seen_context"
                name="enriched_last_seen_context"
                rows={2}
                placeholder="Ej: salió por la puerta cuando abrimos el portón, se asustó con los fuegos artificiales"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Group C: Optional retroactive microchip capture */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Microchip (opcional)
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="enriched_microchip_id"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              >
                Numero de microchip
              </label>
              <input
                id="enriched_microchip_id"
                name="enriched_microchip_id"
                type="text"
                placeholder="Ej: 982000411234567"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Si te acordás que tiene chip pero nunca lo cargaste, ingresalo acá. Si alguien la
                lleva a un refugio con ese chip, te vamos a contactar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Disclosure preference section — governs what appears on the public
          credential while the pet is lost. The section uses a visually
          distinct card to separate concern from the location/reason fields. */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4 space-y-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            ¿Qué información mostramos en tu credencial pública mientras esté perdida?
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            Podés cambiar esto en cualquier momento mientras la mascota esté perdida.
          </p>
        </div>

        <div className="space-y-3">
          {DISCLOSURE_TOGGLES.map((toggle) => (
            <label key={toggle.formName} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name={toggle.formName}
                defaultChecked={disclosureDefaults[toggle.name]}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600 text-amber-600 focus:ring-amber-600 focus:ring-offset-0"
              />
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                  {toggle.label}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {toggle.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-amber-600 dark:bg-amber-500 text-white font-medium hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Marcando..." : "Marcar como perdida"}
      </button>
    </form>
  );
}
