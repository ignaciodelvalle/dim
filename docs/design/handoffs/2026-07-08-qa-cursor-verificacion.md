# QA Cursor — VERIFICACIÓN DE CIERRE — lectura, scope, visual, tipeo

**URL:** https://dim-staging-el6eq8nyg-ignacio-dim.vercel.app
**Cuentas (todas `Test1234!`):** govt-local@ (una localidad) · alejo@ (4 orgs) · noeli@ (foster) · owner@. Para signup usá un gmail+alias nuevo.
**Regla anti-colisión:** Cowork corre los flujos de MUTACIÓN pesada (denuncias, matrícula, org→org, ARCO) en la MISMA URL. Vos NO toques esos — tu lane es LECTURA, SCOPE, VISUAL, y creación liviana de cuenta. Mirá, no mutes los casos de Cowork.

> Verificación dirigida a lo que cambió HOY. Foco: que el login/signup NO coman teclas, que la procedencia/denominadores se VEAN bien, que el scope de roles aguante, y los nits es-AR.

---

## 1. Login y signup — que NO coman teclas (el fix estrella de hoy)
- **Login en frío**: apenas carga /login, **tipeá RÁPIDO** email + password. No debe borrarse nada. Probá un login FALLIDO (password mal) → el **email debe quedar** (antes se borraba), el password se limpia (correcto).
- **Signup**: /signup, tipeá rápido → provocá un error de validación (password débil o email repetido) → el **email (y nombre si lo pide) debe quedar**, no borrarse.
- Signup exitoso → cae como **owner** (nunca admin/govt). Sin verificación de email (por diseño).

## 2. Procedencia de vacunas — el estado dual (#78)
- En la ficha de una mascota con vacuna declarada por el dueño → mirá que muestre DOS bloques claros: verde "lo que tenés" (la dosis + su vigencia) + ámbar "para el registro oficial, un vet debe firmarla". NO debe leerse como contradicción plana ("0 de 4 · DECLARADA" a secas).
- En /p público de esa mascota: la vacuna declarada no debe figurar como "verificada".

## 3. Denominadores dobles + panorama (#79, #78)
- `/gob/panorama` (govt-local@) capa antirrábica: la cobertura debe decir el **doble denominador** ("X% del padrón (N perros) · el padrón cubre Y% de la población estimada"). El toggle **"solo firmado por matrícula"** debe estar y cambiar el número mostrando ambos.
- El scrubber "Reproducir en el tiempo" debe tener el toggle **"Cuándo ocurrió / Según lo conocido al momento"**.

## 4. Puntos en el mapa — lectura (#75)
- `/gob/panorama` con zoom cercano (z≥10): capa **avistajes** debe mostrar puntos reales; capa **denuncias** debe mostrar puntos en el **centroide del barrio** (no dirección exacta). Ninguna debe mostrar la ubicación exacta de una denuncia.

## 5. Scope de roles — lo que vale oro (adversarial)
- **govt-local@** (una localidad): en /gob/maltrato, /gob/panorama, /gob/casos → ¿ve SOLO su localidad? Probá una URL de otra provincia (`/gob/panorama?province=AR-B`) → debe quedar vacío/negado, jamás datos ajenos. El footer del panorama fuera de scope debe decir **"Sin datos en tu alcance"** (no "alcance nacional").
- **noeli@ (foster)**: el menú lateral del refugio debe mostrar **pocos módulos** (los que su permiso habilita), no los ~11. No debe poder aprobar adopciones ni editar la org.
- **alejo@ (4 orgs)**: el switch entre orgs no mezcla datos.

## 6. Nits es-AR (que no haya errores tontos)
- Fechas SIEMPRE en es-AR (nunca UTC ni ISO "2026-07-18"): mirá vencimientos de transferencia, auditoría admin, lista de moderación, confirmación de mordedura.
- Género en boards: /perdidas y /adoptar → un macho dice "Perdido"/"Lo vi", no "Perdida"/"La vi".
- Plurales: /p con 1 escaneo dice "1 escaneo" (no "1 escaneos").
- Formulario de invitar miembro (org): el rol default NO debe ser "Administrador".

## 7. Mobile (390×844, anon)
- Landing (hero credencial viva tocable), /p, /perdidas, /adoptar, /funcionalidades: sin scroll horizontal, CTAs alcanzables con el pulgar.

## Reporte
Lista corta OK/FALLA por punto + captura. Los puntos 1 (login/signup) y 5 (scope) son los que más valen — sé adversarial ahí.
