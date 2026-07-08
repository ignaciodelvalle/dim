# QA Cursor #2 — Perfiles nunca validados (rápido, sin colisión con Cowork)

**URL (build NUEVO con los fixes de esta noche):** https://dim-staging-2ojp19znv-ignacio-dim.vercel.app
**Clave de todas:** `Test1234!`
**Regla anti-colisión:** Cowork usa owner@/owner2@/orgadmin@/lilian@/govt@/admin@ en OTRA URL — vos usás OTRAS cuentas y esta URL. No toques adopciones/transferencias/denuncias existentes (mirá, no mutes — salvo lo explícitamente pedido).
**Aviso de contexto:** las capas de EVENTOS del panorama (perdidas/zoonosis) pueden verse flacas en este build — esperado hasta el re-seed de mañana (los loaders ahora leen shapes reales). NO reportar como falla. Lo que importa acá es SCOPE y ROLES, no riqueza de datos.

## 1. Operador de LOCALIDAD (govt-local@dim.test) — el perfil estrella, nunca probado
El operador con scope de UNA localidad (no la provincia entera). Tras los fixes de subsunción de hoy, esta es la rama de scoping que nadie ejercitó:
- Login → ¿el panel muestra su alcance correcto (chip "Mi alcance")?
- /gob/maltrato: ¿ve SOLO denuncias de su localidad? (compará el conteo con lo que un scope más amplio vería — si ves TODO CABA, es un FALLO de scoping → severidad ALTA)
- /gob/panorama: ¿el mapa autozoomea a su localidad? ¿puede ver datos de OTRA localidad drilleando? (no debería)
- /gob/casos, /gob/perdidas: mismas preguntas de scope.
- Intentá una URL crafteada: /gob/panorama?province=AR-B (provincia ajena) → debe quedar vacío/negado, jamás datos ajenos.

## 2. Admin multi-organización (alejo@dim.test) — 4 sombreros
Alejo administra 4 orgs (refugio, clínica, red de rescate, autoridad sanitaria):
- Login → ¿el picker de portales lista las 4? ¿el switch entre orgs es coherente (datos de la org activa, sin mezclas)?
- En la clínica: ¿ve la superficie de Atender? En el refugio: ¿la de ingresos/adopciones? (cada org su especialización)
- ¿Alguna pantalla mezcla mascotas/datos de dos orgs? (FALLO ALTO si pasa)

## 3. Miembro FOSTER (noeli@dim.test) — el rol más débil
Foster de Refugio Patitas del Norte:
- Login → ¿qué ve del refugio? ¿puede ver los pets en custodia? ¿puede hacer cosas de admin (aprobar adopciones, editar la org)? (NO debería — si puede, FALLO ALTO de permisos)
- ¿Su tránsito asignado (si tiene) se ve con el badge +TRÁNSITO?

## 4. Pasada MOBILE (viewport 390×844, anon — sin cuenta)
- Landing: el hero credencial viva ¿entra bien en mobile? ¿los puntitos son tocables?
- /p/DIM-DEMO-0001, /perdidas, /adoptar, /funcionalidades: layout sin scroll horizontal, CTAs alcanzables con el pulgar.
- Wizard de denuncia SOLO hasta el paso 2 (no enviar — Cowork ya cubre el envío).

## Reporte
Lista corta OK/FALLA por punto + captura. Los FALLOS de scope/permisos (1 y 3) son los que valen oro — sé adversarial ahí.
