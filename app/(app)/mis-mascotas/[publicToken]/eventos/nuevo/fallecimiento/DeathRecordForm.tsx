"use client";

import type { EventFormState } from "@/app/actions/events";
import { diseasesForSpecies, findDisease } from "@/lib/diseases";
import { useActionState, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

export function DeathRecordForm({
  action,
  species,
}: {
  action: FormAction;
  species: string | null;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const [cause, setCause] = useState("");
  const [selectedDiseaseCode, setSelectedDiseaseCode] = useState("");

  const diseaseOptions = diseasesForSpecies(species);
  const selectedDiseaseDef = findDisease(selectedDiseaseCode);
  const isReportableDisease = selectedDiseaseDef?.reportable === true;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="cause" className={labelClass}>
          Causa<span className="text-red-500 ml-0.5">*</span>
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
          <option value="other">Otra</option>
        </select>
      </div>

      {cause === "disease" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="diseaseCode" className={labelClass}>
              Enfermedad<span className="text-red-500 ml-0.5">*</span>
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
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Reportable a autoridad sanitaria
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="confirmedByLab"
              name="confirmedByLab"
              type="checkbox"
              value="true"
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 accent-neutral-900 dark:accent-neutral-50"
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
          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 accent-neutral-900 dark:accent-neutral-50"
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

      <div className="space-y-1.5">
        <label htmlFor="dispositionMethod" className={labelClass}>
          Método de disposición
        </label>
        <select id="dispositionMethod" name="dispositionMethod" className={inputClass}>
          <option value="">—</option>
          <option value="cremation">Cremación</option>
          <option value="burial">Entierro</option>
          <option value="rendering">Reciclaje sanitario</option>
          <option value="unknown">No sé</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="facility" className={labelClass}>
          Instalación
        </label>
        <input
          id="facility"
          name="facility"
          type="text"
          placeholder="Veterinaria, crematorio, etc."
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea id="notes" name="notes" rows={3} className={inputClass} />
      </div>

      <AttachmentField />

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
        {isPending ? "Guardando..." : "Registrar fallecimiento"}
      </button>
    </form>
  );
}
