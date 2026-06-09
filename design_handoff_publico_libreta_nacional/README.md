# Handoff #2: miMAR — Portales Públicos (Dirección «Libreta Nacional»)

> **Continúa el handoff #1 (Owner).** Reusa el MISMO sistema de diseño y tokens.
> Si ya implementaste el #1, acá solo cambian las *pantallas*, no el lenguaje visual.
> Este paquete cubre todo el **tier público / ciudadanía** (sin login) + algunas
> superficies de organización y de cuenta que cuelgan de esos flujos.

## Overview
Rediseño del **tier público** de **miMAR** (Mi Mascota Argentina) en la dirección
**«Libreta Nacional»**: oficial/estatal renovado, editorial-documento, papel cálido,
azul institucional, serif + mono, detalles de certificación.

Personas cubiertas: **ciudadano/a sin login** (escanea un QR, adopta, denuncia, busca
una mascota perdida), **adoptante autenticado**, y el lado **organización/refugio** donde
toca los flujos públicos (transferencias, perfil público).

Pantallas (22 en total, repartidas en 2 archivos de entrada):

**Archivo 01 — Portada y catálogos**
1. Portada pública
2. Adoptar — catálogo
3. Perdidas — catálogo (modo emergencia)
4. Credencial pública **Tier 1** (perdido / escaneo de QR)
5. Denunciar — vista resumida del wizard (versión corta)
6. Caso público — expediente

**Archivo 02 — Tiers y flujos**
7. Credencial **Tier 0** (identidad básica)
8. Credencial **Tier 0+** (con alerta médica)
9. Credencial **Tier 2** (libreta médica · vet)
10. Sheet **«Mostrar libreta»** (el dueño habilita Tier 2)
11–15. Denuncia — **wizard completo de 5 pasos**
16. Denuncia — éxito (código DEN-)
17. Denuncia — buscar por código
18. Denuncia — detalle público
19. Adopción — ficha pública de mascota
20. Adopción — postulación (form)
21. Adopción — postulación enviada (éxito)
22. Adopción — **Mis postulaciones** (seguimiento)
23. Refugio — perfil público
24. Transferir — **Paso 1 Tipo / Paso 2 Destinatario / Paso 3 Confirmar**
25. Transferencias **entre organizaciones** (bandeja)
26. **Reclamar** mascota (por chip — 4 resultados)

---

## About the Design Files
Son **referencias de diseño en HTML/React+Babel** (prototipos), **no** código de
producción para copiar literal. Renderizan con React 18 vía Babel-standalone y un
*design canvas* (pan/zoom) solo para revisión.

La tarea es **recrear estas pantallas en el codebase real** de miMAR
(**Next.js / React + TypeScript**, App Router — ver carpeta `dim/`), con sus
componentes, librerías y capa de datos. No incrustar el HTML ni portar el design canvas.
Las rutas y nombres usados acá son los del dominio real:
`/p/[token]` (credencial), `/adoptar/[petToken]` y `/adoptar/[petToken]/postular`,
`/denuncias/*`, `/denuncias/codigo/[code]`, `/mis-mascotas/reclamar`, sheets de
`transferir-mascota` y `mostrar-libreta`.

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciados, bordes e interacciones definidos.
Placeholders deliberados (reemplazar por lo real del codebase): **fotos** (trama
diagonal + caption), **mapas** (degradé + grilla CSS → proveedor real),
**QR** (no se dibuja; los `image-slot` y el QR salen del generador real).

## Reusa el sistema del Handoff #1
Tokens de color, tipografía, radios, sombras y los componentes base (masthead, fila de
registro, sheets, callouts, toggles, chips, sellos) son **idénticos** al handoff Owner.
Acá se documentan **solo los patrones nuevos** del tier público. Para los tokens
completos, ver `redesign-a.css` (`.dirA`) y el README del handoff #1.

