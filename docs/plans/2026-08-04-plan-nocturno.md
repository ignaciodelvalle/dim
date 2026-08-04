# Plan nocturno — 2026-08-04

> **BORRADOR.** Ignacio va a sumar hallazgos; los bloques de abajo son lo que
> hoy está verificado como abierto. Nada acá se ejecuta hasta que el plan cierre.

## Punto de partida (verificado hoy, no de memoria)

| Hecho | Evidencia |
|---|---|
| CI **verde entero** por primera vez desde el 30/07 | run `30873868074` (push y pull_request), 6/6 jobs, e2e incluido |
| Rama `integration/all-20260703` = rama de producción del proyecto Vercel | cada push despliega staging solo |
| 13 de 15 PRs abiertas ya están absorbidas en HEAD | `git merge-base --is-ancestor origin/<branch> HEAD` una por una |
| PENDIENTES.md describe como abierto todo el bloque e2e que se cerró hoy | comparar su §"Tests que no guardan nada" contra el run verde |

**El activo a proteger es el verde.** Cualquier trabajo de esta corrida entra por
`pnpm verify` + `pnpm test` + el job de e2e. Un rojo nuevo se arregla o se
revierte antes de seguir — un e2e rojo permanente es justamente la deuda que
acabamos de pagar con siete iteraciones.

---

## Bloque 0 — higiene de cola (mecánico, sin criterio)

1. **Cerrar las 13 PRs absorbidas**, cada una con un comentario que diga en qué
   rama quedó. No tocar #760 (la nuestra) ni #762 (review slice, "do not merge").
2. **Actualizar PENDIENTES.md**: cerrar el bloque e2e con la evidencia del run
   verde, y mover a "decidido" las tres decisiones de hoy. El propio documento
   se quemó dos veces por listar como pendiente algo resuelto.

---

## Bloque 1 — 🔴 P1: rompe algo para un usuario

| # | Qué | Dónde |
|---|---|---|
| RA-2 F4 | Firmar un chip distinto al canónico deja el canónico intacto **en silencio**: la espina guarda el chip B verificado, la ficha sigue mostrando el A | `microchip-*` use-case |
| RA-2 F9 | Un `org.transfer.propose` concedido es **inerte** — la página chequea rol de membresía, nunca capacidades, y el mensaje "Solo roles admin o coordinator" **es falso** | `app/org/[orgToken]/transferencias/nueva/page.tsx:43` |
| RA-2 F10 | "Enviar documentación" lleva a una página sin nada que enviar; `done: input.isVerified` nunca se da vuelta desde dentro de la org | `org-setup-checklist.ts:120` |
| RA-2 F5 | `replaceMicrochipVetAction` usa el `redirect()` dentro de la acción que el resto ya migró (contrato N3) | `microchip/reemplazar/action.ts:118` |
| **#758** | `govt_assignments` matchea jurisdicción por **string exacto**: un alta con "CABA" ve cero de las 3.421 mascotas de "Ciudad Autónoma de Buenos Aires" | issue #758 |

> **#758 es la misma clase de falla que nos mordió hoy en e2e**: la denuncia con
> jurisdicción NULL era invisible para todo operador y nada lo decía. Ahí el
> origen era un geocode fallido; acá, una grafía no canónica. **El patrón es
> "scope por igualdad exacta sobre texto libre, sin validación en el alta y sin
> señal cuando no matchea"** — vale arreglar la clase, no la instancia:
> canonicalizar/validar contra `ar_localities` al crear la asignación, y que un
> scope que no resuelve **se note**.

---

## Bloque 2 — decisiones de hoy, ya convertidas en trabajo

| Decisión | Trabajo concreto |
|---|---|
| Walk-in de Atender: **aviso + provenance** | El evento sigue entrando, marcado con provenance de walk-in no verificado, y el dueño recibe notificación inmediata. La irreversibilidad se acepta; la irreversibilidad **silenciosa** no. |
| `/gob` métricas: **estado honesto sin datos** | Reemplazar "las métricas con meta están dentro de rango" por "sin medición suficiente". Calcular metas reales por jurisdicción es trabajo aparte y **no bloquea** sacar la afirmación falsa. |
| Migración 0156: **corregir fuera del archivo** | La corrección va a docs + índice de migraciones. El ledger guarda sha256 de los bytes y `migrate.ts --strict` falla con deriva: no se edita una migración aplicada, ni sus comentarios. |

