# ¿Es buen momento para agregar datos? Sí — pero no "más", sino otros

**Fecha:** 2026-08-09 · **Estado:** idea masticada, sin implementar · **Para:** decisión del PO

## La pregunta correcta

No es *"¿sembramos más datos?"* sino **¿qué pregunta queremos poder responder que hoy no podemos?**

Tenemos vistas nuevas —panorama, censo, población, alcance, reglas, mortalidad, embudo de adopciones, campañas— mirando un conjunto de datos que se sembró antes de que varias existieran. Eso produce dos errores distintos y opuestos:

- una pantalla que **se ve vacía estando bien** (la consulta funciona, no hay filas), y
- una pantalla que **se ve bien estando vacía** (muestra ceros o defaults como si fueran hallazgos).

El segundo es el peligroso, y es el que encontramos.

## Lo que medí (base local, 2026-08-09)

```
pets                32.430        profiles              6.340
ownerships          32.430        welfare_reports       2.816
organizations           17        cases                   749
service_offerings       70        appointments          1.289
time_slots             310        govt_business_rules       0
```

Y por evento: `pet_registered` 32.433 · `vaccination_administered` 28.818 · `sterilization_performed` 17.646 · `microchip_implanted` 13.412 · `death_recorded` 3.946 · `disease_reported` 2.295 · `adoption_finalized` 2.238 · `outbreak_signal` 2.199.

**Corrección a mi propia hipótesis inicial.** Arranqué pensando que la población era "salud rutinaria solamente", porque `seed-perf` da los 46 tipos de evento sólo a las 3 primeras mascotas y al resto le da ocho tipos comunes. Medí y era falso: corrieron otros seeds y mortalidad, adopciones y vigilancia tienen miles de filas. **Esas vistas no están vacías.**

## Los tres huecos reales

### 1. `govt_business_rules` = 0 filas — Reglas muestra defaults

`/gob/reglas` resuelve 10 tipos de regla por cada jurisdicción asignada. Con la tabla vacía, **las diez caen al default hardcodeado**, la columna "origen" siempre dice lo mismo, y la cascada localidad → provincia → país existe sin nada adentro.

Peor: sin filas no hay corto-circuito. Cada resolución camina los **tres** candidatos y falla los tres. La página hace entre 30 y 150 consultas para mostrar diez valores que están en el código.

Esto es, casi con seguridad, lo que se sentía raro en esa pantalla.

### 2. `time_slots` futuros = 0 — no hay ni un turno reservable

Los 310 slots están **todos en el pasado**. `/turnos/buscar` no puede devolver nada, nunca. La materialización existe y funciona (lo probamos hoy: escribe 258 turnos por corrida) pero nadie la corrió con reglas vigentes.

**Bloquea el piloto veterinario de esta semana.**

### 3. `pets.status = 'lost'` = 41 sobre 32.430 (0,13%)

`seed-perf` apunta a 10%. `/perdidas` —superficie pública central— muestra 41 mascotas contra una población de 32k, y la tasa de reunificación se calcula sobre esas 41. No está roto: está estadísticamente vacío.

## Script vs. mano: prueban cosas distintas

Esta es la parte que más importa y la que conviene no mezclar.

| | Qué prueba | Qué NO prueba |
|---|---|---|
| **Seed por script** | La consulta, el índice, el agregado, la vista con volumen | El formulario, la validación, el evento emitido, lo que pasa después |
| **Carga a mano** | El flujo completo: formulario → validación → evento → proyección → pantalla | Nada a escala; no vas a cargar 2000 |

**La evidencia del día lo demuestra.** Ninguno de estos bugs lo encuentra un seed, porque todos viven *entre* el formulario y la pantalla:

- el contador que informaba "Turnos nuevos: 0" habiendo escrito **258**
- "EN ADOPCIÓN" pegado en la credencial de la adoptante tras adoptar
- el borrador de denuncia que perdía la ubicación al recargar
- la notificación de transferencia con un link a un 404

Un seed inserta filas correctas por definición: escribe directo a la tabla, salteando exactamente el camino donde estaban los cuatro defectos.

## Orden propuesto

**Primero por script** (barato, repetible, deja el terreno):

1. **Reglas por jurisdicción.** Un puñado de filas en `govt_business_rules` — CABA y dos o tres provincias con `ppp_breed_list` y `ppp_weight_threshold` propios. Con eso la cascada muestra herencia real y la columna "origen" empieza a decir algo. Es la siembra de mejor relación valor/esfuerzo del lote.
2. **Turnos futuros.** Correr la materialización con reglas vigentes. No hace falta seed nuevo: el código ya existe y hoy quedó verificado.
3. **Subir `lost` a ~10%** en un subconjunto, con fechas escalonadas para que reunificación y "crítica 24h" tengan forma.

**Después a mano, y en este orden** (cada paso valida lo sembrado por el anterior):

4. **Alta de una mascota como dueño**, de punta a punta, cuenta nueva real. Ningún test cubre el primer día.
5. **Reservar un turno** contra los slots del paso 2. Cierra el circuito que hoy no se puede ni empezar.
6. **Una denuncia anónima completa**, con foto y ubicación. Es el flujo más expuesto y el que más arreglos recibió hoy.
7. **Una adopción de punta a punta**, que es donde apareció el chip pegado.

## Lo que NO haría

- **No agregar más mascotas.** 32.430 alcanzan y sobran; el problema no es volumen.
- **No sembrar `welfare_reports` ni `cases` nuevos** — 2.816 y 749 son suficientes para que las colas tengan forma.
- **No automatizar los pasos 4–7.** Su valor es justamente que los ejecute una persona mirando la pantalla. Un Playwright que los recorra prueba que el flujo no explota; una persona nota que el contador miente.

## Un pedido, si se hace a mano

Que quien cargue **anote el número que ve en pantalla** en cada paso, no sólo si funcionó. Los cuatro bugs de hoy eran números plausibles: 0 turnos nuevos, "EN ADOPCIÓN", un link que existe. Todos pasan un "¿anduvo? sí" y ninguno pasa un "¿decía la verdad?".
