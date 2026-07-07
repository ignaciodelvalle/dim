# Validación MiMAR — Pass 8: Cold first impression

**Agente:** Cursor (Playwright runner)  
**Fecha:** 2026-07-07 (re-validación post-fixes)  
**Entorno:** `http://localhost:3000` — logged-out

Screenshots: `docs/reviews/results/val-8-firstimpression-screenshots/`

---

## Percepción (10 segundos)

### 3 cosas que construyen confianza

1. **Marca alineada Mi Argentina** — franja, GCBA, tono institucional (`01-landing-logged-out.png`).
2. **Propuesta clara** — "Toda una vida, en una sola miMAR" + credencial digital sanitaria.
3. **Credencial pública** — QR + token DIM verificable; footer normativo en `/p/`.

### 3 cosas que erosionan confianza

1. **Demo banner** en admin/gobt logueado — correcto en demo, no en landing pública.
2. **Densidad landing** — mucho scroll antes de CTA "Crear cuenta".
3. **Mi Argentina disabled** — placeholder visible en login (esperado, pero genera fricción).

### Mayor "no entiendo"

- Diferencia **credencial pública** vs **libreta compartida** — requiere entrar al producto (copy mejorable en landing).

---

## Hallazgos

_Ningún blocker._

---

## VERDICT: **PASS (0 Blockers)**

### Top 3

1. Landing explica WHAT + WHY en es-AR — trust OK para ciudadano.
2. Credencial `/p/DIM-DEMO-0001` se siente documento nacional.
3. **[MENOR]** Panorama govt no evaluado logged-out — evaluado en Pass 2.