### Tokens nuevos / específicos del público
Los archivos `redesign-a-public.css` y `redesign-a-public2.css` re-declaran los mismos
`--a-*` sobre `.pubwrap` (y `.dirA-sheetwrap` para las sheets), porque esas raíces viven
fuera de `.dirA`. **Si en el codebase los tokens son globales (en el theme), este
re-declarado no hace falta.** Valores idénticos al #1:
`--a-azul #0E5A99 · --a-paper #FBFAF5 · --a-ink #1B2A33 · --a-seal #A23A2C (rojo sello /
emergencia) · --a-ok #2E7D4F · --a-warn #B0771A · --a-rosa #B5497E`. Tipos: IBM Plex
Serif (títulos), Sans (UI), Mono (labels/códigos/fechas).

---

## CONCEPTO CLAVE — Tiers de la credencial pública
La credencial que aparece al **escanear el QR de la chapita** revela información en
*niveles (tiers)* según lo que el dueño decide mostrar. Es el eje del tier público:

| Tier | Cuándo | Qué muestra | Pantalla |
|---|---|---|---|
| **0** | siempre (default) | Identidad básica: especie, raza, sexo, edad, color, microchip, libreta. Botón «avisar al dueño» (notifica sin exponer contacto). | `CredTier0` |
| **0+** | si hay condiciones permanentes | Todo lo de Tier 0 **+ banner de alerta médica siempre visible** (diabetes, cardiopatía…) por seguridad del animal. | `CredTier0Plus` |
| **1** | `pet.status='lost'` | **Modo emergencia**: header rojo, última ubicación, señas, botones «Llamar al dueño» / «La vi». (Archivo 01.) | `PubCredencial` |
| **2** | habilitado por el dueño, temporal | Identidad **+ libreta médica** (vacunas vigentes con sellos, antiparasitario, esterilización, condiciones, medicación). El vet puede asentar eventos. | `CredTier2` |

El dueño habilita Tier 2 desde el sheet **«Mostrar libreta»** (`SheetMostrarLibreta`):
elige **duración** (24 h / 7 d / 30 d / siempre) y **qué incluir** (checklist), nunca
expone nombre/dirección/contacto. La regla de tiers debe vivir en la capa que resuelve
qué render de `/p/[token]` se sirve.

### Patrón visual de la credencial (mobile)
- Vive en un **marco de teléfono** (`.phone`): bezel oscuro 11px, status bar (9:41 + íconos),
  barra de URL (`mimar.gob.ar/p/…` con candado verde), home indicator. Es UI del prototipo
  para comunicar «esto se ve en el cel»; en el codebase es una página responsive normal.
- Tarjeta `.cred-card`: banda guilloché arriba, fila «oficial» (escudo + miMAR + chip de tier),
  foto 4:3, nombre serif + dot de estado, secciones con label mono.
- **Tier 0+**: `.cred-alert.is-crit` (rojo) o `.cred-alert` (ámbar) con ícono `fa-heartbeat`.
- **Tier 2**: filas `.cred-med` con ícono de estado + sello `Vigente` (verde) / `Por vencer`
  (ámbar); banda `.cred-enabled` «habilitado hasta DD/MM».

---

## Patrón: WIZARD multi-paso (denuncia)
Regla de producto del cliente: **enumerar siempre los pasos cuando son > 1.**

- **Denuncia = 5 pasos**, cada uno en marco de teléfono, con **stepper horizontal
  numerado** arriba (`.wiz-steps`): puntos 1–5, los completados en azul con check, el
  actual con halo, los pendientes en gris; debajo «Paso N de 5 · {etiqueta}».
- Pasos: **1** Qué pasó (tipos de maltrato, radio-cards) · **2** Gravedad (3 niveles
  con color) · **3** Dónde y cuándo (descripción + cuándo + dirección + mini-mapa) ·
  **4** Sobre quién (mascota/animal sin dueño/lugar — opcional, salteable) · **5** Cerrar
  (anónima vs con contacto).
- **Éxito**: código **DEN-XXXX-XXXX** monoespaciado en tarjeta, aviso «si fue anónima
  este código es la única forma de volver». Pantallas hermanas: **buscar por código** y
  **detalle público** (resumen + línea de tiempo del trámite + bloque «privacidad
  protegida» + marco legal Ley 14.346 / 25.326).
