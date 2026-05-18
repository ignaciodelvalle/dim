"use client";

// Re-export from shared location for /pro/agenda/turnos/[token].
// Identical to the org-side dispatcher — same component, different import path
// so the pro route doesn't depend on the org route.

export { AttendanceFormDispatcher } from "@/app/org/[orgToken]/agenda/turnos/[appointmentToken]/AttendanceFormDispatcher";
