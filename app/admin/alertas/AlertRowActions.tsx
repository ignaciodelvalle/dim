"use client";

// app/admin/alertas/AlertRowActions.tsx — per-row triage controls (client island).
//
// The inbox page + table are server components; only this control strip is a
// client island. It calls the K1 server actions (app/actions/alert-firings.ts)
// via useTransition and surfaces the next valid step of the state machine:
//
//   disparada            → Reconocer | Descartar
//   reconocida           → (zoonosis) Abrir investigación | (otra) Registrar seguimiento
//                          + Contactar autoridad | Resolver | Descartar
//   en_investigacion     → Contactar autoridad | Resolver
//   autoridad_contactada → Resolver
//   resuelta | descartada → (cerrada, sin acciones)
//
// "Abrir investigación" is shown ONLY for active_zoonosis (the lone disease-
// mapped metric, K-D2); every other metric gets "Registrar seguimiento".
// Resolve / Descartar / Seguimiento open an inline notes prompt before firing.

import { useState, useTransition } from "react";

import {
  acknowledgeFiringAction,
  contactAuthorityFiringAction,
  dismissFiringAction,
  openInvestigationFiringAction,
  registerFollowupFiringAction,
  resolveFiringAction,
} from "@/app/actions/alert-firings";
import type { AlertFiringStatus, AlertMetricKey } from "@/db/schema";

type Props = {
  firingId: string;
  status: AlertFiringStatus;
  metricKey: AlertMetricKey;
  /** True when the firing has both province + locality (needed to route a govt). */
  hasJurisdiction: boolean;
};

type PromptKind = "resolve" | "dismiss" | "followup" | null;

const ZOONOSIS_METRIC: AlertMetricKey = "active_zoonosis";

const BTN =
  "h-11 rounded-[var(--radius-md)] border px-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed";

export function AlertRowActions({ firingId, status, metricKey, hasJurisdiction }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [noteValue, setNoteValue] = useState("");

  if (status === "resuelta" || status === "descartada") {
    return <span className="text-sm text-ln-op-mute">—</span>;
  }

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) {
        setError(res.error);
      } else {
        setPrompt(null);
        setNoteValue("");
      }
    });
  }

  // Inline notes prompt (resolve / dismiss / followup).
  if (prompt !== null) {
    const labels: Record<Exclude<PromptKind, null>, { title: string; cta: string }> = {
      resolve: { title: "Resolver alerta", cta: "Resolver" },
      dismiss: { title: "Descartar alerta", cta: "Descartar" },
      followup: { title: "Registrar seguimiento", cta: "Guardar nota" },
    };
    const { title, cta } = labels[prompt];
    return (
      <div className="flex max-w-[320px] flex-col gap-2">
        <label className="text-[11px] font-semibold text-ln-op-mute" htmlFor={`note-${firingId}`}>
          {title}
        </label>
        <textarea
          id={`note-${firingId}`}
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          rows={2}
          className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2 py-1.5 text-sm text-ln-op-ink"
          placeholder={
            prompt === "followup"
              ? "Qué se hizo / a quién se contactó…"
              : "Nota de cierre (opcional)…"
          }
        />
        {error ? <p className="text-[11px] text-ln-op-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => {
                if (prompt === "resolve") return resolveFiringAction(firingId, noteValue);
                if (prompt === "dismiss") return dismissFiringAction(firingId, noteValue);
                return registerFollowupFiringAction(firingId, noteValue);
              })
            }
            className={`${BTN} border-ln-op-azul bg-ln-op-azul font-semibold text-white hover:opacity-90`}
          >
            {cta}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPrompt(null);
              setError(null);
              setNoteValue("");
            }}
            className={`${BTN} border-ln-op-line text-ln-op-mute hover:text-ln-op-ink`}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const canAcknowledge = status === "disparada";
  const canWork = status === "reconocida" || status === "en_investigacion";
  const isZoonosis = metricKey === ZOONOSIS_METRIC;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {canAcknowledge ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acknowledgeFiringAction(firingId))}
            className={`${BTN} border-ln-op-azul text-ln-op-azul hover:bg-ln-op-azul/10`}
          >
            Reconocer
          </button>
        ) : null}

        {status === "reconocida" && isZoonosis ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => openInvestigationFiringAction(firingId))}
            className={`${BTN} border-ln-op-viol-bd text-ln-op-viol hover:bg-ln-op-viol-bg`}
          >
            Abrir investigación
          </button>
        ) : null}

        {status === "reconocida" && !isZoonosis ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPrompt("followup");
              setError(null);
            }}
            className={`${BTN} border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe`}
          >
            Registrar seguimiento
          </button>
        ) : null}

        {canWork ? (
          <button
            type="button"
            disabled={pending || !hasJurisdiction}
            title={
              hasJurisdiction ? undefined : "Sin jurisdicción local: no hay autoridad a contactar."
            }
            onClick={() => run(() => contactAuthorityFiringAction(firingId))}
            className={`${BTN} border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe`}
          >
            Contactar autoridad
          </button>
        ) : null}

        {canWork || status === "autoridad_contactada" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPrompt("resolve");
              setError(null);
            }}
            className={`${BTN} border-ln-op-ok-bd text-ln-op-ok hover:bg-ln-op-ok-bg`}
          >
            Resolver
          </button>
        ) : null}

        {canAcknowledge || status === "reconocida" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPrompt("dismiss");
              setError(null);
            }}
            className={`${BTN} border-ln-op-line text-ln-op-mute hover:text-ln-op-ink`}
          >
            Descartar
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[11px] text-ln-op-danger">{error}</p> : null}
    </div>
  );
}
