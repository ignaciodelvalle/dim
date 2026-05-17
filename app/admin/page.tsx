import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/auth-guards";

export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Panel de administración
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Gestión de cuentas institucionales: govts y admins del sistema.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            label="Govts"
            description="Listado de govts activos. Creá nuevas cuentas, asigná localidades y revocá accesos."
            cta={{ href: "/admin/govts", label: "Ir a Govts" }}
          />
          <Card
            label="Admins"
            description="Listado de admins activos. Creá nuevas cuentas y administrá el acceso universal."
            cta={{ href: "/admin/admins", label: "Ir a Admins" }}
          />
        </section>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Cola de solicitudes y búsqueda de usuarios
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Las operaciones de aprobación, rechazo, propuestas de rol y revocaciones viven en el
            panel de gobierno.
          </p>
          <Link
            href="/gobierno"
            className="inline-block text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Ir a Gobierno (cola, usuarios, organizaciones) →
          </Link>
        </section>
      </div>
    </main>
  );
}

function Card({
  label,
  description,
  cta,
}: {
  label: string;
  description: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      <Link
        href={cta.href}
        className="inline-block text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
      >
        {cta.label} →
      </Link>
    </div>
  );
}
