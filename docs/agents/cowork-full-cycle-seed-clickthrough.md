# Cowork — siembra integral por clickthrough real (staging)

> Prompt para el agente Cowork con navegador. Objetivo: ejecutar TODOS los flujos
> del producto al menos una vez, 100% por UI real (cero SQL, cero API directa),
> creando su propio elenco de datos con prefijo `CW-`. Prerequisito: staging
> redeployado con la corrida del 2026-08-02 (aviso de disposición en observación,
> chip en /admin/observaciones, ficha de origen).

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

### Veterinario (vet@)
- [ ] Walk-in en /org/…/atender con código: firmar antirrábica (evento VERIFICADO)
- [ ] Implantar/firmar microchip
- [ ] Atender el turno reservado (formulario del tipo de servicio) → evento firmado

### Organización (orgadmin@ — Refugio Test)
- [ ] Publicar oferta de servicio nueva CW- (3 pasos) + regla de agenda + Materializar ahora
- [ ] Intake de animal al refugio → publicarlo en adopción
- [ ] Ciclo de adopción completo: postulación (de graciela@) → aprobar → finalizar → transferencia de custodia
- [ ] Panel de la org: verificar que los turnos/asistencias del día aparecen

### Gobierno (govt-local@)
- [ ] Cola de denuncias: triage de la denuncia CW- → asignar → registrar intervención
- [ ] Vigilancia: reportar mordedura → iniciar observación antirrábica de una mascota CW-
- [ ] Operativos/Campañas: confirmar que la oferta CW- aparece con sus métricas
- [ ] Outreach: armar un operativo (lista + recordatorio) sin enviar masivos
- [ ] Generar el PDF MPF de un caso de maltrato

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
   las 100 CursorPet-0xx con credencial vacía son residuo conocido
