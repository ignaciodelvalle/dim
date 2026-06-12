// Cuenta hub — Libreta Nacional redesign.
//
// Layout: serif page title → identity card (avatar + name + email + role badges)
//   → verifications section → privacy section → quick-actions list (LnRegRow style)
//   → vet clinic banner → sheet mounter.
//
// Data fetching, server actions, and CuentaSheetMounter are unchanged.

import Link from "next/link";
import { Suspense } from "react";

import { logoutAction } from "@/app/actions/auth";
import { db, organizationMemberships, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";

import { CuentaSheetMounter } from "./CuentaSheetMounter";
import { PrivacySection } from "./_components/PrivacySection";

// Role display labels
const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Gobierno",
  admin: "Administrador",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  institutional: "Institucional",
};

export default async function CuentaPage() {
  const { user } = await requireUserOrRedirect();

  // Profile DB read and admin auth email lookup are independent — run in parallel.
  const adminClient = createAdminClient();
  const [[profile], emailResult] = await Promise.all([
    db
      .select({
        role: profiles.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        accountType: profiles.accountType,
        dniNumber: profiles.dniNumber,
        dniVerified: profiles.dniVerified,
        matriculaNumber: profiles.matriculaNumber,
        matriculaJurisdiccion: profiles.matriculaJurisdiccion,
        matriculaVerified: profiles.matriculaVerified,
        discloseNameCredential: profiles.discloseNameCredential,
        disclosePhoneCredential: profiles.disclosePhoneCredential,
        allowOrgContact: profiles.allowOrgContact,
        allowLostAlertsInZone: profiles.allowLostAlertsInZone,
        preferredVetName: profiles.preferredVetName,
        preferredVetPhone: profiles.preferredVetPhone,
        emergencyContactName: profiles.emergencyContactName,
        emergencyContactPhone: profiles.emergencyContactPhone,
        phone: profiles.phone,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    adminClient.auth.admin.getUserById(user.id).catch(() => ({ data: null })),
  ]);
  const email = emailResult.data?.user?.email ?? "";

  let vetNeedsClinic = false;
  if (profile?.role === "vet" && profile.matriculaVerified) {
    const [adminRow] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          inArray(organizationMemberships.role, ["admin", "coordinator"]),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    vetNeedsClinic = !adminRow;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-[32px] py-[28px]">
        <p className="text-[13px] text-[var(--color-ln-err)]">
          No se encontró tu perfil. Cerrá sesión e intentá de nuevo.
        </p>
      </div>
    );
  }

  const initials = profile.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;
  const accountTypeLabel = ACCOUNT_TYPE_LABELS[profile.accountType] ?? profile.accountType;

  return (
    <div className="mx-auto max-w-4xl px-[32px] py-[28px] pb-[48px]">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Mi cuenta
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Perfil, verificaciones y configuración.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Identity card                                                        */}
      {/* ------------------------------------------------------------------ */}
      <LnCard className="mb-[28px]">
        <LnCardHead title="Datos de la cuenta" />
        <LnCardBody>
          <div className="flex items-center gap-[16px]">
            {/* Avatar */}
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="h-[64px] w-[64px] flex-shrink-0 rounded-full border border-[var(--color-ln-line-strong)] object-cover"
              />
            ) : (
              <div className="flex h-[64px] w-[64px] flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] font-[var(--font-ln-serif)] text-[22px] font-semibold text-[var(--color-ln-ink-2)]">
                {initials}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="font-[var(--font-ln-serif)] text-[18px] font-semibold leading-tight text-[var(--color-ln-ink)]">
                {profile.displayName}
              </p>
              {email && (
                <p className="mt-[2px] font-[var(--font-ln-mono)] text-[12px] text-[var(--color-ln-mute)]">
                  {email}
                </p>
              )}
              <div className="mt-[8px] flex flex-wrap gap-[6px]">
                <span className="inline-flex items-center rounded-[2px] border border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-azul)]">
                  {roleLabel}
                </span>
                <span className="inline-flex items-center rounded-[2px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
                  {accountTypeLabel}
                </span>
              </div>
            </div>
          </div>
        </LnCardBody>
      </LnCard>

      {/* ------------------------------------------------------------------ */}
      {/* Verifications                                                        */}
      {/* ------------------------------------------------------------------ */}
      <LnCard className="mb-[28px]">
        <LnCardHead title="Verificaciones de identidad" />
        <LnCardBody>
          <div className="flex flex-col gap-[12px]">
            {/* DNI */}
            {profile.dniNumber ? (
              <div className="flex items-center gap-[10px]">
                <VerificationBadge verified={profile.dniVerified} />
                <span className="text-[13px] text-[var(--color-ln-ink-2)]">
                  DNI{" "}
                  <span className="font-[var(--font-ln-mono)]">
                    {profile.dniVerified ? `••••${profile.dniNumber.slice(-3)}` : profile.dniNumber}
                  </span>{" "}
                  {/* DNI verification is self-declared (trust-on-input) until the Mi Argentina
                      integration lands. Use "declarado" to avoid overclaiming identity assurance. */}
                  {profile.dniVerified ? "declarado" : "no declarado"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-[10px]">
                <span className="h-[8px] w-[8px] flex-shrink-0 rounded-full bg-[var(--color-ln-mute)]" />
                <span className="text-[13px] text-[var(--color-ln-mute)]">
                  DNI no declarado —{" "}
                  <Link
                    href="?sheet=verificar-dni"
                    className="text-[var(--color-ln-azul)] no-underline hover:underline"
                  >
                    Declarar ahora
                  </Link>
                </span>
              </div>
            )}

            {/* Matrícula */}
            {profile.matriculaNumber ? (
              <div className="flex items-center gap-[10px]">
                <VerificationBadge verified={profile.matriculaVerified} />
                <span className="text-[13px] text-[var(--color-ln-ink-2)]">
                  Matrícula M.N. {profile.matriculaNumber}
                  {profile.matriculaJurisdiccion && ` (${profile.matriculaJurisdiccion})`}{" "}
                  {profile.matriculaVerified ? "verificada" : "— pendiente de verificación"}
                </span>
              </div>
            ) : profile.role === "vet" ? (
              <div className="flex items-center gap-[10px]">
                <span className="h-[8px] w-[8px] flex-shrink-0 rounded-full bg-[var(--color-ln-warn)]" />
                <span className="text-[13px] text-[var(--color-ln-mute)]">
                  Matrícula no cargada
                </span>
              </div>
            ) : null}
          </div>
        </LnCardBody>
      </LnCard>

      {/* ------------------------------------------------------------------ */}
      {/* Privacy controls (PrivacySection is a client component — unchanged) */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-[28px]">
        <PrivacySection
          prefs={{
            discloseNameCredential: profile.discloseNameCredential,
            disclosePhoneCredential: profile.disclosePhoneCredential,
            allowOrgContact: profile.allowOrgContact,
            allowLostAlertsInZone: profile.allowLostAlertsInZone,
          }}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Vet clinic banner                                                    */}
      {/* ------------------------------------------------------------------ */}
      {vetNeedsClinic && (
        <div className="mb-[28px] overflow-hidden rounded-[4px] border border-[var(--color-ln-celeste-100)] border-t-[3px] border-t-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] px-[18px] py-[14px]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-ln-ink)]">
                ¿Vas a ofrecer servicios profesionales?
              </p>
              <p className="mt-[2px] text-[12px] text-[var(--color-ln-ink-2)]">
                Creá tu consultorio para publicar servicios, gestionar turnos y emitir eventos en
                libretas sanitarias.
              </p>
            </div>
            <Link
              href="/cuenta/crear-consultorio"
              className="flex-shrink-0 rounded-[3px] bg-[var(--color-ln-azul)] px-[14px] py-[8px] font-[var(--font-ln-sans)] text-[12.5px] font-semibold text-white no-underline hover:bg-[var(--color-ln-azul-700)]"
            >
              Crear consultorio →
            </Link>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Quick actions                                                         */}
      {/* ------------------------------------------------------------------ */}
      <LnSectionHead num="01" title="Acciones" className="mb-[16px]" />

      <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
        <ActionRow
          href="?sheet=editar-perfil"
          label="Editar mi información"
          description="Nombre, teléfono y foto de perfil"
        />
        <ActionRow
          href="/notificaciones"
          label="Notificaciones"
          description="Avisos, alertas y novedades de tus mascotas"
        />
        <ActionRow
          href="/cuenta/memberships"
          label="Mis organizaciones"
          description="Refugios, clínicas y redes en las que participás"
        />
        <ActionRow
          href="/cuenta/solicitudes"
          label="Mis solicitudes"
          description="Estado de tus solicitudes de rol"
        />
        {profile.role === "owner" && (
          <ActionRow
            href="?sheet=solicitar-upgrade-vet"
            label="Convertirme en profesional / organización"
            description="Registrá tu matrícula veterinaria o creá una clínica, refugio u otra organización"
          />
        )}
        <ActionRow
          href="/cuenta/privacidad"
          label="Privacidad y derechos"
          description="Descargar tus datos · Eliminar cuenta · Ley 25.326"
        />
        {profile.role === "owner" && profile.accountType === "personal" && (
          <>
            <ActionRow
              href="/cuenta/ofrecerme-como-transito"
              label="Ofrecerme como hogar de tránsito"
              description="Inscribite en el pool de voluntarios para cuidar mascotas en custodia"
            />
            <ActionRow
              href="/cuenta/transitos/propuestas"
              label="Propuestas de tránsito"
              description="Refugios proponiéndote cuidar mascotas"
            />
            <ActionRow
              href="/cuenta/transitos/activos"
              label="Tránsitos activos"
              description="Mascotas que estás cuidando ahora"
            />
            <ActionRow
              href="/cuenta/transitos/historial"
              label="Historial de tránsitos"
              description="Tránsitos terminados y propuestas no concretadas"
            />
          </>
        )}
        {profile.role === "vet" && (
          <ActionRow
            href="?sheet=renunciar-rol"
            label="Renunciar a rol veterinario"
            description="Volvés a rol dueño/a"
            danger
          />
        )}
        {profile.role === "govt" && profile.accountType === "institutional" && (
          <ActionRow
            href="/cuenta/desactivar"
            label="Desactivar mi cuenta"
            description="Desactiva tu cuenta de operador govt"
            danger
          />
        )}
      </div>

      {/* Logout */}
      <form action={logoutAction} className="mt-[28px]">
        <button
          type="submit"
          className="rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[16px] py-[9px] font-[var(--font-ln-sans)] text-[13px] font-medium text-[var(--color-ln-err)] transition-colors hover:bg-[var(--color-ln-stripe)]"
        >
          Cerrar sesión
        </button>
      </form>

      {/* Footer */}
      <div className="mt-[32px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-[14px] font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Documento sincronizado</span>
        <span>miMAR · Registro Nacional de Mascotas</span>
      </div>

      {/* Sheet mounter */}
      <Suspense>
        <CuentaSheetMounter
          initialProfile={{
            displayName: profile.displayName ?? "",
            phone: profile.phone ?? "",
            avatarUrl: profile.avatarUrl ?? "",
            preferredVetName: profile.preferredVetName ?? "",
            preferredVetPhone: profile.preferredVetPhone ?? "",
            emergencyContactName: profile.emergencyContactName ?? "",
            emergencyContactPhone: profile.emergencyContactPhone ?? "",
          }}
          role={profile.role}
          dniVerified={profile.dniVerified}
        />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VerificationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        aria-label="declarado"
        className="inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-ln-ok-050)] text-[11px] font-bold text-[var(--color-ln-ok)]"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      aria-label="no declarado"
      className="inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-ln-warn-050)] text-[11px] text-[var(--color-ln-warn)]"
    >
      ⏳
    </span>
  );
}

function ActionRow({
  href,
  label,
  description,
  danger = false,
}: {
  href: string;
  label: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[18px] py-[14px] no-underline last:border-b-0",
        "hover:bg-[var(--color-ln-stripe)] transition-colors",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">
        <p
          className={`text-[13.5px] font-medium leading-tight ${danger ? "text-[var(--color-ln-err)]" : "text-[var(--color-ln-ink)]"}`}
        >
          {label}
        </p>
        <p className="mt-[2px] text-[11.5px] text-[var(--color-ln-mute)]">{description}</p>
      </div>
      <span aria-hidden="true" className="flex-shrink-0 text-[var(--color-ln-mute)] text-[16px]">
        ›
      </span>
    </Link>
  );
}
