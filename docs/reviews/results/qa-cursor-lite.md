# QA Cursor LITE — staging read-only

**URL:** https://dim-staging-a3ynpgcos-ignacio-dim.vercel.app  
**Fecha:** 2026-07-08 ~23:35–23:52 ART  
**Cuenta govt:** `govt@dim.test` (solo puntos 3–4)  
**Capturas:** `docs/reviews/results/qa-cursor-lite-screenshots/`

---

## Veredicto

| # | Punto | Resultado |
|---|--------|-----------|
| **1a** | Hero credencial viva (6 estados, PERDIDA roja, CTA llamar, MRZ, dots, QR → `/p/DIM-HACH-0016`) | **OK** |
| **1b** | Hero ↻ gira a mini libreta y vuelve | **OK** |
| **1c** | Historia vet: badge AL DÍA completo, raza "Caniche" | **OK** |
| **1d** | Historia refugio: frase una línea + chip "Cambio de estado" | **PARCIAL** — vet verificado en UI; cap. refugio no quedó en viewport (scrollytelling); código correcto, sin `status_changed` en DOM |
| **1e** | `/funcionalidades` (3 niveles + footer) | **OK** |
| **1f** | `prefers-reduced-motion` hero quieto | **N/C** |
| **2a** | `/p/DIM-DEMO-0001` sin PII dueño + vacuna verificada | **OK** |
| **2b** | `/perdidas` carga + concordancia género | **OK** |
| **2c** | `/adoptar` carga + Castrado/Castrada | **OK** |
| **2d** | `/leyes` sin jerga interna | **OK** |
| **3a** | Panorama AMBA costa (Avellaneda, San Isidro) sin triángulos/huecos | **PARCIAL** — `govt@` solo CABA; sin partidos bonaerenses en combobox; CABA zoom sin artefactos obvios |
| **3b** | Zoom z≥6.5 → departamentos / 48 barrios CABA | **FALLA** — no verificado en esta pasada |
| **3c** | KPIs con coma (`40,6%`) | **OK** |
| **4** | Estabilidad 3× reload `/gob/panorama` | **FALLA** — 3.er reload mostró modo degradado; ver abajo |

---

## Capturas por punto

| Punto | Archivo |
|--------|---------|
| 1a PERDIDA + MRZ + llamar | `01-hero-perdida.png` |
| 1b flip libreta | `01-hero-libreta-flip.png` |
| 1c historia vet (AL DÍA, Caniche en lista cap.1) | `01-historia-vet.png` |
| 1e funcionalidades | `01-funcionalidades.png` |
| 2a demo credential | `02-demo-credential.png` |
| 2b perdidas | `02-perdidas.png` |
| 2c adoptar | `02-adoptar.png` |
| 2d leyes | `02-leyes.png` |
| 3a panorama CABA / zoom | `03-panorama-amba.png`, `03-panorama-amba-zoom.png` |
| 3c KPI coma (post-Actualizar) | `03-panorama-amba-zoom.png` (misma sesión con `40,6%`) |

---

## Notas breves

### 1 · Landing
- **Hero:** 6 dots (AL DÍA, PERDIDA, AL DÍA, EN OBSERVACIÓN, EN TRATAMIENTO, REGISTRO PPP). PERDIDA tiñe card roja + **📞 Llamar al dueño**. MRZ `P<ARGPAMPA<<DIM<HACH<0016…`. QR href `/p/DIM-HACH-0016`.
- **Flip ↻:** muestra libreta (vacuna firmada, botón "Volver a la credencial").
- **Historia cap.2 (vet):** captura con badge **AL DÍA** verde junto a Pampa, matrícula verificada, sin artefacto gris.
- **Historia cap.4 (refugio):** no se pudo fijar el mockup en viewport con scroll automático; en código (`story-screens.tsx`) la frase y `eventTypeLabel("status_changed")` → "Cambio de estado" están correctos.

### 2 · Público anónimo
- Demo: custodia oficial, sin datos del dueño; **"Verificado por veterinario matriculado"**.
- Adoptar: **Castrado** (Negro) / **Castrada** (Lola).
- Leyes: sin `pet_identifications` ni `export_subject_data`.

### 3 · Panorama (govt@)
- Provincia solo **CABA** → no alcanza Avellaneda/San Isidro sin cuenta admin o vista nacional.
- **Mi alcance** pinta comunas CABA; sin triángulos naranjas cruzando el agua en zoom capturado.
- KPIs con coma cuando cargan (`40,6%`, `39,8%`, `0,0`).

### 4 · Estabilidad
| Reload | Mapa | KPIs |
|--------|------|------|
| 1 | OK ≤30s | OK |
| 2 | OK ≤30s | OK |
| 3 (~**23:43 ART**) | OK | **"No pudimos cargar los indicadores"** tras ~12s; recuperó tras **Actualizar** + ~20s |

Frecuencia modo degradado en esta sesión: **1/3** (33%).

---

## Seguimiento sugerido (fuera de lane lite)
- Panorama AMBA costa con cuenta **admin** o toggle vista nacional.
- Zoom CABA z≥6.5 y conteo 48 barrios.
- Cap. refugio historia: captura manual o e2e de scrollytelling.
- Investigar intermitencia KPIs en reload (modo degradado).
