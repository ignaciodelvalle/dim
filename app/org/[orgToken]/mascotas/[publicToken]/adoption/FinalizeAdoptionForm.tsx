"use client";

import { LnCheckbox, LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import { ACTION_STALL_COPY, ACTION_STALL_MS } from "@/lib/ui/action-stall";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import {
  type FinalizeAdoptionFormState,
  finalizeAdoptionAction,
} from "@/src/modules/adoption/actions";
import { useActionState, useEffect, useState } from "react";

const initialState: FinalizeAdoptionFormState = { error: null };

export type ApprovedApplication = {
  applicationEventId: string;
  applicantName: string | null;
};

export function FinalizeAdoptionForm({
  orgToken,
  publicToken,
  fosterShortcut,
  approvedApplications,
}: {
  orgToken: string;
  publicToken: string;
  fosterShortcut: { adopterUserId: string; displayName: string } | null;
  approvedApplications: ApprovedApplication[];
}) {
  const action = finalizeAdoptionAction.bind(null, orgToken, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);
  // On success the action returns `redirectTo`; navigate via a full document
  // load (immune to the Next 15.5.x router-drop that stranded this flow — see
  // the FinalizeAdoptionFormState.redirectTo docblock).
  const navigating = useActionRedirect(state.redirectTo, state);

  // D.12 noisy failure. Finalizing an adoption rides the same dropped
  // post-action navigation as the atender signing surface: the action commits
  // and the button stays on "Finalizando adopción…" forever, so the operator
  // finalizes again and the append-only spine keeps both. Once the submit has
  // been pending past ACTION_STALL_MS we stop implying progress and say what we
  // actually know — nothing — instead of nothing at all.
  // `navigating` is excluded on purpose: once the full document load has
  // started the flow IS working, it is just slow.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!isPending || navigating) {
      setStalled(false);
      return;
    }
    const t = setTimeout(() => setStalled(true), ACTION_STALL_MS);
    return () => clearTimeout(t);
  }, [isPending, navigating]);

  const hasApproved = approvedApplications.length > 0;
  // Default to the approved-application path when one exists — it transfers the
  // pet to the adopter's real account. The typed-DNI / foster path is the
  // secondary "offline adoption" fallback.
  const [offline, setOffline] = useState(!hasApproved);
  const [selectedAppId, setSelectedAppId] = useState(
    approvedApplications[0]?.applicationEventId ?? "",
  );
  const [useFosterShortcut, setUseFosterShortcut] = useState(Boolean(fosterShortcut));

  const usingApplication = hasApproved && !offline;

  return (
    // ⚠ `onSubmitCapture` IS LOAD-BEARING — DO NOT REMOVE IT. On the atender
    // signing surface, registering a capture-phase `submit` listener above the
    // form is what stops the dropped-navigation wedge outright: measured there
    // at 0/16 navigated without it and 16/16 with it, against an extra bare
    // <div> (0/16) and an extra client component without the handler (0/16), so
    // the listener — not the element and not the component — is the cause. That
    // A/B was run on atender, NOT here: this surface is not reachable from the
    // harness without staging a live adoption, so the same wedge is assumed to
    // share the mechanism and is not proven to. The `stalled` notice below stays
    // regardless, because an unproven fix is exactly when D.12's truthful
    // failure has to still be there.
    <form
      action={formAction}
      onSubmitCapture={() => setStalled(false)}
      className="space-y-4"
      encType="multipart/form-data"
    >
      {usingApplication && (
        <section className="rounded-[var(--radius-md)] border border-ln-op-ok-bd bg-ln-op-ok-bg p-4 space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ln-op-ok">
              Postulante aprobado
            </h2>
            <p className="text-ln-op-ok text-sm">
              La mascota queda registrada en la cuenta de la persona que se postuló online. La va a
              ver en <strong>Mis mascotas</strong> al instante y recibe una notificación.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="sr-only">Elegí la postulación a finalizar</legend>
            {approvedApplications.map((app) => (
              <label
                key={app.applicationEventId}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-ln-op-ok-bd bg-white/40 px-3 py-2 text-md text-ln-op-ink cursor-pointer"
              >
                <input
                  type="radio"
                  name="__appChoice"
                  checked={selectedAppId === app.applicationEventId}
                  onChange={() => setSelectedAppId(app.applicationEventId)}
                />
                <span>{app.applicantName ?? "Postulante"}</span>
              </label>
            ))}
          </fieldset>

          <input type="hidden" name="applicationEventId" value={selectedAppId} />

          <button
            type="button"
            onClick={() => setOffline(true)}
            className="text-sm text-ln-op-azul underline hover:text-ln-op-ink"
          >
            ¿Adopción por fuera de las postulaciones?
          </button>
        </section>
      )}

      {offline && (
        <>
          {hasApproved && (
            <button
              type="button"
              onClick={() => setOffline(false)}
              className="text-sm text-ln-op-azul underline hover:text-ln-op-ink"
            >
              ← Volver a las postulaciones aprobadas
            </button>
          )}

          {fosterShortcut && (
            <section className="rounded-[var(--radius-md)] border border-ln-op-ok-bd bg-ln-op-ok-bg p-4 space-y-3">
              <LnCheckbox
                id="use-foster-shortcut"
                checked={useFosterShortcut}
                onChange={(e) => setUseFosterShortcut(e.target.checked)}
              >
                <strong className="block text-md text-ln-op-ok">
                  Finalizar adopción al tránsito actual ({fosterShortcut.displayName})
                </strong>
                <span className="text-ln-op-ok text-sm block mt-1">
                  El voluntario que está cuidando a esta mascota se convierte en dueño/a. Saltamos
                  el paso de pedirte el DNI.
                </span>
              </LnCheckbox>
              {useFosterShortcut && (
                <input type="hidden" name="adopterUserId" value={fosterShortcut.adopterUserId} />
              )}
            </section>
          )}

          {!useFosterShortcut && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ln-op-mute">
                Adoptante
              </h2>
              <LnField
                label="DNI"
                required
                hint="Si la persona ya tiene cuenta miMAR con ese DNI, la usamos. Si no, creamos un perfil preliminar que podrá reclamar más adelante."
              >
                {({ id, describedBy, invalid }) => (
                  <LnInput
                    id={id}
                    name="adopterDni"
                    required={!useFosterShortcut}
                    inputMode="numeric"
                    placeholder="12345678"
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </LnField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <LnField label="Nombre completo" required>
                  {({ id, describedBy, invalid }) => (
                    <LnInput
                      id={id}
                      name="adopterDisplayName"
                      required={!useFosterShortcut}
                      maxLength={200}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </LnField>
                <LnField label="Teléfono">
                  {({ id, describedBy }) => (
                    <LnInput
                      id={id}
                      name="adopterPhone"
                      maxLength={30}
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
              </div>
            </section>
          )}
        </>
      )}

      <section className="space-y-3 pt-2 border-t border-ln-op-line">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ln-op-mute">
          Seguimiento
        </h2>
        <LnField
          label="Meses de seguimiento post-adopción"
          hint="Generará recordatorios de check-in con el adoptante (default: 6)."
        >
          {({ id, describedBy }) => (
            <LnInput
              id={id}
              name="followupMonths"
              type="number"
              min={0}
              max={36}
              defaultValue={6}
              aria-describedby={describedBy}
            />
          )}
        </LnField>
        <LnField label="Notas del contrato">
          {({ id, describedBy }) => (
            <LnTextarea
              id={id}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Condiciones especiales, observaciones, referencia al contrato firmado…"
              aria-describedby={describedBy}
            />
          )}
        </LnField>
        <LnField
          label="Contrato firmado (PDF o imagen)"
          hint="Si lo subís, queda enlazado al evento de adopción y al expediente del animal."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              name="contract"
              type="file"
              accept="application/pdf,image/*"
              aria-describedby={describedBy}
              className="block w-full text-sm text-ln-op-ink-2 file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-ln-op-azul file:px-3 file:py-1.5 file:text-white file:text-sm"
            />
          )}
        </LnField>
      </section>

      {state.error && (
        <p className="text-sm rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
          {state.error}
        </p>
      )}

      {stalled && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-3"
        >
          <p className="text-md font-semibold text-ln-op-warn">
            {ACTION_STALL_COPY.adoption.title}
          </p>
          <p className="mt-1 text-sm text-ln-op-warn">{ACTION_STALL_COPY.adoption.body}</p>
          <p className="mt-2">
            {/* A hard document GET on purpose: the router transition is exactly
                what is broken here, so `next/link` is not a safe way out. */}
            <a
              href={`/org/${orgToken}/mascotas/${publicToken}`}
              className="text-sm font-semibold text-ln-op-warn underline"
            >
              Volver a la ficha de esta mascota
            </a>
          </p>
        </div>
      )}

      <OpButton type="submit" disabled={isPending} variant="ok">
        {isPending ? "Finalizando adopción…" : "Finalizar adopción"}
      </OpButton>
    </form>
  );
}
