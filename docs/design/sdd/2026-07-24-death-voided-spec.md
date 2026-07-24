# Spec — `death_voided`: reversión de una muerte mal registrada

**Origen**: cursor Disputes review D1 (CONFIRMADO). Decisión PO 2026-07-24: spec ahora,
implementación en la Ola integridad ES.

## Problema

Una muerte mal registrada NO tiene salida de producto. Hoy:
- `death_recorded` NO está en `AMENDABLE_EVENT_TYPES` (`lib/infra/amendment.ts:23,28-41`,
  documentado "has no reversal path; forensic").
- No existe ningún `death_voided` / evento inverso (grep: 0 hits).
- Peor: tras la muerte, `requireAlivePetAccess` (`lib/infra/pet-access.ts:262-272`) devuelve
  forbidden porque `status==='deceased'` — así que el dueño **no puede enmendar NINGÚN evento**
  de la mascota, no solo la muerte.
- Única salida actual: cirugía psql con el GUC `app.allow_event_mutation` + reparación manual
  de cache. Inaceptable para un registro nacional.

## Diseño propuesto

### Evento nuevo: `death_voided`
Evento COMPENSATORIO append-only (no muta `death_recorded`, lo anula por proyección — coherente
con la doctrina de eventos compensatorios que el propio review D valida).

Payload (Zod `.strict()`, `payload_version: 1`):
```
{
  target_event_id: uuid,        // el death_recorded que se anula
  reason: string (min 10),      // motivo obligatorio
  voided_by_role: "admin" | "govt",
  confirmed_by_user_id: uuid,   // el SEGUNDO par de ojos (ver control dual)
}
```

### Control dual (four-eyes)
Una muerte es un hecho de alto impacto legal. La anulación requiere DOS funcionarios distintos:
1. Funcionario A abre la anulación (`death_void_proposed`, estado pendiente).
2. Funcionario B (≠ A) confirma → se emite `death_voided` + se re-deriva el estado.

(Nota: esto es MÁS estricto que lo que el PO eligió para disputas D4 — ahí quedó solo audit
trail. La muerte lo amerita porque revierte un estado terminal; si el PO prefiere alinear con
D4 y dejarlo single-actor con audit fuerte, es un ajuste de una línea en el guard.)

### Re-derivación de estado
Al emitir `death_voided`, re-derivar desde el stream (reusar el patrón de
`refreshPetCacheAfterAmendment`):
- `pets.status`: de `deceased` al estado que corresponda por el último evento no-muerte
  (probablemente `active`).
- `pets.deceasedAt` → null.
- Reabrir lo que la muerte cerró en cascada: `foster_ended`, casos cerrados por la muerte,
  `rabies_observation` marcada `completed_dead`. CADA cascada necesita su propio inverso —
  esto es el grueso del trabajo y merece un test por cascada.

### Autorización
Nuevo shim admin/gob-gated (NO `requireAlivePetAccess`, que rechaza deceased): usar
`requireAdminOrGovtOrRedirect` + scope jurisdiccional. Reusa la superficie D3 (corrección gob)
que hoy existe en el writer pero no está ruteada — se cablea junto.

### Notificación + auditoría
- `audit_log`: `death_voided` con ambos user_ids (proponente + confirmador).
- Notificación al dueño (outbox transaccional): "Se revirtió el registro de fallecimiento de {pet}".

## Fuera de alcance
- `death_recorded` SIGUE fuera del allowlist de amend (se anula por evento inverso, no se edita).
- El GUC de mutación queda como escape de infra, nunca en UI.

## Superficie de tests
- Re-derivación por cada cascada (foster, casos, observación rábica).
- Four-eyes: A no puede confirmar su propia propuesta.
- El dueño recupera acceso de amend tras la anulación.
- Idempotencia: doble `death_voided` sobre el mismo target es no-op.

## Migración
Nuevo tipo de evento en el enum + schema Zod. Forward-only. Recontar el entero al escribir.
