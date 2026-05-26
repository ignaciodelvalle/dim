import Link from "next/link";

import { db, organizationMemberships, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { and, eq, inArray, isNull } from "drizzle-orm";

// Role display labels — Argentine Spanish, gendered in context where possible.
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

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  // Fetch email from auth.users via admin SDK — profiles table doesn't store it.
  let email = "";
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient.auth.admin.getUserById(user.id);
    email = data?.user?.email ?? "";
  } catch {
    // Non-critical — email display degrades gracefully
  }

  // Determine if this vet already has an admin/coordinator membership.
  // Used to conditionally show the "Creá tu consultorio" banner.
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
    // Should never happen once authenticated, but defensive.
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10">
          <p className="text-sm text-red-600">
            No se encontró tu perfil. Cerrá sesión e intentá de nuevo.
          </p>
        </div>
      </main>
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        {/* Header — avatar + name + email + badges */}
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Bienvenido/a, {profile.displayName}
          </h1>

          <div className="flex items-center gap-4">
            {/* Avatar */}
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="w-16 h-16 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-800"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-2xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
                {initials}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">
                {profile.displayName}
              </p>
              {email && <p className="text-sm text-neutral-500 dark:text-neutral-500">{email}</p>}
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Badge>{roleLabel}</Badge>
                <Badge variant="secondary">{accountTypeLabel}</Badge>
              </div>
            </div>
          </div>
        </header>

        {/* Identity verifications — read-only */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Verificaciones de identidad
          </h2>

          <div className="space-y-3">
            {/* DNI */}
            {profile.dniNumber ? (
              <div className="flex items-center gap-2">
                <VerificationBadge verified={profile.dniVerified} />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  DNI{" "}
                  <span className="font-mono">
                    {profile.dniVerified ? `••••${profile.dniNumber.slice(-3)}` : profile.dniNumber}
                  </span>{" "}
                  {profile.dniVerified ? "verificado" : "sin verificar"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                <span className="text-sm text-neutral-500 dark:text-neutral-500">
                  DNI no provisto —{" "}
                  <Link
                    href="/cuenta/verificar-dni"
                    className="underline underline-offset-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50"
                  >
                    Verificar ahora
                  </Link>
                </span>
              </div>
            )}

            {/* Matrícula veterinaria */}
            {profile.matriculaNumber ? (
              <div className="flex items-center gap-2">
                <VerificationBadge verified={profile.matriculaVerified} />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  Matrícula M.N. {profile.matriculaNumber}
                  {profile.matriculaJurisdiccion && ` (${profile.matriculaJurisdiccion})`}{" "}
                  {profile.matriculaVerified ? "verificada" : "— pendiente de verificación"}
                </span>
              </div>
            ) : profile.role === "vet" ? (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500" />
                <span className="text-sm text-neutral-500 dark:text-neutral-500">
                  Matrícula no cargada
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Vet onboarding banner — shown only when the vet has no clinic yet */}
        {vetNeedsClinic && (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                ¿Vas a ofrecer servicios profesionales?
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Creá tu consultorio para publicar servicios, gestionar turnos y emitir eventos en
                libretas sanitarias.
              </p>
            </div>
            <Link
              href="/cuenta/crear-consultorio"
              className="shrink-0 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Crear consultorio →
            </Link>
          </section>
        )}

        {/* Quick actions */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Acciones rápidas
          </h2>

          <div className="space-y-2">
            <ActionCard
              href="/cuenta/editar"
              label="Editar mi información"
              description="Nombre, teléfono y foto de perfil"
            />
            <ActionCard
              href="/cuenta/memberships"
              label="Mis organizaciones"
              description="Refugios, clínicas y redes en las que participás"
            />
            <ActionCard
              href="/cuenta/solicitudes"
              label="Mis solicitudes"
              description="Estado de tus solicitudes de rol"
            />
            {profile.role === "owner" && (
              <ActionCard
                href="/cuenta/upgrade"
                label="Convertirme en profesional / organización"
                description="Registrá tu matrícula veterinaria o creá una clínica, refugio u otra organización"
              />
            )}
            {profile.role === "owner" && profile.accountType === "personal" && (
              <>
                <ActionCard
                  href="/cuenta/ofrecerme-como-transito"
                  label="Ofrecerme como hogar de tránsito"
                  description="Inscribite en el pool de voluntarios para cuidar mascotas en custodia"
                />
                <ActionCard
                  href="/cuenta/transitos/propuestas"
                  label="Propuestas de tránsito"
                  description="Refugios proponiéndote cuidar mascotas"
                />
                <ActionCard
                  href="/cuenta/transitos/activos"
                  label="Tránsitos activos"
                  description="Mascotas que estás cuidando ahora"
                />
                <ActionCard
                  href="/cuenta/transitos/historial"
                  label="Historial de tránsitos"
                  description="Tránsitos terminados y propuestas no concretadas"
                />
              </>
            )}
            {profile.role === "vet" && (
              <ActionCard
                href="/cuenta/renunciar"
                label="Renunciar a rol veterinario"
                description="Volvés a rol dueño/a"
              />
            )}
            {profile.role === "govt" && profile.accountType === "institutional" && (
              <ActionCard
                href="/cuenta/desactivar"
                label="Desactivar mi cuenta"
                description="Desactiva tu cuenta de operador govt"
              />
            )}
          </div>
        </section>

        {/* Back link */}
        <div className="pt-2">
          <Link
            href="/mis-mascotas"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            ← Volver a mis mascotas
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  const styles =
    variant === "secondary"
      ? "bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
      : "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-transparent";
  return <span className={`${base} ${styles}`}>{children}</span>;
}

function VerificationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        aria-label="verificado"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold shrink-0"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      aria-label="pendiente"
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-bold shrink-0"
    >
      ⏳
    </span>
  );
}

function ActionCard({
  href,
  label,
  description,
  placeholder = false,
}: {
  href: string;
  label: string;
  description: string;
  placeholder?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
        placeholder
          ? "border-neutral-100 dark:border-neutral-900 opacity-60 pointer-events-none cursor-default"
          : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      }`}
      aria-disabled={placeholder}
      tabIndex={placeholder ? -1 : undefined}
    >
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {label}
          {placeholder && (
            <span className="ml-2 text-xs font-normal text-neutral-400 dark:text-neutral-600">
              (próximamente)
            </span>
          )}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5">{description}</p>
      </div>
      {!placeholder && (
        <span className="text-neutral-400 dark:text-neutral-600 shrink-0 ml-4" aria-hidden>
          →
        </span>
      )}
    </Link>
  );
}
