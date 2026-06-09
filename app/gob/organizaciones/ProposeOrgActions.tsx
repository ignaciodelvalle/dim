"use client";

import { useState, useTransition } from "react";

import { proposeOrgVerificationAction } from "@/app/actions/admin-proposals";

type Org = {
  id: string;
  displayName: string;
  verified: boolean;
};

export function ProposeOrgActions({ org }: { org: Org }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (org.verified) {
    return (
      <p className="text-[12px] text-ln-op-mute">
        Ya verificada — sin acciones disponibles desde aca.
      </p>
    );
  }

  if (submitted) {
    return (
      <p className="text-[12px] text-ln-op-ok">
        Solicitud creada. Va a aparecer en la cola para revision.
      </p>
    );
  }

  function propose() {
    setError(null);
    startTransition(async () => {
      const result = await proposeOrgVerificationAction({ organizationId: org.id });
      if ("error" in result) setError(result.error);
      else setSubmitted(true);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={propose}
        disabled={pending}
        className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-line text-ln-op-ink-2 hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creando..." : "Proponer verificacion"}
      </button>
      {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
    </div>
  );
}
