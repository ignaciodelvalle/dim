# miMAR para funcionarios municipales

> Guía de arranque para el área de zoonosis, bromatología o bienestar animal de un municipio.

## Qué problema tuyo resuelve

Hoy tu área responde por la salud y el bienestar animal del territorio con información fragmentada: libretas de papel que se pierden, denuncias que llegan por teléfono o por redes, campañas de vacunación que se registran en planillas sueltas. miMAR junta todo eso en un solo lugar: un registro de mascotas con historial sanitario verificable, una mesa de entradas de denuncias con seguimiento, y tableros con indicadores de tu jurisdicción — vacunación, mortalidad, mordeduras, mascotas perdidas — calculados sobre datos reales y con sus limitaciones a la vista.

## Qué necesitás para empezar

- Una dirección de correo institucional para el área (no personal: la cuenta representa al organismo, no a la persona que lo opera hoy).
- Saber qué localidad o localidades va a cubrir tu área. El alcance de tu cuenta se define por localidad: vas a ver y gestionar lo que pasa en tu territorio, no lo de otros municipios.
- Nada más. No hace falta instalar nada: miMAR funciona desde el navegador, en computadora o celular. Para el trabajo de gestión diaria recomendamos una computadora de escritorio.

## Cómo entrás

**No podés registrarte solo, y eso es a propósito.** Las cuentas de gobierno no se crean desde la pantalla de registro como las de un vecino: las crea el equipo administrador de miMAR, que carga el correo del área, el nombre con el que va a operar y las localidades que cubre. Es una medida de seguridad: nadie puede "hacerse pasar" por un municipio creándose una cuenta.

El proceso concreto:

1. Tu municipio se contacta con el equipo de miMAR y define el correo del área y las localidades a cubrir.
2. El equipo crea la cuenta y te hace llegar un enlace de acceso directo (un link que abre tu sesión sin contraseña, por única vez).
3. Entrás con ese enlace. Para las próximas veces, definí tu contraseña usando la opción "¿Olvidaste tu contraseña?" de la pantalla de ingreso, con el correo del área.
4. A partir de ahí entrás siempre desde la pantalla de ingreso de miMAR con correo y contraseña, y el sistema te lleva directo a tu portal de gobierno.

Si la persona que opera la cuenta cambia (alguien deja el cargo, entra otra), la cuenta no se rehace: el equipo administrador restablece las credenciales y la historia de trabajo del área queda intacta. Si tu área cubre más localidades con el tiempo, el equipo administrador las agrega a la misma cuenta.

## Tus primeros 15 minutos

1. **Entrá al portal.** Después de iniciar sesión aparecés en el **Briefing de jurisdicción**: la pantalla de inicio de tu área. Arriba vas a ver un chip con tu alcance (tu localidad, o la lista si cubrís varias). Todo lo que muestra el portal está filtrado por ese alcance.
2. **Leé el briefing.** La pantalla resume lo que necesita atención hoy: alertas, indicadores clave de tu territorio y la **cola operativa** — cuántas solicitudes de aprobación esperan, cuántas denuncias de maltrato están abiertas, casos regulatorios y mascotas perdidas activas. Cada tarjeta es un enlace al lugar donde se trabaja ese tema.
3. **Abrí "Aprobaciones"** (en el menú, sección *Bandeja operativa*). Acá llegan tres tipos de solicitudes que tu área decide: **matrículas de veterinarios** que piden operar en tu localidad, **habilitación de organizaciones** (refugios, clínicas, redes de rescate) y **credenciales de perro de asistencia**. Aprobar una matrícula es lo que le permite a un veterinario firmar eventos sanitarios con validez en miMAR — es la decisión de confianza más importante que vas a tomar en el sistema.
4. **Abrí "Denuncias"** (misma sección). Es la mesa de entradas de los reportes de maltrato y abandono de tu territorio (Ley 14.346), con dos etapas: moderación de denuncias anónimas y triage de casos — asignar, priorizar, seguir y cerrar. Las denuncias llegan con tipo, gravedad, ubicación y evidencia adjunta si la persona la cargó.
5. **Mirá el "Panorama"** (sección *Situación*). Es el mapa de situación de tu jurisdicción: capas de eventos (síntomas, mordeduras, pérdidas, denuncias) sobre el territorio, con filtros por período. Los agregados públicos aplican protección de privacidad: los números chicos se suprimen para que nadie pueda re-identificar un caso individual.
6. **Recorré la sección *Programa*.** Ahí viven los tableros de gestión: **Padrón** (cuántas mascotas registradas hay en tu territorio y qué porcentaje representan de la población canina estimada — el sistema siempre te muestra el denominador, no un número suelto), **Mortalidad**, **Adopciones** y el resumen general. Al principio, con pocas mascotas registradas en tu localidad, estos números van a ser chicos y el sistema te lo va a decir con honestidad en vez de inflar porcentajes.
7. **Si tu jurisdicción tiene reglas propias** (por ejemplo, sobre razas potencialmente peligrosas o canales de credencial física), revisá **"Reglas"** (sección *Profundidad*): ahí se configuran las reglas de negocio que aplican en tu territorio. Lo que definas para tu localidad pisa el valor por defecto del país.

