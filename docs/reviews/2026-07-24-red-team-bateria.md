# Batería adversarial — red team local (2026-07-24)

**Filosofía**: no son click-paths guionados. Son **personas reales con problemas reales que necesitan
resolverse**, ancladas en datos que HOY existen en la DB local. Para cada una: quién sos, qué
necesitás lograr (no cómo), con qué datos arrancás, y las 4 lentes de evaluación —
**¿funciona? · ¿resuelve el problema? · ¿se ve bien? · ¿la experiencia genera confianza?**

**Entorno** (precalentado y validado): http://localhost:3000 · build `1f6b9abe` · todas las cuentas
`Test1234!`. El entorno está fresco y estable — si algo falla al navegar, es un hallazgo, no ruido.
Rate-limit de `/login` se esquiva rotando `x-real-ip` si scripteás.

**Regla de oro del red team**: buscá dónde el producto te MIENTE, te FRENA, o te hace DUDAR. Un
número sin contexto, un botón que no hace lo que dice, una pantalla que parece rota cuando no lo
está, una acción que un funcionario no se animaría a tomar sin segundo par de ojos — todo cuenta.

---

## PERSONA 1 — Funcionaria de gobierno con mandato MIXTO
**Cuenta**: `govt@dim.test` · **Mandato real**: Ushuaia (TdF) + El Calafate (Santa Cruz) + Palermo (CABA).
Es el caso más adversarial del sistema: TRES provincias distintas, con marcos legales distintos.

### 1.1 — "¿Cuál es mi problema más urgente esta mañana?"
Sos jefa de zoonosis. Entrás al Panel (`/gob`) con 15 minutos antes de una reunión.
- **Datos reales**: 1.135 denuncias de bienestar abiertas, 1.263 casos abiertos, 1 aprobación
  pendiente, 1 disputa de custodia. En Palermo hay 12 denuncias abiertas + 1 en triage.
- **El problema**: necesitás saber, sin pensar, qué requiere TU acción HOY y qué puede esperar.
- **Evaluá**: ¿El panel te da una respuesta en 3 segundos o es un segundo sitemap? ¿La "cola
  operativa" te ordena por lo accionable o te muestra bandejas en cero primero? ¿Las alertas
  priorizadas linkean al caso exacto? **Adversarial**: ¿hay algún número en el panel que no puedas
  explicar de dónde sale? ¿Alguna alerta contradice un KPI de la misma pantalla?

### 1.2 — "¿Puedo confiar en el número de cobertura antirrábica que voy a llevar a la reunión?"
- **Dato real y CRUDO**: hay 48.315 vacunas antirrábicas registradas, de las cuales **solo 42
  están firmadas por un veterinario matriculado** (0,09%). El resto es auto-declarado por dueños.
- **El problema**: si llevás "cobertura X%" a un ministro y es 99,9% auto-declarada, es un
  problema. El sistema debería decírtelo SIN que preguntes.
- **Evaluá** (`/gob` tile de cobertura antirrábica): ¿Ves el doble lente Declarado | Firmado?
  ¿Es honesto sin ser alarmista? ¿Entendés la diferencia sin abrir el ⓘ? **Adversarial**: ¿el
  número grande engaña? ¿el "firmado" queda escondido?

### 1.3 — "Un caso de mordedura en Ushuaia — ¿qué ley aplica?"
- **El problema**: tu mandato cruza CABA, TdF y Santa Cruz. Una cita legal de "Ley CABA 5470" al
  lado de un caso de Ushuaia te hace dudar de TODO el encuadre legal.
- **Evaluá** (`/gob/vigilancia`, `/gob/mortalidad`, alertas): ¿Las citas legales están badgeadas
  por jurisdicción ("CABA: Ley 5470")? ¿Se distingue lo nacional (Ley 22.953, sin badge) de lo
  provincial? **Adversarial**: ¿alguna cita provincial aparece SIN badge, como si aplicara a las
  tres provincias?

### 1.4 — "Filtré por Palermo — ¿el sistema es coherente sobre qué estoy viendo?"
- **El problema**: aplicás un filtro de provincia/localidad. Todo — el chip activo, el select, el
  caption de alcance, los mapas — debe contar la MISMA historia.
- **Evaluá**: filtrá y verificá coherencia entre el chip de filtro, el select, el caption "Vista:
  … · filtro activo", y qué pintan los mapas. **Adversarial**: ¿el chip dice una cosa y el select
  otra? ¿el mapa muestra datos fuera de tu filtro? ¿un mapa nacional trunca en silencio (mostrá
  el caption "conteos absolutos" / "datos precalculados al…" / "capas al tope")?

---

## PERSONA 2 — Administrador de plataforma (superadmin)
**Cuenta**: `admin@dim.test` · vista universal, portal `/admin`.

### 2.1 — "¿La plataforma está sana o está en llamas?"
- **El problema**: un admin que ve rojo permanente aprende a ignorar las alarmas — peligroso
  cuando hay una real.
