# Cowork QA — escenarios ronda 2

> Para la próxima sesión de Cowork (tester externo, Claude in Chrome). Entorno: el server que
> le indique el PO (ej. :3001 congelado). Datos sintéticos de demostración. Se le pasa UN bloque
> de misiones; Cowork decide CÓMO cumplir cada una — no le damos pasos. Objetivo: que descubra
> confusiones, dead-ends, y (crítico) cualquier estado donde **el flotante, el mapa y las
> métricas NO digan lo mismo**. La ronda 1 (funcionario planificador/foco/auditor) ya se corrió;
> estos son NUEVOS ángulos. Elegí el bloque por rol según qué quieras estresar.

## BLOQUE A — Funcionario, decisiones más finas (panorama, admin/govt)
Cuenta: `admin@dim.test` (universal) o `lucas@dim.test` (5 jurisdicciones — mejor para probar el fence). `Test1234!`.

- **A1 · Comparar dos jurisdicciones:** tu ministro quiere saber si la cobertura antirrábica de
  Córdoba mejoró más o menos que la de Santa Fe en el último año. Contá cómo lo averiguás y qué
  número final le das a cada una. *(estresa: cambiar de scope ida y vuelta, que las métricas
  sigan al flotante)*
- **A2 · El dato que no cuadra:** buscá una jurisdicción donde el número que ves en un KPI y lo
  que muestra el mapa te parezcan contar cosas distintas. Si lo encontrás, es un bug — anotá
  exactamente qué viste. *(caza directa de la incoherencia flotante/mapa/métrica)*
- **A3 · Estacionalidad:** ¿en qué época del año se pierden más mascotas? Usá la línea de tiempo
  para responderlo y decí cómo la usaste. *(estresa: scrubber, histograma, base bitemporal)*
- **A4 · Privacidad bajo presión:** tratá de averiguar cuántos casos hay en una localidad muy
  chica y despoblada. ¿El sistema te deja verlo o lo protege? Contá qué pasó. *(prueba k-anon en
  vivo — debería suprimir, no exponer)*

## BLOQUE B — Dueño de mascota (owner, mobile-first)
Cuenta: `owner@dim.test` / `Test1234!`. **Probá en viewport de celular (390px) además de desktop.**

- **B1 · Recién llegado:** entrás por primera vez, no cargaste ninguna mascota. ¿Entendés qué
  tenés que hacer? ¿La pantalla te guía o te deja perdido?
- **B2 · Se me perdió el perro:** marcá una mascota como perdida y tratá de hacer TODO lo que
  harías en pánico real (compartir, avisar, ver el caso). ¿Encontraste cada acción sin frustrarte?
- **B3 · ¿Estoy al día?:** mirá una mascota y decidí si está al día con sus vacunas/chip. ¿El
  estado que ves es claro y consistente entre la lista y el perfil?
- **B4 · Adopción/transferencia:** si tenés una postulación o transferencia pendiente, ¿te
  enterás desde el inicio o tenés que ir a buscarla?

## BLOQUE C — Veterinario / clínica (vet)
Cuenta: seed de vet (`alejo@dim.test` admin de varias orgs, o el que indique el PO). `Test1234!`.

- **C1 · Recién aprobado:** acabás de obtener el rol de veterinario. ¿Sabés cuál es tu próximo
  paso para empezar a trabajar? ¿La pantalla te lleva o te deja adivinando?
- **C2 · Clínica solo:** entrás a tu consultorio por primera vez. ¿Ves una guía de primeros pasos
  o caés en una agenda vacía sin saber qué hacer?
- **C3 · ¿Dónde estoy parado?:** mientras navegás entre portales, ¿siempre sabés en qué
  organización estás y qué rol tenés? Anotá cualquier momento de duda.

## BLOQUE D — Organización / refugio (org-admin)
Cuenta: `orgadmin@dim.test` (shelter) o `alejo@dim.test` (admin de shelter+clinic+rescue+autoridad). `Test1234!`.

- **D1 · Mi trabajo pendiente:** entrás como responsable de un refugio. ¿La pantalla te dice qué
  tenés pendiente HOY sin que tengas que abrir cada sección? Contá qué colas ves y si los números
  te sirven.
- **D2 · Cambio de sombrero:** entrá como una CLÍNICA y después como una AUTORIDAD SANITARIA.
  ¿Cada tipo de organización te muestra lo que le corresponde, o ves cosas que no aplican / faltan
  las que sí?
- **D3 · Maltrato derivado:** te derivaron una denuncia de maltrato. ¿La encontrás fácil desde el
  panel o tenés que cazarla en el menú?

## BLOQUE E — Adversarial / romper cosas (cualquier rol operador)
- **E1 · Botón-mash:** en el panorama, cambiá de vista/provincia/período/capas lo más rápido que
  puedas, apretá Atrás muchas veces, abrí y cerrá paneles a lo loco. ¿Se rompe, se traba, o el
  mapa queda en un estado raro? *(smoke del hardening — no debería romperse)*
- **E2 · Links compartidos:** copiá un enlace de una vista drilleada, abrilo en otra pestaña.
  ¿Llegás exactamente a lo mismo que veías? Probá también editar el link a mano (una provincia
  que no existe, un período inválido).
- **E3 · Fuera de jurisdicción:** como `lucas` (que cubre solo algunas provincias), tratá de ver
  datos de una provincia que NO te corresponde, forzando la URL. ¿El sistema te frena? *(prueba
  del fence — debe mostrar cero, nunca filtrar)*
- **E4 · Sesión larga:** dejá el panorama abierto ~10 minutos tocando cobertura Buenos Aires y
  otras vistas pesadas, después seguí usándolo. ¿Sigue vivo y respondiendo? *(smoke del crash de
  revalidación — ya arreglado, esto confirma)*

## Qué pedirle a Cowork (todos los bloques)
- Combiná N filtros, presets, alcances, fechas — como un usuario real curioso, no un script.
- Anotá: qué te confundió, qué esperabas y no encontraste, cualquier dead-end (una acción que no
  lleva a ningún lado), y **todo momento donde el rótulo, el mapa y los números no coincidan**.
- Screenshots de lo que valga la pena. Formato libre, como la vez pasada.
