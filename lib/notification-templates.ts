// Notification templates for the cases system. Each template_id resolves
// to a `{ title, body, severity, ctaLabel?, ctaUrl? }` shape. The bodies
// support `{{placeholder}}` substitution at render time — callers pass
// vars when emitting.
//
// Sources: lifecycles spec §§5.9, 6.9, 7.9, 8.9, 9.9, 10.9, 11.9 and the
// consolidated matrix §14.
//
// Adding a template: add the id below + corresponding entry, then use
// `emitCaseNotification(template_id, recipients, vars)` (lib/case-notifications.ts)
// from the server action that fires it.

import type { Notification } from "@/db";

export type NotificationSeverity = Notification["severity"];

export interface NotificationTemplate {
  title: string;
  body: string;
  severity: NotificationSeverity;
  ctaLabel?: string;
  /** Pattern with `{{public_code}}` substituted to the case CAS-XXXX-XXXX. */
  ctaUrlPattern?: string;
}

const TEMPLATE_DEFS = {
  // ---------------------------------------------------------------------
  // bite_incident (§5.9)
  // ---------------------------------------------------------------------
  bite_incident_opened_owner: {
    title: "Observación antirrábica iniciada para {{pet_name}}",
    body: "{{pet_name}} mordió a alguien el {{bite_date}}. Por ley, debe quedar bajo observación durante 10 días. Si presenta síntomas inusuales, contactá inmediatamente al veterinario.",
    severity: "warning",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  bite_incident_opened_govt: {
    title: "Mordedura reportada — observación rábica iniciada",
    body: "Pet en {{locality}}. Observación de 10 días activa.",
    severity: "warning",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  bite_incident_escalated_owner: {
    title: "Atención: signal compatible con rabia en {{pet_name}}",
    body: "Durante la observación, se detectó un síntoma compatible con rabia. Consultá inmediatamente con tu veterinario o autoridad sanitaria.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  bite_incident_escalated_govt: {
    title: "Escalación rábica en {{locality}}",
    body: "Pet bajo observación con síntoma compatible con rabia. Requiere atención profesional.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  bite_incident_closed_positive_owner: {
    title: "Rabia confirmada en {{pet_name}}",
    body: "El cierre de observación fue positivo. La autoridad sanitaria coordina los próximos pasos.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  bite_incident_closed_positive_govt: {
    title: "Caso de rabia confirmado en {{locality}}",
    body: "Cierre con outcome=positive_rabies. Requiere notificación a centro de salud.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },

  // ---------------------------------------------------------------------
  // lost_pet_episode (§6.9)
  // ---------------------------------------------------------------------
  lost_episode_opened_owner: {
    title: "{{pet_name}} marcada como perdida",
    body: "Activamos el broadcast a refugios verificados en tu zona. Si la encontrás, marcala como recuperada desde su perfil.",
    severity: "info",
    ctaLabel: "Ver mascota",
    ctaUrlPattern: "/mis-mascotas/{{pet_public_token}}",
  },
  lost_episode_broadcast_refugio: {
    title: "Mascota perdida en {{locality}}",
    body: "{{pet_name}} ({{species}}) está reportada como perdida. Si la ves o llega al refugio, ayudanos a devolverla.",
    severity: "info",
    ctaLabel: "Ver detalles",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  lost_episode_match_proposed_owner: {
    title: "Posible encuentro de {{pet_name}}",
    body: "{{org_name}} cree haber encontrado a tu mascota. Revisá la propuesta y confirmá si es ella.",
    severity: "urgent",
    ctaLabel: "Ver propuesta",
    ctaUrlPattern: "/mis-mascotas/{{pet_public_token}}/devolucion",
  },
  lost_episode_resolved_owner: {
    title: "¡{{pet_name}} fue encontrada!",
    body: "Marcamos el caso como resuelto. Hasta la próxima 🐾",
    severity: "success",
    ctaLabel: "Ver mascota",
    ctaUrlPattern: "/mis-mascotas/{{pet_public_token}}",
  },
  lost_episode_resolved_broadcast: {
    title: "Caso cerrado: {{pet_name}} encontrada",
    body: "El owner confirmó que recuperó a su mascota. Gracias por estar atentos.",
    severity: "info",
  },
  lost_episode_auto_expired_owner: {
    title: "El caso de {{pet_name}} se cerró por inactividad",
    body: "Hace más de 180 días que no hay actualizaciones. Si todavía no apareció, podés volver a marcarla perdida y reactivamos el broadcast.",
    severity: "warning",
    ctaLabel: "Ver mascota",
    ctaUrlPattern: "/mis-mascotas/{{pet_public_token}}",
  },
  lost_episode_cancelled_owner: {
    title: "Caso de pérdida cancelado",
    body: "Se canceló el caso de {{pet_name}}.",
    severity: "info",
  },

  // ---------------------------------------------------------------------
  // welfare_denuncia (§7.9)
  // ---------------------------------------------------------------------
  welfare_denuncia_opened_govt: {
    title: "Nueva denuncia de bienestar en {{locality}}",
    body: "Severidad: {{severity_label}}. Requiere triage.",
    severity: "warning",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  welfare_denuncia_opened_reporter: {
    title: "Recibimos tu denuncia",
    body: "Código de tracking: {{reference_code}}. Te avisaremos cuando haya novedades.",
    severity: "info",
    ctaLabel: "Ver mi denuncia",
    ctaUrlPattern: "/denuncias/codigo/{{reference_code}}",
  },
  welfare_denuncia_closed_resolved_reporter: {
    title: "Tu denuncia fue resuelta",
    body: "La autoridad cerró el caso. Gracias por reportar.",
    severity: "info",
    ctaLabel: "Ver mi denuncia",
    ctaUrlPattern: "/denuncias/codigo/{{reference_code}}",
  },
  welfare_denuncia_stale_govt: {
    title: "Denuncia inactiva >90 días",
    body: "La denuncia {{reference_code}} no tiene actualizaciones desde hace 90+ días.",
    severity: "warning",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },

  // ---------------------------------------------------------------------
  // adoption_listing (§8.9)
  // ---------------------------------------------------------------------
  adoption_listing_opened_org: {
    title: "{{pet_name}} publicada en adopción",
    body: "El listing está activo. Las postulaciones llegan a {{org_name}}.",
    severity: "info",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  adoption_listing_finalized_adopter: {
    title: "¡Adoptaste a {{pet_name}}!",
    body: "{{org_name}} confirmó la adopción. Vamos a hacer seguimiento durante {{followup_months}} meses.",
    severity: "success",
    ctaLabel: "Ver mascota",
    ctaUrlPattern: "/mis-mascotas/{{pet_public_token}}",
  },
  adoption_listing_finalized_org: {
    title: "Adopción finalizada para {{pet_name}}",
    body: "Comienza la ventana de followup de {{followup_months}} meses.",
    severity: "success",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  adoption_listing_followup_expired_org: {
    title: "Followup de {{pet_name}} completado",
    body: "Cerramos el seguimiento post-adopción. El caso queda archivado.",
    severity: "info",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },

  // ---------------------------------------------------------------------
  // adoption_application (§9.9)
  // ---------------------------------------------------------------------
  adoption_application_submitted_applicant: {
    title: "Tu postulación para {{pet_name}} fue recibida",
    body: "{{org_name}} la revisará pronto. Te vamos a avisar con la decisión.",
    severity: "info",
    ctaLabel: "Ver mi postulación",
    ctaUrlPattern: "/mis-mascotas/postulaciones",
  },
  adoption_application_won_applicant: {
    title: "¡Te aprobaron la postulación de {{pet_name}}!",
    body: "{{org_name}} eligió tu hogar. Coordinarán los próximos pasos por mail.",
    severity: "success",
    ctaLabel: "Ver mi postulación",
    ctaUrlPattern: "/mis-mascotas/postulaciones",
  },
  adoption_application_rejected_applicant: {
    title: "{{pet_name}} no avanzó con tu postulación",
    body: "{{org_name}} eligió otra familia esta vez. Hay otras mascotas buscando hogar.",
    severity: "info",
    ctaLabel: "Ver otras en adopción",
    ctaUrlPattern: "/adoptar",
  },
  adoption_application_pet_died_applicant: {
    title: "{{pet_name}} falleció",
    body: "Lamentamos comunicarte que {{pet_name}} falleció antes de que pudiéramos avanzar con tu postulación.",
    severity: "info",
    ctaLabel: "Ver otras en adopción",
    ctaUrlPattern: "/adoptar",
  },

  // ---------------------------------------------------------------------
  // custody_dispute (§10.9)
  // ---------------------------------------------------------------------
  custody_dispute_opened_owner: {
    title: "Disputa de custodia abierta sobre {{pet_name}}",
    body: "Un procedimiento judicial externo está en curso. Mientras dure, algunas operaciones estarán suspendidas.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  custody_dispute_opened_party: {
    title: "Te incluimos como parte en la disputa de custodia de {{pet_name}}",
    body: "Procedimiento judicial en curso. Información en el caso.",
    severity: "urgent",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  custody_dispute_closed_owner: {
    title: "Disputa de custodia cerrada — {{pet_name}}",
    body: "Outcome: {{outcome_label}}. Detalle en el caso.",
    severity: "info",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },

  // ---------------------------------------------------------------------
  // foster_placement (§11.9)
  // ---------------------------------------------------------------------
  foster_placement_opened_foster: {
    title: "Tránsito de {{pet_name}} confirmado",
    body: "{{org_name}} te asignó como tránsito. Coordinen el retiro por mail.",
    severity: "info",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  foster_placement_opened_org: {
    title: "Tránsito iniciado para {{pet_name}}",
    body: "{{foster_name}} aceptó la propuesta.",
    severity: "info",
    ctaLabel: "Ver caso",
    ctaUrlPattern: "/casos/{{public_code}}",
  },
  foster_placement_closed_returned_foster: {
    title: "Cerraste el tránsito de {{pet_name}}",
    body: "Gracias por hacerte cargo. ¿Volvés al pool?",
    severity: "info",
    ctaLabel: "Mi perfil de tránsitos",
    ctaUrlPattern: "/cuenta/transitos",
  },
  foster_placement_closed_adopted_foster: {
    title: "¡{{pet_name}} fue adoptada!",
    body: "Tu tránsito cumplió su misión. ¿Volvés al pool?",
    severity: "success",
    ctaLabel: "Mi perfil de tránsitos",
    ctaUrlPattern: "/cuenta/transitos",
  },
} satisfies Record<string, NotificationTemplate>;

export type CaseNotificationTemplateId = keyof typeof TEMPLATE_DEFS;

/**
 * Templates indexed by id. Widened to `NotificationTemplate` so callers
 * see the common shape (ctaLabel/ctaUrlPattern as optional) regardless
 * of which entries set those fields.
 */
export const CASE_NOTIFICATION_TEMPLATES: Record<
  CaseNotificationTemplateId,
  NotificationTemplate
> = TEMPLATE_DEFS;

/**
 * Resolve a template + substitute placeholders. Returns the same
 * shape `notifications` table accepts. Caller adds userId + related ids.
 */
export function renderCaseNotificationTemplate(
  templateId: CaseNotificationTemplateId,
  vars: Record<string, string | number>,
): {
  title: string;
  body: string;
  severity: NotificationSeverity;
  ctaLabel: string | null;
  ctaUrl: string | null;
} {
  const tpl = CASE_NOTIFICATION_TEMPLATES[templateId];
  const substitute = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = vars[key];
      return value === undefined ? `{{${key}}}` : String(value);
    });
  return {
    title: substitute(tpl.title),
    body: substitute(tpl.body),
    severity: tpl.severity,
    ctaLabel: tpl.ctaLabel ? substitute(tpl.ctaLabel) : null,
    ctaUrl: tpl.ctaUrlPattern ? substitute(tpl.ctaUrlPattern) : null,
  };
}
