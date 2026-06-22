"use client";

// Reset credentials button for institutional accounts.
//
// State machine: idle -> resetting -> done | error
// On success: renders MagicLinkResultPanel inline with the returned magic link.
// Used on both /admin/govts/[userId] and /admin/admins/[userId] detail pages.

import { useState, useTransition } from "react";

import { resetInstitutionalCredentialsAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";

type Mode = "idle" | "done" | "error";

export function ResetCredentialsButton({
  targetUserId,
  displayName,
  email,
  detailPath,
}: {
  targetUserId: string;
  displayName: string;
  email: string;
  detailPath: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (mode === "done" && magicLink !== null) {
    return (
      <MagicLinkResultPanel
        magicLink={magicLink}
        displayName={displayName}
        email={email}
        profileId={targetUserId}
        detailPath={detailPath}
        variant="reset"
        resetLabel="Cerrar"
        onReset={() => {
          setMode("idle");
          setMagicLink(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleReset}
        disabled={pending}
        className="rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe disabled:opacity-50"
      >
        {pending ? "Generando link..." : "Resetear credentials"}
      </button>
      {error && <p className="text-[10px] text-ln-op-danger">{error}</p>}
    </div>
  );

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetInstitutionalCredentialsAction({ targetUserId });
      if ("error" in result) {
        setError(result.error);
        setMode("error");
        return;
      }
      setMagicLink(result.magicLink);
      setMode("done");
    });
  }
}
