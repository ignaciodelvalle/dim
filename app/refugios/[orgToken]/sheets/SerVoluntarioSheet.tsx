"use client";

// Ser voluntario — public form (handoff P2-9 + D3 + D4 overrides).
//
// Reuses submitOrgContactAction with kind='volunteer' so the inbox is
// separate from regular contact messages but the rate limit policy +
// validation are shared. Visible from HelpPanel "Sumate como voluntario".
//
// Distinct from the foster pool (ofrecerme-como-transito): voluntario
// means "I want to help — events, walking, cleaning, fundraising". The
// refugio reads the inbox and decides how to use each candidate.

import { useActionState, useEffect } from "react";

import { type SubmitOrgContactState, submitOrgContactAction } from "@/app/actions/org-contact";
import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { inputClass, labelClass } from "@/lib/form-classes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  orgToken: string;
  orgDisplayName: string;
}

const initialState: SubmitOrgContactState = { ok: false, error: null };

export function SerVoluntarioSheet({ orgToken, orgDisplayName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = searchParams.get("sheet") === "ser-voluntario";

  const boundAction = submitOrgContactAction.bind(null, orgToken, "volunteer");
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (!state.ok || !open) return;
    const timer = setTimeout(() => {
      router.replace(buildCloseSheetUrl(pathname, searchParams));
    }, 4000);
    return () => clearTimeout(timer);
  }, [state.ok, open, pathname, searchParams, router]);

  return (
    <Sheet
      id="ser-voluntario"
      title={`Sumate como voluntario en ${orgDisplayName}`}
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="md"
    >
      <div className="space-y-5">
        <p className="text-sm text-gob-text-gray">
          {orgDisplayName} recibe tu interés y te contactan por email para coordinar. Pueden ser
          tareas puntuales (eventos, traslados) o ayuda más regular.
        </p>

        {state.ok ? (
          <div className="rounded-xl border border-gob-success/40 bg-gob-success/10 p-4 text-sm text-gob-text">
            <p className="font-medium">¡Genial! Tu mensaje llegó.</p>
            <p className="mt-1 text-xs text-gob-text-gray">
              El equipo de {orgDisplayName} te va a escribir por email cuando puedan.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="vol-inquirerName" className={labelClass}>
                Tu nombre <span className="text-gob-text-muted text-xs">(opcional)</span>
              </label>
              <input
                id="vol-inquirerName"
                name="inquirerName"
                type="text"
                maxLength={100}
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="vol-inquirerEmail" className={labelClass}>
                Tu email <span className="text-gob-danger ml-0.5">*</span>
              </label>
              <input
                id="vol-inquirerEmail"
                name="inquirerEmail"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                className={inputClass}
                placeholder="vos@ejemplo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="vol-message" className={labelClass}>
                Contales en qué te interesa ayudar <span className="text-gob-danger ml-0.5">*</span>
              </label>
              <textarea
                id="vol-message"
                name="message"
                required
                rows={5}
                maxLength={500}
                placeholder="Ej: tengo auto y puedo hacer traslados los sábados; ayudo con eventos; quiero pasear perros…"
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
              {isPending ? "Enviando…" : "Enviar"}
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
