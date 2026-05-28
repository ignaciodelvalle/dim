"use client";

import { useActionState, useState } from "react";

import {
  type CreateShareResult,
  type RevokeShareResult,
  createLibretaShareAction,
  revokeLibretaShareAction,
} from "@/app/actions/libreta-share";
import { Checkbox } from "@/components/poncho";
import type { LibretaShareToken } from "@/db/schema";

type Props = {
  petPublicToken: string;
  shares: LibretaShareToken[];
};

const DURATION_OPTIONS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "Sin vencimiento", days: null },
] as const;

const initialCreateState: CreateShareResult | null = null;
const initialRevokeState: RevokeShareResult | null = null;

export function SharesManager({ petPublicToken, shares }: Props) {
  const [creating, setCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30);
  const [noExpiryConfirmed, setNoExpiryConfirmed] = useState(false);
  const [label, setLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [createState, createAction, createPending] = useActionState(
    async (_prev: CreateShareResult | null, formData: FormData) => {
      const labelVal = (formData.get("label") as string | null)?.trim() || null;
      const daysStr = formData.get("expiresInDays") as string | null;
      const days = daysStr === "null" ? null : daysStr ? Number(daysStr) : 30;
      return createLibretaShareAction({
        petPublicToken,
        expiresInDays: days,
        label: labelVal,
      });
    },
    initialCreateState,
  );

  const [revokeState, revokeAction, revokePending] = useActionState(
    async (_prev: RevokeShareResult | null, formData: FormData) => {
      const id = formData.get("shareTokenRowId") as string;
      return revokeLibretaShareAction(id);
    },
    initialRevokeState,
  );

  function buildShareUrl(token: string): string {
    return `${window.location.origin}/libreta/compartir/${token}`;
  }

  function copyToClipboard(token: string) {
    navigator.clipboard.writeText(buildShareUrl(token)).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  const newShareToken = createState && "shareToken" in createState ? createState.shareToken : null;
  const createError = createState && "error" in createState ? createState.error : null;
  const revokeError = revokeState && "error" in revokeState ? revokeState.error : null;

  return (
    <section className="space-y-4 print:hidden">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gob-text ">Compartir libreta</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCopiedToken(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-gob-primary  text-white  hover:opacity-90 transition-opacity"
          >
            Nuevo enlace
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <form action={createAction} className="space-y-3 rounded-lg border border-gob-border  p-4">
          <div className="space-y-1">
            <label className="text-xs text-gob-text-gray " htmlFor="share-label">
              Etiqueta (opcional)
            </label>
            <input
              id="share-label"
              name="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Para Dra. Perez"
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary "
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-xs text-gob-text-gray ">Duracion</legend>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <label key={String(opt.days)} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="expiresInDays"
                    value={String(opt.days)}
                    checked={expiresInDays === opt.days}
                    onChange={() => {
                      setExpiresInDays(opt.days);
                      if (opt.days !== null) setNoExpiryConfirmed(false);
                    }}
                    className="accent-gob-primary "
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
            {expiresInDays === null && (
              <Checkbox
                checked={noExpiryConfirmed}
                onChange={(e) => setNoExpiryConfirmed(e.target.checked)}
                labelClassName="text-xs! text-gob-warning-text!"
              >
                Confirmo que este enlace no vence nunca
              </Checkbox>
            )}
          </fieldset>

          {createError && <p className="text-xs text-gob-danger ">{createError}</p>}

          {newShareToken && (
            <div className="space-y-1">
              <p className="text-xs text-gob-success  font-medium">
                Enlace generado. Copia y envialo.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={buildShareUrl(newShareToken)}
                  className="flex-1 text-xs font-mono rounded-md border border-gob-border  bg-gob-surface-alt  px-3 py-1.5 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(newShareToken)}
                  className="text-xs px-3 py-1.5 rounded-md border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
                >
                  {copiedToken === newShareToken ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createPending || (expiresInDays === null && !noExpiryConfirmed)}
              className="text-xs px-3 py-1.5 rounded-md bg-gob-primary  text-white  hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createPending ? "Creando..." : "Crear enlace"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setLabel("");
                setExpiresInDays(30);
                setNoExpiryConfirmed(false);
              }}
              className="text-xs px-3 py-1.5 rounded-md border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Active shares list */}
      {shares.length > 0 ? (
        <ul className="space-y-2">
          {shares.map((share) => (
            <li
              key={share.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-gob-border  px-3 py-2.5"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-gob-text  truncate">
                  {share.label ?? "Sin etiqueta"}
                </p>
                <p className="text-[10px] text-gob-text-muted ">
                  {share.expiresAt
                    ? `Vence ${new Date(share.expiresAt).toLocaleDateString("es-AR")}`
                    : "Sin vencimiento"}
                  {" · "}
                  {share.viewCountCached === 0
                    ? "Sin vistas"
                    : `${share.viewCountCached} vista${share.viewCountCached !== 1 ? "s" : ""}`}
                  {share.lastViewedAtCached &&
                    ` · Ultima: ${new Date(share.lastViewedAtCached).toLocaleDateString("es-AR")}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(share.shareToken)}
                  className="text-[10px] px-2 py-1 rounded border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
                >
                  {copiedToken === share.shareToken ? "Copiado" : "Copiar"}
                </button>
                <form action={revokeAction}>
                  <input type="hidden" name="shareTokenRowId" value={share.id} />
                  <button
                    type="submit"
                    disabled={revokePending && revokingId === share.id}
                    onClick={() => setRevokingId(share.id)}
                    className="text-[10px] px-2 py-1 rounded border border-gob-danger  text-gob-danger  hover:bg-gob-danger/10  transition-colors disabled:opacity-50"
                  >
                    Revocar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !creating && (
          <p className="text-xs text-gob-text-muted ">
            No hay enlaces activos. Crea uno para compartir la libreta.
          </p>
        )
      )}

      {revokeError && <p className="text-xs text-gob-danger ">{revokeError}</p>}
    </section>
  );
}
