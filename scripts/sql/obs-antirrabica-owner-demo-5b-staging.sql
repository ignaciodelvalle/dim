-- Beat 5b (demo) — pone UNA mascota de owner@dim.test en observación antirrábica
-- ABIERTA, para que el PO pueda registrar el fallecimiento en vivo y disparar el
-- aviso rabia-consciente + la cascada (cerrar observación, cerrar caso, notificar).
--
-- STAGING ONLY. Aplicar a la DB remota es tarea de Ignacio (necesita el .env de
-- staging). Correr como UNA transacción; el SELECT final imprime la mascota elegida.
--
-- Qué dispara el beat (validado en código 2026-08-02):
--   DeathRecordForm: showRabiesDisposalWarning = inRabiesObservation && disposición-no-recomendada
--   inRabiesObservation = pets.rabies_observation_status === 'in_progress'
-- Por eso este script setea ese cache + escribe la observación completa (evento +
-- caso abierto) para que /admin/observaciones y la cascada sean coherentes.
--
-- Elección de mascota: la PRIMERA (alfabética) mascota ACTIVA, especie perro, de
-- owner@, que NO esté ya en observación, NO bajo custodia, y sin caso de mordedura
-- abierto. Excluye a Pampa (insignia) y a Rocco/DIM-DEMO-0001 (bajo custodia).
--
-- Ventana: mordedura hace 2 días → observación vence en 8 (ABIERTA, mid-window),
-- así el fallecimiento ocurre DENTRO de la observación.
--
-- Idempotente: si owner@ ya tiene una mascota en observación por este script
-- (source='demo-5b'), no hace nada nuevo.

BEGIN;

WITH owner_user AS (
  SELECT id FROM auth.users WHERE email = 'owner@dim.test'
),
already AS (  -- ¿ya corrimos este beat?
  SELECT 1
  FROM pet_events e
  WHERE e.event_type = 'rabies_observation_started'
    AND e.payload->>'source' = 'demo-5b'
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
    -- no bajo custodia (sin ownership shelter_custody activa)
    AND NOT EXISTS (
      SELECT 1 FROM ownerships oc
      WHERE oc.pet_id = p.id AND oc.role = 'shelter_custody' AND oc.ended_at IS NULL
    )
    -- sin caso de mordedura abierto
    AND NOT EXISTS (
      SELECT 1 FROM cases c
      WHERE c.primary_pet_id = p.id AND c.case_kind = 'bite_incident' AND c.status = 'open'
    )
    -- solo si el beat no fue sembrado ya
    AND NOT EXISTS (SELECT 1 FROM already)
  ORDER BY p.name
  LIMIT 1
),
bite AS (  -- 1) la mordedura reportada (hace 2 días)
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
caso AS (  -- 2) el expediente de mordedura ABIERTO
  INSERT INTO cases
    (public_code, case_kind, status, primary_subject_kind, primary_pet_id,
     jurisdiction_province, jurisdiction_locality, locality_id, opened_at, opened_reason)
  SELECT 'DEMO-BITE-5B-01', 'bite_incident', 'open', 'registered_pet', c.id,
         c.prov, c.loc, c.locality_id, now() - interval '2 days',
         'Mordedura reportada — observación antirrábica de 10 días en curso'
  FROM chosen c
  RETURNING id, primary_pet_id, opened_at
),
obs AS (  -- 3) la observación antirrábica INICIADA (vence en 8 días)
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
-- 4) el cache que /adoptar, la libreta y el form de muerte leen
UPDATE pets
SET rabies_observation_status = 'in_progress', updated_at = now()
WHERE id IN (SELECT pet_id FROM obs);

-- Mostrá la mascota elegida (para el PO). Si no imprime filas, el beat ya estaba
-- sembrado o no había mascota elegible — revisá antes de la demo.
SELECT p.public_token, p.name, p.jurisdiction_locality, p.rabies_observation_status
FROM pets p
JOIN pet_events e ON e.pet_id = p.id
WHERE e.event_type = 'rabies_observation_started' AND e.payload->>'source' = 'demo-5b';

COMMIT;

-- ===========================================================================
-- REVERTIR (si querés limpiar después de la demo) — correr como transacción:
-- ===========================================================================
-- BEGIN;
-- UPDATE pets SET rabies_observation_status = NULL, updated_at = now()
--   WHERE id IN (SELECT primary_pet_id FROM cases WHERE public_code = 'DEMO-BITE-5B-01');
-- DELETE FROM pet_events WHERE payload->>'source' = 'demo-5b';
-- DELETE FROM cases WHERE public_code = 'DEMO-BITE-5B-01';
-- COMMIT;
