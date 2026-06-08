CREATE SCHEMA "ref";
--> statement-breakpoint
CREATE TYPE "public"."author_role" AS ENUM('owner', 'scanner', 'finder', 'vet', 'shelter', 'govt', 'system');--> statement-breakpoint
CREATE TYPE "public"."data_purpose" AS ENUM('identidad_mascota', 'salud_animal', 'notificacion_zoonosis', 'reunificacion_perdida', 'control_poblacional', 'razas_peligrosas', 'auditoria_legal', 'consentimiento_marketing');--> statement-breakpoint
CREATE TYPE "public"."identification_kind" AS ENUM('microchip_iso', 'tattoo', 'collar_tag', 'photo_biometric');--> statement-breakpoint
CREATE TYPE "public"."identification_status" AS ENUM('active', 'replaced', 'removed', 'unreadable');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'success', 'warning', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended', 'dissolved');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('clinic', 'shelter', 'rescue_network', 'sanitary_authority', 'other');--> statement-breakpoint
CREATE TYPE "public"."organization_capability_status" AS ENUM('pending', 'approved', 'denied', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."organization_membership_role" AS ENUM('admin', 'coordinator', 'member', 'volunteer', 'foster', 'vet_individual');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outbox_target_kind" AS ENUM('govt_webhook', 'eno_authority', 'audit_export', 'internal_dashboard');--> statement-breakpoint
CREATE TYPE "public"."ownership_role" AS ENUM('owner', 'co_owner', 'shelter_custody', 'foster', 'caretaker');--> statement-breakpoint
CREATE TYPE "public"."pet_acquisition_method" AS ENUM('adopted', 'purchased', 'found_stray', 'gift', 'born_in_litter', 'other');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."pet_status" AS ENUM('active', 'lost', 'deceased');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('vaccine', 'deworming', 'medication', 'appointment', 'custom', 'post_adoption_checkin');--> statement-breakpoint
CREATE TYPE "public"."training_level" AS ENUM('none', 'basic', 'intermediate', 'advanced', 'professional');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'vet', 'govt', 'admin');--> statement-breakpoint
CREATE TYPE "public"."welfare_report_kind" AS ENUM('abandonment', 'neglect', 'physical_abuse', 'chained', 'no_shelter', 'hoarding', 'dog_fighting', 'trafficking', 'other');--> statement-breakpoint
CREATE TYPE "public"."welfare_report_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."welfare_report_status" AS ENUM('open', 'triaged', 'in_progress', 'closed', 'duplicate', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."welfare_report_subject_kind" AS ENUM('registered_pet', 'unowned_animal', 'location', 'general');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"slot_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"service_offering_id" uuid NOT NULL,
	"organization_id" uuid,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"attended_at" timestamp with time zone,
	"attended_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"no_show_marked_at" timestamp with time zone,
	"outcome_event_id" uuid,
	"reminder_id" uuid,
	"notes_from_owner" text,
	"notes_from_org" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "appointment_status_valid" CHECK ("appointments"."status" in ('confirmed', 'attended', 'no_show', 'cancelled_by_owner', 'cancelled_by_org')),
	CONSTRAINT "appointment_outcome_only_when_attended" CHECK (("appointments"."outcome_event_id" is null) or ("appointments"."status" = 'attended'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"initiated_by" text DEFAULT 'self' NOT NULL,
	"initiated_by_user_id" uuid,
	"target_user_id" uuid,
	"target_organization_id" uuid,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text NOT NULL,
	"jurisdiction_locality" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_notes" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "approval_type_valid" CHECK ("approval_requests"."type" in ('role_upgrade_vet', 'organization_verification', 'service_dog_credential_verification')),
	CONSTRAINT "approval_status_valid" CHECK ("approval_requests"."status" in ('pending', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "approval_initiated_valid" CHECK ("approval_requests"."initiated_by" in ('self', 'authority')),
	CONSTRAINT "approval_target_consistent" CHECK (case "approval_requests"."type" when 'role_upgrade_vet' then "approval_requests"."target_user_id" is not null and "approval_requests"."target_organization_id" is null when 'organization_verification' then "approval_requests"."target_user_id" is null and "approval_requests"."target_organization_id" is not null end),
	CONSTRAINT "approval_decision_consistent" CHECK (("approval_requests"."status" in ('approved', 'rejected') and "approval_requests"."decided_at" is not null) or ("approval_requests"."status" in ('pending', 'withdrawn') and "approval_requests"."decided_at" is null and "approval_requests"."decided_by_user_id" is null)),
	CONSTRAINT "approval_requests_jurisdiction_province_canonical" CHECK ("approval_requests"."jurisdiction_province" is null or "approval_requests"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ar_localities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_code" text NOT NULL,
	"department_name" text,
	"department_code" text,
	"locality_name" text NOT NULL,
	"locality_slug" text NOT NULL,
	"indec_id" text,
	"category" text NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"source" text NOT NULL,
	"source_version" text,
	"last_imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "ar_localities_indec_id_unique" UNIQUE("indec_id"),
	CONSTRAINT "ar_localities_province_valid" CHECK ("ar_localities"."province_code" ~ '^AR-[A-Z]$'),
	CONSTRAINT "ar_localities_category_valid" CHECK ("ar_localities"."category" IN ('localidad','ciudad','pueblo','comuna','barrio','componente')),
	CONSTRAINT "ar_localities_source_valid" CHECK ("ar_localities"."source" IN ('indec_cppdyl','bahra','manual','caba_open_data'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ar_localities_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"source_version" text,
	"status" text DEFAULT 'running' NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"noop_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ar_imports_status_valid" CHECK ("ar_localities_import_runs"."status" in ('running','ok','failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid,
	"event_id" uuid,
	"approval_request_id" uuid,
	"audit_log_id" uuid,
	"uploaded_by_user_id" uuid,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"approval_request_id" uuid,
	"target_user_id" uuid,
	"target_organization_id" uuid,
	"target_govt_assignment_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_code" text NOT NULL,
	"case_kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_reason" text,
	"superseded_by_case_id" uuid,
	"primary_subject_kind" text NOT NULL,
	"primary_pet_id" uuid,
	"primary_location_lat" numeric(10, 7),
	"primary_location_lng" numeric(10, 7),
	"applicant_user_id" uuid,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by_user_id" uuid,
	"opened_by_organization_id" uuid,
	"opened_reason" text,
	"receiver_organization_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"welfare_report_id" uuid,
	"adoption_application_id" uuid,
	"custody_dispute_id" uuid,
	"parent_listing_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_subject_pet_consistency" CHECK (("cases"."primary_subject_kind" = 'registered_pet') = ("cases"."primary_pet_id" is not null)),
	CONSTRAINT "cases_subject_location_consistency" CHECK (("cases"."primary_subject_kind" = 'location') = ("cases"."primary_location_lat" is not null and "cases"."primary_location_lng" is not null)),
	CONSTRAINT "cases_merged_consistency" CHECK (("cases"."status" = 'merged') = ("cases"."superseded_by_case_id" is not null and "cases"."closed_reason" = 'merged')),
	CONSTRAINT "cases_closed_consistency" CHECK (("cases"."status" in ('closed', 'merged')) = ("cases"."closed_at" is not null)),
	CONSTRAINT "cases_opened_reason_min_length" CHECK ("cases"."opened_reason" is null or length("cases"."opened_reason") >= 10),
	CONSTRAINT "cases_jurisdiction_province_canonical" CHECK ("cases"."jurisdiction_province" is null or "cases"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cron_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "cron_runs_status_valid" CHECK ("cron_runs"."status" in ('running','ok','failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custody_dispute_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"party_user_id" uuid,
	"party_organization_id" uuid,
	"party_role" text NOT NULL,
	"party_position_summary" text,
	"added_by_user_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_party_exactly_one_subject" CHECK (("custody_dispute_parties"."party_user_id" is not null and "custody_dispute_parties"."party_organization_id" is null) or ("custody_dispute_parties"."party_user_id" is null and "custody_dispute_parties"."party_organization_id" is not null)),
	CONSTRAINT "dispute_party_role_valid" CHECK ("custody_dispute_parties"."party_role" in ('current_owner','claimant_owner','current_org_custody','claimant_org','witness'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custody_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"pet_id" uuid NOT NULL,
	"raised_by_user_id" uuid,
	"raised_by_org_id" uuid,
	"raised_by_role" text NOT NULL,
	"raising_event_id" uuid NOT NULL,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text NOT NULL,
	"jurisdiction_locality" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolution_summary" text,
	"resolution_event_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"purpose" "data_purpose",
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custody_disputes_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "custody_disputes_status_valid" CHECK ("custody_disputes"."status" in ('open','resolved','withdrawn')),
	CONSTRAINT "custody_disputes_resolution_consistent" CHECK (("custody_disputes"."status" = 'open' and "custody_disputes"."resolution" is null and "custody_disputes"."resolved_by_user_id" is null and "custody_disputes"."resolved_at" is null) or ("custody_disputes"."status" in ('resolved','withdrawn') and "custody_disputes"."resolved_by_user_id" is not null and "custody_disputes"."resolved_at" is not null)),
	CONSTRAINT "custody_disputes_resolution_required_when_resolved" CHECK ("custody_disputes"."status" != 'resolved' or ("custody_disputes"."resolution" is not null and "custody_disputes"."resolution_summary" is not null)),
	CONSTRAINT "custody_disputes_raised_role_valid" CHECK ("custody_disputes"."raised_by_role" in ('owner','org','govt','admin')),
	CONSTRAINT "custody_disputes_jurisdiction_province_canonical" CHECK ("custody_disputes"."jurisdiction_province" is null or "custody_disputes"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eno_processing_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_event_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "eno_processing_queue_status_check" CHECK ("eno_processing_queue"."status" IN ('pending', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_event_id" uuid NOT NULL,
	"target_kind" "outbox_target_kind" NOT NULL,
	"target_jurisdiction_province" text,
	"target_jurisdiction_locality" text,
	"payload_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "foster_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"volunteer_user_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"proposed_by_user_id" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposed_duration_weeks" integer,
	"proposed_notes" text,
	"match_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"response_notes" text,
	"rejection_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"resolved_ownership_id" uuid,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foster_proposals_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "foster_proposals_status_valid" CHECK ("foster_proposals"."status" in ('pending','accepted','rejected','expired','cancelled')),
	CONSTRAINT "foster_proposals_rejection_reason_valid" CHECK ("foster_proposals"."rejection_reason" is null or "foster_proposals"."rejection_reason" in ('capacity','health_mismatch','timing','distance','household','other')),
	CONSTRAINT "foster_proposals_response_consistent" CHECK (("foster_proposals"."status" = 'pending'   and "foster_proposals"."responded_at" is null and "foster_proposals"."cancelled_at" is null) or ("foster_proposals"."status" = 'accepted'  and "foster_proposals"."responded_at" is not null and "foster_proposals"."resolved_ownership_id" is not null) or ("foster_proposals"."status" = 'rejected'  and "foster_proposals"."responded_at" is not null) or ("foster_proposals"."status" = 'expired'   and ("foster_proposals"."responded_at" is null or "foster_proposals"."expires_at" <= "foster_proposals"."responded_at")) or ("foster_proposals"."status" = 'cancelled' and "foster_proposals"."cancelled_at" is not null and "foster_proposals"."cancelled_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "foster_volunteers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"available_slots" integer DEFAULT 0 NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"accepts_dogs" boolean DEFAULT false NOT NULL,
	"accepts_cats" boolean DEFAULT false NOT NULL,
	"accepts_other_species" boolean DEFAULT false NOT NULL,
	"accepts_size_small" boolean DEFAULT true NOT NULL,
	"accepts_size_medium" boolean DEFAULT true NOT NULL,
	"accepts_size_large" boolean DEFAULT false NOT NULL,
	"accepts_puppies" boolean DEFAULT false NOT NULL,
	"accepts_seniors" boolean DEFAULT true NOT NULL,
	"accepts_chronic_conditions" boolean DEFAULT false NOT NULL,
	"accepts_dangerous_breeds" boolean DEFAULT false NOT NULL,
	"max_duration_weeks" integer,
	"household_other_pets" boolean,
	"household_kids" boolean,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foster_volunteers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "foster_volunteers_status_valid" CHECK ("foster_volunteers"."status" in ('active','paused','withdrawn')),
	CONSTRAINT "foster_volunteers_slots_non_negative" CHECK ("foster_volunteers"."available_slots" >= 0),
	CONSTRAINT "foster_volunteers_at_least_one_species" CHECK ("foster_volunteers"."status" != 'active' or ("foster_volunteers"."accepts_dogs" or "foster_volunteers"."accepts_cats" or "foster_volunteers"."accepts_other_species")),
	CONSTRAINT "foster_volunteers_jurisdiction_province_canonical" CHECK ("foster_volunteers"."jurisdiction_province" is null or "foster_volunteers"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "govt_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text NOT NULL,
	"jurisdiction_locality" text NOT NULL,
	"granted_by_user_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "govt_assignments_jurisdiction_province_canonical" CHECK ("govt_assignments"."jurisdiction_province" is null or "govt_assignments"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "govt_business_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"rule_type" text NOT NULL,
	"rule_payload" jsonb NOT NULL,
	"notes" text,
	"legal_anchor_ids" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "govt_business_rules_rule_type_valid" CHECK ("govt_business_rules"."rule_type" in ('ppp_breed_list', 'ppp_weight_threshold', 'ppp_attestation_required_registries')),
	CONSTRAINT "govt_business_rules_jurisdiction_province_canonical" CHECK ("govt_business_rules"."jurisdiction_province" is null or "govt_business_rules"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jurisdictions_census" (
	"province_name" text PRIMARY KEY NOT NULL,
	"population" integer NOT NULL,
	"census_year" smallint NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "libreta_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_token" text NOT NULL,
	"pet_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"view_count_cached" integer DEFAULT 0 NOT NULL,
	"last_viewed_at_cached" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "libreta_share_tokens_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"related_pet_id" uuid,
	"related_event_id" uuid,
	"related_reminder_id" uuid,
	"related_case_id" uuid,
	"category" text,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text DEFAULT 'contact' NOT NULL,
	"inquirer_name" text,
	"inquirer_email" text NOT NULL,
	"message" text NOT NULL,
	"submitter_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "org_contact_messages_kind_check" CHECK ("org_contact_messages"."kind" IN ('contact', 'volunteer')),
	CONSTRAINT "org_contact_messages_message_length_check" CHECK (length("org_contact_messages"."message") <= 500),
	CONSTRAINT "org_contact_messages_email_length_check" CHECK (length("org_contact_messages"."inquirer_email") <= 254)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_capability_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"status" "organization_capability_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_reason" text,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text NOT NULL,
	"jurisdiction_locality" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_coverage_org_province_locality_unique" UNIQUE NULLS NOT DISTINCT("organization_id","jurisdiction_province","jurisdiction_locality"),
	CONSTRAINT "organization_coverage_jurisdiction_province_canonical" CHECK ("organization_coverage"."jurisdiction_province" is null or "organization_coverage"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_role" "organization_membership_role" NOT NULL,
	"can_write_pet_events" boolean DEFAULT false NOT NULL,
	"invited_by_user_id" uuid,
	"invitation_token" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '14 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_invitation_token_unique" UNIQUE("invitation_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_membership_role" NOT NULL,
	"title" text,
	"can_write_pet_events" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"invited_by_user_id" uuid,
	"receives_broadcasts" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"org_type" "org_type" NOT NULL,
	"cuit" text,
	"personeria_juridica_number" text,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"avatar_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"tier_0_show_branding" boolean DEFAULT false NOT NULL,
	"tier_0_show_origin_org" boolean DEFAULT false NOT NULL,
	"auto_verified_via_matricula" boolean DEFAULT false NOT NULL,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"description" text,
	"logo_storage_path" text,
	"disclose_address" boolean DEFAULT true NOT NULL,
	"donation_methods" jsonb,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "organizations_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "organizations_cuit_unique" UNIQUE("cuit"),
	CONSTRAINT "organizations_description_length_check" CHECK ("organizations"."description" IS NULL OR length("organizations"."description") <= 2000),
	CONSTRAINT "organizations_coordinates_pair_check" CHECK (("organizations"."latitude" IS NULL) = ("organizations"."longitude" IS NULL)),
	CONSTRAINT "organizations_jurisdiction_province_canonical" CHECK ("organizations"."jurisdiction_province" is null or "organizations"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"owner_organization_id" uuid,
	"role" "ownership_role" DEFAULT 'owner' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"transferred_from_id" uuid,
	"allow_co_foster" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownerships_polymorphic_holder" CHECK ((("ownerships"."owner_user_id" IS NOT NULL)::int + ("ownerships"."owner_organization_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet_achievement_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pulse_until" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid,
	"author_role" "author_role" DEFAULT 'owner' NOT NULL,
	"author_organization_id" uuid,
	"author_verified" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"location_lat" numeric(10, 7),
	"location_lng" numeric(10, 7),
	"case_id" uuid,
	"client_idempotency_key" uuid,
	"tipo_evento_code" text,
	"lote_biologico" text,
	"laboratorio" text,
	"vencimiento_biologico" date,
	"via_aplicacion_code" text,
	"vet_matricula" text,
	"vet_jurisdiccion_code" text,
	"establecimiento_renspa" text,
	"proxima_dosis_at" date,
	"firmado_at" timestamp with time zone,
	"firma_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet_identifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" "identification_kind" NOT NULL,
	"status" "identification_status" DEFAULT 'active' NOT NULL,
	"code" text,
	"recorded_at" date NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_by_label" text,
	"photo_id" uuid,
	"iso_country_code" char(3),
	"iso_manufacturer_code" char(4),
	"iso_national_id" char(8),
	"iso_compliant" boolean,
	"implantation_site" text,
	"tattoo_location" text,
	"tattoo_description" text,
	"replaced_by_id" uuid,
	"replacement_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"purpose" "data_purpose",
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chip_requires_iso_fields" CHECK ("pet_identifications"."kind" <> 'microchip_iso' OR ("pet_identifications"."code" IS NOT NULL AND length("pet_identifications"."code") = 15)),
	CONSTRAINT "tattoo_location_valid" CHECK ("pet_identifications"."tattoo_location" IS NULL OR "pet_identifications"."tattoo_location" IN ('inner_ear_left','inner_ear_right','inner_thigh','belly','other')),
	CONSTRAINT "implantation_site_valid" CHECK ("pet_identifications"."implantation_site" IS NULL OR "pet_identifications"."implantation_site" IN ('lateral_cuello_izq','lateral_cuello_der','interescapular','otro')),
	CONSTRAINT "replacement_reason_valid" CHECK ("pet_identifications"."replacement_reason" IS NULL OR "pet_identifications"."replacement_reason" IN ('damaged','migrated','illegible','medical','other'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet_service_dog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"credential_status" text DEFAULT 'pendiente_verificacion' NOT NULL,
	"rupga_credential" text,
	"training_center" text NOT NULL,
	"training_cert_date" date,
	"credential_issue_date" date,
	"credential_expiry_date" date,
	"in_service" boolean DEFAULT true NOT NULL,
	"public_visibility" text DEFAULT 'private_only' NOT NULL,
	"notes" text,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_service_dog_pet_id_unique" UNIQUE("pet_id"),
	CONSTRAINT "pet_service_dog_service_type_valid" CHECK ("pet_service_dog"."service_type" in ('guia','asistencia_motriz','alerta_medica','senal_auditiva','asistencia_tea','otro')),
	CONSTRAINT "pet_service_dog_status_valid" CHECK ("pet_service_dog"."credential_status" in ('en_entrenamiento','pendiente_verificacion','vigente','vencida','revocada')),
	CONSTRAINT "pet_service_dog_visibility_valid" CHECK ("pet_service_dog"."public_visibility" in ('full_banner','private_only')),
	CONSTRAINT "pet_service_dog_vigente_requires_verification" CHECK ("pet_service_dog"."credential_status" != 'vigente' or ("pet_service_dog"."verified_at" is not null and "pet_service_dog"."verified_by_user_id" is not null)),
	CONSTRAINT "pet_service_dog_revoked_requires_motivo" CHECK ("pet_service_dog"."credential_status" != 'revocada' or ("pet_service_dog"."revoked_at" is not null and "pet_service_dog"."revoked_by_user_id" is not null and "pet_service_dog"."revocation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pet_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"pet_id" uuid NOT NULL,
	"from_owner_id" uuid NOT NULL,
	"to_owner_id" uuid,
	"to_owner_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"note" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"rejection_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_transfers_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "pet_transfers_status_valid" CHECK ("pet_transfers"."status" in ('pending','accepted','rejected','expired','cancelled')),
	CONSTRAINT "pet_transfers_reason_valid" CHECK ("pet_transfers"."reason" is null or "pet_transfers"."reason" in ('sale','gift','inheritance','other')),
	CONSTRAINT "pet_transfers_expiry_after_init" CHECK ("pet_transfers"."expires_at" > "pet_transfers"."initiated_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"species" text NOT NULL,
	"breed" text,
	"name" text NOT NULL,
	"sex" "pet_sex" DEFAULT 'unknown' NOT NULL,
	"date_of_birth" date,
	"birth_date_is_estimated" boolean DEFAULT false NOT NULL,
	"color" text,
	"distinguishing_features" text,
	"microchip_id" text,
	"microchip_country_code" text,
	"microchip_implanted_at" date,
	"microchip_implanted_by" text,
	"microchip_location" text,
	"tattoo_code" text,
	"tattoo_location" text,
	"tattoo_description" text,
	"tattoo_recorded_at" date,
	"tattoo_recorded_by" text,
	"tattoo_photo_id" uuid,
	"primary_photo_id" uuid,
	"status" "pet_status" DEFAULT 'active' NOT NULL,
	"deceased_at" timestamp with time zone,
	"estimated_weight_kg" numeric(5, 2),
	"favourite_foods" text[],
	"known_allergies" text[],
	"training_level" "training_level",
	"potentially_dangerous_breed" boolean DEFAULT false NOT NULL,
	"insurance_company" text,
	"insurance_policy_number" text,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"acquisition_method" "pet_acquisition_method",
	"emergency_info_visible" boolean DEFAULT false NOT NULL,
	"disclose_first_name_when_lost" boolean DEFAULT true NOT NULL,
	"disclose_phone_when_lost" boolean DEFAULT true NOT NULL,
	"disclose_email_when_lost" boolean DEFAULT false NOT NULL,
	"disclose_last_location_when_lost" boolean DEFAULT true NOT NULL,
	"allow_finder_form_when_lost" boolean DEFAULT true NOT NULL,
	"tier2_public_enabled_until" timestamp with time zone,
	"in_custody_dispute" boolean DEFAULT false NOT NULL,
	"rabies_observation_status" text,
	"pregnancy_status" text,
	"adoption_eligible" boolean,
	"adoption_ineligible_reason" text,
	"adoption_ineligible_reason_notes" text,
	"adoption_ineligible_until" timestamp with time zone,
	"adoption_eligibility_set_at" timestamp with time zone,
	"adoption_eligibility_set_by_user_id" uuid,
	"adoption_listed_at" timestamp with time zone,
	"adoption_listing_paused_at" timestamp with time zone,
	"adoption_story" text,
	"adoption_requirements" text,
	"adoption_energy_level" text,
	"adoption_size_estimate" text,
	"adoption_age_bucket" text,
	"adoption_good_with_kids" boolean,
	"adoption_good_with_dogs" boolean,
	"adoption_good_with_cats" boolean,
	"adoption_needs_yard" boolean,
	"adoption_fee_ars" integer,
	"permanent_conditions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"permanent_conditions_other" text,
	"disclose_conditions_publicly" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"purpose" "data_purpose",
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pets_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "pets_adoption_ineligible_reason_valid" CHECK ("pets"."adoption_ineligible_reason" IS NULL OR "pets"."adoption_ineligible_reason" IN ('medical_treatment','behavioral_evaluation','recovery','quarantine','legal_hold','age','pending_intake_eval','other')),
	CONSTRAINT "pets_adoption_eligibility_consistent" CHECK (("pets"."adoption_eligible" IS NOT NULL AND "pets"."adoption_eligibility_set_at" IS NOT NULL) OR ("pets"."adoption_eligible" IS NULL AND "pets"."adoption_eligibility_set_at" IS NULL)),
	CONSTRAINT "pets_adoption_ineligible_reason_required" CHECK ("pets"."adoption_eligible" IS NULL OR "pets"."adoption_eligible" = true OR ("pets"."adoption_eligible" = false AND "pets"."adoption_ineligible_reason" IS NOT NULL)),
	CONSTRAINT "pets_adoption_ineligible_other_needs_notes" CHECK ("pets"."adoption_ineligible_reason" IS NULL OR "pets"."adoption_ineligible_reason" != 'other' OR ("pets"."adoption_ineligible_reason_notes" IS NOT NULL AND length(trim("pets"."adoption_ineligible_reason_notes")) > 0)),
	CONSTRAINT "pets_rabies_observation_status_valid" CHECK ("pets"."rabies_observation_status" is null or "pets"."rabies_observation_status" in ('in_progress', 'completed_negative', 'completed_positive_rabies', 'completed_dead', 'completed_lost_to_followup')),
	CONSTRAINT "pets_adoption_energy_level_valid" CHECK ("pets"."adoption_energy_level" is null or "pets"."adoption_energy_level" in ('low','medium','high')),
	CONSTRAINT "pets_adoption_size_estimate_valid" CHECK ("pets"."adoption_size_estimate" is null or "pets"."adoption_size_estimate" in ('small','medium','large','xl')),
	CONSTRAINT "pets_adoption_age_bucket_valid" CHECK ("pets"."adoption_age_bucket" is null or "pets"."adoption_age_bucket" in ('puppy','junior','young','adult','senior')),
	CONSTRAINT "pets_adoption_fee_non_negative" CHECK ("pets"."adoption_fee_ars" is null or "pets"."adoption_fee_ars" >= 0),
	CONSTRAINT "pets_conditions_other_consistent" CHECK ("pets"."permanent_conditions_other" is null or 'otra' = any("pets"."permanent_conditions")),
	CONSTRAINT "pets_pregnancy_status_valid" CHECK ("pets"."pregnancy_status" is null or "pets"."pregnancy_status" in ('in_progress', 'completed_live_birth', 'completed_stillbirth', 'completed_miscarriage', 'completed_termination')),
	CONSTRAINT "pets_tattoo_location_valid" CHECK ("pets"."tattoo_location" is null or "pets"."tattoo_location" in ('inner_ear_left','inner_ear_right','inner_thigh','belly','other')),
	CONSTRAINT "pets_jurisdiction_province_canonical" CHECK ("pets"."jurisdiction_province" is null or "pets"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "physical_tag_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"avatar_url" text,
	"dni_number" text,
	"dni_verified" boolean DEFAULT false NOT NULL,
	"matricula_number" text,
	"matricula_jurisdiccion" text,
	"matricula_verified" boolean DEFAULT false NOT NULL,
	"preferred_vet_name" text,
	"preferred_vet_phone" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"account_type" text DEFAULT 'personal' NOT NULL,
	"disclose_name_credential" boolean DEFAULT false NOT NULL,
	"disclose_phone_credential" boolean DEFAULT false NOT NULL,
	"allow_org_contact" boolean DEFAULT true NOT NULL,
	"allow_lost_alerts_in_zone" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"purpose" "data_purpose",
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_account_type_valid" CHECK ("profiles"."account_type" in ('personal', 'institutional')),
	CONSTRAINT "profiles_institutional_no_pii" CHECK ("profiles"."account_type" = 'personal' or ("profiles"."dni_number" is null and "profiles"."matricula_number" is null and "profiles"."matricula_jurisdiccion" is null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref"."identification_kind_norma" (
	"kind" "identification_kind" PRIMARY KEY NOT NULL,
	"norma_origen" text NOT NULL,
	"estandar_tecnico" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref"."jurisdiccion_sanitaria" (
	"code" text PRIMARY KEY NOT NULL,
	"label_es" text NOT NULL,
	"colegio_veterinario" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref"."tipo_evento_sanitario" (
	"code" text PRIMARY KEY NOT NULL,
	"label_es" text NOT NULL,
	"norma_origen" text NOT NULL,
	"requiere_lote" boolean DEFAULT false NOT NULL,
	"requiere_via" boolean DEFAULT false NOT NULL,
	"notificable_eno" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref"."via_aplicacion" (
	"code" text PRIMARY KEY NOT NULL,
	"label_es" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_type" "reminder_type" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_event_id" uuid,
	"completed_at" timestamp with time zone,
	"appointment_id" uuid,
	"snoozed_until" timestamp with time zone,
	"snooze_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"organization_id" uuid,
	"provider_user_id" uuid,
	"jurisdiction_country" text DEFAULT 'AR' NOT NULL,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"service_kind" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 15 NOT NULL,
	"slot_capacity" integer DEFAULT 1 NOT NULL,
	"price_ars" numeric(10, 2),
	"eligibility_species" text[],
	"eligibility_age_min_months" integer,
	"eligibility_age_max_months" integer,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"rejection_reason" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_offerings_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "provider_xor" CHECK (("service_offerings"."organization_id" is not null and "service_offerings"."provider_user_id" is null) or ("service_offerings"."organization_id" is null and "service_offerings"."provider_user_id" is not null)),
	CONSTRAINT "service_status_valid" CHECK ("service_offerings"."status" in ('pending_approval', 'approved', 'rejected', 'paused', 'archived')),
	CONSTRAINT "service_capacity_positive" CHECK ("service_offerings"."slot_capacity" > 0),
	CONSTRAINT "service_duration_positive" CHECK ("service_offerings"."duration_minutes" > 0),
	CONSTRAINT "service_offerings_jurisdiction_province_canonical" CHECK ("service_offerings"."jurisdiction_province" is null or "service_offerings"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_schedule_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_offering_id" uuid NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"start_time_local" time NOT NULL,
	"end_time_local" time NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_time_window_sane" CHECK ("service_schedule_rules"."end_time_local" > "service_schedule_rules"."start_time_local"),
	CONSTRAINT "rule_dates_sane" CHECK ("service_schedule_rules"."effective_until" is null or "service_schedule_rules"."effective_until" >= "service_schedule_rules"."effective_from"),
	CONSTRAINT "rule_days_nonempty" CHECK (array_length("service_schedule_rules"."days_of_week", 1) > 0),
	CONSTRAINT "rule_status_valid" CHECK ("service_schedule_rules"."status" in ('active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"share_token_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewer_ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_offering_id" uuid NOT NULL,
	"rule_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"bookings_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_window_sane" CHECK ("time_slots"."ends_at" > "time_slots"."starts_at"),
	CONSTRAINT "slot_capacity_positive" CHECK ("time_slots"."capacity" > 0),
	CONSTRAINT "slot_bookings_non_negative" CHECK ("time_slots"."bookings_count" >= 0),
	CONSTRAINT "slot_bookings_within_capacity" CHECK ("time_slots"."bookings_count" <= "time_slots"."capacity"),
	CONSTRAINT "slot_status_valid" CHECK ("time_slots"."status" in ('open', 'full', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "welfare_report_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"welfare_report_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "welfare_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_code" text NOT NULL,
	"reporter_user_id" uuid,
	"reporter_organization_id" uuid,
	"reporter_contact_email" text,
	"reporter_contact_phone" text,
	"kind" "welfare_report_kind" NOT NULL,
	"severity" "welfare_report_severity" NOT NULL,
	"description" text NOT NULL,
	"subject_kind" "welfare_report_subject_kind" NOT NULL,
	"subject_pet_id" uuid,
	"subject_description" text,
	"location_address" text,
	"jurisdiction_province" text,
	"jurisdiction_locality" text,
	"location_lat" numeric(10, 7),
	"location_lng" numeric(10, 7),
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "welfare_report_status" DEFAULT 'open' NOT NULL,
	"triaged_at" timestamp with time zone,
	"triaged_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"resolution_notes" text,
	"flagged_at" timestamp with time zone,
	"flag_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"moderation_resolved_at" timestamp with time zone,
	"moderation_resolved_by_user_id" uuid,
	"case_id" uuid,
	"assigned_to_user_id" uuid,
	CONSTRAINT "welfare_reports_jurisdiction_province_canonical" CHECK ("welfare_reports"."jurisdiction_province" is null or "welfare_reports"."jurisdiction_province" in (
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe',
  'Santiago del Estero','Tierra del Fuego','Tucumán'
))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_time_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_offering_id_service_offerings_id_fk" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_attended_by_user_id_profiles_id_fk" FOREIGN KEY ("attended_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_user_id_profiles_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_outcome_event_id_pet_events_id_fk" FOREIGN KEY ("outcome_event_id") REFERENCES "public"."pet_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_applicant_user_id_profiles_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_initiated_by_user_id_profiles_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_target_organization_id_organizations_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_user_id_profiles_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_event_id_pet_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pet_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_audit_log_id_audit_log_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_profiles_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_organization_id_organizations_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_govt_assignment_id_govt_assignments_id_fk" FOREIGN KEY ("target_govt_assignment_id") REFERENCES "public"."govt_assignments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_events" ADD CONSTRAINT "case_events_recorded_by_user_id_profiles_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_primary_pet_id_pets_id_fk" FOREIGN KEY ("primary_pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_applicant_user_id_profiles_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_opened_by_user_id_profiles_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_opened_by_organization_id_organizations_id_fk" FOREIGN KEY ("opened_by_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_receiver_organization_id_organizations_id_fk" FOREIGN KEY ("receiver_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_closed_by_user_id_profiles_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_welfare_report_id_welfare_reports_id_fk" FOREIGN KEY ("welfare_report_id") REFERENCES "public"."welfare_reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_custody_dispute_id_custody_disputes_id_fk" FOREIGN KEY ("custody_dispute_id") REFERENCES "public"."custody_disputes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_dispute_parties" ADD CONSTRAINT "custody_dispute_parties_dispute_id_custody_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."custody_disputes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_dispute_parties" ADD CONSTRAINT "custody_dispute_parties_party_user_id_profiles_id_fk" FOREIGN KEY ("party_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_dispute_parties" ADD CONSTRAINT "custody_dispute_parties_added_by_user_id_profiles_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_dispute_parties" ADD CONSTRAINT "custody_dispute_parties_party_organization_id_organizations_id_" FOREIGN KEY ("party_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_raised_by_user_id_profiles_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_raised_by_org_id_organizations_id_fk" FOREIGN KEY ("raised_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_raising_event_id_pet_events_id_fk" FOREIGN KEY ("raising_event_id") REFERENCES "public"."pet_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_resolution_event_id_pet_events_id_fk" FOREIGN KEY ("resolution_event_id") REFERENCES "public"."pet_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_resolved_by_user_id_profiles_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custody_disputes" ADD CONSTRAINT "custody_disputes_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_notification_outbox" ADD CONSTRAINT "event_notification_outbox_source_event_id_pet_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."pet_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_volunteer_user_id_profiles_id_fk" FOREIGN KEY ("volunteer_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_proposed_by_user_id_profiles_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_cancelled_by_user_id_profiles_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_proposals" ADD CONSTRAINT "foster_proposals_resolved_ownership_id_ownerships_id_fk" FOREIGN KEY ("resolved_ownership_id") REFERENCES "public"."ownerships"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foster_volunteers" ADD CONSTRAINT "foster_volunteers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "govt_assignments" ADD CONSTRAINT "govt_assignments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "govt_assignments" ADD CONSTRAINT "govt_assignments_granted_by_user_id_profiles_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "govt_assignments" ADD CONSTRAINT "govt_assignments_revoked_by_user_id_profiles_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "govt_business_rules" ADD CONSTRAINT "govt_business_rules_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "govt_business_rules" ADD CONSTRAINT "govt_business_rules_updated_by_user_id_profiles_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "libreta_share_tokens" ADD CONSTRAINT "libreta_share_tokens_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "libreta_share_tokens" ADD CONSTRAINT "libreta_share_tokens_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "libreta_share_tokens" ADD CONSTRAINT "libreta_share_tokens_revoked_by_user_id_profiles_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_pet_id_pets_id_fk" FOREIGN KEY ("related_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_event_id_pet_events_id_fk" FOREIGN KEY ("related_event_id") REFERENCES "public"."pet_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_reminder_id_reminders_id_fk" FOREIGN KEY ("related_reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_contact_messages" ADD CONSTRAINT "org_contact_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_capability_grants" ADD CONSTRAINT "organization_capability_grants_membership_id_organization_membe" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_memberships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_capability_grants" ADD CONSTRAINT "organization_capability_grants_organization_id_organizations_id" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_capability_grants" ADD CONSTRAINT "organization_capability_grants_decided_by_user_id_profiles_id_f" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_coverage" ADD CONSTRAINT "organization_coverage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_profiles_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_profiles_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_user_id_profiles_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_verified_by_user_id_profiles_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_achievement_views" ADD CONSTRAINT "pet_achievement_views_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_achievement_views" ADD CONSTRAINT "pet_achievement_views_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_events" ADD CONSTRAINT "pet_events_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_events" ADD CONSTRAINT "pet_events_recorded_by_user_id_profiles_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_events" ADD CONSTRAINT "pet_events_author_organization_id_organizations_id_fk" FOREIGN KEY ("author_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_identifications" ADD CONSTRAINT "pet_identifications_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_identifications" ADD CONSTRAINT "pet_identifications_recorded_by_user_id_profiles_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_identifications" ADD CONSTRAINT "pet_identifications_replaced_by_id_pet_identifications_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."pet_identifications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_identifications" ADD CONSTRAINT "pet_identifications_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_identifications" ADD CONSTRAINT "pet_identifications_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_service_dog" ADD CONSTRAINT "pet_service_dog_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_service_dog" ADD CONSTRAINT "pet_service_dog_verified_by_user_id_profiles_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_service_dog" ADD CONSTRAINT "pet_service_dog_revoked_by_user_id_profiles_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_transfers" ADD CONSTRAINT "pet_transfers_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_transfers" ADD CONSTRAINT "pet_transfers_from_owner_id_profiles_id_fk" FOREIGN KEY ("from_owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pet_transfers" ADD CONSTRAINT "pet_transfers_to_owner_id_profiles_id_fk" FOREIGN KEY ("to_owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pets" ADD CONSTRAINT "pets_adoption_eligibility_set_by_user_id_profiles_id_fk" FOREIGN KEY ("adoption_eligibility_set_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pets" ADD CONSTRAINT "pets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pets" ADD CONSTRAINT "pets_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_tag_interest" ADD CONSTRAINT "physical_tag_interest_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_tag_interest" ADD CONSTRAINT "physical_tag_interest_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_source_event_id_pet_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."pet_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_provider_user_id_profiles_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_reviewed_by_user_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_schedule_rules" ADD CONSTRAINT "service_schedule_rules_service_offering_id_service_offerings_id" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_telemetry" ADD CONSTRAINT "share_telemetry_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_telemetry" ADD CONSTRAINT "share_telemetry_share_token_id_libreta_share_tokens_id_fk" FOREIGN KEY ("share_token_id") REFERENCES "public"."libreta_share_tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_service_offering_id_service_offerings_id_fk" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_rule_id_service_schedule_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."service_schedule_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_report_attachments" ADD CONSTRAINT "welfare_report_attachments_uploaded_by_user_id_profiles_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_report_attachments" ADD CONSTRAINT "welfare_report_attachments_welfare_report_id_welfare_reports_id" FOREIGN KEY ("welfare_report_id") REFERENCES "public"."welfare_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_reporter_user_id_profiles_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_reporter_organization_id_organizations_id_fk" FOREIGN KEY ("reporter_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_subject_pet_id_pets_id_fk" FOREIGN KEY ("subject_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_triaged_by_user_id_profiles_id_fk" FOREIGN KEY ("triaged_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_moderation_resolved_by_user_id_profiles_id_fk" FOREIGN KEY ("moderation_resolved_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "welfare_reports" ADD CONSTRAINT "welfare_reports_assigned_to_user_id_profiles_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_pet_idx" ON "appointments" USING btree ("pet_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_owner_idx" ON "appointments" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_org_idx" ON "appointments" USING btree ("organization_id","status") WHERE "appointments"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_slot_idx" ON "appointments" USING btree ("slot_id") WHERE "appointments"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_status_idx" ON "approval_requests" USING btree ("status","created_at") WHERE "approval_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_applicant_idx" ON "approval_requests" USING btree ("applicant_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_juris_idx" ON "approval_requests" USING btree ("jurisdiction_province","jurisdiction_locality") WHERE "approval_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_type_idx" ON "approval_requests" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_initiated_by_idx" ON "approval_requests" USING btree ("initiated_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_decided_by_idx" ON "approval_requests" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ar_localities_province_slug_idx" ON "ar_localities" USING btree ("province_code","locality_slug") WHERE "ar_localities"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ar_localities_province_idx" ON "ar_localities" USING btree ("province_code") WHERE "ar_localities"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ar_localities_import_runs_idx" ON "ar_localities_import_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_pet_id_idx" ON "attachments" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_event_id_idx" ON "attachments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","performed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_request_idx" ON "audit_log" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_user_idx" ON "audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_organization_idx" ON "audit_log" USING btree ("target_organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action","performed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_events_case_id_occurred_idx" ON "case_events" USING btree ("case_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cases_public_code_unique" ON "cases" USING btree ("public_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_open_by_jurisdiction_kind_idx" ON "cases" USING btree ("jurisdiction_locality","case_kind") WHERE "cases"."status" IN ('open', 'escalated');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cases_open_per_pet_kind_idx" ON "cases" USING btree ("primary_pet_id","case_kind") WHERE "cases"."status" IN ('open', 'escalated') AND "cases"."case_kind" NOT IN ('adoption_application', 'adoption_listing', 'welfare_denuncia', 'foster_placement');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cases_open_adoption_app_per_applicant_idx" ON "cases" USING btree ("primary_pet_id","applicant_user_id") WHERE "cases"."status" IN ('open', 'escalated') AND "cases"."case_kind" = 'adoption_application';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_open_by_owner_pet_idx" ON "cases" USING btree ("primary_pet_id") WHERE "cases"."status" IN ('open', 'escalated');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cases_receiver_org_open_idx" ON "cases" USING btree ("receiver_organization_id","case_kind") WHERE "cases"."status" IN ('open', 'escalated') AND "cases"."receiver_organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_runs_name_started_idx" ON "cron_runs" USING btree ("cron_name","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_custody_disputes_deleted_idx" ON "custody_disputes" USING btree ("deleted_at") WHERE "custody_disputes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eno_processing_queue_status_idx" ON "eno_processing_queue" USING btree ("status","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eno_processing_queue_event_id_unique" ON "eno_processing_queue" USING btree ("pet_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_drainable_idx" ON "event_notification_outbox" USING btree ("next_retry_at") WHERE "event_notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_sla_due_idx" ON "event_notification_outbox" USING btree ("sla_due_at","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_source_event_idx" ON "event_notification_outbox" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_volunteer_idx" ON "foster_proposals" USING btree ("volunteer_user_id","status","proposed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_org_idx" ON "foster_proposals" USING btree ("organization_id","status","proposed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_pet_idx" ON "foster_proposals" USING btree ("pet_id") WHERE "foster_proposals"."status" IN ('pending','accepted');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_status_idx" ON "foster_proposals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_proposed_by_idx" ON "foster_proposals" USING btree ("proposed_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_cancelled_by_idx" ON "foster_proposals" USING btree ("cancelled_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_proposals_resolved_ownership_idx" ON "foster_proposals" USING btree ("resolved_ownership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_volunteers_pool_idx" ON "foster_volunteers" USING btree ("status") WHERE "foster_volunteers"."status" = 'active' AND "foster_volunteers"."available_slots" > 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foster_volunteers_locality_idx" ON "foster_volunteers" USING btree ("jurisdiction_province","jurisdiction_locality") WHERE "foster_volunteers"."status" = 'active' AND "foster_volunteers"."available_slots" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "govt_assignments_active_unique" ON "govt_assignments" USING btree ("user_id","jurisdiction_province","jurisdiction_locality") WHERE "govt_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "govt_assignments_user_active_idx" ON "govt_assignments" USING btree ("user_id") WHERE "govt_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "govt_assignments_locality_idx" ON "govt_assignments" USING btree ("jurisdiction_province","jurisdiction_locality") WHERE "govt_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "govt_business_rules_rule_type_idx" ON "govt_business_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "libreta_share_tokens_pet_idx" ON "libreta_share_tokens" USING btree ("pet_id") WHERE "libreta_share_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "libreta_share_tokens_token_idx" ON "libreta_share_tokens" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL AND "notifications"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_category_idx" ON "notifications" USING btree ("user_id","category") WHERE "notifications"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_reminder_recent_idx" ON "notifications" USING btree ("related_reminder_id","created_at") WHERE "notifications"."related_reminder_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_contact_messages_org_idx" ON "org_contact_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_contact_messages_created_at_idx" ON "org_contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_capability_grants_membership_capability_idx" ON "organization_capability_grants" USING btree ("membership_id","capability");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_capability_grants_org_pending_idx" ON "organization_capability_grants" USING btree ("organization_id") WHERE "organization_capability_grants"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_capability_grants_one_open_per_capability" ON "organization_capability_grants" USING btree ("membership_id","capability") WHERE "organization_capability_grants"."status" IN ('pending', 'approved');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_coverage_org_id_idx" ON "organization_coverage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_coverage_jurisdiction_idx" ON "organization_coverage" USING btree ("jurisdiction_province","jurisdiction_locality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invitations_org_id_idx" ON "organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invitations_token_idx" ON "organization_invitations" USING btree ("invitation_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invitations_email_idx" ON "organization_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_invitations_active_unique" ON "organization_invitations" USING btree ("organization_id",lower("email")) WHERE "organization_invitations"."accepted_at" IS NULL AND "organization_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_memberships_org_id_idx" ON "organization_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_memberships_user_id_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_memberships_active_idx" ON "organization_memberships" USING btree ("organization_id","user_id") WHERE "organization_memberships"."left_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_active_unique" ON "organization_memberships" USING btree ("organization_id","user_id") WHERE "organization_memberships"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_org_type_idx" ON "organizations" USING btree ("org_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_verified_idx" ON "organizations" USING btree ("verified");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ownerships_one_active_owner_per_pet" ON "ownerships" USING btree ("pet_id") WHERE "ownerships"."role" = 'owner' AND "ownerships"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ownerships_owner_user_id_idx" ON "ownerships" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ownerships_owner_organization_id_idx" ON "ownerships" USING btree ("owner_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pet_achievement_views_owner_pet_ach_unique" ON "pet_achievement_views" USING btree ("user_id","pet_id","achievement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_achievement_views_user_pet_idx" ON "pet_achievement_views" USING btree ("user_id","pet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_events_pet_id_occurred_at_idx" ON "pet_events" USING btree ("pet_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_events_event_type_idx" ON "pet_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_events_author_role_idx" ON "pet_events" USING btree ("author_role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_events_location_idx" ON "pet_events" USING btree ("location_lat","location_lng");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pet_events_idempotency_idx" ON "pet_events" USING btree ("pet_id","event_type","client_idempotency_key") WHERE client_idempotency_key is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_events_tipo_evento_code_idx" ON "pet_events" USING btree ("tipo_evento_code") WHERE "pet_events"."tipo_evento_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_identifications_pet_idx" ON "pet_identifications" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_identifications_code_idx" ON "pet_identifications" USING btree ("kind","code") WHERE "pet_identifications"."code" IS NOT NULL AND "pet_identifications"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pet_identifications_chip_unique" ON "pet_identifications" USING btree ("code") WHERE "pet_identifications"."kind" = 'microchip_iso' AND "pet_identifications"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_pet_identifications_deleted_idx" ON "pet_identifications" USING btree ("deleted_at") WHERE "pet_identifications"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pet_transfers_one_pending_per_pet" ON "pet_transfers" USING btree ("pet_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_transfers_from_owner_idx" ON "pet_transfers" USING btree ("from_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_transfers_to_owner_idx" ON "pet_transfers" USING btree ("to_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_transfers_to_email_idx" ON "pet_transfers" USING btree ("to_owner_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pet_transfers_status_idx" ON "pet_transfers" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pets_microchip_unique_when_present" ON "pets" USING btree ("microchip_id") WHERE "pets"."microchip_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pets_jurisdiction_idx" ON "pets" USING btree ("jurisdiction_province","jurisdiction_locality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pets_status_idx" ON "pets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_pets_deleted_idx" ON "pets" USING btree ("deleted_at") WHERE "pets"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pets_adoption_listing_active_idx" ON "pets" USING btree ("adoption_listed_at","id") WHERE "pets"."adoption_listed_at" IS NOT NULL AND "pets"."adoption_listing_paused_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pets_adoption_eligibility_set_by_idx" ON "pets" USING btree ("adoption_eligibility_set_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pets_tattoo_code_idx" ON "pets" USING btree ("tattoo_code") WHERE "pets"."tattoo_code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "physical_tag_interest_pet_user_unique" ON "physical_tag_interest" USING btree ("pet_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_tag_interest_pet_active_idx" ON "physical_tag_interest" USING btree ("pet_id") WHERE "physical_tag_interest"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_tag_interest_active_created_idx" ON "physical_tag_interest" USING btree ("created_at") WHERE "physical_tag_interest"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_dni_unique_when_present" ON "profiles" USING btree ("dni_number") WHERE "profiles"."dni_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_matricula_unique_when_present" ON "profiles" USING btree ("matricula_number") WHERE "profiles"."matricula_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_institutional_active_idx" ON "profiles" USING btree ("role") WHERE "profiles"."account_type" = 'institutional' AND "profiles"."deactivated_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_profiles_deleted_idx" ON "profiles" USING btree ("deleted_at") WHERE "profiles"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_user_due_at_idx" ON "reminders" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_pet_due_at_idx" ON "reminders" USING btree ("pet_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_appointment_idx" ON "reminders" USING btree ("appointment_id") WHERE "reminders"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_offerings_org_idx" ON "service_offerings" USING btree ("organization_id") WHERE "service_offerings"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_offerings_provider_idx" ON "service_offerings" USING btree ("provider_user_id") WHERE "service_offerings"."provider_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_offerings_pending_idx" ON "service_offerings" USING btree ("status","submitted_at") WHERE "service_offerings"."status" = 'pending_approval';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_offerings_active_search_idx" ON "service_offerings" USING btree ("service_kind","status") WHERE "service_offerings"."status" = 'approved';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_offerings_jurisdiction_idx" ON "service_offerings" USING btree ("jurisdiction_country","jurisdiction_province","jurisdiction_locality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_rules_offering_active_idx" ON "service_schedule_rules" USING btree ("service_offering_id") WHERE "service_schedule_rules"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_telemetry_pet_idx" ON "share_telemetry" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_telemetry_token_viewed_idx" ON "share_telemetry" USING btree ("share_token_id","viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_slots_unique_starts" ON "time_slots" USING btree ("service_offering_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_slots_offering_window_idx" ON "time_slots" USING btree ("service_offering_id","starts_at") WHERE "time_slots"."status" = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_slots_search_idx" ON "time_slots" USING btree ("service_offering_id","starts_at") WHERE "time_slots"."status" IN ('open', 'full');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_report_attachments_report_idx" ON "welfare_report_attachments" USING btree ("welfare_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "welfare_reports_reference_code_unique" ON "welfare_reports" USING btree ("reference_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_reporter_idx" ON "welfare_reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_status_idx" ON "welfare_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_subject_pet_idx" ON "welfare_reports" USING btree ("subject_pet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_jurisdiction_idx" ON "welfare_reports" USING btree ("jurisdiction_province","jurisdiction_locality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_location_idx" ON "welfare_reports" USING btree ("location_lat","location_lng");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "welfare_reports_assigned_to_idx" ON "welfare_reports" USING btree ("assigned_to_user_id");