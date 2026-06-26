"use client";

// Client component for the create-admin form.
// Same shape as CreateGovtForm but no locality selector (admins have universal scope).

import { useState } from "react";

import { createInstitutionalAccountAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";
import { OpButton } from "@/components/ui/dashboard";

type SuccessState = {
  profileId: string;
  magicLink: string;
  displayName: string;
  email: string;
};

export function CreateAdminForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await createInstitutionalAccountAction({
        role: "admin",
        email: email.trim(),
        displayName: displayName.trim(),
        initialLocalities: [],
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess({
          profileId: result.profileId,
          magicLink: result.magicLink,
          displayName: displayName.trim(),
          email: email.trim(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleCreateAnother() {
    setSuccess(null);
    setEmail("");
    setDisplayName("");
    setError(null);
  }

  if (success) {
    return (
      <MagicLinkResultPanel
        magicLink={success.magicLink}
        displayName={success.displayName}
        email={success.email}
        profileId={success.profileId}
        detailPath={`/admin/admins/${success.profileId}`}
        variant="create"
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ln-op-ink-2 mb-1">
            Email{" "}
            <span className="text-ln-op-danger" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nuevo.admin@dim.gob.ar"
            className="w-full text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-ln-op-ink-2 mb-1">
            Nombre de display{" "}
            <span className="text-ln-op-danger" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Admin MiMAR"
            maxLength={100}
            className="w-full text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-[6px] bg-ln-op-danger-bg border border-ln-op-danger-bd px-4 py-3">
          <p className="text-[13px] text-ln-op-danger">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <OpButton type="submit" disabled={loading} loading={loading} variant="primary">
          {loading ? "Creando..." : "Crear cuenta admin"}
        </OpButton>
        <a
          href="/admin/admins"
          className="px-5 py-2 text-[13px] border border-ln-op-line rounded-[6px] hover:bg-ln-op-stripe"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
