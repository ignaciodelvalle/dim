# Benchmark de apps gubernamentales + notas para la landing — MiMAR

**Fecha:** 2026-07-04
**Propósito:** insumo de diseño para Claude design. Benchmark de registros de mascotas estatales, gov digital argentino, competidores privados y best-in-class de diseño gubernamental — sintetizado en un brief de landing **compatible con D8** (reusar y extender `app/page.tsx`, sin rediseño).

**Cross-refs vivos:**
- `handoff-2026-05-27.md` — D8 y P4-1 (spec original de la landing)
- `pendientes-2026-05-27.md` §1.4 — estado del pendiente
- `mimar-business-model-canvas.md` — posicionamiento vs VetCard
- `C:\dev\dim\app\page.tsx` — **P4-1 ya está implementado** (hero 3-CTA, explainer 3 pasos, 4 theme blocks, quiet links, nota legal). Este doc propone *enriquecimientos*, no reconstrucción.

**Método:** 4 streams de research en paralelo con visitas reales a los sitios (2026-07-04). Fuentes al final de cada sección.

---

## 0. Dos datos estratégicos que salieron del research (leer primero)

1. **VetCard opera en `vetcard.pet`, no `vetcard.com.ar`** (corregir en el BMC). Más importante: además del wallet-pass B2C, **ya pilotea con la Municipalidad de Concordia** (clínicas veterinarias públicas). El play B2G que MiMAR planea con Mendoza ya tiene un competidor ejecutándolo a escala municipal.
2. **CABA lanzó en abril 2026 la nueva web "Animales BA"** — reportar perdidas, adopción y servicios veterinarios, con registros obligatorios. Un gobierno subnacional ya construyó una versión parcial de MiMAR. Refuerza la urgencia del piloto Mendoza y el ángulo *federal* (Animales BA es solo CABA, SPA, estética BA — no Poncho).

---

## 1. Registros de mascotas gubernamentales (peers directos)

### 1.1 Chile — Registro Nacional de Mascotas (registratumascota.cl, Subdere, Ley 21.020)

El peer más cercano. Portal + registro en uno, login con ClaveÚnica.

**Lo mejor:**
- **Contadores en vivo como señal de confianza**: "3.441.135 animales de compañía registrados / 2.445.475 responsables registrados". El elemento más persuasivo de todo el benchmark: comunica "esto es real y todos lo usan".
- **"Consultas de Animales Encontrados" en el nav principal** — path público sin login para quien encontró un animal, separado del flujo de dueño. Acepta chip ISO 11784 o un código alternativo del sistema para animales sin chip (detalle de inclusividad).
- **El patrón ficha de ChileAtiende** (ficha 53562): Descripción → Requisitos → Documentos → Pasos → Marco legal, cada uno expandible, + teléfono de ayuda con **código de trámite citable**, PDF descargable de la página y recordatorio .ics. Modelo para las páginas por-servicio de MiMAR (calza con el patrón `SuccessScreen` + código citable que MiMAR ya usa).

**Anti-patrones que exhibe:** hero carousel de 3 slides con el mismo CTA (nadie lee el slide 3); un modal de "marcha blanca 2018" todavía en producción (¡8 años!); requisitos como PDFs en vez de HTML; links muertos; string de build visible en el footer; todo gated por login salvo la consulta de encontrados.

### 1.2 España — REIAC + RIAC regionales (reiac.es, colvema.org/riac)

Sistema federado de 19 bases regionales; el registro estatal de la Ley 7/2023 sigue sin portal 3 años después — **"registro nacional unificado" es la promesa incumplida en España, y es exactamente lo que MiMAR vende**.

