-- PII baseline (compliance handoff PR 1, Ley 25.326).
--
-- Three structural changes to lock in before pilot:
--   1. data_purpose enum — base legal del tratamiento (Ley 25.326 art. 4°).
--   2. Schema `pii` separado — defense in depth para revocaciones futuras.
--   3. pii.apply_baseline(tbl) — añade `created_by/updated_by/purpose/
--      deleted_at/retention_until` a cualquier tabla con PII.
--
-- Aplicado a 4 tablas core en este sprint: profiles, pets,
-- pet_identifications, custody_disputes. pet_events queda afuera porque
-- ya es append-only via trigger (soft-delete no aplica semánticamente).
-- Tablas adicionales se suman en migraciones siguientes a medida que
-- referencien PII directamente.
--
-- Aditivo y reversible per-column (todas las columnas son nullable).
-- Sin RLS en este PR — defense in depth se agrega cuando el wrapper de
-- audit en lib/audit/log.ts esté listo, sprint siguiente.

BEGIN;

CREATE TYPE data_purpose AS ENUM (
  'identidad_mascota',          -- registro y credencial DIM
  'salud_animal',               -- libreta sanitaria, eventos clínicos
  'notificacion_zoonosis',      -- ENO Ley 15.465, rabia Res. MS 1144/2018
  'reunificacion_perdida',      -- L&F, Art. 1947 CCyCN
  'control_poblacional',        -- castración Ley CABA 1.338, PBA 13.879
  'razas_peligrosas',           -- Registros Ley CABA 4.078 / PBA 14.107
  'auditoria_legal',            -- conservación obligatoria por norma
  'consentimiento_marketing'    -- comunicaciones opcionales
);

CREATE SCHEMA IF NOT EXISTS pii;

-- Helper: aplica el baseline a una tabla regclass.
-- Idempotente — ADD COLUMN IF NOT EXISTS para que migraciones re-aplicadas
-- no exploten.
CREATE OR REPLACE FUNCTION pii.apply_baseline(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $func$
DECLARE
  tname text;
BEGIN
  tname := tbl::text;
  EXECUTE format($f$
    ALTER TABLE %s
      ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS purpose         data_purpose,
      ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
      ADD COLUMN IF NOT EXISTS retention_until timestamptz
  $f$, tname);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %s(deleted_at) WHERE deleted_at IS NOT NULL',
    replace(tname, '.', '_') || '_deleted_idx',
    tname
  );
END
$func$;

-- Aplicado a tablas con PII conocidas.
SELECT pii.apply_baseline('public.profiles');
SELECT pii.apply_baseline('public.pets');
SELECT pii.apply_baseline('public.pet_identifications');
SELECT pii.apply_baseline('public.custody_disputes');

COMMENT ON TYPE data_purpose IS
  'Base legal del tratamiento (Ley 25.326 art. 4°). Usado en la columna `purpose` agregada por pii.apply_baseline().';

COMMENT ON SCHEMA pii IS
  'Helpers de privacidad: pii.apply_baseline(tbl) suma columnas estándar (created_by/updated_by/purpose/deleted_at/retention_until) a tablas con PII. Compliance handoff PR 1.';

COMMIT;
