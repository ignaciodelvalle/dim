"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setCoFosterAllowedAction } from "@/app/actions/foster-volunteers";

export function CoFosterToggle({
  fosterOwnershipId,
  initial,
}: {
  fosterOwnershipId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setCoFosterAllowedAction({
        fosterOwnershipId,
        allowCoFoster: value,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCurrent(value);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900/50 p-3 text-sm">
      <p className="text-neutral-800 dark:text-neutral-200 mb-2">
        ¿Permitís que la organización asigne un co-foster a esta mascota?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={pending || current}
          className={`px-3 py-1 rounded text-xs ${
            current
              ? "bg-emerald-600 text-white"
              : "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          } disabled:opacity-60`}
        >
          Permitir
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={pending || !current}
          className={`px-3 py-1 rounded text-xs ${
            !current
              ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900"
              : "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          } disabled:opacity-60`}
        >
          No permitir
        </button>
      </div>
      {error && <output className="block text-xs text-red-600 mt-2">{error}</output>}
    </div>
  );
}
