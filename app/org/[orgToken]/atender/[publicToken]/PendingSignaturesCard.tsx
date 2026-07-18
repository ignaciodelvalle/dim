// PendingSignaturesCard — owner-declared chip/esterilización events waiting
// on a professional signature (#3, #43 keystone extension). Server Component:
// read-only, no client state. Each row links into the SAME AtenderCaptureMounter
// surface (?evento=chip|esterilizacion) with the declared values prefilled —
// the actual sign-off is a normal atender form submit, no separate mechanism.

import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";

import type { PendingDeclaredEvent } from "../atender-declared-events";

const EVENTO_BY_TYPE: Record<PendingDeclaredEvent["eventType"], string> = {
  microchip_implanted: "chip",
  sterilization_performed: "esterilizacion",
};

export function PendingSignaturesCard({
  orgToken,
  publicToken,
  pending,
}: {
  orgToken: string;
  publicToken: string;
  pending: PendingDeclaredEvent[];
}) {
  if (pending.length === 0) return null;

  return (
    <OpCard>
      <OpCardHead title="Declarado por el dueño · pendiente de firma" />
      <OpCardBody>
        <ul className="space-y-2">
          {pending.map((item) => {
            const params = new URLSearchParams({
              evento: EVENTO_BY_TYPE[item.eventType],
              ...item.prefill,
            });
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-ln-op-line px-3 py-2"
              >
                <span className="text-sm text-ln-op-ink">{item.summary}</span>
                <Link
                  href={`/org/${orgToken}/atender/${publicToken}?${params.toString()}`}
                  className="text-sm font-semibold text-ln-op-azul no-underline hover:underline"
                >
                  Confirmar y firmar →
                </Link>
              </li>
            );
          })}
        </ul>
      </OpCardBody>
    </OpCard>
  );
}