- Componentes: `WizSteps`, `DenWizard1..5`, `DenWizardOK`, `DenBuscar`, `DenDetalle`.

## Patrón: STEPPER en sheets (transferencia)
- **Transferir mascota = 3 pasos** con stepper en el header del sheet (`.dirA-stepper`):
  **Tipo** (a persona / a organización / devolver a refugio) → **Destinatario** (búsqueda
  + tarjeta de contraparte verificada + motivo) → **Confirmar** (resumen `.dirA-review` +
  banner «ventana de aceptación de 14 días» + toggle de consentimiento).
- La libreta completa viaja con el animal; el destinatario tiene **14 días** para aceptar;
  el titular original lo sigue siendo hasta la aceptación.
- **Entre organizaciones** (`OrgTransferInbox`): bandeja con **entrantes** (aceptar/rechazar,
  chip «expira en N días») y **salientes** (origen → destino, estado pendiente/aceptada).
- Componentes: `SheetTransfer1/2/3`, `OrgTransferInbox`.

## Patrón: formulario de una página con secciones numeradas (postulación)
- La **postulación de adopción** (`AdoptPostular`) es single-page (no wizard) pero las
  preguntas se numeran **01–04** (`.adopt-q-num`): por qué adoptás / experiencia /
  tipo de hogar / otros animales. Cierra con tarjeta de **contacto read-only** + submit.
  Banner: «tu contacto se comparte al enviar».

---

## Screens / Views (resumen accionable)

### Catálogos (`PubAdoptar`, `PubPerdidas`) — desktop
Shell público: `.pub-header` (escudo + miMAR + nav + Ingresar/Registrarme), guilloché,
`.pub-footer` azul-900 con marco legal. Hero con `.pub-h1` serif grande + énfasis azul.
Filtros (`.pub-filters` + quick-chips), grilla `.pub-grid` (auto-fill 264px) de
`.pub-petcard`. **Perdidas** suma banda roja de urgencia, KPIs en rojo sello, banderín
«Perdido/a», chip de tiempo (`data-u=critical/recent/medium/low`) y caja «Visto por
última vez».

### Ficha de adopción (`AdoptDetalle`) — desktop
Galería (hero 4:3 + 4 thumbnails), chips de rollup sobre la foto, identidad (nombre serif
34px + meta-chips), tarjetas **Sobre / Salud (rollups ✓/✗ + condiciones) / Personalidad
(chips por tono pos/neu/warn) / Refugio (verificado)**, **CTA sticky** abajo. Variantes
de estado en el código real: `default / not_authed / adopted / paused`.

### Mis postulaciones (`MisPostulaciones`) — desktop
Lista `.pub-trackcard` con barra de progreso (`.pub-trackprog`: Enviada → Revisión →
Entrevista → Resolución) y pill de estado (revisión/aceptada/rechazada).

### Perfil de refugio (`RefugioPerfil`) — desktop
Hero con banda institucional + logo, fila de stats (en adopción / adopciones / voluntarios
/ tiempo de respuesta), bio, y grilla de mascotas en adopción.

### Reclamar (`PubReclamar`) — desktop
Buscar por **microchip/tatuaje** (segmented), y **4 resultados** posibles: libre para
reclamar (CTA azul) · ya tiene dueño (callout ámbar → iniciar disputa) · existente y
**perdida** (callout rojo sello → iniciar devolución, privacidad coordinada por miMAR) ·
sin registro (registrar como nueva).

---

## Interactions & Behavior
Los prototipos son estáticos. Comportamiento esperado:
- **Tiers**: el render de `/p/[token]` depende de `pet.status` + flags de divulgación
  (Tier 2 on/off + qué incluir + vencimiento). Tier 0+ se activa solo si hay condiciones
  permanentes. La alerta médica **no** es ocultable.
- **«Avisar al dueño»** (Tier 0/0+): notifica al dueño sin revelar el contacto del que avisa.
- **Wizard denuncia**: navegación adelante/atrás conserva estado; paso 4 salteable; el
  «cuándo» y la gravedad alimentan la priorización del triage.