- **Evaluá** (`/admin`, `/admin/sistema`): ¿el estado de crons/colas/SLA distingue "pausado a
  propósito / entorno demo" de "roto de verdad"? ¿La bandeja de salida es accionable
  (reintentar/asignar) o es un badge escarlata permanente? **Adversarial**: ¿algo grita crisis
  sobre datos de demo?

### 2.2 — "909 casos, mostrando 50 — ¿esto escala?"
- **Dato real**: 1.263 casos abiertos a nivel nacional.
- **El problema**: a escala nacional (100M mascotas) un "mostrando los 50 más recientes de N" es
  un modelo mental que se rompe. ¿Es una cola de trabajo (asignado/sin asignar/en breach) o un
  volcado?
- **Evaluá** (`/admin/casos`): ¿Podés responder "¿cuáles son MÍOS?" o "¿cuáles están en breach?"?
  **Adversarial**: ¿el "50 de 1.263" se siente arbitrario e irrendible de cuentas?

### 2.3 — "Un refugio pide verificación — ¿tengo lo que necesito para decidir?"
- **Dato real**: `DIM-WBQR-VD76` "Refugio Pendiente Verificación" (Recoleta, verified=false) +
  1 aprobación pendiente en la cola.
- **Evaluá**: encontrá la solicitud, ¿tenés contexto suficiente para aprobar/rechazar con
  fundamento? ¿La acción es reversible/auditada? **Adversarial**: ¿aprobar es un solo click sin
  fricción para un acto institucional?

---

## PERSONA 3 — Veterinaria de clínica (Clínica Recoleta)
**Cuenta**: `alejo@dim.test` (admin de la clínica `DIM-FQS9-5PKZ`) o `vet@dim.test` (matriculado).

### 3.1 — "Entra un perro a la consulta — quiero firmar la vacuna en su libreta"
- **Dato real**: Rocco `DIM-DEMO-0001` (de owner@dim.test, activo). Es el flujo CORE de la clínica.
- **El problema**: el dueño te muestra la credencial; vos cargás el evento clínico. Este es EL
  trabajo de la clínica — no puede fallar en silencio.
- **Evaluá** (`/org/<clinicToken>/atender`, ingresá `DIM-DEMO-0001`): ¿Resuelve a la mascota +
  formulario, o se queda mudo? ¿Ves "Mascota encontrada — abriendo la libreta…"? ¿El dueño recibe
  notificación de que firmaste un evento? **Adversarial**: probá un token inválido, uno inexistente,
  y volvé-atrás + reintentá el mismo → ¿siempre hay feedback, nunca un no-op mudo?

### 3.2 — "Mi rail de clínica — ¿me muestra MI trabajo o el de un refugio?"
- **El problema**: una clínica no gestiona tránsitos ni voluntarios. Su nav debe ser más liviano
  que el de un refugio.
- **Evaluá** (rail de `/org/<clinicToken>`): ¿aparece la agenda cerca del Panel (trabajo diario de
  clínica)? ¿el resto está bajo "Administración" colapsada? ¿NO aparecen ítems de refugio
  (Tránsitos/Voluntarios/Postulaciones)? **Adversarial**: ¿algún ítem lleva a un dead-end sin H1?

### 3.3 — "Registré una muerte por error — ¿cómo la revierto?"
- **El problema**: registraste `death_recorded` en la mascota equivocada. HOY no hay salida de
  producto (solo psql). Esto es un gap CONOCIDO con spec escrita (`death_voided`, Ola ES).
- **Evaluá**: intentá corregir/revertir. **Documentá** que hoy NO se puede desde la UI — validá
  que el gap del spec es real y que la mascota queda bloqueada para toda edición.

---

## PERSONA 4 — Ciudadano/dueño (calle + libreta)
**Cuentas**: `owner@dim.test` / `carla@dim.test` · mascotas Rocco, Negro, Greta, Bianca.

### 4.1 — "Me encontré un perro perdido en la calle — escaneo el QR"
- **Dato real**: Luna `DIM-S005-PLRM` (perdida, Palermo) — o cualquier perdida. Sos un vecino,
  sin cuenta, con el celular.
- **El problema**: escaneás → necesitás UNA acción obvia. "La tengo conmigo" / "la vi acá" /
  llamar. Contenido sin acción falla en la calle.
- **Evaluá** (`/p/DIM-S005-PLRM` en **mobile 390px**): ¿hay un CTA primario sticky claro? ¿El
  verbo corresponde al estado (perdida → reportar/contactar)? ¿Podés ayudar sin exponer tu
  identidad? **Adversarial**: ¿el CTA se pierde? ¿te pide login para algo que debería ser sin
  cuenta?

