"use client";

import type { EventFormState } from "@/app/actions/events";
import { diseasesForSpecies, findDisease } from "@/lib/diseases";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const facilityHints: Record<string, { label: string; placeholder: string }> = {
  cremation_collective: { label: "Crematorio", placeholder: "Nombre del crematorio" },
  cremation_individual_ashes: { label: "Crematorio", placeholder: "Nombre del crematorio" },
  authorized_cemetery: {
    label: "Cementerio",
    placeholder: "Nombre del cementerio o número de habilitación",
  },
  owner_burial: { label: "Ubicación (opcional)", placeholder: "Lugar del entierro" },
};

const defaultFacilityHint = { label: "Instalación", placeholder: "Veterinaria, crematorio, etc." };

export function DeathRecordForm({
  action,
  species,
  defaults,
}: {
  action: FormAction;
  species: string | null;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);
  const [cause, setCause] = useState("");
  const [selectedDiseaseCode, setSelectedDiseaseCode] = useState("");
  const [disposition, setDisposition] = useState("");
  const [deathAtClinic, setDeathAtClinic] = useState(false);
  const [vetContactedOwner, setVetContactedOwner] = useState("");

  const diseaseOptions = diseasesForSpecies(species);
  const selectedDiseaseDef = findDisease(selectedDiseaseCode);
  const isReportableDisease = selectedDiseaseDef?.reportable === true;

  const facilityHint = facilityHints[disposition] ?? defaultFacilityHint;
  const showOwnerBurialHint = disposition === "owner_burial";
  const showVetDecidedAlone = deathAtClinic && vetContactedOwner === "no";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <label htmlFor="cause" className={labelClass}>
          Causa<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <select
          id="cause"
          name="cause"
          required
          className={inputClass}
          value={cause}
          onChange={(e) => {
            setCause(e.target.value);
            setSelectedDiseaseCode("");
          }}
        >
          <option value="">— Seleccioná —</option>
          <option value="known">Conocida</option>
          <option value="unknown">Desconocida</option>
          <option value="natural">Natural / vejez</option>
          <option value="disease">Enfermedad</option>
          <option value="accident">Accidente</option>
          <option value="euthanasia">Eutanasia</option>
          <option value="sudden">Repentina</option>
          <option value="violent">Violenta</option>
          <option value="other">Otra</option>
        </select>
      </div>

      {cause === "disease" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="diseaseCode" className={labelClass}>
              Enfermedad<span className="text-gob-danger ml-0.5">*</span>
            </label>
            <select
              id="diseaseCode"
              name="diseaseCode"
              className={inputClass}
              value={selectedDiseaseCode}
              onChange={(e) => setSelectedDiseaseCode(e.target.value)}
            >
              <option value="">Seleccionar enfermedad</option>
              {diseaseOptions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            {isReportableDisease && (
              <p className="text-xs text-gob-warning-text ">Reportable a autoridad sanitaria</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="confirmedByLab"
              name="confirmedByLab"
              type="checkbox"
              value="true"
              className="h-4 w-4 rounded border-gob-border-strong  accent-neutral-900 "
            />
            <label htmlFor="confirmedByLab" className={labelClass}>
              Confirmado por laboratorio
            </label>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="causeDetail" className={labelClass}>
          Detalles de la causa
        </label>
        <textarea
          id="causeDetail"
          name="causeDetail"
          rows={2}
          placeholder="Detalles, si querés agregar"
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="confirmedByVet"
          name="confirmedByVet"
          type="checkbox"
          value="true"
          className="h-4 w-4 rounded border-gob-border-strong  accent-neutral-900 "
        />
        <label htmlFor="confirmedByVet" className={labelClass}>
          Confirmado por veterinario/a
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="vetName" className={labelClass}>
          Nombre del veterinario/a
        </label>
        <input
          id="vetName"
          name="vetName"
          type="text"
          placeholder="Dra. López, Dr. García..."
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-gob-border  p-3">
        <legend className="px-1 text-sm font-medium text-gob-text ">
          ¿Falleció en una veterinaria?
        </legend>

        <div className="flex items-center gap-2">
          <input
            id="deathAtClinic"
            name="deathAtClinic"
            type="checkbox"
            value="true"
            checked={deathAtClinic}
            onChange={(e) => {
              setDeathAtClinic(e.target.checked);
              if (!e.target.checked) setVetContactedOwner("");
            }}
            className="h-4 w-4 rounded border-gob-border-strong  accent-neutral-900 "
          />
          <label htmlFor="deathAtClinic" className={labelClass}>
            Falleció durante una estadía en la veterinaria
          </label>
        </div>

        {deathAtClinic && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="clinicName" className={labelClass}>
                Nombre de la clínica
              </label>
              <input
                id="clinicName"
                name="clinicName"
                type="text"
                placeholder="Clínica Veterinaria…"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <span className={labelClass}>¿El veterinario logró contactarte?</span>
              <div className="space-y-1.5">
                {[
                  { value: "yes", label: "Sí, me contactaron" },
                  { value: "no", label: "No, no lograron contactarme" },
                  { value: "not_applicable", label: "No aplica" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="vetContactedOwner"
                      value={opt.value}
                      checked={vetContactedOwner === opt.value}
                      onChange={(e) => setVetContactedOwner(e.target.value)}
                      className="h-4 w-4 border-gob-border-strong  accent-neutral-900 "
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {showVetDecidedAlone && (
              <div className="flex items-center gap-2">
                <input
                  id="vetDecidedAlone"
                  name="vetDecidedAlone"
                  type="checkbox"
                  value="true"
                  className="h-4 w-4 rounded border-gob-border-strong  accent-neutral-900 "
                />
                <label htmlFor="vetDecidedAlone" className={labelClass}>
                  El veterinario decidió la disposición sin poder contactarme
                </label>
              </div>
            )}
          </>
        )}
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          id="ownerToPrivateCrematorium"
          name="ownerToPrivateCrematorium"
          type="checkbox"
          value="true"
          className="h-4 w-4 rounded border-gob-border-strong  accent-neutral-900 "
        />
        <label htmlFor="ownerToPrivateCrematorium" className={labelClass}>
          Llevé el cuerpo a un crematorio privado por mi cuenta
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="dispositionMethod" className={labelClass}>
          Método de disposición
        </label>
        <select
          id="dispositionMethod"
          name="dispositionMethod"
          className={inputClass}
          value={disposition}
          onChange={(e) => setDisposition(e.target.value)}
        >
          <option value="">—</option>
          <optgroup label="Recomendadas">
            <option value="cremation_collective">Cremación colectiva</option>
            <option value="cremation_individual_ashes">
              Cremación individual (cenizas al propietario)
            </option>
            <option value="authorized_cemetery">Cementerio de animales autorizado</option>
          </optgroup>
          <optgroup label="No recomendadas">
            <option value="owner_burial">Sepultura por el propietario</option>
            <option value="household_waste">Residuos no especiales (basura)</option>
          </optgroup>
          <optgroup label="Otras">
            <option value="rendering">Reciclaje sanitario</option>
            <option value="unknown">No sé</option>
          </optgroup>
        </select>
      </div>

      {showOwnerBurialHint && (
        <div className="rounded-lg border border-gob-warning  bg-gob-warning/10  p-3 text-sm text-gob-warning-text ">
          <p className="font-medium">Si vas a enterrarlo, te recomendamos:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>Profundidad suficiente para que ningún carroñero pueda excavar.</li>
            <li>
              Asegurate que el animal no tenía enfermedades zoonóticas o contagiosas a otros
              animales.
            </li>
            <li>Que no haya acuíferos cerca que se puedan contaminar.</li>
            <li>Elegí una zona remota.</li>
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="facility" className={labelClass}>
          {facilityHint.label}
        </label>
        <input
          id="facility"
          name="facility"
          type="text"
          placeholder={facilityHint.placeholder}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={defaults?.occurredAt ?? today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ""}
          className={inputClass}
        />
      </div>

      <AttachmentField />

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar fallecimiento"}
      </button>
    </form>
  );
}
