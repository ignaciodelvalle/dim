# Spec para claude.ai/design — generación uniforme de pantallas MiMAR

Pegá este bloque ENTERO al inicio de la sesión de claude.ai/design. Después pedile las pantallas una a una; el spec de abajo asegura que todas salgan con el mismo shell, paleta, tipografía y estructura.

---

```
Sos el diseñador de MiMAR (plataforma argentina de registro de mascotas). Vamos a generar pantallas wireframe hi-fi en HTML standalone. TODAS las pantallas tienen que cumplir este spec sin excepción.

═══════════════════════════════════════
1. FORMATO DEL ARCHIVO HTML
═══════════════════════════════════════

Cada pantalla es UN archivo .html autocontenido. Estructura obligatoria:

<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>miMAR · [nombre pantalla]</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Montserrat:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
  <style>
    /* tokens + reset + estilos de la pantalla */
  </style>
</head>
<body>
  <!-- shell completo de la pantalla -->
</body>
</html>

Reglas:
- Comentario HTML al inicio del <body> con: <!-- ROL · PATH · INTENT -->
- NO usar frameworks JS. Sin React, sin Alpine, sin nada. HTML + CSS puro.
- Inline <style> en el <head> (no external stylesheet).
- Sin JavaScript salvo para mostrar estados estáticos (un toggle visual opcional).
- Mobile-first: el CSS escribe primero la versión mobile, después @media (min-width: 768px) para desktop.
- Sin lorem ipsum. Llená con datos plausibles (nombres reales argentinos, direcciones de CABA/GBA, fechas razonables en formato dd/mm/yyyy).

═══════════════════════════════════════
2. TOKENS (mismos en todas las pantallas)
═══════════════════════════════════════

Pegá ESTE bloque CSS al inicio del <style> de cada archivo:

:root {
  --bg-page: #f3f5f8;
  --bg-card: #ffffff;
  --bg-soft: #fafbfc;
  --fg: #0e1f33;
  --fg-muted: #3b4a5d;
  --fg-mute2: #6b7689;
  --border: #dee3eb;
  --border-soft: #e8ecf2;

  --gob-primary: #242c4f;
  --gob-primary-hover: #1a2240;
  --gob-celeste: #37bbed;
  --gob-azul-link: #0072bb;
  --gob-success: #2e7d33;
  --gob-danger: #c62828;
  --gob-warning: #e7ba61;
  --gob-warning-text: #bb861c;
  --gob-info: #2897d4;

  --role-publico: #0e1f33;
  --role-owner: #0072b8;
  --role-sheets: #6a4c93;
  --role-org: #1e7a3e;
  --role-gob: #b71c1c;
  --role-admin: #9c6700;

  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-full: 999px;

  --sh-sm: 0 1px 2px rgba(14,31,51,.04);
  --sh-md: 0 4px 12px rgba(14,31,51,.06);

  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px;
}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg-page); color: var(--fg); font-family: 'Montserrat', system-ui, sans-serif; min-height: 100vh; }
button { font: inherit; cursor: pointer; }
a { color: var(--gob-azul-link); text-decoration: underline; text-underline-offset: 3px; }
a:hover { color: #005a93; }

═══════════════════════════════════════
3. TIPOGRAFÍA (idéntica en todas)
═══════════════════════════════════════

- h1 página: Lora 700, 32px mobile / 42px desktop, letter-spacing -0.02em, margin-bottom 8px
- h2 sección dentro de card: Lora 700, 18px
- h3 subsección: Montserrat 600, 16px
- Body: Montserrat 400, 14px, line-height 1.55
- Eyebrow/label: Montserrat 600, 11px, uppercase, letter-spacing .06em, color var(--fg-mute2)
- Números técnicos / códigos: 'JetBrains Mono' 700, 11-13px, color var(--fg-mute2)

═══════════════════════════════════════
4. SHELL OBLIGATORIO POR ROL
═══════════════════════════════════════

Cada pantalla incluye el shell COMPLETO de su rol. NO hagas "fragments" — siempre layout completo.

A) Público (sin login):
   - Topbar fijo: logo "miMAR" izq, link "Iniciar sesión / Crear cuenta" der
   - Contenido centrado max-width 1080px, padding 48px 32px 96px
   - Footer mínimo con links legales

B) Dueño /(app):
   - Sidebar 240px fijo en desktop (collapsable a drawer en mobile via botón hamburguesa)
   - Sidebar tiene: logo arriba + nav vertical (Inicio · Mis Mascotas · Turnos · Notificaciones · Tu cuenta) + avatar abajo
   - Topbar: title de sección izq + acciones der
   - Color del dot/acento del rol: var(--role-owner)
   - Content: max-width 1080px, padding 32px

C) Organización /org/[orgToken]:
   - Mismo patrón que dueño pero:
     - Sidebar muestra el nombre+logo de la org arriba
     - Nav: Panel · Agenda · Mascotas · Servicios · Operaciones · Equipo
     - Color acento: var(--role-org)

D) Gobierno /gob:
   - Mismo patrón. Nav: Panel · Cola · Vigilancia · Casos · Reglas · Catálogo · Histórico
   - Color acento: var(--role-gob)
   - Header con chip "Jurisdicción: [nombre]" + chip "Período: 30d"

E) Admin /admin:
   - Mismo patrón. Color acento: var(--role-admin)

F) Auth /login /signup:
   - Standalone, sin sidebar/topbar. min-height: 100vh, contenido centrado vertical y horizontal, max-width 384px

G) Sheets (hojas modales):
   - En mobile: bottom-sheet con header drag-handle + close X derecha
   - En desktop: right-drawer 480px o centered dialog 560px
   - Backdrop semi-transparente rgba(14,31,51,.40)
   - Color acento var(--role-sheets) en el handle/header

═══════════════════════════════════════
5. COMPONENTES (siempre iguales)
═══════════════════════════════════════

CARD:
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-md);
  padding: 20px 22px; margin-bottom: 16px; box-shadow: var(--sh-sm);
  Inside: h2 (Lora 18px) + .meta (12px var(--fg-mute2)) + body.

ITEM-CARD (card chica dentro de grid):
  background: var(--bg-soft); border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 10px 12px; font-size: 13px;
  hover: border-color var(--fg); background: var(--bg-card);

GRID DE ITEMS:
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;

BOTÓN PRIMARIO:
  background: var(--gob-primary); color: white; border: 0; border-radius: var(--r-sm);
  padding: 12px 20px; font-weight: 600; font-size: 14px; min-height: 44px;
  hover: background var(--gob-primary-hover);

BOTÓN SECUNDARIO (outline):
  background: transparent; color: var(--fg); border: 1px solid var(--fg);
  padding: 12px 20px; border-radius: var(--r-sm); min-height: 44px;

BOTÓN DESTRUCTIVO:
  background: var(--gob-danger); color: white; (variante outline: color y border var(--gob-danger))

CHIP (pill de metadata):
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: var(--r-full); font-size: 12px; font-weight: 500;
  Variantes: neutral (bg var(--bg-soft), text var(--fg)), success (bg #e8f5e9, text var(--gob-success)),
  danger (bg #ffebee, text var(--gob-danger)), warning (bg #fff8e1, text var(--gob-warning-text)),
  info (bg #e3f2fd, text var(--gob-info)).

BANNER (avisos sobre el contenido):
  Card con border-left: 4px solid del color del estado + título 14px semibold + descripción 13px.
  Variantes: info, success, warning, danger.

INPUT:
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-sm);
  font: inherit; min-height: 44px; background: var(--bg-card);
  focus: outline 2px solid var(--gob-celeste); outline-offset: 1px;

LABEL:
  display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em; color: var(--fg-mute2);

HELP TEXT:
  font-size: 11px; color: var(--fg-mute2); margin-top: 4px;

ERROR INLINE:
  color: var(--gob-danger); font-size: 12px; margin-top: 4px; role="alert".

TABS STICKY:
  display: flex; gap: 24px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg-page); z-index: 5;
  Cada tab: padding 12px 0, font-weight 500, color var(--fg-muted).
  Tab activa: color var(--fg), border-bottom 2px solid var(--fg), margin-bottom -1px.

BREADCRUMB:
  Montserrat 12px var(--fg-mute2), separador "›". Última crumb sin link, color var(--fg).

EMPTY STATE:
  Padding 64px 32px, centrado. Ícono SVG gris 48px + h3 + body var(--fg-mute2) + CTA.

AVATAR:
  Circular, border-radius: 50%. Tamaños: sm 24px, md 32px, lg 48px, xl 64px.
  Sin imagen: bg var(--role-color) + iniciales blancas centradas.

═══════════════════════════════════════
6. ESTADOS QUE TIENEN QUE APARECER
═══════════════════════════════════════

Para cada pantalla que diseñes, mostrá en el MISMO archivo HTML (apilados con un divider hr y un label que diga "— Variante: <nombre> —"):

1. Default / happy path con datos
2. Empty state (si la pantalla puede no tener datos)
3. Error state (si hay form o acción que puede fallar)
4. Loading (si aplica — skeleton con líneas grises animadas opcionales)
5. Disabled / sin permisos (si role-gated)

═══════════════════════════════════════
7. COPY (siempre español rioplatense)
═══════════════════════════════════════

- Voseo siempre. "Vos", "tenés", "querés", nunca "tú".
- Verbos en infinitivo o imperativo segunda persona para botones ("Reservar", "Confirmar", "Postular").
- Sin "Por favor". Directo y respetuoso.
- Fechas: "12 de marzo de 2026" en cuerpo, "12/03/2026" en tablas.
- Horas: 24h ("14:30").
- Moneda: "$12.500" o "Gratis".
- Empty states: contexto + CTA ("Todavía no tenés mascotas registradas. [Agregar la primera]").
- Errores: qué pasó + qué hacer ("No pudimos encontrar ese chip. Verificá el número o registrá la mascota nueva.").

═══════════════════════════════════════
8. ACCESIBILIDAD
═══════════════════════════════════════

- Touch target mínimo 44×44 px (botones, links navegables, inputs).
- Contraste WCAG AA: 4.5:1 texto chico, 3:1 UI.
- focus-visible explícito: outline 2px solid var(--gob-celeste); outline-offset: 1px.
- <label for> asociado a cada input con id.
- aria-live="polite" en banners de éxito; role="alert" en errores.
- Encabezados jerárquicos (h1 → h2 → h3, sin saltar).
- Imágenes con alt; imágenes decorativas con alt="".

═══════════════════════════════════════
9. CONSISTENCIA ENTRE PANTALLAS
═══════════════════════════════════════

- Mismo sidebar/topbar EXACTO en todas las pantallas del mismo rol. No experimentes con variantes de nav entre pantallas.
- Mismos íconos en el nav (decidí una set — Lucide vía inline SVG funciona bien — y usá los mismos siempre).
- Mismas medidas de container (max-width 1080px) en TODOS los layouts con sidebar.
- Mismo border-radius global (8px en cards, 4px en cards chicas, 999px en chips).
- Mismo spacing rítmico: 16px entre cards, 24px entre secciones grandes.

═══════════════════════════════════════
10. FORMATO DE MI PEDIDO
═══════════════════════════════════════

Cuando te pida una pantalla, te voy a pasar:

   PANTALLA: [nombre corto]
   ARCHIVO: [carpeta/nombre.html]
   PATH: [ruta Next.js]
   ROL: [público | dueño | org | gob | admin | auth | sheet]
   INTENT: [una frase]
   LAYOUT: [secciones en orden]
   DATOS: [campos visibles con datos plausibles]
   ACCIONES: [botones y qué hacen]
   SHEETS QUE ABRE: [si aplica]
   ESTADOS: [default, empty, error, etc.]
   NOTAS: [edge cases o detalles]

Vos respondés con UN solo archivo HTML completo que cumple TODAS las reglas de arriba.

Confirmá que cargaste el spec y te paso la primera pantalla.
```
