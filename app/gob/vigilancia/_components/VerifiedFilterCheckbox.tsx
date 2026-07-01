"use client";

// Client wrapper for the "solo verificados" filter checkbox on the brotes page.
// The page is a Server Component, so it cannot pass an onChange handler to the
// client LnCheckbox directly (React rejects event handlers across the RSC
// boundary — it was throwing a Server Components render error and blanking the
// page content). This tiny client component owns the progressive-enhancement
// auto-submit; the surrounding <form method="GET"> still lives in the page.
import { LnCheckbox } from "@/components/ui/Field";

export function VerifiedFilterCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <LnCheckbox
      name="soloVerificados"
      value="1"
      defaultChecked={defaultChecked}
      onChange={(e) => {
        // Submit the enclosing GET form on toggle (progressive enhancement).
        e.currentTarget.form?.submit();
      }}
    >
      Solo verificados institucionalmente
    </LnCheckbox>
  );
}
