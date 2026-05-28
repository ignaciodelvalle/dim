"use client";

// Contactar sheet — public contact form on /refugios/[orgToken].
// Handoff P2-8 + D3 override (rate limit only, no captcha).
//
// Layout:
//   - mailto / tel links above the form when the org exposes them
//   - inquirerName (opcional), inquirerEmail (required), message (≤ 500)
//   - Submit → server action with rate limit (3/min IP + 5/day IP + 20/day org)
//   - Success: confirmation copy with the email the org will reply to
//   - Error: inline message under the submit button

import { useActionState, useEffect } from "react";

import { type SubmitOrgContactState, submitOrgContactAction } from "@/app/actions/org-contact";
import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { inputClass, labelClass } from "@/lib/form-classes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  orgToken: string;
  orgDisplayName: string;
  orgEmail: string | null;
  orgPhone: string | null;
}

const initialState: SubmitOrgContactState = { ok: false, error: null };

export function ContactarSheet({ orgToken, orgDisplayName, orgEmail, orgPhone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = searchParams.get("sheet") === "contactar";

  const boundAction = submitOrgContactAction.bind(null, orgToken, "contact");
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  // Auto-close 4s after success so the URL clears and the panel reopens
  // cleanly next time. Not blocking — the success copy renders meanwhile.
  useEffect(() => {
    if (!state.ok || !open) return;
    const timer = setTimeout(() => {
      router.replace(buildCloseSheetUrl(pathname, searchParams));
    }, 4000);
    return () => clearTimeout(timer);
  }, [state.ok, open, pathname, searchParams, router]);

  return (
    <Sheet
      id="contactar"
      title={`Contactar a ${orgDisplayName}`}
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="md"
    >
      <div className="space-y-5">
        {/* Direct channels — when set, give the visitor the fastest path
            before the form. */}
        {(orgEmail || orgPhone) && (
          <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3 text-sm space-y-1.5">
            <p className="text-xs uppercase tracking-wider text-gob-text-muted">Canales directos</p>
            {orgEmail && (
              <p>
                <a href={`mailto:${orgEmail}`} className="text-gob-azul-link underline">
                  ✉ {orgEmail}
                </a>
              </p>
            )}
            {orgPhone && (
              <p>
                <a href={`tel:${orgPhone}`} className="text-gob-azul-link underline">
                  📞 {orgPhone}
                </a>
              </p>
            )}
          </div>
        )}

        {state.ok ? (
          <div className="rounded-xl border border-gob-success/40 bg-gob-success/10 p-4 text-sm text-gob-text">
            <p className="font-medium">Mensaje enviado.</p>
            <p className="mt-1 text-xs text-gob-text-gray">
              El equipo de {orgDisplayName} te va a responder por email cuando pueda.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="inquirerName" className={labelClass}>
                Tu nombre <span className="text-gob-text-muted text-xs">(opcional)</span>
              </label>
              <input
                id="inquirerName"
                name="inquirerName"
                type="text"
                maxLength={100}
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="inquirerEmail" className={labelClass}>
                Tu email <span className="text-gob-danger ml-0.5">*</span>
              </label>
              <input
                id="inquirerEmail"
                name="inquirerEmail"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                className={inputClass}
                placeholder="vos@ejemplo.com"
              />
              <p className="text-xs text-gob-text-muted">
                Solo lo usamos para que {orgDisplayName} pueda responderte.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="message" className={labelClass}>
                Mensaje <span className="text-gob-danger ml-0.5">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                maxLength={500}
                placeholder="Contales por qué los contactás…"
                className={inputClass}
              />
              <p className="text-xs text-gob-text-muted">Máximo 500 caracteres.</p>
            </div>

            {state.error && (
              <p className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-gob-primary text-white text-sm font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2 transition-opacity"
            >
              {isPending ? "Enviando…" : "Enviar mensaje"}
            </button>

            <p className="text-[11px] text-gob-text-muted text-center">
              Hay un límite diario de mensajes por persona para evitar abuso. Si no entra, esperá un
              rato y volvé a intentar.
            </p>
          </form>
        )}
      </div>
    </Sheet>
  );
}
