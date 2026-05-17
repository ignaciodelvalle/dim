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

export function MarkLostForm({
  action,
  disclosureDefaults,
}: {
  action: FormAction;
  disclosureDefaults: DisclosurePrefsInput;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="lastKnownLocation"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Última ubicación conocida
        </label>
        <input
          id="lastKnownLocation"
          name="lastKnownLocation"
          type="text"
          placeholder="Ej: Plaza Italia, esquina Cerviño"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Opcional. Aparece en la credencial pública para ayudar a quien la encuentre.
        </p>
      </div>

      {/* Map picker — drops a marker on the actual spot. Coordinates flow
          through pet_events.location_lat / location_lng so the credential
          page and future broadcast/hotspot maps can use them. */}
      <LocationFields mode="point" />

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
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Opcional. Guardado en el historial para tu referencia.
        </p>
      </div>

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
