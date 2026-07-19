"use client";

// Client wrapper for the "solo verificados" filter checkbox on the brotes page.
// The page is a Server Component, so it cannot pass an onChange handler to the
// client checkbox directly (React rejects event handlers across the RSC
// boundary — it was throwing a Server Components render error and blanking the
// page content). This tiny client component owns the progressive-enhancement
// auto-submit; the surrounding <form method="GET"> still lives in the page.
//
// Uses OpCheckbox (op-tier tokens) — this control is 100% operator surface
// (/gob/vigilancia/brotes); migrated off LnCheckbox as part of the OpCheckbox
// follow-up (consistency/op-skin-followups, 2026-07-19).
import { OpCheckbox } from "@/components/ui/dashboard/OpField";

export function VerifiedFilterCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <OpCheckbox
      name="soloVerificados"
      value="1"
      defaultChecked={defaultChecked}
      onChange={(e) => {
        // Submit the enclosing GET form on toggle (progressive enhancement).
        e.currentTarget.form?.submit();
      }}
    >
      Solo verificados institucionalmente
    </OpCheckbox>
  );
}
