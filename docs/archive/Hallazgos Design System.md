# miMAR · Design System «Libreta Nacional» — Hallazgos de revisión

> Notas para handoff. Inconsistencias detectadas al consolidar el sistema en una
> pantalla de styleguide (`Design System - Libreta Nacional.html`). Las tres son
> correcciones de **tokens / spec**, no rediseños — bajo riesgo, alto retorno en
> consistencia. Orden sugerido de implementación: #1 → #2 → #3.

## Contexto
El sistema tiene **una identidad en dos pieles**:
- **Cálida** (ciudadanía: Owner / Público) — prefijo CSS `.dirA-*`, papel `#FBFAF5`.
- **Operador** (back-office: Gobierno / Admin / Organización) — prefijo `.gob-*`, navy `#0A3556`.

Ambas comparten ADN (IBM Plex Serif/Sans/Mono, azul `#0E5A99`, sellos, códigos mono),
pero crecieron en capas y arrastran tres divergencias.

---

## Hallazgo 1 — Colores de estado desfasados entre pieles  · prioridad ALTA
**Qué pasa:** el mismo estado semántico tiene hex distinto según la piel. Hoy hay
**8 hexes para 4 estados**.

| Estado | Cálida (`--a-*`) | Operador (`--g-*`) |
|---|---|---|
| OK / vigente | `#2E7D4F` | `#1E7A3E` |
| Atención | `#B0771A` | `#9C6700` |
| Error / peligro | `#C0392B` | `#B71C1C` |
| Especial | rosa `#B5497E` | violeta `#6A4C93` |

**Propuesta:** un set semántico único `--st-ok / --st-warn / --st-err / --st-info`
que **ambas pieles consumen**; cada piel solo mapea sus aliases a esos tokens.
Valores sugeridos: ok `#1E7A3E` · warn `#9C6700` · err `#B71C1C` · info `#6A4C93`.

**Por qué importa:** una mascota «al día» debe verse idéntica para el dueño y para el
veterinario. Mantener 8 hexes sincronizados a mano es frágil.

**Impacto:** find/replace de tokens en `redesign-a*.css` y `redesign-a-gob*.css`. Sin
cambios de markup.

---

## Hallazgo 2 — Badges de estado con tres formas distintas  · prioridad MEDIA
**Qué pasa:** el mismo concepto («estado») se dibuja de tres maneras:
- `.dirA-flag` — radio 2px, mono, UPPERCASE.
- `.gob-pill` — radio 999px, sans.
- `.gob-codebadge` — radio 3px, mono (se usa para estados **y** para códigos).

**Propuesta:** un único `.pill` (punto de color + label, radio 6px, sans 600, tonos por
`data-tone`) válido en ambas pieles. Reservar los **code-badge mono solo para códigos**
(expedientes `OBS-…`, tokens `req_…`), nunca para estados.

**Por qué importa:** tres formas para una misma idea obligan al ojo a recalibrar en cada
pantalla; separa mal "estado" de "identificador".

**Impacto:** definir `.pill`, migrar usos de estado. Medio — toca varias vistas.

---

## Hallazgo 3 — Demasiadas clases de botón one-off  · prioridad MEDIA/BAJA
**Qué pasa:** cada módulo agregó su botón, con padding/radio/peso levemente distintos:
`.dirA-btn`, `.gob-tbtn`, `.gob-dbtn`, `.acct-btn`, `.org-actbtn`, `.cred-btn` (6).

**Propuesta:** una base `.btn` + modificadores (`--primary / --ghost / --danger /
--success / --sm / --block`). El **color del acento lo hereda la piel** (variable
`--accent`), no una clase nueva por módulo.

**Por qué importa:** 6 botones casi iguales = deriva visual y costo extra por pantalla.

**Impacto:** definir `.btn`, reemplazar progresivamente. Se puede hacer por módulo.

---

## Resumen para el handoff
1. **Tokens de estado unificados `--st-*`** — primero, base de todo lo demás.
2. **Componente `.pill` único** + code-badge solo para códigos.
3. **Botón `.btn` base + modificadores** con acento heredado de la piel.

Referencia visual viva (actual vs propuesta de cada punto): sección
**«08 · Oportunidades de mejora»** en `Design System - Libreta Nacional.html`.
