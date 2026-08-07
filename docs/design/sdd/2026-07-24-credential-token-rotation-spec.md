# Spec — rotación de credencial (chapita robada/perdida)

**Origen**: cursor QR review V3 (CONFIRMADO). Decisión PO 2026-07-24: **fase 3**
(documentar ahora, implementar más adelante). Mitigación actual: rate-limit en `/p`.

## Problema

No hay rotación ni revocación de `public_token`. Una chapita perdida/robada resuelve la
página de identidad de la mascota para siempre (`db/schema.ts:535` — asignado al crear, nunca
reescrito). El token es a la vez:
- la **identidad interna** (usado como clave tipo-FK en decenas de rutas), y
- el **payload del QR físico** (`credentialQrUrl` = `https://…/p/<token>`).

Rotar uno rota ambos → romper todas las rutas que lo referencian. Por eso no es un fix chico.

## Diseño propuesto (para cuando se implemente)

### Separar identidad de credencial
- `public_token` (existente): queda como **identidad interna estable**. NO cambia nunca. Sigue
  siendo la clave que usan las rutas internas, FKs lógicas, etc.
- `credential_token` (NUEVO, nullable, unique, indexado): el valor que va en el QR físico y que
  `/p` resuelve PRIMERO. Al crear la mascota, `credential_token = public_token` (retrocompat: los
  QR ya impresos siguen funcionando).

### Resolución en `/p/[token]`
1. Buscar por `credential_token = token`.
2. Fallback: buscar por `public_token = token` (los tokens viejos = credential inicial).
3. Si el token pertenece a una chapita reemplazada (ver abajo) → página honesta
   "Credencial reemplazada", no la identidad.

### Acción de dueño "Reemplazar chapita"
- Genera un `credential_token` nuevo (misma entropía que el actual).
- El valor VIEJO se guarda en una tabla de historial (`credential_tokens_history`) con
  `replaced_at` → cuando alguien escanea el QR viejo, `/p` renderiza una página honesta
  ("Esta credencial fue reemplazada. Si encontraste a la mascota, …") en vez de la identidad.
- Evento append-only `credential_token_rotated` (auditoría).

## Consideraciones
- La lógica de disclosure (Tier 1/2) ya es revocable; esto agrega revocabilidad a la IDENTIDAD,
  que hoy es lo único permanente.
- Costo real: auditar las ~decenas de call-sites que hoy asumen que el token del QR == identidad
  interna, y decidir cuáles resuelven por credential_token vs public_token.
- El comentario en `page.tsx:14` ya flaggea la deuda relacionada ("token entropy widening… would
  invalidate existing tokens") — evidencia de que el equipo sabe que los tokens son permanentes.

## Por qué fase 3 (no ahora)
Toca demasiadas rutas para el riesgo/beneficio en ciudad-piloto; la mitigación de rate-limit
en `/p` contiene el abuso a escala demo. Se prioriza cuando haya chapitas físicas reales en
circulación.
