// Owner dashboard / home — composes widgets from lib/owner-dashboard.
// Auth + role gates already enforced by (app)/layout.tsx (admin/govt
// get redirected to their portal before this page renders).

import { and, eq, isNull } from "drizzle-orm";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import {
  countUnreadNotifications,
  fetchActiveReminders,
  fetchLivingPetLocalities,
  fetchOngoingMedications,
  fetchOpenWorkflows,
  fetchPetsForOwner,
  fetchPreviousWorkflows,
  fetchUnreadNotifications,
  fetchUpcomingAppointments,
} from "@/lib/owner-dashboard";

import { AppointmentsWidget } from "./_components/AppointmentsWidget";
import { MedicationsWidget } from "./_components/MedicationsWidget";
import { NewsPlaceholder } from "./_components/NewsPlaceholder";
import { NotificationsWidget } from "./_components/NotificationsWidget";
import { OpenWorkflowsWidget } from "./_components/OpenWorkflowsWidget";
import { PetsGridWidget } from "./_components/PetsGridWidget";
import { PreviousWorkflowsWidget } from "./_components/PreviousWorkflowsWidget";
import { QuickCaptureWidget } from "./_components/QuickCaptureWidget";
import { RegulationsPlaceholder } from "./_components/RegulationsPlaceholder";
import { RemindersSection } from "./_components/RemindersSection";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const { user } = await requireUserOrRedirect();

  // Everything loads in parallel — one round-trip for the full dashboard.
  const [
    profile,
    pets,
    appointments,
    notifications,
    unreadCount,
    meds,
    openWf,
    prevWf,
    locs,
    reminders,
  ] = await Promise.all([
    db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(and(eq(profiles.id, user.id), isNull(profiles.deactivatedAt)))
      .limit(1),
    fetchPetsForOwner(user.id),
    fetchUpcomingAppointments(user.id, 5),
    fetchUnreadNotifications(user.id, 5),
    countUnreadNotifications(user.id),
    fetchOngoingMedications(user.id),
    fetchOpenWorkflows(user.id),
    fetchPreviousWorkflows(user.id, 10),
    fetchLivingPetLocalities(user.id),
    fetchActiveReminders(user.id),
  ]);

  const firstName = (profile[0]?.displayName ?? "").trim().split(/\s+/)[0] || "Hola";

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 p-6">
      <div className="max-w-5xl mx-auto pt-6 pb-10 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Hola, {firstName}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
            Esto es lo que pasa con tus mascotas hoy.
          </p>
        </header>

        <RemindersSection reminders={reminders} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickCaptureWidget pets={pets} />
          <NotificationsWidget notifications={notifications} totalUnread={unreadCount} />
        </div>

        <PetsGridWidget pets={pets} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AppointmentsWidget appointments={appointments} />
          <MedicationsWidget medications={meds} />
        </div>

        <OpenWorkflowsWidget items={openWf} />

        <PreviousWorkflowsWidget items={prevWf} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NewsPlaceholder />
          <RegulationsPlaceholder localities={locs} />
        </div>
      </div>
    </main>
  );
}
