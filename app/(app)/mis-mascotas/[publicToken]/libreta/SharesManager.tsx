"use client";

import { useActionState, useEffect, useState } from "react";

import {
  type CreateShareResult,
  type RevokeShareResult,
  createLibretaShareAction,
  revokeLibretaShareAction,
} from "@/app/actions/libreta-share";
import { LnCheckbox } from "@/components/ui/Field";
import type { LibretaShareToken } from "@/db/schema";
import { AR_TIME_ZONE } from "@/lib/utils/format";

type Props = {
  petPublicToken: string;
  shares: LibretaShareToken[];
};

const DURATION_OPTIONS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
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
  // Mirrors the `shares` prop but can also be trimmed locally on a
  // successful revoke — revalidatePath() (server action) only refreshes
  // RSC trees, it doesn't touch this already-mounted client component's
  // state, so without this the revoked row + its "Revocar" button stayed
  // live until a hard reload.
  const [localShares, setLocalShares] = useState(shares);

  useEffect(() => {
    setLocalShares(shares);
  }, [shares]);

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

  useEffect(() => {
    if (revokeState && "ok" in revokeState) {
      setLocalShares((prev) => prev.filter((s) => s.id !== revokeState.shareTokenRowId));
    }
  }, [revokeState]);

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
        <h2 className="text-sm font-semibold text-[var(--color-ln-ink)]">Compartir libreta</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCopiedToken(null);
            }}
            className="text-xs px-3 py-1.5 rounded-[3px] bg-[var(--color-ln-azul)] text-white hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Nuevo enlace
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <form
          action={createAction}
          className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] p-4"
        >
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-ln-ink-2)]" htmlFor="share-label">
              Etiqueta (opcional)
            </label>
            <input
              id="share-label"
              name="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Para Dra. Perez"
              className="w-full text-sm rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-3 py-1.5 outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-xs text-[var(--color-ln-ink-2)]">Duracion</legend>
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
                    className="accent-[var(--color-ln-azul)]"
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
            {expiresInDays === null && (
              <LnCheckbox
                checked={noExpiryConfirmed}
                onChange={(e) => setNoExpiryConfirmed(e.target.checked)}
                labelClassName="text-xs! text-[var(--color-ln-warn)]!"
              >
                Confirmo que este enlace no vence nunca
              </LnCheckbox>
            )}
          </fieldset>

          {createError && <p className="text-xs text-[var(--color-ln-err)]">{createError}</p>}

          {newShareToken && (
            <div className="space-y-1">
              <p className="text-xs text-[var(--color-ln-ok)] font-medium">
                Enlace generado. Copia y envialo.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={buildShareUrl(newShareToken)}
                  className="flex-1 text-xs font-mono rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-3 py-1.5 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(newShareToken)}
                  className="text-xs px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-line)] hover:bg-[var(--color-ln-stripe)] transition-colors"
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
              className="text-xs px-3 py-1.5 rounded-[3px] bg-[var(--color-ln-azul)] text-white hover:bg-[var(--color-ln-azul-700)] transition-colors disabled:opacity-50"
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
              className="text-xs px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-line)] hover:bg-[var(--color-ln-stripe)] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Active shares list */}
      {localShares.length > 0 ? (
        <ul className="space-y-2">
          {localShares.map((share) => (
            <li
              key={share.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] px-3 py-2.5"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-[var(--color-ln-ink)] truncate">
                  {share.label ?? "Sin etiqueta"}
                </p>
                <p className="text-xs text-[var(--color-ln-mute)]">
                  {share.expiresAt
                    ? `Vence ${new Date(share.expiresAt).toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}`
                    : "Sin vencimiento"}
                  {" · "}
                  {share.viewCountCached === 0
                    ? "Sin vistas"
                    : `${share.viewCountCached} vista${share.viewCountCached !== 1 ? "s" : ""}`}
                  {share.lastViewedAtCached &&
                    ` · Ultima: ${new Date(share.lastViewedAtCached).toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(share.shareToken)}
                  className="text-xs px-2 py-1 rounded-[3px] border border-[var(--color-ln-line)] hover:bg-[var(--color-ln-stripe)] transition-colors"
                >
                  {copiedToken === share.shareToken ? "Copiado" : "Copiar"}
                </button>
                <form action={revokeAction}>
                  <input type="hidden" name="shareTokenRowId" value={share.id} />
                  <button
                    type="submit"
                    disabled={revokePending && revokingId === share.id}
                    onClick={() => setRevokingId(share.id)}
                    className="text-xs px-2 py-1 rounded-[3px] border border-[var(--color-ln-seal)] text-[var(--color-ln-seal)] hover:bg-[var(--color-ln-err-050)] transition-colors disabled:opacity-50"
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
          <p className="text-xs text-[var(--color-ln-mute)]">
            No hay enlaces activos. Crea uno para compartir la libreta.
          </p>
        )
      )}

      {revokeError && <p className="text-xs text-[var(--color-ln-err)]">{revokeError}</p>}
    </section>
  );
}
