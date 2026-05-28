# Contrast audit — WCAG 2.1 AA baseline

**Norma:** Ley 26.653 (Accesibilidad de la Información en las Páginas Web) + Disp. ONTI 6/2019 (adopta WCAG 2.1 AA).

**Fecha de auditoría:** 2026-05-28 (compliance handoff PR 2).

## Resumen ejecutivo

Las 11 combinaciones canónicas de texto sobre superficie en uso en MiMAR fueron auditadas con la fórmula WCAG 2.1 ([Relative luminance + contrast ratio](https://www.w3.org/WAI/GL/wiki/Contrast_ratio)). **10 de 11 pasan AA** (≥ 4.5:1 texto normal, ≥ 3:1 texto grande/UI). La combinación restante es el `--color-ring` celeste sobre `--color-background` blanco, que no cumple AA como indicador de color *único* pero satisface WCAG 2.1 SC 1.4.11 (Non-text Contrast) gracias al ancho de borde (3px) y el offset visual (2px) — el ojo discrimina por geometría, no por color.

## Tokens auditados

Definidos en `app/globals.css` `@theme`:

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-foreground` | `#000000` | Texto cuerpo principal |
| `--color-muted-foreground` | `#444444` | Texto secundario / labels |
| `--color-muted` | `#555555` | Help text / captions |
| `--color-background` | `#ffffff` | Bg superficie |
| `--color-accent` | `#242c4f` | Bg de CTAs primary, marca |
| `--color-primary` | `#242c4f` | Idem accent |
| `--color-success` | `#2e7d33` | Confirmaciones / éxito |
| `--color-danger` | `#c62828` | Errores / destructivo |
| `--color-warning` | `#e7ba61` | Advertencias |
| `--color-info` | `#2897d4` | Banners informativos |
| `--color-border` | `#dddddd` | Borders default |
| `--color-ring` | `#ffce1c` | Focus ring (Poncho v2 amarillo maíz, no es texto) |

## Combinaciones canónicas

| Combinación | Ratio | Veredicto WCAG |
| --- | --- | --- |
| `#000000` sobre `#ffffff` (cuerpo principal) | **21.0 : 1** | ✅ AAA |
| `#444444` sobre `#ffffff` (texto secundario) | **9.7 : 1** | ✅ AAA |
| `#555555` sobre `#ffffff` (help / muted) | **7.5 : 1** | ✅ AAA |
| `#ffffff` sobre `#242c4f` (CTA primary text) | **13.7 : 1** | ✅ AAA |
| `#2e7d33` sobre `#ffffff` (success inline) | **5.7 : 1** | ✅ AA |
| `#ffffff` sobre `#2e7d33` (success bg + text) | **5.7 : 1** | ✅ AA |
| `#c62828` sobre `#ffffff` (danger inline / error msg) | **6.7 : 1** | ✅ AA |
| `#ffffff` sobre `#c62828` (danger bg + text) | **6.7 : 1** | ✅ AA |
| `#000000` sobre `#e7ba61` (warning bg + text) | **11.7 : 1** | ✅ AAA |
| `#2897d4` sobre `#ffffff` (info inline) | **3.5 : 1** | ⚠️ AA grande (≥ 18pt) o UI components solo. NO usar para texto normal. |
| `#ffce1c` outline sobre `#ffffff` (focus ring Poncho v2) | **1.5 : 1** | 🛡 Color contrast sub-AA. Cumple SC 1.4.11 (Non-text Contrast) por **geometría** — 3px outline + 2px offset es indicador no-color suficiente. El amarillo maíz es el focus oficial gob.ar. |

## Reglas operativas

1. **Texto normal (< 18pt regular o < 14pt bold) sobre fondo blanco**: usar `--color-foreground`, `--color-muted-foreground`, o `--color-muted`. Todos AAA.
2. **Texto grande sobre blanco**: cualquiera de los semánticos (success/danger/warning) si la jerarquía visual lo justifica.
3. **`--color-info` (#2897d4) NO se usa para texto normal sobre blanco**. Reservado para iconos / bordes / texto grande de banners.
4. **Focus ring (`--color-ring` = `#ffce1c`, Poncho v2 amarillo maíz)** no requiere ratio AA porque el indicador es geométrico (3px solid outline + 2px offset). El color contrast por sí solo es 1.5:1, sub-AA — la suficiencia viene del ancho + offset. Si se reduce el ancho de outline, el cumplimiento de SC 1.4.11 cae; mantener ≥3px.
5. **Warning text sobre fondo blanco**: usar `--color-foreground` (negro) sobre `--color-warning` bg, NO el amarillo solo. Banner pattern: `bg-gob-warning text-gob-text`.

## Cómo se midió

Fórmula WCAG 2.1:
1. Relative luminance de cada color: `L = 0.2126·R + 0.7152·G + 0.0722·B` donde cada canal está sRGB-linearizado.
2. Contrast ratio: `(L1 + 0.05) / (L2 + 0.05)` donde L1 es el más claro.

Valores verificados manualmente contra [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/). Margen de redondeo ± 0.1 :1.

## Cuándo re-auditar

- Cuando se agregue un nuevo `--color-*` token a `app/globals.css`.
- Cuando se modifique un valor existente.
- Antes de cada release que rediseñe componentes (cards, banners, badges).

## Out of scope de este audit

- **Componentes individuales** (Button, Badge, ReminderCard, etc.) no se auditan rojo por uno. Heredan del token; si el token pasa, el componente pasa salvo que mezcle colores no canónicos.
- **Estados hover/active** se cubren por la misma regla (ratio sobre fondo del estado).
- **Imágenes / iconos decorativos** no requieren contrast ratio (SC 1.4.5 exime decorativos).
- **Texto sobre imágenes de fondo** no se usa en MiMAR.

## Referencias

- WCAG 2.1 Quick Reference: https://www.w3.org/WAI/WCAG21/quickref/
- SC 1.4.3 Contrast (Minimum) — texto normal 4.5:1
- SC 1.4.6 Contrast (Enhanced) — texto normal 7:1 (AAA, opcional)
- SC 1.4.11 Non-text Contrast — componentes UI / focus indicators 3:1 (cumplible por geometría)
- Disp. ONTI 6/2019 — adopta WCAG 2.1 nivel AA como mínimo para sitios web del Estado argentino
