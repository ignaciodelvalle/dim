"use client";

// InviteForm — calls inviteMemberAction and shows the generated invite URL on success.

import { useState, useTransition } from "react";

import { inviteMemberAction } from "@/app/actions/org-invitations";
import { Alert, Button, Checkbox, Field, Input, Select } from "@/components/poncho";

type RoleOption = { value: string; label: string };

type Props = {
  organizationId: string;
  orgToken: string;
  grantableRoles: RoleOption[];
};

export function InviteForm({ organizationId, grantableRoles }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState(grantableRoles[0]?.value ?? "");
  const [canWritePetEvents, setCanWritePetEvents] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteMemberAction({
        organizationId,
        email,
        invitedRole: role,
        canWritePetEvents,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInviteUrl(result.inviteUrl);
    });
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — nothing to do.
    }
  }

  if (inviteUrl) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Invitación creada">
          Compartí este link con la persona que querés sumar al equipo.
        </Alert>
        <div className="rounded-xl border border-gob-border bg-white p-4 space-y-3">
          <p className="break-all text-sm font-mono text-gob-text">{inviteUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" onClick={handleCopy}>
              {copied ? "¡Copiado!" : "Copiar link"}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(inviteUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-gob-border-strong px-4 py-1.5 text-sm font-semibold text-gob-text transition-colors hover:bg-gob-surface-alt"
            >
              WhatsApp
            </a>
          </div>
          <p className="text-xs text-gob-text-muted">
            Este link vence en 14 días. Solo puede ser aceptado por la cuenta con el email indicado.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setInviteUrl(null);
            setCopied(false);
            setEmail("");
            setRole(grantableRoles[0]?.value ?? "");
            setCanWritePetEvents(false);
          }}
        >
          Invitar a otra persona
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <Field label="Email" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
            placeholder="nombre@ejemplo.com"
            required
          />
        )}
      </Field>

      <Field label="Rol" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
            required
          >
            {grantableRoles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="pb-4">
        <Checkbox
          checked={canWritePetEvents}
          onChange={(e) => setCanWritePetEvents(e.target.checked)}
        >
          Puede registrar eventos clínicos/sanitarios
        </Checkbox>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Button type="submit" variant="primary" loading={pending} className="w-full">
        Crear invitación
      </Button>
    </form>
  );
}