- **Transferencia**: crea una solicitud pendiente (14 días); cancelable mientras esté
  pendiente; al aceptar, cambia titularidad y reasocia toda la libreta.
- **Postulación**: valida mínimo de caracteres; al enviar comparte contacto y crea
  `POST-AAAA-NNNN` seguible desde Mis postulaciones.
- **Reclamar**: la rama depende del estado del registro del chip (libre/con dueño/perdida/
  inexistente). «Disputa» y «devolución» abren procesos moderados por gobierno/miMAR.
- Focus visible (halo celeste), hover = stripe/oscurecido, respetar `prefers-reduced-motion`.

## State Management
- `pet.status`: `ok | sick | lost | pregnant | deceased` (define modo de credencial).
- Flags de divulgación por mascota: tier-2 enabled, vencimiento, set de campos incluidos.
- Estado del wizard de denuncia (5 pasos) + modo de envío (anónimo / con contacto).
- Estado de transferencia: tipo, contraparte, motivo, pendiente/aceptada, deadline 14 d.
- Estado de postulación: respuestas + etapa (enviada/revisión/entrevista/resolución).
- Resultado de reclamo: rama según lookup del chip.

## Assets
- Tipografías: IBM Plex Serif/Sans/Mono (Google Fonts, vía `<link>`).
- Íconos: Font Awesome 4.7.0 (CDN) — mapear al set del codebase.
- Fotos / mapa / QR: placeholders → reemplazar por reales (`image-slot`, proveedor de
  mapas, generador de QR). Sin binarios en el bundle.

## Files
| Archivo | Contenido |
|---|---|
| `01 — Portada y catálogos.html` | Entry: portada, adoptar, perdidas, credencial Tier 1, denuncia (resumen), caso |
| `02 — Tiers y flujos.html` | Entry: tiers 0/0+/2, mostrar libreta, denuncia 5 pasos, adopción, transferencias, reclamar |
| `redesign-a.css` / `redesign-a.jsx` | Tokens base + helpers compartidos (`APhoto`, masthead) |
| `redesign-a-forms.css` / `redesign-a-forms.jsx` | Sheets, campos, `ASheetPet` (reusado por las sheets de transferencia/mostrar) |
| `redesign-a-public.css` / `redesign-a-public.jsx` | Shell público, catálogos, credencial Tier 1, caso, footer/header (`PubHeader`,`PubFooter`) |
| `redesign-a-public2.css` | Phone frame, tiers, wizard stepper, sheet stepper, claim, adopción, refugio, tracking |
| `redesign-a-public2.jsx` | Credencial tiers + denuncia wizard 5 pasos + buscar + detalle |
| `redesign-a-public3.jsx` | Adopción (ficha/postular/éxito) + Mis postulaciones + perfil de refugio |
| `redesign-a-public4.jsx` | Mostrar libreta + transferencias (3 pasos + org→org) + reclamar |
| `app-public.jsx` / `app-public2.jsx` | Entradas que montan los artboards en el canvas |
| `design-canvas.jsx` | Andamiaje de revisión (pan/zoom) — **no portar** |

### Orden de carga (importa, por el scope de Babel)
Las funciones top-level de cada script Babel quedan globales. El archivo 02 carga, en orden:
`design-canvas → redesign-a.jsx → redesign-a-forms.jsx → public.jsx → public2.jsx →
public3.jsx → public4.jsx → app-public2.jsx`. `redesign-a.jsx` debe ir **antes** de
forms.jsx porque define `APhoto`, que usa `ASheetPet`. (En el codebase con imports
explícitos esto deja de ser un tema.)

**Preview:** abrir cualquiera de los dos `.html` (requiere internet para fuentes/íconos).
Canvas con pan (arrastrar) y zoom; doble-click en un artboard para enfocarlo.
Clases bajo `.pubwrap` (páginas), `.phone` (mobile), `.dirA-sheetwrap` (sheets).
