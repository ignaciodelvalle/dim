"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setCoFosterAllowedAction } from "@/src/modules/foster/actions";

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
    <div className="rounded-lg bg-gob-surface-alt  p-3 text-sm">
      <p className="text-gob-text  mb-2">
        ¿Permitís que la organización asigne un co-foster a esta mascota?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={pending || current}
          className={`px-3 py-1 rounded text-xs ${
            current
              ? "bg-gob-success text-white"
              : "border border-gob-border-strong  hover:bg-gob-surface-alt "
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
              ? "bg-gob-primary  text-white "
              : "border border-gob-border-strong  hover:bg-gob-surface-alt "
          } disabled:opacity-60`}
        >
          No permitir
        </button>
      </div>
      {error && <output className="block text-xs text-gob-danger mt-2">{error}</output>}
    </div>
  );
}
