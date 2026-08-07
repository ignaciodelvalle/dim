-- PREP DE STAGING PARA LA DEMO — correr UNA vez, poco antes de presentar.
--
-- STAGING ONLY. Aplicar a la DB remota es tarea de Ignacio (SQL Editor de
-- Supabase del proyecto de staging, o psql con el DATABASE_URL de staging).
-- Son DOS transacciones independientes; corré cada una y mirá su SELECT final.
--
-- Qué deja listo:
--   PARTE 1 — resetea la alerta de esterilización de CABA a 'disparada'
--             (hoy quedó 'Reconocida'), para el beat en vivo "Reconocer → la fila cambia".
--   PARTE 2 — pone UNA mascota de owner@ en observación antirrábica ABIERTA,
--             para el beat 5b (registrar fallecimiento → aviso rabia + cascada).
--
-- Ambas son idempotentes y traen su bloque de REVERTIR al final.

-- ===========================================================================
-- PARTE 1 — reset de la alerta a 'disparada'
-- ===========================================================================
BEGIN;

UPDATE alert_firings
SET status = 'disparada',
    acknowledged_at = NULL, acknowledged_by = NULL,
    investigation_code = NULL,
    contacted_govt_user_id = NULL, contacted_at = NULL,
    resolved_at = NULL, resolved_by = NULL
WHERE metric_key = 'sterilization_coverage_pct'
  AND observed_value = 38 AND threshold = 70
  AND status <> 'disparada';

-- Confirmá: debe quedar 'disparada'. fired_at NO se toca (mantiene el SLA vencido).
SELECT id, metric_key, jurisdiction_province, jurisdiction_locality,
       observed_value, threshold, status, fired_at
FROM alert_firings
WHERE metric_key = 'sterilization_coverage_pct' AND observed_value = 38 AND threshold = 70;

COMMIT;

-- ===========================================================================
-- PARTE 2 — mascota de owner@ en observación antirrábica ABIERTA (beat 5b)
-- ===========================================================================
-- Elige la PRIMERA (alfabética) mascota ACTIVA, especie perro, de owner@, que no
-- esté ya en observación, no bajo custodia, sin caso de mordedura abierto.
-- Excluye a Pampa (insignia) y a Rocco/DIM-DEMO-0001 (bajo custodia).
-- Ventana: mordedura hace 2 días → observación vence en 8 (ABIERTA, mid-window).
-- Dispara showRabiesDisposalWarning: pets.rabies_observation_status='in_progress'.
BEGIN;

WITH owner_user AS (
  SELECT id FROM auth.users WHERE email = 'owner@dim.test'
),
already AS (
  SELECT 1 FROM pet_events e
  WHERE e.event_type = 'rabies_observation_started' AND e.payload->>'source' = 'demo-5b'
),
chosen AS (
  SELECT p.id, p.public_token, p.name, p.jurisdiction_province AS prov,
         p.jurisdiction_locality AS loc, p.locality_id
  FROM pets p
  JOIN ownerships o
    ON o.pet_id = p.id AND o.role = 'owner' AND o.ended_at IS NULL
  WHERE o.owner_user_id = (SELECT id FROM owner_user)
    AND p.status = 'active'
    AND p.species = 'dog'
    AND p.deleted_at IS NULL
    AND (p.rabies_observation_status IS DISTINCT FROM 'in_progress')
    AND p.public_token NOT IN ('DIM-PAMP-0001', 'DIM-DEMO-0001')
    AND NOT EXISTS (
      SELECT 1 FROM ownerships oc
      WHERE oc.pet_id = p.id AND oc.role = 'shelter_custody' AND oc.ended_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM cases c
      WHERE c.primary_pet_id = p.id AND c.case_kind = 'bite_incident' AND c.status = 'open'
    )
    AND NOT EXISTS (SELECT 1 FROM already)
  ORDER BY p.name
  LIMIT 1
),
bite AS (
  INSERT INTO pet_events
    (pet_id, event_type, occurred_at, recorded_at, author_role, author_verified, payload)
  SELECT id, 'incident_reported',
         now() - interval '2 days', now() - interval '2 days',
         'owner'::author_role, false,
         jsonb_build_object('incident_type', 'bite_inflicted',
                            'payload_version', 1, 'source', 'demo-5b')
  FROM chosen
  RETURNING pet_id
),
caso AS (
  INSERT INTO cases
    (public_code, case_kind, status, primary_subject_kind, primary_pet_id,
     jurisdiction_province, jurisdiction_locality, locality_id, opened_at, opened_reason)
  SELECT 'DEMO-BITE-5B-01', 'bite_incident', 'open', 'registered_pet', c.id,
         c.prov, c.loc, c.locality_id, now() - interval '2 days',
         'Mordedura reportada — observación antirrábica de 10 días en curso'
  FROM chosen c
  RETURNING id, primary_pet_id, opened_at
),
obs AS (
  INSERT INTO pet_events
    (pet_id, event_type, occurred_at, recorded_at, author_role, author_verified, payload, case_id)
  SELECT primary_pet_id, 'rabies_observation_started', opened_at, opened_at,
         'system'::author_role, true,
         jsonb_build_object('payload_version', 1, 'source', 'demo-5b',
                            'observation_until',
                            to_char(opened_at + interval '10 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         id
  FROM caso
  RETURNING pet_id
)
UPDATE pets
SET rabies_observation_status = 'in_progress', updated_at = now()
WHERE id IN (SELECT pet_id FROM obs);

-- Este SELECT te dice qué mascota quedó en observación (el token para el beat 5b).
-- Si no imprime filas: el beat ya estaba sembrado o no había mascota elegible.
SELECT p.public_token, p.name, p.jurisdiction_locality, p.rabies_observation_status
FROM pets p
JOIN pet_events e ON e.pet_id = p.id
WHERE e.event_type = 'rabies_observation_started' AND e.payload->>'source' = 'demo-5b';

COMMIT;

-- ===========================================================================
-- REVERTIR DESPUÉS DE LA DEMO (opcional) — cada bloque como transacción
-- ===========================================================================
-- -- Parte 2:
-- BEGIN;
-- UPDATE pets SET rabies_observation_status = NULL, updated_at = now()
--   WHERE id IN (SELECT primary_pet_id FROM cases WHERE public_code = 'DEMO-BITE-5B-01');
-- DELETE FROM pet_events WHERE payload->>'source' = 'demo-5b';
-- DELETE FROM cases WHERE public_code = 'DEMO-BITE-5B-01';
-- COMMIT;
-- -- Parte 1: no requiere revertir (resolvés la alerta en el propio cierre de la demo).