Resultado concreto al final del recorrido: sabés qué está esperando una decisión de tu área, viste el estado sanitario de tu territorio en el mapa, y sabés dónde llegan las denuncias de tu jurisdicción.

## Qué NO hace miMAR todavía

- **No está integrado con Mi Argentina.** Es la premisa de diseño del proyecto y la arquitectura está preparada, pero hoy no hay login ni credenciales federadas con la plataforma nacional.
- **No verifica identidad contra RENAPER.** El DNI que declaran los usuarios se guarda protegido (nunca en texto plano), pero la validación contra registros estatales todavía no existe.
- **No envía denuncias ni notificaciones sanitarias a sistemas estatales externos.** Las denuncias se gestionan dentro de miMAR (tu área las ve en su bandeja); la derivación automática a canales gubernamentales externos está en desarrollo, y lo mismo vale para las notificaciones de eventos de declaración obligatoria: el sistema ya mide su cola interna de salida, pero el envío automático a la autoridad todavía no está conectado.
- **El registro de perros potencialmente peligrosos todavía no exporta al registro provincial.** La marca y la declaración jurada existen; el archivo de intercambio con la provincia está pendiente.
- **Las reglas jurisdiccionales de cumplimiento legal (vacunación antirrábica obligatoria, esterilización, microchip) están en desarrollo.** Hoy podés configurar reglas operativas; el módulo que modela obligaciones legales con su nivel de exigencia por jurisdicción está diseñado pero no construido.
- **No hay aplicación nativa** (App Store / Google Play): es una aplicación web. Funciona en el celular desde el navegador.
- **Los datos de tu territorio arrancan de cero.** miMAR no importa padrones preexistentes por ahora: la cobertura crece a medida que vecinos, veterinarias y refugios de tu localidad se suman.

## Marco legal que te aplica

miMAR está construido alrededor del marco normativo argentino de sanidad y bienestar animal — podés ver el detalle en lenguaje simple en la página pública **Marco legal** del sitio. Lo que toca directamente a tu trabajo:

- **Ley Nacional 14.346 (malos tratos):** las denuncias que llegan a tu bandeja se encuadran en esta ley, y el sistema puede generar un expediente de exportación para presentar ante la fiscalía.
- **Ley CABA 4078 y Ley PBA 14.107 (razas potencialmente peligrosas):** miMAR marca los animales alcanzados y mide cuántos tienen la declaración jurada de su dueño registrada, por jurisdicción.
- **Ordenanza CABA 41.831 (observación antirrábica):** el período de observación de 10 días tras una mordedura se abre, se sigue y se cierra dentro del sistema, con aviso de vencimientos.
- **Ley CABA 5470 (disposición final):** los registros de fallecimiento llevan el método de disposición, y el tablero de mortalidad mide la trazabilidad.
- **Ley Nacional 25.326 (datos personales):** los tableros que ves aplican supresión de celdas chicas (ningún agregado expone menos de 5 casos), las consultas masivas sobre datos personales (campañas de alcance, exportaciones) quedan registradas en auditoría, y los DNI nunca se almacenan en texto plano.
- **Resoluciones SENASA 284/2024, 580/2014 y la Libreta Sanitaria Única:** los eventos sanitarios usan los vocabularios oficiales, para que una futura homologación con SENASA sea directa.
