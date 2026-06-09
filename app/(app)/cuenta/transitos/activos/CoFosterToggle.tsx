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
    <div className="rounded-[4px] bg-[var(--color-ln-stripe)] border border-[var(--color-ln-line)] p-3 text-sm">
      <p className="text-[var(--color-ln-ink)] mb-2">
        ¿Permitís que la organización asigne un co-foster a esta mascota?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={pending || current}
          className={`px-3 py-1 rounded-[3px] text-xs transition-colors ${
            current
              ? "bg-[var(--color-ln-ok)] text-white"
              : "border border-[var(--color-ln-line-strong)] hover:bg-[var(--color-ln-stripe)]"
          } disabled:opacity-60`}
        >
          Permitir
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={pending || !current}
          className={`px-3 py-1 rounded-[3px] text-xs transition-colors ${
            !current
              ? "bg-[var(--color-ln-azul)] text-white"
              : "border border-[var(--color-ln-line-strong)] hover:bg-[var(--color-ln-stripe)]"
          } disabled:opacity-60`}
        >
          No permitir
        </button>
      </div>
      {error && <output className="block text-xs text-[var(--color-ln-err)] mt-2">{error}</output>}
    </div>
  );
}
