// Cuenta hub — Item 14.1 reorder.
//
// Layout: serif page title → identity card → verifications → privacy section
//   → grouped action sections (Tu información / Rol y organizaciones /
//     Privacidad y datos / Zona de riesgo) → logout → footer → sheet mounter.
//
// Changes from previous flat "01 Acciones" list:
//   - Replaced single group with four named LnSectionHead groups.
//   - Dropped Notificaciones + Mis denuncias (already in OWNER_NAV — no duplicates).
//   - Added Zona de riesgo section visually separated (error border/bg) with
//     DeactivateAccountDialog (ConfirmDialog + motivo, ≥ 5 chars).
//   - Role/foster items appear per capabilities (owner, vet).

import Link from "next/link";
import { Suspense } from "react";

import { logoutAction } from "@/app/actions/auth";
import { db, organizationMemberships, ownerships, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { LnBadge } from "@/components/ui/Badge";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";

import { CuentaSheetMounter } from "./CuentaSheetMounter";
import { DeactivateAccountDialog } from "./_components/DeactivateAccountDialog";
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

  // Profile DB read, admin auth email lookup, and pet count are independent — run in parallel.
  // petCount uses SQL COUNT(*) — never loads pet rows into JS (scale guard, UX 0.3).
  const adminClient = createAdminClient();
  const [[profile], emailResult, petCountResult] = await Promise.all([
    db
      .select({
        role: profiles.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        accountType: profiles.accountType,
        // Wave 5 Item 25a: no plaintext DNI. Display uses dniLast4 only.
        dniLast4: profiles.dniLast4,
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
    // SQL COUNT — bounded by definition; safe for owners with thousands of pets.
    db
      .select({ n: count() })
      .from(ownerships)
      .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)))
      .then((r) => Number(r[0]?.n ?? 0))
      .catch(() => 0),
  ]);
  const petCount = petCountResult;
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

  const isPersonal = profile.accountType === "personal";

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
                <LnBadge variant="info">{roleLabel}</LnBadge>
                <LnBadge variant="neutral">{accountTypeLabel}</LnBadge>
                {isPersonal && petCount > 0 && (
                  <LnBadge variant="neutral">
                    {petCount} mascota{petCount !== 1 ? "s" : ""}
                  </LnBadge>
                )}
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
            {/* DNI — Wave 5 Item 25a: show last-4 only (no plaintext).
                Full DNI is never stored; disambiguation via dniLast4. */}
            {profile.dniLast4 ? (
              <div className="flex items-center gap-[10px]">
                <VerificationBadge verified={profile.dniVerified} />
                <span className="text-[13px] text-[var(--color-ln-ink-2)]">
                  DNI{" "}
                  <span className="font-[var(--font-ln-mono)]">{`••••${profile.dniLast4}`}</span>{" "}
                  {/* DNI verification is self-declared (trust-on-input) until the Mi Argentina
                      integration lands. Use "declarado" to avoid overclaiming identity assurance. */}
                  {profile.dniVerified ? "declarado" : "no declarado"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-[10px]">
                <span className="h-[8px] w-[8px] flex-shrink-0 rounded-full bg-[var(--color-ln-mute)]" />
                <span className="text-[13px] text-[var(--color-ln-mute)]">DNI no declarado</span>
                <Link
                  href="?sheet=verificar-dni"
                  className="inline-flex items-center justify-center gap-[7px] rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[11px] py-[6px] text-[12px] font-semibold text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] no-underline"
                >
                  Declarar ahora
                </Link>
              </div>
            )}

            {/* Matrícula */}
            {profile.matriculaNumber ? (
              <div className="flex items-center gap-[10px]">
                <VerificationBadge verified={profile.matriculaVerified} />
                <span className="text-[13px] text-[var(--color-ln-ink-2)]">
                  Matrícula M.N. {profile.matriculaNumber}
                  {profile.matriculaJurisdiccion && ` (${profile.matriculaJurisdiccion})`}{" "}
                  {profile.matriculaVerified
                    ? "verificada"
                    : "— reportada al colegio / autoridad jurisdiccional — pendiente de validación"}
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

      {/* ================================================================== */}
      {/* Grouped action sections (Item 14.1)                                 */}
      {/* ================================================================== */}

      {/* ------------------------------------------------------------------ */}
      {/* 01 Tu información                                                    */}
      {/* ------------------------------------------------------------------ */}
      <LnSectionHead num="01" title="Tu información" className="mb-[16px]" />

      <div className="mb-[32px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
        <ActionRow
          href="?sheet=editar-perfil"
          label="Editar mi información"
          description="Nombre, teléfono y foto de perfil"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 02 Rol y organizaciones                                              */}
      {/* Shown only for personal accounts. Institutional accounts (govt/     */}
      {/* admin) don't have org memberships or role transitions here.         */}
      {/* ------------------------------------------------------------------ */}
      {isPersonal && (
        <>
          <LnSectionHead num="02" title="Rol y organizaciones" className="mb-[16px]" />

          <div className="mb-[32px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
            {profile.role === "owner" && (
              <ActionRow
                href="?sheet=solicitar-upgrade-vet"
                label="Convertirme en profesional / organización"
                description="Registrá tu matrícula veterinaria o creá una clínica, refugio u otra organización"
              />
            )}
            {profile.role === "vet" && (
              <ActionRow
                href="/cuenta/crear-consultorio"
                label="Crear consultorio"
                description="Configurá tu consultorio veterinario para gestionar turnos y publicar servicios"
              />
            )}
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
            <ActionRow
              href="/cuenta/transitos"
              label="Tránsitos"
              description="Hogar de tránsito, propuestas, tránsitos activos e historial"
            />
            {profile.role === "vet" && (
              <ActionRow
                href="?sheet=renunciar-rol"
                label="Renunciar a rol veterinario"
                description="Volvés a rol dueño/a"
                danger
              />
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 03 Privacidad y datos                                                */}
      {/* ------------------------------------------------------------------ */}
      <LnSectionHead
        num={isPersonal ? "03" : "02"}
        title="Privacidad y datos"
        className="mb-[16px]"
      />

      <div className="mb-[32px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
        <ActionRow
          href="/cuenta/privacidad"
          label="Privacidad y derechos"
          description="Descargar tus datos · Eliminar cuenta · Ley 25.326"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Zona de riesgo — personal accounts only. Visually separated:        */}
      {/* error-tone heading + border + bg. ConfirmDialog with mandatory       */}
      {/* motivo (≥ 5 chars) gates irreversible deactivation.                 */}
      {/* Govt deactivation lives at /cuenta/desactivar (coverage check).     */}
      {/* ------------------------------------------------------------------ */}
      {isPersonal && (
        <section aria-labelledby="zona-riesgo-heading" className="mb-[32px]">
          {/* Custom error-tone section heading — not using LnSectionHead      */}
          {/* because we need the error color variant.                          */}
          <div className="mb-[16px] flex items-baseline gap-[14px] border-b-2 border-[var(--color-ln-err)] pb-[10px]">
            <span className="font-[var(--font-ln-mono)] text-[12px] font-semibold tracking-[.04em] text-[var(--color-ln-err)]">
              04
            </span>
            <h2
              id="zona-riesgo-heading"
              className="m-0 font-[var(--font-ln-serif)] text-[21px] font-semibold tracking-[-0.01em] text-[var(--color-ln-err)]"
            >
              Zona de riesgo
            </h2>
          </div>
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-err)] bg-[var(--color-ln-err-050)]">
            <DeactivateAccountDialog />
          </div>
        </section>
      )}

      {/* Logout */}
      <form action={logoutAction} className="mt-[4px] mb-[28px]">
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
        <span>MiMAR · Registro Nacional de Mascotas</span>
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
      className="inline-flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]"
    >
      {/* clock/pending glyph */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
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
