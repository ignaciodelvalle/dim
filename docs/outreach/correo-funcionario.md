# Correo de contacto a funcionario (admin/govt) — versión lean

> Uso: outreach a una autoridad sanitaria o de bienestar animal. Personalizá el
> saludo y la jurisdicción antes de enviar. Fuente de la propuesta de valor:
> `docs/design/handoffs/2026-07-07-govt-personas-pitch.md`.

---

**Asunto:** Dónde está el hueco de vacunación antirrábica en [JURISDICCIÓN] — demo de 5 minutos

Estimado/a [Nombre, Cargo]:

Le escribo porque MiMAR resuelve algo que hoy vive en planillas sueltas: **ver, sobre un mapa de su territorio, dónde falta cobertura antirrábica y qué casos hay que cerrar esta semana** — con un número que puede repetir ante su superior sin que otra pantalla lo contradiga.

No es una libreta digital para el dueño de la mascota. Es la herramienta de su oficina: alarmas de lo que no puede ignorar hoy, colas de trabajo con decisión documentada (Ley 25.326), y exportes que alimentan lo que ya usa (SENASA, fiscalía, Excel) en vez de pedirle reescribir todo.

Preparé un acceso de demostración con datos sintéticos para que lo vea con sus propios ojos, sin instalar nada:

**Entrá a:** https://dim-staging.vercel.app/login
**Usuario:** govt@dim.test · **Contraseña:** Test1234!

Con eso, en tres pasos ve el corazón:
1. **Panel** — las alarmas del día (rabia fuera de los 10 días, denuncia crítica sin asignar, brote en barrio de baja cobertura).
2. **Panorama** — el mapa de cobertura de la jurisdicción, filtrable por período y zona.
3. **Exportar** — la lista de mascotas con antirrábica vencida por barrio, en CSV, con fecha de corte.

Si le hace sentido, el próximo paso natural es un **piloto territorial honesto**: una jurisdicción, un barrio, datos reales, para que vea *su* territorio y no un demo genérico.

Quedo a disposición para mostrárselo en vivo cuando le venga bien.

Saludos cordiales,
Ignacio Del Valle
MiMAR — Mi Mascota Argentina
[teléfono / email de contacto]

---

## Instrucciones para el envío (no van en el correo)

**Antes de mandar:**
- Reemplazá `[JURISDICCIÓN]`, `[Nombre, Cargo]` y la firma. El asunto con el nombre de SU municipio/provincia sube muchísimo la tasa de apertura.
- `govt@dim.test` es el operador de CABA (ciudad completa). Si el destinatario es de otra provincia, avisale en el correo que la cuenta demo está cargada con datos de CABA, o pedime una cuenta demo con el scope de su jurisdicción.
- Verificá que el QR y los datos estén vivos: abrí `https://dim-staging.vercel.app/p/DIM-PAMP-0001` (la mascota insignia, Pampa) antes de enviar.

**Qué NO prometer** (honestidad = la ventaja ante un funcionario):
- No digas "integrado con SENASA/Mi Argentina" — eso es roadmap post-piloto, no está hoy.
- No prometas moderación de denuncias del lado govt jurisdiccional (hoy es admin; está diseñado, no entregado).
- Si pregunta por privacidad: k-anonimato, auditoría de quién vio qué PII, y sin DNI en claro. Eso sí lo tenemos y es el diferenciador.

**El pedido real** es el piloto, no la venta. El cierre gana si lo dejás en "que veas tu territorio", no en "contratá".