**Lo mejor:**
- **La homepage de REIAC ES un buscador de chip** — input + "Enviar" y dos links grandes: **"Perdí un animal ¿qué hacer?" / "Encontré un animal ¿qué hacer?"**. Segmentación por *situación*, no por persona.
- **Indirección de privacidad**: la búsqueda pública devuelve solo *en qué* registro regional está el animal, nunca datos del dueño.
- **COLVEMA (Madrid): tres puertas de acceso** — titulares / organismos y fuerzas de seguridad / profesionales autorizados. Mapea 1:1 al split dueño/vet/gobierno de MiMAR.
- **Campaña QR de COLVEMA**: quien escanea la chapita ve el contacto del dueño **solo si el dueño activó esa visibilidad** — exactamente el modelo de tiers de MiMAR, con el opt-in explicitado en el copy.
- Script claro para "encontré una mascota": andá a un vet / Policía Local / protectora a que lean el chip — instrucciones de fallback offline.

**Anti-patrones:** REIAC parece abandonado (© 2019); fragmentación que obliga al dueño a saber en cuál de 19 registros está.

### 1.3 Uruguay — RENAC (gub.uy / snig.gub.uy)

**El anti-benchmark**: legalmente sólido, experiencialmente ausente. Sin hero, sin explicación de por qué registrar, directorios críticos como PDFs, la consulta pública es un form GeneXus crudo en otro dominio (el sistema de trazabilidad ganadera), y permite buscar por CI del dueño (dudoso en privacidad). Registro solo vía vets acreditados — cero self-service del dueño.

**Rescatable:** el estado del animal en el registro público incluye **EXTRAVIADO** con log de eventos (versión mínima del state machine de perdidas de MiMAR); el directorio de vets acreditados por departamento (MiMAR debería renderizar su red de vets verificados como directorio buscable, nunca PDF).

### 1.4 Nueva Zelanda — National Dog Database (DIA)

Base nacional **cerrada** operada por councils: el público no puede consultar nada. Resultado: apareció un registro privado paralelo (animalregister.co.nz) a llenar el hueco. Lección: si el registro estatal no tiene superficie pública, el mercado la crea.

**Rescatable — la mejor FAQ del benchmark:** manejo de objeciones con evidencia citada. "¿El chip puede 'moverse' dentro del perro?" respondido con un estudio del British Journal of Small Animal Practice (165 migraciones en 2,3M implantes); costos desglosados ítem por ítem; "¿quién ve mis datos?" respondido con nombres de roles concretos. MiMAR debería responder "¿le duele el chip?", "¿cuánto cuesta?" (gratis), "¿quién ve mis datos?" con números y citas.

### 1.5 Reino Unido — gov.uk + Petlog

- **gov.uk "Get your dog or cat microchipped"**: título verbal, obligación y multa en las primeras 3 líneas ("You can be fined up to £500"), cero imágenes. Incluye una **advertencia anti-estafa** (emails falsos pidiendo plata para "registrar" la mascota, con link para denunciar phishing) — directamente relevante para Argentina, donde la estafa "encontré a tu mascota, transferime" es común. **Sumar nota anti-estafa al flujo de perdidas de MiMAR.**
- Checklist de "prueba de chip" al adquirir una mascota (pedí: certificado de chip, historial del vet) — módulo ideal para el flujo de adopción.
- **Petlog** (privado): lookup de chip como card principal de la homepage, 3 pasos de "cómo funciona", pero **paywallea la reunificación** (hotline y alertas solo en planes de £15–39/año). El anti-patrón "pagar para que te encuentren" es exactamente contra lo que MiMAR posiciona su "gratis para siempre".

**Fuentes §1:** registratumascota.cl · chileatiende.gob.cl/fichas/53562 · reiac.es · colvema.org/riac · gub.uy (RENAC) · snig.gub.uy/renac · dia.govt.nz · gov.uk/get-your-dog-cat-microchipped · petlog.org.uk

---

## 2. Gov digital argentino (el lenguaje al que MiMAR debe sonar nativo)

### 2.1 Mi Argentina — la referencia primaria

