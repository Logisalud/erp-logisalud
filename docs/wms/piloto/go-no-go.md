# Piloto «como real» · Criterios Go / No-Go

**Para decidir dos cosas:** (a) **entrar al piloto en noviembre** y (b) **pasar a producción en diciembre**.
**Todos los umbrales son una propuesta: «a confirmar por Sebas».** Odoo es el sistema oficial durante el piloto; el stock del WMS no tiene que cuadrar con el de Odoo.
Cómo se mide: «Reportes», «Auditoría», `verificar_saldos()` (consulta de la base que corre el equipo técnico) y la revisión diaria del propio WMS.

## (a) Entrar al piloto en noviembre — decide **Sebas**, con Katia y Charlie

| # | Criterio (umbral propuesto, a confirmar por Sebas) | Cómo se mide | Quién lo confirma |
|---|---|---|---|
| A1 | La **carga de ensayo** sale «Lista para cargar» (cero líneas con error) en el Informe de la carga | Control → Carga inicial → «Armar el informe» | Katia |
| A2 | `verificar_saldos()` **sin filas** y **cero saldos negativos** tras la carga de ensayo | Consulta del equipo técnico | Equipo técnico |
| A3 | Las **8 hojas por rol** entregadas y cada persona hizo su recorrido de prueba **una vez** | `docs/wms/piloto/hojas-por-rol/` | Charlie y Roberto |
| A4 | El **respaldo de Supabase** está activo en la base del piloto y se **verificó en el panel** que hay una copia del mismo día (no hay respaldo en GitHub: `docs/respaldos/README.md`) | Captura del panel con fecha y hora | Equipo técnico |
| A5 | La **contadora confirmó** lo pendiente que afecta al piloto (baja de guías ante SUNAT, serie y correlativo de guías del panel) | Respuesta por escrito | Sebas |
| A6 | Definida **la ruta o el día fijo** de salidas del piloto y quién emite la guía en el panel | Acta corta de acuerdo | Roberto y Sebas |
| A7 | **Plan de archivo y recreación** de la base (qué se archiva, cómo, con respaldo) escrito y aprobado | Documento del plan | Sebas |
| A8 | `guia_modo = PANEL` verificado en la base del piloto | Consulta del equipo técnico | Equipo técnico |

**Go:** los 8 cumplidos. **No-Go:** cualquiera sin cumplir.
**Si es No-Go:** el piloto no arranca ese día. El dueño del criterio dice qué falta y para cuándo; se vuelve a revisar el siguiente lunes. Nada se carga en la base real mientras tanto.

## (b) Pasar a producción en diciembre — decide **Sebas**, con Katia, Charlie y Roberto

Se evalúa al **terminar al menos 2 semanas** de piloto.

| # | Criterio (umbral propuesto, a confirmar por Sebas) | Cómo se mide | Quién lo confirma |
|---|---|---|---|
| B1 | **Cero saldos negativos** durante todo el piloto | `verificar_saldos()` cada día | Equipo técnico |
| B2 | `verificar_saldos()` **sin filas** los últimos **10 días hábiles** seguidos | Registro diario | Equipo técnico |
| B3 | **Actas sin bloqueo:** ninguna acta o solicitud trabada más de **2 días hábiles** | Reportes → Recepciones | Sandra |
| B4 | **Entradas completas el mismo día:** al menos **90 %** (llegan, se reciben y se firma el acta el mismo día) | Reportes → Recepciones | Charlie |
| B5 | **Incidencias abiertas:** cero críticas y no más de **5** abiertas en total, todas con responsable y fecha | Lista de incidencias del piloto | Sebas |
| B6 | **Revisión diaria cerrada** al menos **90 %** de los días hábiles del piloto | Almacén → Revisión diaria | Charlie |
| B7 | **Exactitud de conteos** de al menos **98 %** en los conteos de la semana | Reportes → Exactitud del inventario | Katia |
| B8 | **Salidas del piloto:** 100 % con número de pedido, guía registrada y salida confirmada; cero guías repetidas | Órdenes de salida y Auditoría | Roberto |
| B9 | **Copia diaria de Supabase presente los últimos 14 días** y la **reversa de cada migración ensayada** en Postgres 17 (restaurar es del proyecto completo, no de un esquema) | Captura del panel y acta del ensayo | Equipo técnico |
| B12 | **Verificación del respaldo del día antes de cada ventana** (el mismo día, en el panel de Supabase); sin copia del día no hay ventana | Captura del panel con fecha y hora, adjunta a la guía de la ventana | Equipo técnico |
| B13 | **Respaldo de los archivos del Storage** (PDF de actas, bucket `wms-documentos`) definido y probado: Supabase no los incluye en la copia de la base | Procedimiento escrito y una restauración de prueba | Equipo técnico |
| B10 | La **contadora confirmó** lo pendiente (baja de guías ante SUNAT, retenciones y lo que Contabilidad deba validar) | Respuesta por escrito | Sebas |
| B11 | **Plan de archivo y recreación** aprobado: la información del piloto se archiva y la base del WMS se recrea con la **carga definitiva**, con respaldo previo | Plan firmado por Sebas | Sebas |
| B12 | **Carga definitiva** probada en un ensayo: informe «Lista para cargar» con los datos de cierre del piloto | Informe de la carga | Katia |

**Go:** B1 a B12 cumplidos. Se puede pasar a producción con **B5, B6 o B7 en el umbral siguiente** solo si Sebas lo acepta por escrito: B5 hasta 8 abiertas, B6 hasta 80 %, B7 hasta 95 %.
**Si es No-Go:**
1. Se anota qué criterio falló y quién es su dueño.
2. Se **extiende el piloto una semana** y se vuelve a medir solo lo que falló.
3. Si falla de nuevo un criterio de saldos (B1, B2) o de respaldo (B9), se **detiene la fecha de producción** hasta corregir la causa. Nunca se compensa con una carga manual.
4. La recreación de la base **no se hace** sin la aprobación de Sebas y el respaldo hecho el mismo día.

## Quién decide qué
- **Sebas** decide el Go o No-Go final de (a) y de (b), y acepta cualquier excepción por escrito.
- **Katia** confirma lo sanitario y el informe de la carga; **Charlie** y **Roberto**, lo operativo; **Sandra**, las actas; el **equipo técnico**, saldos y respaldos.
