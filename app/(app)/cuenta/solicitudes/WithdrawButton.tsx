"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { withdrawApprovalRequestAction } from "@/app/actions/approval-requests";

type Props = {
  requestId: string;
};

export function WithdrawButton({ requestId }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm("¿Seguro que querés retirar esta solicitud?")) return;

    startTransition(async () => {
      const result = await withdrawApprovalRequestAction(requestId);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center px-3 py-1.5 rounded-md border border-gob-border-strong text-xs font-medium text-gob-text-gray bg-white hover:bg-gob-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Retirando…" : "Retirar solicitud"}
    </button>
  );
}
