# MED/LOW triage — audits 25–28

Prioridad ↓. Severidad real = ajuste post-auditoría vs etiqueta del informe.

| # | Grupo / hallazgo | Sev real | Esfuerzo | Piloto | Fix (1 línea) |
|---|------------------|----------|----------|--------|---------------|
| 1 | **Erasure RPC incompleto** — `custody_disputes` + `attachments`/Storage no se purgan (`27#4,#5`) | MED→HIGH | M | **Bloquea** (Ley 25.326) | Extender `erase_subject_data`: soft-delete disputes del sujeto + borrar objetos Storage referenciados |
| 2 | **Free claim instantáneo** — chip/tatuaje solo, sin ventana ni aviso (`26#6`) | MED→HIGH | M | **Bloquea** | Cola de objeción + notificación al último owner (aunque `deactivated_at`) antes de flip de ownership |
| 3 | **Leaked-password protection off** (`28#5`) | MED | S | **Bloquea** (runbook cutover) | Toggle en Supabase Auth dashboard — ya trackeado, PO-gated |
| 4 | **Signup enumera cuentas** (`28#3`) | MED | S | **Bloquea** | Mismo copy genérico en signup duplicado, o `enable_confirmations=true` |
| 5 | **Flood anon por token** — sighting/finder/encontré limitan solo por IP (`25#6`; cierra replay débil de sightings) | MED | S | **Bloquea** | Segundo bucket `enforceRateLimit` keyed solo `publicToken` (ej. 30/h global) junto al per-IP |
| 6 | **GoTrue password < app** — 6 chars vía API directa (`28#4`) | MED | S | Piloto | `minimum_password_length=8` + `password_requirements` en dashboard hosted (config.toml no sync) |
| 7 | **Password-reset sin rate limit** (`28#2`) | MED | S | Piloto | `enforceRateLimit("password_reset_request", ip, …)` en `request-password-reset.ts` |
| 8 | **Public reads sin throttle** — libreta view log + `/casos` + `/denuncias/codigo` (`25#3,#4,#5`) | MED | S | Post-piloto | `enforceRateLimit` al tope de cada page/action (mismos buckets que `/p/[publicToken]`) |
| 9 | **overlayAmendments no en proyecciones** — credencial/KPIs/cache drift heredan valor pre-corrección (`27#9,#10`) | MED | M | Post-piloto* | `overlayAmendments` (+ ideally `upcastPayload`) dentro de `lib/projections/**` y `rederivePetCache` |
| 10 | **org-reject-return sin lock** — race con accept del owner (`26#7`) | MED | S | Post-piloto | Mismo `pg_advisory_xact_lock(hashtext(pet.id))` + re-check que `owner-reject-return` |
| 11 | **Sin revocación de sesión al downgrade** — vet/govt/admin revocados (`28#7`) | LOW→MED | S | Post-piloto | `auth.admin.signOut(userId, "global")` post-tx en los 5 writers de revocación/deactivación |
| 12 | **Sin session timebox** — refresh rota forever (`28#8`) | LOW→MED | S | Post-piloto | `[auth.sessions] timebox` (24h mínimo en roles institucionales) en dashboard hosted |
| 13 | **Cache drift solo manual** — sin cron ni trigger derivado (`27#12`) | MED | M | Post-piloto | Cron detect-only + alerta; ideal: trigger que derive `pets.status`/`deceasedAt` de inserts |
| 14 | **Disputa vs case desincronizados** — `escalated` solo en `cases` (`26#8`) | LOW | S | Post-piloto | Agregar `escalated` a `custody_disputes.status` o leer lifecycle del case vinculado |
| 15 | **SLA disputa solo 365d** — sin triage inicial (`26#9`) | LOW | M | Post-piloto | Segundo SLA corto (30/60d) con notificación/escalación antes del stale anual |
| 16 | **vet_name en payload post-borrado** — texto libre no anonimizado (`27#6`) | LOW | S | Post-piloto | Documentar retención profesional aceptada, o redactar vía mismo path que PII en payloads |
| 17 | **Auth callback sin safeReturnTo** — `next` raw (`28#9`) | LOW | S | Post-piloto | Pasar `nextParam` por `safeReturnTo()` en `app/auth/callback/route.ts` |

\* Post-piloto salvo que el piloto use `event_amended` en producción — entonces sube a piloto.

## Agrupación por fix compartido

| Fix único | IDs informe |
|-----------|-------------|
| Extender `erase_subject_data` RPC | 27#4, 27#5 |
| `overlayAmendments` en capa de proyección + cache rebuild | 27#9, 27#10 |
| `enforceRateLimit` en 3 public reads | 25#3, 25#4, 25#5 |
| Patrón lock return-to-owner | 26#7 (par con HIGH 26#4) |
| Auth dashboard / GoTrue config hosted | 28#4, 28#5, 28#8 |
| Session hygiene post-privilege-change | 28#7 |
| Dispute lifecycle | 26#8, 26#9 (fixes distintos, mismo dominio) |

## Orden sugerido de sprint

1. **#1–5** — legal + abuso activo en superficies públicas del piloto  
2. **#6–7** — auth baseline de bajo esfuerzo  
3. **#8–10** — hardening operacional pre-escala  
4. **#11–17** — defensa en profundidad / ops / deuda LOW
