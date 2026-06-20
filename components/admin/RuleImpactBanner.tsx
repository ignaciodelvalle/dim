"use client";

// Rule-impact preview banner for PPP business-rule forms (Item 22).
// Shows "esta regla afecta a ~N mascotas" before the user submits.
// Used by PppBreedListForm and PppWeightThresholdForm.

import { useCallback, useEffect, useRef, useState } from "react";

import { type RuleImpactPreviewInput, previewRuleImpact } from "@/app/actions/rule-impact-preview";

type Props = {
  input: RuleImpactPreviewInput | null;
};

type Status = "idle" | "loading" | "done" | "error";

export function RuleImpactBanner({ input }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async (previewInput: RuleImpactPreviewInput) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("loading");
    try {
      const result = await previewRuleImpact(previewInput);
      if (!ac.signal.aborted) {
        setCount(result.affectedCount);
        setStatus("done");
      }
    } catch {
      if (!ac.signal.aborted) {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (!input) {
      setStatus("idle");
      setCount(null);
      return;
    }
    void fetch(input);
    return () => {
      abortRef.current?.abort();
    };
  }, [input, fetch]);

  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <p className="text-[13px] text-ln-op-mute italic" aria-live="polite" aria-busy="true">
        Calculando impacto…
      </p>
    );
  }

  if (status === "error") {
    // UX 3.6 (f): never render nothing — show a non-blocking fallback so the
    // operator knows the estimate is unavailable (submission stays allowed; the
    // preview is advisory, not a gate).
    return (
      <p className="text-[13px] text-ln-op-mute" aria-live="polite">
        No se pudo calcular el impacto estimado. Podés continuar igual.
      </p>
    );
  }

  if (count === null) return null;

  if (count === 0) {
    return (
      <p className="text-[13px] text-ln-op-mute" aria-live="polite">
        Esta regla no afecta a ninguna mascota actualmente no clasificada.
      </p>
    );
  }

  return (
    <p
      className="text-[13px] rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-3 text-ln-op-warn"
      aria-live="polite"
    >
      Esta regla afecta a ~{count.toLocaleString("es-AR")} {count === 1 ? "mascota" : "mascotas"}{" "}
      actualmente no clasificadas como PPP.
    </p>
  );
}
