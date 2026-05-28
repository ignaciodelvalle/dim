"use client";

// Claim wizard — 3 steps, client-side state machine.
// Step 1: pick identifier kind + value
// Step 2: render the lookup variant
// Step 3 (variant B only): submit dispute with evidence + reason

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import {
  type ClaimLookupResult,
  lookupForClaimAction,
  submitClaimDisputeAction,
} from "@/app/actions/pet-claim";

type IdKind = "microchip" | "tattoo";

type Step1State = { phase: "idle"; kind: IdKind; value: string; error: string | null };
type Step2State = { phase: "result"; lookup: Extract<ClaimLookupResult, { variant: string }> };
type Step3State = {
  phase: "dispute";
  petToken: string;
  petName: string;
  reason: string;
  error: string | null;
};
type DoneState = { phase: "submitted"; disputeToken: string; petName: string };

type WizardState = Step1State | Step2State | Step3State | DoneState;

const INITIAL: Step1State = {
  phase: "idle",
  kind: "microchip",
  value: "",
  error: null,
};

export function ClaimWizard() {
  const [state, setState] = useState<WizardState>(INITIAL);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (state.phase === "submitted") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
          Reclamo enviado
        </p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          Una autoridad local va a revisar tu reclamo por {state.petName}. Te avisaremos cuando haya
          una resolución.
        </p>
        <p className="mt-3 font-mono text-xs text-emerald-800 dark:text-emerald-200">
          Referencia: {state.disputeToken}
        </p>
        <Link
          href="/mis-mascotas"
          className="mt-4 inline-block text-emerald-900 underline underline-offset-2 dark:text-emerald-100"
        >
          ← Volver a mis mascotas
        </Link>
      </section>
    );
  }

  if (state.phase === "idle") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await lookupForClaimAction({ kind: state.kind, value: state.value });
            if ("error" in result) {
              setState({ ...state, error: result.error });
              return;
            }
            setState({ phase: "result", lookup: result });
          });
        }}
        className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            ¿Cómo identificás a la mascota?
          </legend>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="kind"
              value="microchip"
              checked={state.kind === "microchip"}
              onChange={() => setState({ ...state, kind: "microchip", value: "", error: null })}
              className="h-4 w-4 accent-gob-primary"
            />
            Microchip (15 dígitos)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="kind"
              value="tattoo"
              checked={state.kind === "tattoo"}
              onChange={() => setState({ ...state, kind: "tattoo", value: "", error: null })}
              className="h-4 w-4 accent-gob-primary"
            />
            Tatuaje
          </label>
        </fieldset>

        <div className="space-y-1">
          <label
            htmlFor="claim-value"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
          >
            {state.kind === "microchip" ? "Número de microchip" : "Código del tatuaje"}
          </label>
          <input
            id="claim-value"
            type="text"
            inputMode={state.kind === "microchip" ? "numeric" : "text"}
            pattern={state.kind === "microchip" ? "\\d{15}" : undefined}
            value={state.value}
            onChange={(e) => setState({ ...state, value: e.target.value, error: null })}
            placeholder={state.kind === "microchip" ? "123456789012345" : "ABC-1234"}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-gob-primary focus:outline-none focus:ring-1 focus:ring-gob-primary dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </div>

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || state.value.trim().length === 0}
          className="w-full rounded-lg bg-gob-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </form>
    );
  }

  if (state.phase === "result") {
    return (
      <ResultStep
        lookup={state.lookup}
        onBack={() => setState(INITIAL)}
        onClaim={(t, n) =>
          setState({ phase: "dispute", petToken: t, petName: n, reason: "", error: null })
        }
      />
    );
  }

  // state.phase === "dispute"
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!formRef.current) return;
        const fd = new FormData(formRef.current);
        const fileInput = formRef.current.elements.namedItem("evidence") as HTMLInputElement | null;
        const files = fileInput?.files ? Array.from(fileInput.files) : [];
        startTransition(async () => {
          const reason = String(fd.get("reason") ?? "");
          const result = await submitClaimDisputeAction(
            { petToken: state.petToken, reason },
            files,
          );
          if ("error" in result) {
            setState({ ...state, error: result.error });
            return;
          }
          setState({
            phase: "submitted",
            disputeToken: result.disputeToken,
            petName: state.petName,
          });
        });
      }}
      className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/30"
    >
      <div className="space-y-1">
        <p className="text-base font-semibold text-amber-900 dark:text-amber-100">
          Iniciar disputa por {state.petName}
        </p>
        <p className="text-amber-800 dark:text-amber-200">
          Tu reclamo se envía a la autoridad local para revisión. Subí evidencia (foto del chip
          escaneado, libreta sanitaria si la tenés, etc.) y contanos por qué creés que es tu
          mascota.
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="claim-reason"
          className="block text-sm font-medium text-amber-900 dark:text-amber-100"
        >
          ¿Por qué creés que es tuya?
        </label>
        <textarea
          id="claim-reason"
          name="reason"
          rows={4}
          minLength={20}
          maxLength={2000}
          required
          value={state.reason}
          onChange={(e) => setState({ ...state, reason: e.target.value, error: null })}
          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-gob-primary focus:outline-none focus:ring-1 focus:ring-gob-primary dark:border-amber-800 dark:bg-neutral-900 dark:text-neutral-50"
        />
        <p className="text-xs text-amber-700 dark:text-amber-300">Mínimo 20, máximo 2000.</p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="claim-evidence"
          className="block text-sm font-medium text-amber-900 dark:text-amber-100"
        >
          Evidencia (opcional, máx. 5 archivos)
        </label>
        <input
          id="claim-evidence"
          name="evidence"
          type="file"
          multiple
          accept="image/*,video/*"
          capture="environment"
          className="block w-full text-xs text-amber-900 dark:text-amber-200"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setState(INITIAL)}
          className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending || state.reason.trim().length < 20}
          className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar reclamo"}
        </button>
      </div>
    </form>
  );
}

