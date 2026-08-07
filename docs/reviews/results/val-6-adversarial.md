# Validación MiMAR — Pass 6: Adversarial / edge

**Agente:** Cursor (Playwright runner)  
**Fecha:** 2026-07-07 (re-validación post-fixes)  
**Entorno:** `http://localhost:3000` — build fresco, seed limpio

Screenshots: `docs/reviews/results/val-6-adversarial-screenshots/`

---

## Chequeos ejecutados

| Caso | Ruta | Resultado |
|------|------|-----------|
| Token mascota inválido | `/mis-mascotas/DIM-NOPE` | Redirect / 404 limpio |
| Caso inválido | `/gob/casos/CAS-NOPE` | No crash |
| Sheet desconocido | `?sheet=x` | Ignorado / sin crash |
| Owner en portal gob | owner@ → `/gob` | **Redirect** (no acceso) ✅ |

---

## Hallazgos

_Ninguno._

---

## VERDICT: **PASS (0 Blockers)**

### Top 3

1. _(sin hallazgos)_ — auth redirect owner→gob OK.
2. Deep links inválidos fallan sin digest.
3. Sin regresiones vs run previo.
