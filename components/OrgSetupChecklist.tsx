// OrgSetupChecklist — guided first-run checklist for newly created orgs.
// Wave 3 Item 19.
//
// Spec: docs/superpowers/specs/2026-06-18-wave3-org-ops-handoff.md (Item 19)
//
// Rendered as an OpCard in the org panel. Auto-hides when all steps complete.
// Each step shows done (✓) or pending state with a CTA link.
// A11y: <fieldset>+<legend> wrapper, <ul>/<li> list, aria-label progress.
// Focus managed by the parent (page.tsx focuses the first pending step via autoFocus).

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import type { SetupStep } from "@/lib/infra/org-setup-checklist";

// Pending indicator: a simple open circle rendered via Tailwind border classes.
// Using a <span> avoids adding a new icon name to the Icon component for a
// single usage.
function PendingDot() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full border border-ln-op-line-2 bg-transparent"
    />
  );
}

type Props = {
  steps: SetupStep[];
  orgToken: string;
  /** When true, the autoFocus attribute is set on the first pending step's CTA. */
  autoFocusFirst?: boolean;
};

export function OrgSetupChecklist({ steps, orgToken, autoFocusFirst = false }: Props) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;

  return (
    <OpCard accent={doneCount === total ? undefined : "warn"}>
      <OpCardHead
        title="Primeros pasos"
        actions={
          <span className="text-sm text-ln-op-mute font-normal" aria-hidden>
            {doneCount} / {total}
          </span>
        }
      />
      <OpCardBody className="p-0">
        {/* fieldset + legend for semantically grouped form-like checklist. */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="sr-only">
            Progreso de configuración: {doneCount} de {total} pasos completados
          </legend>
          <ul
            aria-label={`${doneCount} de ${total} pasos completados`}
            className="divide-y divide-ln-op-line-2"
          >
            {steps.map((step, idx) => {
              const isFirstPending =
                !step.done && autoFocusFirst && idx === steps.findIndex((s) => !s.done);

              return (
                <li
                  key={step.key}
                  className="flex items-start gap-3 px-4 py-3"
                  aria-current={isFirstPending ? "step" : undefined}
                >
                  {/* Done/pending icon — icon+text, never color alone (a11y Item 11 pattern). */}
                  <span
                    className={[
                      "mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full",
                      step.done
                        ? "bg-ln-op-ok text-white"
                        : "border border-ln-op-line-2 bg-ln-op-stripe",
                    ].join(" ")}
                    aria-hidden
                  >
                    {step.done ? <Icon name="check-circle" size={12} decorative /> : <PendingDot />}
                  </span>

                  {/* Step content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p
                      className={[
                        "text-[13px] font-semibold",
                        step.done ? "text-ln-op-mute line-through" : "text-ln-op-ink",
                      ].join(" ")}
                    >
                      {step.label}
                      {step.done && <span className="sr-only">(completado)</span>}
                    </p>
                    {!step.done && <p className="text-sm text-ln-op-mute">{step.hint}</p>}
                  </div>

                  {/* CTA — only shown when pending. */}
                  {!step.done && (
                    <Link
                      href={`/org/${orgToken}/${step.href}`}
                      className={[
                        "shrink-0 rounded-[4px] border border-ln-op-azul px-3 py-1",
                        "text-sm font-semibold text-ln-op-azul no-underline",
                        "hover:bg-ln-op-azul hover:text-white transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ln-op-azul",
                      ].join(" ")}
                      autoFocus={isFirstPending}
                    >
                      {step.cta}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      </OpCardBody>
    </OpCard>
  );
}
