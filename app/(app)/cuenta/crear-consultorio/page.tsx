import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, organizationMemberships, organizations, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { CrearConsultorioForm } from "./CrearConsultorioForm";

export default async function CrearConsultorioPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      role: profiles.role,
      matriculaVerified: profiles.matriculaVerified,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Only verified vets without an existing admin/coordinator membership can use this page.
  if (!profile || profile.role !== "vet" || !profile.matriculaVerified) {
    redirect("/cuenta");
  }

  // If the vet already has a clinic, send them straight to it.
  const [adminMembership] = await db
    .select({ publicToken: organizations.publicToken })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, user.id),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (adminMembership) {
    redirect(`/org/${adminMembership.publicToken}`);
  }

  const defaultName = `Consultorio ${profile.displayName}`;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Crear consultorio
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Completá los datos de tu consultorio para empezar a ofrecer servicios en MiMAR.
          </p>
        </header>

        <section className="rounded-lg border border-gob-border  p-6">
          <CrearConsultorioForm defaultName={defaultName} />
        </section>

        <div className="pt-2">
          <Link
            href="/cuenta"
            className="text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text  transition-colors"
          >
            ← Volver a mi cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
