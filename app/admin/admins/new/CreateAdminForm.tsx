"use client";

// Client component for the create-admin form.
// Same shape as CreateGovtForm but no locality selector (admins have universal scope).

import { useState } from "react";

import { createInstitutionalAccountAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";

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
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gob-text-gray  mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nuevo.admin@dim.gob.ar"
            className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          />
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gob-text-gray  mb-1"
          >
            Nombre de display
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Admin MiMAR"
            maxLength={100}
            className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-gob-danger/10  border border-gob-danger  px-4 py-3">
          <p className="text-sm text-gob-danger ">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm bg-gob-primary  text-white  rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creando..." : "Crear cuenta admin"}
        </button>
        <a
          href="/admin/admins"
          className="px-5 py-2 text-sm border border-gob-border-strong  rounded-md hover:bg-gob-surface-alt "
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