function ResultStep({
  lookup,
  onBack,
  onClaim,
}: {
  lookup: Extract<ClaimLookupResult, { variant: string }>;
  onBack: () => void;
  onClaim: (petToken: string, petName: string) => void;
}) {
  // Variant A — not found → invite to register
  if (lookup.variant === "not_found") {
    return (
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="font-medium text-neutral-900 dark:text-neutral-50">
          No encontramos una mascota con ese identificador.
        </p>
        <p className="text-neutral-700 dark:text-neutral-300">
          Si la mascota es tuya, registrala ahora y le emitimos la credencial.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
          >
            Buscar otro identificador
          </button>
          <Link
            href="/mis-mascotas/nueva"
            className="flex-1 rounded-lg bg-gob-primary px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Registrar mascota
          </Link>
        </div>
      </section>
    );
  }

  // Deceased gate
  if (lookup.variant === "deceased") {
    return (
      <section className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm dark:border-red-800 dark:bg-red-950/30">
        <p className="font-medium text-red-900 dark:text-red-100">
          Esta mascota figura como fallecida en MiMAR.
        </p>
        <p className="text-red-800 dark:text-red-200">
          Si creés que es un error, contactá a soporte.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-neutral-900 dark:text-red-100"
        >
          Volver
        </button>
      </section>
    );
  }

  // Variant C — pet is marked lost → encourage sighting
  if (lookup.variant === "lost") {
    return (
      <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-medium text-blue-900 dark:text-blue-100">
          {lookup.petName} está reportada como perdida.
        </p>
        <p className="text-blue-800 dark:text-blue-200">
          Si encontraste esta mascota, podés avisar a quien la busca usando el formulario de
          avistaje en lugar de iniciar un reclamo.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-800 dark:bg-neutral-900 dark:text-blue-100"
          >
            Volver
          </button>
          <Link
            href={`/p/${lookup.petToken}/sighting`}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            Reportar avistaje →
          </Link>
        </div>
      </section>
    );
  }

  // Variant B — active owner → offer dispute
  return (
    <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <p className="font-medium text-amber-900 dark:text-amber-100">
        {lookup.petName} ya tiene dueño/a registrado/a
        {lookup.ownerInitials ? ` (${lookup.ownerInitials})` : ""}.
      </p>
      <p className="text-amber-800 dark:text-amber-200">
        Si pensás que la mascota es tuya, podés iniciar una disputa. Una autoridad local va a
        revisar la evidencia y decidir.
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-100"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={() => onClaim(lookup.petToken, lookup.petName)}
          className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Iniciar disputa
        </button>
      </div>
    </section>
  );
}
