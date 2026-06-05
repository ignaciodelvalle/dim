// Public invite acceptance page — renders correctly logged-out.
//
// Three session states:
//   1. No session → show invite details + link to login with returnTo.
//   2. Session but email doesn't match → inform user without leaking invite details.
//   3. Session + email matches → Accept button (calls acceptInvitationAction).
//
// Invalid/expired/revoked tokens render a friendly error, NOT notFound().
// Only the org display name and invited role are exposed — no other PII.

import { eq } from "drizzle-orm";

import { db, organizationInvitations, organizations } from "@/db";
import { createClient } from "@/lib/supabase/server";

import { AcceptButton } from "./AcceptButton";
import { maskEmail } from "./helpers";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  member: "Miembro",
  volunteer: "Voluntario",
  vet_individual: "Veterinario",
  foster: "Tránsito",
};

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Load invitation row — only the columns the page actually uses.
  // (organizations has sensitive fields like cuit/cbu; narrow the select so
  // only displayName is fetched from that table.)
  const [inviteRow] = await db
    .select({
      invite: {
        email: organizationInvitations.email,
        invitedRole: organizationInvitations.invitedRole,
        expiresAt: organizationInvitations.expiresAt,
        acceptedAt: organizationInvitations.acceptedAt,
        revokedAt: organizationInvitations.revokedAt,
        invitationToken: organizationInvitations.invitationToken,
      },
      org: {
        displayName: organizations.displayName,
      },
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(eq(organizationInvitations.invitationToken, token))
    .limit(1);

  // Determine validity before reading session (fast-fail path).
  const now = new Date();
  const isInvalid =
    !inviteRow ||
    !!inviteRow.invite.acceptedAt ||
    !!inviteRow.invite.revokedAt ||
    inviteRow.invite.expiresAt <= now;

  if (isInvalid) {
    const reason = !inviteRow
      ? "Este link de invitación no existe o ya no es válido."
      : inviteRow.invite.acceptedAt
        ? "Esta invitación ya fue aceptada."
        : inviteRow.invite.revokedAt
          ? "Esta invitación fue revocada."
          : "Esta invitación ya expiró.";

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-gob-surface-alt">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gob-border bg-white p-8 text-center shadow-sm">
          <p className="text-4xl" aria-hidden="true">
            ⚠️
          </p>
          <h1 className="text-lg font-semibold text-gob-text">Link no válido</h1>
          <p className="text-sm text-gob-text-gray">{reason}</p>
          <a
            href="/"
            className="inline-block rounded-full bg-gob-primary px-5 py-2 text-sm font-semibold text-white hover:bg-gob-primary-hover transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </main>
    );
  }

  const { invite, org } = inviteRow;
  const roleLabel = ROLE_LABEL[invite.invitedRole] ?? invite.invitedRole;

  // Read Supabase session — always server-side.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loginHref = `/login?returnTo=${encodeURIComponent(`/r/invite/${token}`)}`;

  // State 1: no session.
  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-gob-surface-alt">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-gob-border bg-white p-8 shadow-sm">
          <div className="space-y-1 text-center">
            <p className="text-xs uppercase tracking-widest text-gob-text-muted">Invitación</p>
            <h1 className="text-xl font-semibold text-gob-text">{org.displayName}</h1>
          </div>
          <p className="text-sm text-gob-text-gray text-center">
            Te invitaron a sumarte como <strong>{roleLabel}</strong>. Iniciá sesión o creá una
            cuenta para aceptar.
          </p>
          <a
            href={loginHref}
            className="block w-full rounded-full bg-gob-primary px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-gob-primary-hover transition-colors"
          >
            Iniciar sesión
          </a>
          <a
            href={`/signup?returnTo=${encodeURIComponent(`/r/invite/${token}`)}`}
            className="block w-full rounded-full border border-gob-border-strong px-5 py-2.5 text-center text-sm font-semibold text-gob-text hover:bg-gob-surface-alt transition-colors"
          >
            Crear cuenta
          </a>
          <p className="text-center text-xs text-gob-text-muted">
            Este link vence el{" "}
            {invite.expiresAt.toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        </div>
      </main>
    );
  }

  const sessionEmail = user.email?.toLowerCase().trim() ?? "";

  // State 2: email mismatch — show masked address only (PII: do not expose the
  // full invite email to whoever holds the token).
  if (invite.email.toLowerCase() !== sessionEmail) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-gob-surface-alt">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gob-border bg-white p-8 text-center shadow-sm">
          <p className="text-4xl" aria-hidden="true">
            🔒
          </p>
          <h1 className="text-lg font-semibold text-gob-text">Cuenta incorrecta</h1>
          <p className="text-sm text-gob-text-gray">
            Esta invitación es para{" "}
            <strong className="font-semibold">{maskEmail(invite.email)}</strong>. Iniciá sesión con
            esa cuenta para aceptarla.
          </p>
          <a
            href={loginHref}
            className="inline-block rounded-full border border-gob-border-strong px-5 py-2 text-sm font-semibold text-gob-text hover:bg-gob-surface-alt transition-colors"
          >
            Cambiar cuenta
          </a>
        </div>
      </main>
    );
  }

  // State 3: session + email matches → show accept button.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-gob-surface-alt">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-gob-border bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-widest text-gob-text-muted">Invitación</p>
          <h1 className="text-xl font-semibold text-gob-text">{org.displayName}</h1>
        </div>
        <p className="text-sm text-gob-text-gray text-center">
          Fuiste invitado a sumarte como <strong>{roleLabel}</strong>. ¿Querés aceptar y unirte al
          equipo?
        </p>
        <AcceptButton invitationToken={token} />
        <div className="text-center">
          <a
            href="/"
            className="text-xs text-gob-text-muted underline underline-offset-2 hover:text-gob-text transition-colors"
          >
            Más tarde
          </a>
        </div>
      </div>
    </main>
  );
}
