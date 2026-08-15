# Corrida Cowork — estado preparado (2026-08-15)

**Estado**: PREPARADO — pendiente de (1) cerrar el backlog de código previo (WP1-5 panorama + review adverso + push) y (2) lanzamiento del PO en la conversación de Cowork.
**Decisión PO 2026-08-15**: el backlog previo se implementa ANTES de largar la corrida; la tanda corre contra el build post-push.

## Lo hecho (verificado, no asumido)

| Pieza | Estado | Evidencia |
|---|---|---|
| Dataset staging | ✅ Completo | seed-panorama: 41.145 mascotas, 110.974 eventos, 24 provincias con historia multi-año 2024-2026, 5.465 denuncias históricas, campañas con asistencias/no-shows; gates finales limpios (cache de fallecidos reconciliado, 0 seed-markers) |
| Narrativa demo (spine) | ✅ Verificado | idempotente, todo SKIP: Argo, Carla (matrícula pendiente), disputa de Bruno, `adoptante@` con Mora + recordatorio A9 abierto (vence 2026-08-25) |
| Cubo | ✅ Fresco | 2.448 filas, built 2026-08-15T18:00Z; `X-Kpi-Source: cube` verificado por HTTP |
| Cuentas | ✅ Verificadas por SQL | `gov-pba@`: 4 partidos (La Plata, Quilmes, Morón, **Tigre**); `lucas@`: CABA entera; `adoptante@`: owner con Mora |
| Cookies | ✅ Acuñadas | `qa-sessions.json` (8 cuentas, gitignoreado). Trampa PowerShell: la lista de mails va ENTRE COMILLAS (las comas arman array). Vars: `QA_SUPABASE_URL`/`QA_SUPABASE_ANON_KEY` (la anon key NO está en `.env.staging.local` — agregarla como `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| Performance | ✅ GO | `/admin/panorama` 1,8s frío (era ~11s en CW0813); `/gob` como lucas 3,0s / gov-pba 1,7s; `/p/` 4,0s; único soft spot: `/admin` home 4,7-6,4s (QueueHealthCockpit — territorio Lote D-1, anotado, no bloquea) |
| Brief guionado | ✅ Blindado | `docs/agents/prompt-cowork-demo-recorridos.md` — 9 tours con ramas (denuncia→org/decomiso/MPF, turno cancelar/re-reservar/asistencia, propuesta de tránsito con coda), nav post-fusión, review adverso aplicado (2 bloqueos de capabilities corregidos), alcances verificados contra staging |
| Brief ciego | ✅ Listo | `docs/agents/prompt-cowork-recorridos-ciegos.md` — 12 objetivos sin rutas, prefijo `RC`, LOGRADO vs FALSO COMPLETADO. Corre SIEMPRE después de una guionada verde |

## Para lanzar (en orden)

1. Cerrar backlog: WP3 (gates corriendo) → WP1 (merge de presets, aliases de URL) → WP2 → WP4 → WP5 → review adverso fresco del rango → push (redeploya staging).
2. Anotar el SHA nuevo de staging (7 chars del HEAD pusheado) — el `22cc7a4` de hoy queda obsoleto con el push.
3. Pegar el brief guionado en Cowork con ese SHA + entregarle `qa-sessions.json`.
4. Al terminar verde: tanda ciega, mismo SHA, prefijo `RC`.

**Las cookies sobreviven al redeploy** — son sesiones de Supabase firmadas por GoTrue, independientes del deploy de Vercel. Solo se re-acuñan si el refresh rotó y el valor guardado quedó viejo (el brief instruye a Cowork a pedirlo, no a reintentar).

## Autonomía y manejo de errores — qué esperar

La corrida NO es un pipeline con retries automáticos, **por diseño**: un agente de QA que reintenta a ciegas fabrica estado y contamina el dataset. El modelo es "autonomía con reglas de parada":

- **Build check por tour**: si el meta tag de staging no matchea el SHA, PARA y avisa — media corrida contra otro build no sirve para nada.
- **Login**: cero reintentos. Sesión perdida = tour "no ejecutado" + aviso al operador (re-acuñar es un comando). El rate limit por email (5/min·20/h) hace que reintentar sea la peor jugada.
- **Reintentos permitidos, acotados y documentados**: recarga única ante caché fría de KPIs (trampa conocida), leer el DOM cuando la captura CDP cuelga con backdrop-blur (trampa CW0813), y nada más.
- **Datos**: prefijo por corrida (`RD<fecha>` / `RC<fecha>`), stop-before-submit en todo lo destructivo — una corrida que falla a mitad NO deja el dataset degradado; deja datos prefijados identificables y un reporte parcial honesto.
- **Rol del operador (PO)**: lanzar, entregar cookies, re-acuñar si una sesión muere, y recibir el reporte. Nada más — no hay que mirarla correr.

## Referencias

- Engram: `ops/staging-0181-and-seed-status` (secuencia completa), `qa/cowork-demo-recorridos-brief` (historia del brief).
- Fixes pendientes que la corrida puede re-detectar (no son hallazgos nuevos): `/admin` home lento (Lote D-1), capa `denuncias` live (WP4), matriz de gaps de briefings (`docs/plans/2026-08-15-lote-d-briefings-cuatro-fallas.md`).
