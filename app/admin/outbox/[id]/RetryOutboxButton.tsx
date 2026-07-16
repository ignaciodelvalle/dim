"use client";

// Manual-retry button for a single outbox row (Cowork A1 / operator-trust T0-T1).
//
// The retry action gave zero feedback: it reset next_retry_at/status server-side
// but the page didn't refresh and nothing confirmed the click, so an operator
// re-clicked thinking it had failed. This client island follows the established
// admin action-feedback pattern (ModerationActions / ResetCredentialsButton):
// useTransition to drive the server action, disable the button while pending,
// then confirm the outcome.
//
// T1 — the retry must NEVER dump the operator to /login. It used to reload the
// detail via navigateAfterActionSuccess (a full document navigation); a review
// saw that land on /login mid-action (a transient session drop during the
// reload). We now do a Tier-B OPTIMISTIC in-place update instead: the action
// returns the new schedule, we render it in place and fire a sonner toast, and
// we STAY on the detail page. No full-document navigation means a flaky session
// can't bounce the operator away, and an error keeps them on the page too.

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { OpButton } from "@/components/ui/dashboard";
import { AR_TIME_ZONE } from "@/lib/utils/format";

import { retryOutboxRowAction } from "../actions";

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AR_TIME_ZONE,
  });
  if (sameDay) return `HOY ${time}`;
  const date = d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: AR_TIME_ZONE,
  });
  return `${date} ${time}`;
}

export function RetryOutboxButton({ rowId }: { rowId: string }) {
  const [pending, startTransition] = useTransition();
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await retryOutboxRowAction(rowId);
      if (result.error) {
        setError(result.error);
        // Error toast + stay on the page (T1): never a silent redirect.
        toast.error(result.error, { duration: 7000 });
        return;
      }
      // Tier-B optimistic in-place update (T1): show the new schedule locally and
      // toast success — no full-document navigation, so a flaky session can't
      // bounce the operator to /login. The drainer picks the row up next tick.
      setScheduledAt(result.scheduledAt ?? null);
      toast.success(
        result.scheduledAt
          ? `Reintento programado para ${formatScheduled(result.scheduledAt)}.`
          : "Reintento programado.",
      );
    });
  }

  return (
    <span className="mt-2 block space-y-2">
      <OpButton type="button" variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Programando…" : "Reintentar ahora"}
      </OpButton>
      {scheduledAt && !error && (
        <output className="block text-[var(--text-sm)] font-semibold text-ln-op-ok">
          Reintento programado para {formatScheduled(scheduledAt)}. El cron de drenaje lo procesa en
          el próximo ciclo (máximo 5 min).
        </output>
      )}
      {error && <output className="block text-[var(--text-sm)] text-ln-op-danger">{error}</output>}
    </span>
  );
}
