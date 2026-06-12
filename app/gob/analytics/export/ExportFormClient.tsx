"use client";

// Client wrapper for the analytics export form.
// Surfaces the signedUrl returned by generateExportAction using useActionState.
// On error, shows the error message inline.
//
// P1-6 fix: hidden inputs must reflect the LIVE URL state that the PeriodPicker
// updates client-side, not the SSR snapshot passed as props. We read period/from/to
// from useSearchParams() so a PeriodPicker change is immediately mirrored into the
// form before submission.

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnButton } from "@/components/ui/Button";
import { LnCheckbox } from "@/components/ui/Field";
import { type GenerateExportResult, generateExportAction } from "./actions";

type ExportState =
  | { status: "idle" }
  | { status: "ok"; signedUrl: string; emailSent: boolean }
  | { status: "error"; error: string };

const initialState: ExportState = { status: "idle" };

async function submitAction(_prev: ExportState, formData: FormData): Promise<ExportState> {
  const result: GenerateExportResult = await generateExportAction(formData);
  if (result.ok) {
    return { status: "ok", signedUrl: result.signedUrl, emailSent: result.emailSent };
  }
  return { status: "error", error: result.error };
}

export function ExportFormClient({
  allowedProvinces,
  localities,
  period: ssrPeriod,
  from: ssrFrom,
  to: ssrTo,
}: {
  allowedProvinces: Array<{ code: string; name: string }>;
  localities: Array<{ slug: string; name: string }>;
  period: string;
  from: string;
  to: string;
}) {
  const [state, dispatch, pending] = useActionState(submitAction, initialState);
  // Read live URL state so the hidden inputs always match the currently-selected
  // period, even after the PeriodPicker updates the URL client-side.
  const searchParams = useSearchParams();
  const period = searchParams.get("period") ?? ssrPeriod;
  const from = searchParams.get("from") ?? ssrFrom;
  const to = searchParams.get("to") ?? ssrTo;

  return (
    <form action={dispatch} className="space-y-6">
      {/* Hidden inputs carrying PeriodPicker + JurisdictionSwitcher state
          from the LIVE URL (useSearchParams). These update reactively when the
          PeriodPicker changes the URL so the export matches the displayed charts. */}
      <input type="hidden" name="period" value={period} />
      {from && <input type="hidden" name="from" value={from} />}
      {to && <input type="hidden" name="to" value={to} />}

      {/* Period selector */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-medium text-ln-op-ink">Periodo</h2>
        <PeriodPicker defaultPreset="30d" />
      </section>

      {/* Jurisdiction selector */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-medium text-ln-op-ink">Jurisdiccion</h2>
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
      </section>

      {/* Data slices */}
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ln-op-ink">Datos a incluir</legend>
        <div className="space-y-2 pt-1">
          <LnCheckbox name="slice" value="pets" defaultChecked>
            Mascotas (anonimizado)
          </LnCheckbox>
          <LnCheckbox name="slice" value="events">
            Eventos
          </LnCheckbox>
          <LnCheckbox name="slice" value="cases">
            Casos
          </LnCheckbox>
          <LnCheckbox name="slice" value="organizations">
            Organizaciones
          </LnCheckbox>
        </div>
      </fieldset>

      {/* Format */}
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ln-op-ink">Formato</legend>
        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="radio"
              name="format"
              value="csv"
              defaultChecked
              className="accent-ln-op-azul"
            />
            CSV
          </label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="radio" name="format" value="json" className="accent-ln-op-azul" />
            JSON
          </label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer opacity-50">
            <input type="radio" name="format" value="parquet" disabled />
            {"Parquet — proximamente"}
          </label>
        </div>
      </fieldset>

      <LnButton type="submit" disabled={pending}>
        {pending ? "Generando…" : "Generar export"}
      </LnButton>

      {/* Error state */}
      {state.status === "error" && (
        <p className="text-[13px] font-medium text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      {/* Success state: show download link */}
      {state.status === "ok" && (
        <div className="space-y-3 rounded-lg border border-ln-op-line bg-ln-op-card p-4">
          <p className="text-[13px] font-medium text-ln-op-ink">Export listo</p>
          <a
            href={state.signedUrl}
            download
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ln-op-azul underline underline-offset-2 hover:opacity-80"
          >
            Descargar export →
          </a>
          <p className="text-[12px] text-ln-op-mute">
            Este link vence en 24 horas (Ley 25.326 de Proteccion de Datos Personales).
            {state.emailSent
              ? " También te enviamos el link por email."
              : " No se envió por email — RESEND_API_KEY no está configurado."}
          </p>
        </div>
      )}
    </form>
  );
}