- **Fórmula de hero de una oración**: H1 = nombre del producto; subcopy = "Tu perfil digital ciudadano para gestionar trámites, sacar turnos, acceder a tus credenciales…". Sin marketing-speak. Palabras que marcan el registro: **fácil, segura, en un solo lugar, digital**. Un solo CTA primario ("Ingresá a Mi Argentina"); todo lo demás son links planos.
- **Voseo imperativo en todos los labels**: Descargá, Ingresá, Creá, Validá, Consultá. Los CTAs son verbos, nunca sustantivos.
- **Naming posesivo de secciones**: "Mis documentos", "Mis hijos", "Mi salud" — y el patrón "Asociá tus hijos a tu perfil" (hijos colgados del perfil del titular = mascotas colgadas del tutor en MiMAR).
- **Gating de identidad siempre visible**: "(\*) Sólo para usuarios con identidad validada" / "identidad validada Nivel 3". MiMAR ya tiene verificación DNI — usar la misma convención de asterisco.

### 2.2 La anatomía "credencial digital" (página de la licencia de conducir digital)

Este es **el template exacto para vender la credencial MiMAR**:
1. H1 + subcopy de una línea
2. CTA inmediato
3. **Cita normativa + frase de equivalencia legal**: "A partir del Decreto 196/2025… Ambas tienen la misma validez legal". El análogo MiMAR: **LSUCyF de FeVA validada por SENASA (memo 2023-15743890-APN-DCEA#SENASA)** como artefacto real que MiMAR digitaliza.
4. **Foto de la credencial misma** con caption
5. 3 pasos numerados (Descargá / Validá tu identidad / Accedé)
6. **Explainer del flujo de verificación QR**: "Al escanear el QR de tu licencia verifica su estado" — el QR-scan como mecánica canónica de confianza. Idéntico al Tier-0 de MiMAR.
7. Cards de cross-links + bloque de descarga

También clave la honestidad de límites: "tiene las mismas funciones que el DNI tarjeta, **excepto** para votar y viajar fuera del país". MiMAR debe declarar igual de claro qué vale y qué no vale su credencial hoy.

### 2.3 argentina.gob.ar — anatomía de trámite (Poncho)

- Secuencia fija de H2 en toda ficha: **¿A quién está dirigido? → ¿Qué necesito? → ¿Cómo hago? → ¿Cuál es el costo? → Vigencia** + bloque "Normativa" con links a InfoLEG + botón **"Iniciar trámite"** repetido al final. Los usuarios argentinos ya conocen este esqueleto — las páginas por-servicio de MiMAR deberían calcarlo.
- Anclas visuales verificadas: navy del header **#242C4F**, azul Poncho primario **#0072b8**, **Encode Sans**, footer estándar de 3 columnas (Trámites / Acerca de la República Argentina / Acerca de este sitio).
- Homepage = buscador de trámites primero, lista plana de tareas populares en voseo imperativo. Tipografía > ilustración.

### 2.4 Buenos Aires Ciudad — qué NO tomar

Animales BA usa el vocabulario correcto (**"tutores"**, "tenencia responsable") pero todo lo demás grita CABA: amarillo BA, tipografía Archivo, SPA con shell JS, footer de teléfonos de emergencia, flujos gated por cuenta miBA. Si MiMAR quiere leerse *nacional*, cero BA-ismos. (El vocabulario "tutor" ya lo adoptó MiMAR — bien.)

### 2.5 Patrón de anuncio de apps estatales

Página "/app" con: "Descargá la APP y creá tu cuenta" + lista "¿Qué necesitás?" + **pasos numerados 1–6 cada uno con screenshot del teléfono** + micro-ayuda inline. Cuando MiMAR empuje la PWA instalable, este es el formato.

**Fuentes §2:** argentina.gob.ar/miargentina (+/app, /servicios-disponibles, /servicios/licencia-digital) · argentina.gob.ar/servicio/dni-en-tu-celular · argentina.gob.ar/servicio/solicitar-certificacion-veterinaria-… (SENASA) · mascotas.senasa.gob.ar · github.com/argob/poncho · buenosaires.gob.ar · gcba.github.io/Obelisco-V2

---

## 3. Plataformas privadas (competencia + patrones)

### 3.1 VetCard (vetcard.pet) — el competidor nombrado

Libreta sanitaria como **pass de Google/Apple Wallet, "sin app"**. El vet escanea el QR en la consulta y actualiza; gratis para tutores; sin página de precios (¿quién paga? — hueco de credibilidad). Badges TÜV ISO 9001 + registro AAIP de bases de datos.

**Su mejor copy:** hero "La libreta sanitaria de tu mascota, siempre con vos." + **"Sin app. Sin papeleo. Todo en tu wallet."** — objection-kill de tres frases. CTA dual "Registrar mascota" / "Soy veterinario". Testimonial de emergencia excelente ("Milo mordió a un ciclista y la antirrábica vive en mi celu").

**Debilidades confirmadas para posicionar en contra:**
- **Read-mostly para el tutor**: el registro solo se actualiza cuando *tu* vet adopta VetCard — el cuello de botella "construida alrededor de los vets" que el BMC ya identifica. Cold-start puro.
- **Sin capa cívica**: no perdidas, no adopción, no denuncias, no perfil QR público para quien encuentra la mascota (su QR es mecánica de escaneo del vet).
- Closed source, buzzword blockchain, sin números de tracción ni mapa de vets adheridos.
- El diferencial del BMC se puede extender: *"construida con los vets"* → *"construida con los vets, los municipios y las protectoras"*.

**Robar:** el mock de credencial en el hero; el objection-kill de 3 frases (versión MiMAR: **"Gratis. Sin papeleo. Código abierto."**); el badge AAIP; la FAQ "¿Qué pasa si pierdo el teléfono?".

### 3.2 Petco Love Lost — el mejor UX de perdidas del mundo

- Hero: "We're here to help you find your pet." + exactamente dos botones: **"I Lost a Pet" / "I Found a Pet"**. La persona en crisis recibe una bifurcación binaria above the fold. Nada más compite.
- **Búsqueda por foto sin login** (AI matching); cuenta solo para mensajear.
- Social proof = **muro de historias de reencuentro** con nombres ("Sweetie + Ivelis") — el producto se demuestra por resultados, no por screenshots.
- **Bloque de conversión pre-crisis**: "Sign up *now* in case they go missing *later*" — convierte al visitante que no está en crisis. El análogo MiMAR: "Registrala hoy, antes de que se pierda."

### 3.3 PetHub — la chapita QR original

- Utility bar persistente: **"REPORT A FOUND PET" / "ACTIVATE A NEW TAG"** — crisis y activación a un click desde cualquier página.
- **Lookup inline en la homepage**: tipeás el ID de la chapita y "Fetch!" — el flujo de encontrado funciona sin login ni navegación. Análogo MiMAR: pegá/escaneá un código `DIM-XXXX-XXXX` en la landing y ves el perfil público al instante.
- **La estadística asesina**: "96% of PetHub recovered pets are home in 24 hours or LESS." Concreta, memorable, de resultado. MiMAR debería instrumentar su métrica equivalente desde el día uno.
- Vende licencias municipales de mascotas (pethub.solutions) — validación del modelo B2G.

### 3.4 11pets — el anti-patrón

Landing de "50+ features" con copy B2B pegado por error en cards de consumidor. Lección directa para MiMAR (que tiene aún más superficie): **liderar con la credencial y bifurcar los flujos de crisis; jamás listar features**. Única idea rescatable: su pitch de sharing granular ("elegí qué datos, de qué mascota, con quién y por cuánto tiempo") — narrativa fuerte para los tiers de privacidad.

### 3.5 LATAM privados

Registros QR privados (PetLat Colombia, cluster chileno: Registro Animal Chile, Petfind, Bitpet) con branding pseudo-oficial deliberado para tomar prestada confianza estatal — algunos con contadores animados rotos en 0 (PetLat), templates Elementor, claims sin evidencia. **MiMAR puede reclamar legítimamente la confianza que estos imitan.** Regla derivada: nunca mostrar contadores en cero o inventados — un contador honesto vale más que cuatro falsos.

**Fuentes §3:** vetcard.pet · petcolove.org/lost · pethub.com · 11pets.com · petlatdigital.com · registroanimalchile.cl · petfind.cl + prensa del lanzamiento VetCard (Cadena 3, Concordia24, Despertar Entrerriano)

---

## 4. Best-in-class de diseño gubernamental

### 4.1 GOV.UK — la gramática de página de servicio

- **Start page**: breadcrumb → H1 verbal → lede de una oración → "How long it takes" → "Before you start" (qué necesitás + costo exacto: "£13.50 cheaper online") → **UN solo botón "Start now"** (verde #00703c, flecha, full-width mobile) → "Other ways to apply" DESPUÉS del CTA → related content. Regla documentada: *"si necesitás un segundo call to action, usá un link estándar"* — valida el patrón "quiet links" que MiMAR ya tiene.
- Regla del pattern "Start using a service": **la elegibilidad compleja se pregunta adentro del servicio, no en la landing**.
- Step-by-step navigation: pasos numerados expandibles con línea vertical conectora; solo texto esencial por paso; validado en 8 rondas de research con usuarios de baja alfabetización digital. Reproducible trivialmente con tokens Poncho.
- Homepage sin una sola imagen hero: search + lista de tareas populares + cards tipográficas.

### 4.2 login.gov — el landing 3-personas más limpio

- **Banner oficial arriba de todo**: bandera + "An official website of the United States government" + disclosure expandible **"Here's how you know"**. El dispositivo de confianza más copiado del gov digital.
- H1: "The public's one account for government." Sección **"Login.gov is for you"** con exactamente 3 bloques H3 — Individuals / Agency partners / Agency developers — cada uno con 1-2 oraciones de beneficio y **UN CTA propio con verbo distinto** que rutea a sub-sitios distintos. Es el hero 3-CTA de MiMAR, resuelto.

### 4.3 e-Estonia — cómo se MARKETEA un producto digital estatal

- **Banda de contadores directamente bajo el hero**: número gigante + label chico ("99% Estonian residents have ID card"), siempre con fuente y año citados.
- Fila de 3 personas después de los stats; quotes de prensa (NYT, Forbes, Wired).
- Footer que **nombra la institución pública responsable** incluso en el sitio de marketing ("Managed by the Estonian Business and Innovation Agency…"). MiMAR: línea equivalente cuando haya convenio ("Operado por … en convenio con …").

### 4.4 gob.mx + LifeSG

- gob.mx: **la uniformidad como confianza** — todas las fichas de trámite de todas las agencias comparten esqueleto idéntico (mandado por norma técnica). Los 4 theme blocks de MiMAR deben abrir a páginas con esqueleto idéntico.
- LifeSG (Singapur): servicios organizados por **momentos de vida**, no por sistemas. Los 4 theme blocks son momentos de vida de una mascota — nombrarlos como momentos ("Se perdió mi mascota", "Vi un caso de maltrato"), no como módulos ("Módulo de denuncias").

**Fuentes §4:** gov.uk (+/apply-renew-passport) · design-system.service.gov.uk (start-using-a-service, step-by-step-navigation) · login.gov · e-estonia.com (+/facts-and-figures) · gob.mx/wikiguias (norma del Formato Único; el sitio bloquea fetch — confianza media) · tech.gov.sg/LifeSG

---

## 5. Brief de landing para Claude design (D8-compliant)

**Premisa:** `app/page.tsx` ya implementa P4-1 (hero 3-CTA, explainer, 4 blocks, quiet links, nota legal). Todo lo que sigue es *extender*, en orden de impacto. Ningún ítem contradice D8.

### L1 — 🔴 Bifurcación de crisis + lookup público (el gap más grande) — Esfuerzo M

Hoy "Buscá mascotas perdidas" y compañía son quiet links al fondo. El benchmark es unánime (REIAC, Petco, PetHub, Chile): **la persona que encontró o perdió una mascota es EL visitante anónimo de mayor valor y hoy no tiene entrada visible**.

- Nueva banda entre el hero y el explainer (o bajo los 3 CTAs): dos entradas grandes por *situación* — **"Perdí mi mascota"** → flujo de reporte / login-intent · **"Encontré una mascota"** → instrucciones + lookup.
- **Lookup inline estilo PetHub**: input para código `DIM-XXXX-XXXX` (o chip a futuro) → perfil público Tier-0 sin login. Reusar la infra de `/p/[publicToken]`.
- Respeto de tiers estilo REIAC/COLVEMA en el copy: "vas a ver solo lo que el tutor decidió compartir".
- Incluir la **nota anti-estafa** (patrón gov.uk) en el flujo de perdidas: "MiMAR nunca te va a pedir dinero para recuperar tu mascota."

### L2 — 🔴 Preview de la credencial con QR demo — Esfuerzo S

Patrón licencia-digital + VetCard: **mostrar la credencial misma**. Render del componente real de credencial (no screenshot) con un QR escaneable que abre un perfil público de demo. Ningún competidor tiene demo interactiva — y MiMAR ya tiene el componente construido. Ubicación: dentro del theme block "¿Qué es la credencial?" expandido, o como visual del hero en desktop.

### L3 — 🟡 Microcopy objection-kill + prerequisitos — Esfuerzo XS

- Sumar bajo el subcopy del hero la tríada estilo VetCard: **"Gratis. Sin papeleo. Código abierto."** (o "Gratis para siempre" — decisión de copy).
- En el explainer paso 1, patrón GOV.UK "Before you start": "Necesitás: un email y una foto de tu mascota. Es gratis. Tarda menos de un minuto." (el "menos de un minuto" ya está — sumar el "es gratis" y el "qué necesitás").
- Declarar límites con honestidad Mi Argentina-style cuando aplique: qué vale la credencial hoy y qué no (pre-homologación).

### L4 — 🟡 Banda de confianza — Esfuerzo S

- **Fila de badges**: Ley 14.346 + Ley 25.326 (ya en la nota legal — elevar), registro AAIP cuando exista (patrón VetCard), open source con link al repo (diferencial del BMC), provenance UTN/CONAISSI.
- **Phase banner beta** (patrón GOV.UK): "MiMAR está en beta — tu opinión nos ayuda a mejorar" + link de feedback. Inocula contra bugs percibidos y suena a gov digital moderno.
- **Contadores estilo Chile/e-Estonia — SOLO cuando haya números reales** (mascotas registradas, reencuentros, vets verificados). Regla férrea anti-PetLat: nunca contadores en 0 ni inflados. Los KPIs de P4-3 pueden alimentar esto.
- A futuro (convenio firmado): línea de institución responsable estilo e-Estonia + franja "sitio oficial" estilo login.gov con disclosure "¿Cómo lo sé?".

### L5 — 🟡 Ajustes al hero 3-CTA existente — Esfuerzo XS

La implementación actual ya sigue la regla login.gov/GOV.UK (un solo botón sólido: "Soy dueño"; los otros dos outline) — **confirmado correcto, no tocar la jerarquía**. Ajustes menores:
- Considerar el patrón "es para vos" de login.gov: una oración de beneficio por persona además del label ("Credencial, libreta y alertas para tus mascotas" / "Gestión de intake, tránsito y adopciones" / "Dashboards epidemiológicos por jurisdicción").
- Subcopy del hero: la fórmula Mi Argentina ya está bien lograda ("La credencial digital de salud para tu mascota…"). Alternativa a A/B-ear con verbos: "Identificá, cuidá y encontrá a tu mascota."

### L6 — 🟡 Theme blocks como momentos de vida — Esfuerzo XS

Renombrar títulos de sistema → momento (patrón LifeSG): "¿Cómo reportar una mascota perdida?" → **"Se perdió mi mascota"** · "¿Cómo denunciar maltrato?" → **"Vi un caso de maltrato"**. Mantener esqueleto idéntico entre los 4 (uniformidad gob.mx — ya cumple). Cada block debe abrir a una ficha con el esqueleto argentina.gob.ar (¿A quién está dirigido? / ¿Qué necesito? / ¿Cómo hago? / Costo / Normativa / CTA).

### L7 — 🟢 FAQ de objeciones con evidencia — Esfuerzo S

Patrón NZ DIA: 5-8 preguntas reales con respuestas citadas — "¿Cuánto cuesta?" (gratis, y quién financia), "¿Quién ve los datos de mi mascota?" (explicar tiers con nombres de roles), "¿Necesito microchip?" (no — QR primero), "¿Reemplaza la libreta de papel?" (honestidad de límites), "¿Qué pasa si me roban el teléfono?". Ubicación: entre theme blocks y quiet links, accordion Poncho.

### L8 — 🟢 Footer completo — Esfuerzo XS

Ya previsto en P4-1. Confirmar patrón 3 columnas argentina.gob.ar + fila legal (Términos, Privacidad, **Accesibilidad como página real**, Contacto) + línea de licencia open source (el eco del "© Crown copyright / Open Government Licence").

### Anti-patrones prohibidos (síntesis del benchmark)

1. Hero carousel (Chile) — un mensaje, un CTA dominante.
2. Contadores falsos, en cero o sin fuente (PetLat).
3. Banners/modales de anuncio hardcodeados que envejecen (el "marcha blanca 2018" de Chile).
4. Directorios o requisitos como PDF (Uruguay) — todo HTML buscable.
5. Landing de lista-de-features (11pets) — MiMAR tiene más superficie que nadie; liderar con la credencial y bifurcar por situación.
6. Página donde el anónimo no puede hacer *nada* sin login (NZ, Chile parcial) — el lookup y la denuncia anónima deben funcionar desde la landing.
7. Funcionalidad de reunificación paga (Petlog) — "gratis para siempre" es posicionamiento, decirlo explícito.
8. BA-ismos (amarillo, Archivo, SPA shell) si el objetivo es leerse nacional/Poncho.
9. Marketing-speak y superlativos — el registro gov argentino es una oración declarativa + listas + voseo imperativo.
10. Eligibilidad compleja en la landing (regla GOV.UK) — se pregunta dentro del wizard.

### Orden de ejecución sugerido

| # | Item | Prio | Esfuerzo | Toca |
|---|---|:---:|:---:|---|
| L3 | Microcopy objection-kill | 🟡 | XS | copy en `page.tsx` |
| L5 | Ajustes hero 3-CTA | 🟡 | XS | copy en `page.tsx` |
| L6 | Theme blocks como momentos | 🟡 | XS | copy en `page.tsx` |
| L1 | Crisis fork + lookup público | 🔴 | M | componente nuevo + reusa `/p/[token]` |
| L2 | Credencial preview + QR demo | 🔴 | S | reusa componente credencial + seed demo |
| L4 | Banda de confianza + phase banner | 🟡 | S | componente nuevo |
| L7 | FAQ accordion | 🟢 | S | componente nuevo |
| L8 | Footer completo | 🟢 | XS | ya previsto P4-1 |

### Decisiones abiertas para Nacho

1. **L1**: ¿el lookup acepta solo código DIM o también chip de 15 dígitos desde el día uno? (el claim por chip es P3-1 — coordinar).
2. **L2**: ¿credencial demo con mascota ficticia seedeada en prod, o render estático? (recomendado: seed real — la demo interactiva es el diferencial).
3. **L3**: ¿"Código abierto" merece estar en el hero, o es señal para audiencia técnica que va mejor en la banda de confianza? (recomendado: banda de confianza).
4. **L4**: ¿phase banner "beta" sí o no? Suena honesto pero puede debilitar el pitch B2G en demos a gobierno. (alternativa: mostrarlo solo fuera de rutas `/gob`).
5. Corregir `vetcard.com.ar` → `vetcard.pet` en el BMC y sumar el dato del piloto Concordia + Animales BA a la sección de competencia.
