# Cowork — siembra integral por clickthrough real (staging)

> Prompt para el agente Cowork con navegador. Objetivo: ejecutar TODOS los flujos
> del producto al menos una vez, 100% por UI real (cero SQL, cero API directa),
> creando su propio elenco de datos con prefijo `CW-`.
>
> **Actualizado 2026-08-06** — staging sirve `9ee89f90` (verificado contra
> Vercel): la corrida del 04-05/08 completa. Novedades que esta pasada cubre por
> primera vez: **chapas físicas** (`/t/[serial]`, activación con código,
> emisión admin), impresión sin recorte (expediente + informe), export del mapa
> encuadrado al alcance, aviso al refugio de origen en hallazgos, estados
> vacíos con acción, y vocabulario de estados unificado. La base de staging
> tiene las migraciones `0166`-`0170` aplicadas y `db:doctor` limpio.

---

Sos un operador QA integral de miMAR (https://dim-staging.vercel.app). Tu misión:
recorrer TODOS los flujos del producto de punta a punta, una vez cada uno, creando
los datos por los flujos reales — como lo haría una persona. Nada de atajos.

## Reglas duras

1. **Solo UI.** Nada de SQL, nada de API directa. Si un flujo no se puede completar
   por la interfaz, eso ES un hallazgo — documentalo, no lo saltees por otra vía.
2. **Prefijo `CW-` en todo lo que crees** (nombres de mascotas "CW-Luna", ofertas,
   notas, denuncias). Jamás toques el elenco de demo: mascotas `DIM-DEMO-*`,
   `DIM-PAMP-0001` (Pampa), cuentas `cursor-*`, ni edites/borres datos que no
   creaste vos.
3. **Cuentas: usá el elenco sembrado** (todas con `Test1234!`): `admin@dim.test`,
   `govt-local@dim.test` (CABA/Palermo), `orgadmin@dim.test` (Refugio Test),
   `vet@dim.test` (matriculado), `owner@dim.test`, `graciela@dim.test` (2ª dueña).
   **Rate limit real: 5 logins/min por email, 10/min por IP.** Logueá cada cuenta
   UNA vez en su propia pestaña/contexto y reusá la sesión. Si te bloquea, esperá
   2 minutos — no insistas.
4. **Registro de todo lo creado**: al final, una tabla con cada entidad (tipo,
   nombre/token público, cuenta creadora, flujo que la creó) para poder limpiarla.
5. **Capturas en cada paso clave** y SIEMPRE en severidad ALTA.
6. El flujo de **registro de cuenta nueva** probalo UNA vez (signup real): si la
   confirmación por email te bloquea, documentá "NO PROBADO: requiere email" y
   seguí con el elenco.

## Checklist de flujos (uno de cada uno, mínimo)

### Ciudadano / dueño (owner@)
- [ ] Registrar mascota nueva CW- (con foto — el avatar vacío es el camino de carga)
- [ ] Editar mascota, ver credencial pública y QR
- [ ] Declarar vacuna propia (no firmada) y compararla en la libreta con una firmada
- [ ] Marcar perdida → (desde OTRO contexto/anónimo) escanear/abrir el QR y reportar avistaje → recuperarla
- [ ] Buscar turno (esterilización o vacunación) → reservar → verla en /mis-turnos
- [ ] Transferencia dueño a dueño (owner@ → graciela@): proponer, aceptar
- [ ] Denuncia de bienestar CON evidencia (foto obligatoria) como ciudadano
- [ ] **NUEVO — Privacidad del perfil**: abrir la hoja "Qué se muestra al público" de una mascota CW- y verificar que dice la verdad (incluido, si la mascota tiene refugio de origen, el aviso de que ese refugio se entera de un hallazgo)

### Chapas físicas (NUEVO 08/05 — la serie completa, en este orden)
> **Rate limit real en activación: 5/min por IP + 3/min por serial.** Máximo DOS
> intentos con código equivocado; si te bloquea, esperá 2 minutos. No insistas.
- [ ] **(admin@)** Emitir un lote chico (2-3 chapas) en /admin/chapas → descargar el **CSV de un solo uso** y GUARDARLO (los códigos no se pueden recuperar: solo se persiste el hash) → recargar la página y verificar que ni seriales ni códigos se vuelven a mostrar
- [ ] **(anónimo)** Abrir /t/&lt;serial-inventado&gt; → 404 · abrir /t/&lt;serial real SIN activar&gt; → página neutra, CERO datos de mascota, CTA de activación
- [ ] **(owner@)** Activar una chapa desde /cuenta/chapas/activar con serial + código del envoltorio, vinculándola a una mascota CW- → verla ACTIVA en el panel
- [ ] **(anónimo)** /t/&lt;serial activado&gt; → redirige a la credencial pública /p de la mascota
- [ ] **(owner@)** Probar UNA vez un código equivocado en otra chapa → el rechazo debe ser EXACTAMENTE el mismo mensaje que con un serial inexistente (compuerta uniforme: no filtra qué existe)
- [ ] **(owner@)** Revocar la chapa activada → **(anónimo)** /t/&lt;serial&gt; → página honesta "dada de baja", sin datos de mascota, sin razón
- [ ] Transferir la mascota CW- con chapa activa (owner@ → graciela@) → la chapa sigue activa y /t sigue resolviendo (la chapa es de la MASCOTA); graciela@ puede revocarla, owner@ ya no

### Veterinario (vet@)
- [ ] Walk-in en /org/…/atender con código: firmar antirrábica (evento VERIFICADO)
  — **y verificá el otro lado**: el dueño de la mascota debe recibir la
  notificación inmediata del evento walk-in (mitigación PO 04/08). Si el evento
  entra y el dueño no se entera, es ALTA
- [ ] Implantar/firmar microchip
- [ ] Atender el turno reservado (formulario del tipo de servicio) → evento firmado

### Organización (orgadmin@ — Refugio Test)
- [ ] Publicar oferta de servicio nueva CW- (3 pasos) + regla de agenda + Materializar ahora
- [ ] Intake de animal al refugio → publicarlo en adopción
- [ ] Ciclo de adopción completo: postulación (de graciela@) → aprobar → finalizar → transferencia de custodia
- [ ] Panel de la org: verificar que los turnos/asistencias del día aparecen

### Gobierno (govt-local@)
- [ ] Cola de denuncias: triage de la denuncia CW- → asignar → registrar intervención
  — **vocabulario esperado**: los estados canónicos son "Revisada"/"En curso"
  (unificados 08/05); si ves "Triagueada" o "En seguimiento" en CUALQUIER
  pantalla, es regresión → ALTA
- [ ] Vigilancia: reportar mordedura → iniciar observación antirrábica de una mascota CW-
- [ ] Operativos/Campañas: confirmar que la oferta CW- aparece con sus métricas
- [ ] Outreach: armar un operativo (lista + recordatorio) sin enviar masivos
- [ ] Generar el PDF MPF de un caso de maltrato
- [ ] **NUEVO — Expediente imprimible**: abrir el expediente de un caso de maltrato → botón "Imprimir expediente" → si tu entorno permite vista previa de impresión, verificar que el documento sale ENTERO (más de una página, sin recorte). Si no permite, documentá "NO PROBADO: sin print preview"
- [ ] **NUEVO — Export del mapa encuadrado**: en Panorama, panel "Exportar" → "Exportar PNG" → la imagen debe encuadrar TODO el alcance del operador (no lo que casualmente entraba en pantalla), con el pie de método. Después del export, la vista del mapa vuelve a donde estaba
- [ ] **NUEVO — Vacíos con acción**: aplicar en una cola un filtro que no matchee nada → el vacío debe ofrecer una salida ("Limpiar filtros" o equivalente), nunca una lápida muda

### Admin (admin@)
- [ ] Crear suscripción de alerta CW- (umbral que la data actual NO rompa — nota: los disparos corren en cron diario, no esperes firing inmediato; documentalo)
- [ ] Triage completo de la alerta sembrada existente si sigue abierta (reconocer → seguimiento → resolver) — SOLO si nadie la necesita para la demo; si dudás, no la toques y anotalo
- [ ] Aprobar una solicitud pendiente en /admin/cola si existe (matrícula/org)
- [ ] Ficha de origen: en /admin/sistema, abrir "Ver origen" de un KPI y verificar que alcance/fórmula/frescura dicen la verdad
- [ ] Moderación: revisar una denuncia flaggeada si hay

### Fallecidos — la serie completa (el corazón de esta pasada)
Registrá mascotas CW- nuevas para cada escenario (no reuses las de otros flujos):
- [ ] **D1 — muerte simple, disposición recomendada** (cremación colectiva): sin avisos, cierre normal
- [ ] **D2 — muerte con entierro domiciliario SIN observación**: debe aparecer el aviso GENÉRICO de entierro; confirmá igual
- [ ] **D3 — muerte DURANTE observación antirrábica, disposición recomendada**: primero mordedura → observación (govt-local@), después la muerte (owner@). Verificá: la observación se cierra sola "Cerrada por fallecimiento", y la autoridad recibe notificación URGENTE que NOMBRA la disposición
- [ ] **D4 — muerte DURANTE observación + entierro domiciliario**: debe aparecer el aviso ESPECÍFICO de rabia (distinto al genérico) → confirmá igual ("a pesar del aviso") → verificá el chip en danger en /admin/observaciones y la notificación urgente con "Entierro en domicilio"
- [ ] **D5 — muerte con caso de bienestar ABIERTO**: denuncia CW- abierta sobre la mascota, después la muerte — documentá qué pasa con el caso (¿queda abierto? ¿se nota en la cola?)
- [ ] En /gob/mortalidad: verificá que "Cementerio autorizado" y "Entierro en domicilio" aparecen SEPARADOS y que tus muertes CW- movieron los números

## Formato del informe

1. **Resumen ejecutivo** (qué anduvo, qué no, veredicto por área)
2. **Por flujo**: PASS / FAIL / NO PROBADO (con por qué), pasos exactos para
   reproducir cualquier FAIL, captura
3. **Severidad**: ALTA = un funcionario citaría algo falso o un flujo core no
   cierra; MEDIA = fricción real; BAJA = pulido
4. **Registro de entidades creadas** (la tabla CW-)
5. **"Lo que no pude probar"** — vale tanto como un hallazgo
6. NO reportes como bugs: los dashboards de Panorama/Padrón corren sobre cubo
   nocturno (no se mueven en vivo); los disparos de alertas son cron diario;
   las 100 CursorPet-0xx con credencial vacía son residuo conocido; el mapa
   provincial puede mostrar pocas o cero burbujas (k-anonimato con ventana de
   30 días en regiones de baja densidad); la ficha pública de /adoptar muestra
   SOLO el booleano "tiene microchip" — sin dígitos — a propósito (decisión de
   privacidad 08/05); las chapas CW- revocadas no se pueden borrar por UI
   (estado terminal por diseño) — anotalas en el registro igual
7. **Chapas ajenas: NO.** Solo activá/revocá chapas del lote CW- que emitiste
   vos. Jamás toques una chapa que no creaste.