---

## Bloque 3 — 🟠 P2: los fences mienten

Ahora que los tests son honestos, este es el bloque con más valor: son gates que
**reportan verde sobre algo que no miran**.

- **10 archivos `"use server"` invisibles a los tres linters de authz** (el glob
  es plano). Incluye 8 acciones de escritura médica en atender.
- **`check-authz-scoping` se derrota con un comentario**: la palabra
  "jurisdiction" en cualquier parte del cuerpo cuenta como prueba.
- **`check-rls-coverage` sólo verifica que exista una política**, nunca su
  contenido, roles, cláusula `TO` ni GRANTs.
- **8 políticas sin cláusula `TO`** → caen a `PUBLIC` (incluye anon). Hoy son
  seguras **por accidente**, vía predicados `auth.uid()`, no por diseño.
- `lint:nav` prohíbe sólo `router.refresh(` mientras su docblock nombra
  push/replace — **20 sitios vivos**.
- El fence N3 reporta **cero deuda falsamente**: 8 `redirect()` en módulos de
  caso de uso quedan fuera de sus dos globs.
- Cuatro fences cargan su propia copia byte-idéntica de `stripComments`
  existiendo ya `scripts/lib/strip-comments.mjs`.

---

## Bloque 4 — issues de GitHub abiertos (10)

| # | Qué | Clase |
|---|---|---|
| #758 | jurisdicción por string exacto (ver Bloque 1) | bug, datos huérfanos |
| #755 | Los badges del hero se aplastan contra el QR a 320px exactos | bug visual |
| #141 | Replay de notificaciones ENO perdidas (diagnósticos pre-fix) | bug, datos |
| #754 | Drop de `pet_achievement_views` — migración destructiva, review propio | riesgo |
| #753 | Endurecer provenance de `dangerous_breed_attested`: quién puede emitirlo y con qué evidencia | integridad |
| #759 | No existe writer de UI/server-action para los tipos de evento de vigilancia | feature |
| #757 | Guiar al vet al canal profesional cuando actúa sobre una mascota que tiene en tránsito personal | feature |
| #756 | Acceso de escritura del vet vía link de libreta compartida — **flujo publicitado, no construido** | feature |
| #752 | Rediseñar credencial pública `/p/{token}` + cartel al lenguaje visual de la Credencial DNI | diseño |
| #751 | Extraer helpers compartidos de pet-list/reminders + doctrina de footer en mis-turnos | refactor |

---

## Bloque 5 — 🟡 P3 / ⚪ P4 (declarada)

- **P3**: panorama contándose distinto a sí mismo — denominadores anidados en
  datos abiertos (`perros_registrados` ⊂ `mascotas_activas`, la resta despeja
  las no-perro), dos claves de leyenda que describen estados que el frame puede
  no contener, el triage de maltrato que perdió la edad de una denuncia no
  vencida.
- **P4**: 21 pesos tipográficos inertes, 19 tamaños bajo el piso del ratchet, la
  libreta de vacunas que clipea a 390px, `role="img"` tragándose subárboles,
  `?chip=a&chip=b` → 500 (falla cerrado, sin fuga), el logo post-demo.

---

## Reglas de la corrida (no negociables)

- **Escritores en paralelo sólo en worktrees**, territorio de archivos disjunto,
  con merge serial e integración por `pnpm verify` completo.
- **Todo hijo en background se pollea dentro del mismo turno.** Un turno no
  termina con un hijo vivo sin poll.
- **Cursor como revisor fresco antes de pushear** el rango.
- **Evidencia real, no impresiones**: salida pegada de `verify`/`test`, y para
  cualquier cosa de e2e, el veredicto de CI — la DB de dev miente (estado
  acumulado), como quedó documentado en `e2e/README.md`.
- Migraciones: forward-only, inmutables, y **aplicarlas a una DB remota es
  decisión de Ignacio**, no del agente.

---

## Pendiente de completar

- [ ] Hallazgos que va a pasar Ignacio.
- [ ] Orden final y qué corre desatendido vs qué necesita criterio.
