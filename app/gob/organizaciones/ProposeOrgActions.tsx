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
      <p className="text-xs text-gob-text-muted">
        Ya verificada — sin acciones disponibles desde acá.
      </p>
    );
  }

  if (submitted) {
    return (
      <p className="text-xs text-gob-success">
        Solicitud creada. Va a aparecer en la cola para revisión.
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
        className="text-xs px-3 py-1.5 rounded-md border border-gob-border text-gob-text-gray hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creando..." : "Proponer verificación"}
      </button>
      {error && <p className="text-xs text-gob-danger">{error}</p>}
    </div>
  );
}