### 4.2 — "Escaneo la credencial de Bruno — pero Bruno está en disputa de custodia"
- **Dato real**: `DIM-BRUNO-DEMO`, in_custody_dispute=true. Dueña actual noeli@ vs reclamante graciela@.
- **El problema DELICADO**: si Bruno aparece como mascota normal del dueño actual, y vos como
  finder contactás a ese dueño, el sistema toma partido en una disputa legal.
- **Evaluá** (`/p/DIM-BRUNO-DEMO`, mobile): ¿Ves un banner neutral "Titularidad en revisión por la
  autoridad"? Si estuviera en modo perdido, ¿se SUPRIME el contacto del dueño disputado?
  **Adversarial**: ¿se filtra teléfono/nombre del dueño en disputa por algún lado?

### 4.3 — "Abro mi app — quiero ver a MI mascota, no un menú de ministerio"
- **El problema**: el home del dueño debe abrir con TU mascota (foto, cumplimiento, acciones), no
  con un header institucional sobre un cuerpo vacío.
- **Evaluá** (login owner@ → `/inicio`): ¿aterrizás en la credencial/libreta de tu mascota? ¿El
  footer legal está colapsado ("Acerca de miMAR")? Si tenés varias, ¿carrusel? **Adversarial**:
  ¿el producto se esconde detrás del chrome?

### 4.4 — "Quiero entender qué me falta para estar 'al día' con Rocco"
- **Dato real**: Rocco `DIM-DEMO-0001`. El cumplimiento se muestra como "N de M al día".
- **El problema**: un contador "0 de 3" sin decir CUÁLES 3 genera ansiedad, no acción.
- **Evaluá** (libreta de Rocco, mobile): ¿las 3 obligaciones están nombradas con un CTA cada una
  (agendar vacuna, declarar chip, completar ficha)? ¿En mobile están a un tap detrás del
  desplegable "Obligaciones"? **Adversarial**: ¿el "N de M" avergüenza sin enseñar?

---

## PERSONA 5 — Refugio (jefe de turno)
**Cuenta**: `orgadmin@dim.test` (Refugio) o el refugio `DIM-A9PJ-B5T7` (Refugio Test, La Plata).

### 5.1 — "Empieza mi turno — ¿qué necesito hacer HOY?"
- **El problema**: un jefe de turno necesita ingresos/custodia/adopciones de HOY, no un ERP de 18
  ítems.
- **Evaluá** (rail del refugio): ¿ves 5 jobs (Ingresos, Custodia, Postulaciones, Casos, Equipo) +
  "Administración" colapsada? ¿El rail no es más largo que el primer viewport de contenido?
  **Adversarial**: ¿algún label miente sobre su destino (ej. "Operaciones" que abre "Postulaciones")?

### 5.2 — "Reportar una mordedura" y "revisar denuncias"
- **Evaluá**: el ítem de mordeduras, ¿va a una lista/inbox o directo al formulario de alta (riesgo
  de cargas equivocadas)? Los estados vacíos de las bandejas, ¿usan el componente compartido o
  texto pelado? **Adversarial**: buscá inconsistencias de componentes entre pestañas hermanas.

---

## PERSONA 6 — Datos abiertos / auditor externo (sin login)
**Sin cuenta** · `/transparencia`, `/privacidad`, mapas públicos.

### 6.1 — "¿Qué afirma miMAR sobre cumplimiento legal de datos?"
- **El problema RECIÉN corregido**: la página de privacidad afirmaba cumplir el registro AAIP/DNPDP
  sin inscripción. Se sacó.
- **Evaluá** (`/privacidad`): ¿La política es honesta sobre qué se hace y qué no? ¿Nombra Tier 2,
  enlaces de libreta, búsqueda de autoridad por DNI, datos abiertos? **Adversarial**: buscá
  cualquier afirmación de compliance que no pueda respaldarse.

### 6.2 — "Los mapas públicos, ¿son honestos sobre lo que muestran?"
- **Dato real**: Palermo ahora tiene 12+ denuncias (supera k-anon).
- **Evaluá** (`/perdidas`, mapas de `/transparencia` si existen): ¿Los mapas bajo supresión k-anon
  dicen "detalle protegido — N en el agregado" en vez de quedar grises mudos? ¿La leyenda de
  burbujas graduadas se ve (era blanco-sobre-blanco)? ¿Las coropletas dicen "conteos absolutos, no
  es tasa"? **Adversarial**: ¿algún mapa parece vacío/roto cuando en realidad hay supresión o cero
  honesto ("sin zoonosis en 30d — buena noticia")?

---

## Cómo reportar hallazgos
Por cada hallazgo: **persona · pantalla · qué esperabas · qué viste · severidad · lente**
(¿funciona/resuelve/se-ve/confianza?). Como siempre: **nada se toma por válido por defecto** — cada
hallazgo se verifica contra código + DB antes de arreglar, y se distingue "es un bug" de "es una
decisión de diseño consciente" de "el reviewer vio un estado stale".
