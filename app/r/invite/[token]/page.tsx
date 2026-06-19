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
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-8 text-center shadow-sm">
          {/* warning glyph */}
          <span
            className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]"
            aria-hidden="true"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <h1 className="font-[var(--font-ln-serif)] text-[19px] font-semibold text-[var(--color-ln-ink)]">
            Link no válido
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">{reason}</p>
          <a
            href="/"
            className="inline-block rounded-[3px] bg-[var(--color-ln-azul)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
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
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-5 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-8 shadow-sm">
          <div className="space-y-1 text-center">
            <p className="text-xs uppercase tracking-widest text-[var(--color-ln-mute)]">
              Invitación
            </p>
            <h1 className="font-[var(--font-ln-serif)] text-[22px] font-semibold text-[var(--color-ln-ink)]">
              {org.displayName}
            </h1>
          </div>
          <p className="text-sm text-[var(--color-ln-ink-2)] text-center">
            Te invitaron a sumarte como <strong>{roleLabel}</strong>. Iniciá sesión o creá una
            cuenta para aceptar.
          </p>
          <a
            href={loginHref}
            className="block w-full rounded-[3px] bg-[var(--color-ln-azul)] px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Iniciar sesión
          </a>
          <a
            href={`/signup?returnTo=${encodeURIComponent(`/r/invite/${token}`)}`}
            className="block w-full rounded-[3px] border border-[var(--color-ln-line-strong)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] transition-colors"
          >
            Crear cuenta
          </a>
          <p className="text-center text-xs text-[var(--color-ln-mute)]">
            Este link vence el{" "}
            {invite.expiresAt.toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        </div>
      </div>
    );
  }

  const sessionEmail = user.email?.toLowerCase().trim() ?? "";

  // State 2: email mismatch — show masked address only (PII: do not expose the
  // full invite email to whoever holds the token).
  if (invite.email.toLowerCase() !== sessionEmail) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-8 text-center shadow-sm">
          {/* lock glyph */}
          <span
            className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)]"
            aria-hidden="true"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <h1 className="font-[var(--font-ln-serif)] text-[19px] font-semibold text-[var(--color-ln-ink)]">
            Cuenta incorrecta
          </h1>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            Esta invitación es para{" "}
            <strong className="font-semibold">{maskEmail(invite.email)}</strong>. Iniciá sesión con
            esa cuenta para aceptarla.
          </p>
          <a
            href={loginHref}
            className="inline-block rounded-[3px] border border-[var(--color-ln-line-strong)] px-5 py-2 text-sm font-semibold text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] transition-colors"
          >
            Cambiar cuenta
          </a>
        </div>
      </div>
    );
  }

  // State 3: session + email matches → show accept button.
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-5 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-widest text-[var(--color-ln-mute)]">
            Invitación
          </p>
          <h1 className="font-[var(--font-ln-serif)] text-[22px] font-semibold text-[var(--color-ln-ink)]">
            {org.displayName}
          </h1>
        </div>
        <p className="text-sm text-[var(--color-ln-ink-2)] text-center">
          Fuiste invitado a sumarte como <strong>{roleLabel}</strong>. ¿Querés aceptar y unirte al
          equipo?
        </p>
        <AcceptButton invitationToken={token} />
        <div className="text-center">
          <a
            href="/"
            className="text-xs text-[var(--color-ln-mute)] underline underline-offset-2 hover:text-[var(--color-ln-ink)] transition-colors"
          >
            Más tarde
          </a>
        </div>
      </div>
    </div>
  );
}
