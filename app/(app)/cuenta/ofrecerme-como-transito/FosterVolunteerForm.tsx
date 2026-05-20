"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  type UpsertFosterVolunteerInput,
  upsertFosterVolunteerAction,
  withdrawFosterVolunteerAction,
} from "@/app/actions/foster-volunteers";
import { labelClass } from "@/lib/form-classes";

type InitialState = {
  status: "active" | "paused" | "withdrawn";
  availableSlots: number;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  acceptsDogs: boolean;
  acceptsCats: boolean;
  acceptsOtherSpecies: boolean;
  acceptsSizeSmall: boolean;
  acceptsSizeMedium: boolean;
  acceptsSizeLarge: boolean;
  acceptsPuppies: boolean;
  acceptsSeniors: boolean;
  acceptsChronicConditions: boolean;
  acceptsDangerousBreeds: boolean;
  maxDurationWeeks: number | null;
  householdOtherPets: boolean | null;
  householdKids: boolean | null;
  notes: string | null;
};

export function FosterVolunteerForm({ initial }: { initial: InitialState | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const isWithdrawn = initial?.status === "withdrawn";
  const isNew = !initial || isWithdrawn;

  const [acceptsDogs, setAcceptsDogs] = useState(initial?.acceptsDogs ?? true);
  const [acceptsCats, setAcceptsCats] = useState(initial?.acceptsCats ?? true);
  const [acceptsOtherSpecies, setAcceptsOtherSpecies] = useState(
    initial?.acceptsOtherSpecies ?? false,
  );
  const [acceptsSizeSmall, setAcceptsSizeSmall] = useState(initial?.acceptsSizeSmall ?? true);
  const [acceptsSizeMedium, setAcceptsSizeMedium] = useState(initial?.acceptsSizeMedium ?? true);
  const [acceptsSizeLarge, setAcceptsSizeLarge] = useState(initial?.acceptsSizeLarge ?? false);
  const [acceptsPuppies, setAcceptsPuppies] = useState(initial?.acceptsPuppies ?? false);
  const [acceptsSeniors, setAcceptsSeniors] = useState(initial?.acceptsSeniors ?? true);
  const [acceptsChronicConditions, setAcceptsChronicConditions] = useState(
    initial?.acceptsChronicConditions ?? false,
  );
  const [acceptsDangerousBreeds, setAcceptsDangerousBreeds] = useState(
    initial?.acceptsDangerousBreeds ?? false,
  );
  const [maxDurationWeeks, setMaxDurationWeeks] = useState(
    initial?.maxDurationWeeks?.toString() ?? "",
  );
  const [province, setProvince] = useState(initial?.jurisdictionProvince ?? "");
  const [locality, setLocality] = useState(initial?.jurisdictionLocality ?? "");
  const [householdOtherPets, setHouseholdOtherPets] = useState<boolean | null>(
    initial?.householdOtherPets ?? null,
  );
  const [householdKids, setHouseholdKids] = useState<boolean | null>(
    initial?.householdKids ?? null,
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(mode: "enroll" | "update_preferences_only", status: "active" | "paused") {
    setError(null);
    setOkMessage(null);
    const input: UpsertFosterVolunteerInput = {
      mode,
      status,
      jurisdictionProvince: province.trim() || null,
      jurisdictionLocality: locality.trim() || null,
      acceptsDogs,
      acceptsCats,
      acceptsOtherSpecies,
      acceptsSizeSmall,
      acceptsSizeMedium,
      acceptsSizeLarge,
      acceptsPuppies,
      acceptsSeniors,
      acceptsChronicConditions,
      acceptsDangerousBreeds,
      maxDurationWeeks: maxDurationWeeks.trim()
        ? Math.max(0, Number.parseInt(maxDurationWeeks, 10) || 0)
        : null,
      householdOtherPets,
      householdKids,
      notes: notes.trim() || null,
    };
    startTransition(async () => {
      const result = await upsertFosterVolunteerAction(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(`Listo. Tenés ${result.availableSlots} slot(s) disponible(s).`);
      router.refresh();
    });
  }

  function withdraw() {
    if (!confirm("¿Seguro que querés retirarte del pool? Tus propuestas pendientes se cancelan."))
      return;
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await withdrawFosterVolunteerAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Saliste del pool. Podés volver a inscribirte cuando quieras.");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(isNew ? "enroll" : "update_preferences_only", "active");
      }}
      className="space-y-6"
    >
      {initial && initial.status === "active" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 text-sm">
          <p className="text-emerald-900 dark:text-emerald-100">
            Estás inscripto · <strong>{initial.availableSlots}</strong> slot(s) disponible(s)
          </p>
        </div>
      )}
      {isWithdrawn && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-100">
          Saliste del pool antes. Re-inscribirte va a sumar un slot fresh.
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Especies que aceptás
        </legend>
        <CheckboxRow label="Perros" checked={acceptsDogs} onChange={setAcceptsDogs} />
        <CheckboxRow label="Gatos" checked={acceptsCats} onChange={setAcceptsCats} />
        <CheckboxRow
          label="Otras especies"
          checked={acceptsOtherSpecies}
          onChange={setAcceptsOtherSpecies}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Tamaño (solo aplica a perros)
        </legend>
        <CheckboxRow
          label="Chico (<10 kg)"
          checked={acceptsSizeSmall}
          onChange={setAcceptsSizeSmall}
        />
        <CheckboxRow
          label="Mediano (10–25 kg)"
          checked={acceptsSizeMedium}
          onChange={setAcceptsSizeMedium}
        />
        <CheckboxRow
          label="Grande (>25 kg)"
          checked={acceptsSizeLarge}
          onChange={setAcceptsSizeLarge}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Edad</legend>
        <CheckboxRow
          label="Cachorros (<4 meses)"
          checked={acceptsPuppies}
          onChange={setAcceptsPuppies}
        />
        <CheckboxRow
          label="Adultos mayores (>7 años)"
          checked={acceptsSeniors}
          onChange={setAcceptsSeniors}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Otras condiciones
        </legend>
        <CheckboxRow
          label="Animales con condiciones crónicas"
          checked={acceptsChronicConditions}
          onChange={setAcceptsChronicConditions}
        />
        <CheckboxRow
          label="Razas potencialmente peligrosas (PPP)"
          checked={acceptsDangerousBreeds}
          onChange={setAcceptsDangerousBreeds}
        />
        {acceptsDangerousBreeds && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400 pl-6">
            Aclaración: la responsabilidad civil por daños permanece en quien ejerce custodia
            mientras el animal esté en tránsito.
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="fv-max-duration" className={labelClass}>
          Duración máxima (semanas)
        </label>
        <input
          id="fv-max-duration"
          type="number"
          min={0}
          value={maxDurationWeeks}
          onChange={(e) => setMaxDurationWeeks(e.target.value)}
          placeholder="Ej: 8"
          className="w-32 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="fv-province" className={labelClass}>
            Provincia
          </label>
          <input
            id="fv-province"
            type="text"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            placeholder="Buenos Aires"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
        </div>
        <div>
          <label htmlFor="fv-locality" className={labelClass}>
            Localidad
          </label>
          <input
            id="fv-locality"
            type="text"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            placeholder="La Plata"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Hogar (opcional)
        </legend>
        <TriStateRow
          label="¿Tenés otros animales en casa?"
          value={householdOtherPets}
          onChange={setHouseholdOtherPets}
        />
        <TriStateRow
          label="¿Tenés chicos en casa?"
          value={householdKids}
          onChange={setHouseholdKids}
        />
      </fieldset>

      <div>
        <label htmlFor="fv-notes" className={labelClass}>
          Notas para el refugio
        </label>
        <textarea
          id="fv-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Algo que quieras que sepan: experiencia previa, horarios, etc."
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
        />
      </div>

      {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
      {okMessage && (
        <output className="block text-sm text-emerald-700 dark:text-emerald-300">
          {okMessage}
        </output>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Guardando..." : isNew ? "Inscribirme (sumar slot)" : "Guardar preferencias"}
        </button>
        {!isNew && (
          <>
            <button
              type="button"
              onClick={() =>
                submit(
                  "update_preferences_only",
                  initial?.status === "paused" ? "active" : "paused",
                )
              }
              disabled={pending}
              className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              {initial?.status === "paused" ? "Reactivar" : "Pausar"}
            </button>
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Salir del pool
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300"
      />
      <span className="text-neutral-800 dark:text-neutral-200">{label}</span>
    </label>
  );
}

function TriStateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex-1 text-neutral-800 dark:text-neutral-200">{label}</span>
      <div className="flex gap-2">
        {(
          [
            { v: true, l: "Sí" },
            { v: false, l: "No" },
            { v: null, l: "Prefiero no decir" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.l}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`px-2 py-1 rounded border text-xs ${
              value === opt.v
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}
