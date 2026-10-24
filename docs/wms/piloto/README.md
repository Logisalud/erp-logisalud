# Piloto «como real» del WMS · noviembre

**Decisión de Sebas (2026-10-24).** Producción en diciembre. En noviembre corre un **piloto «como real» de al menos 2 semanas con Odoo como sistema oficial**.

## Qué entra al piloto
- **Como real:** entradas, calidad, movimientos, conteos y revisión diaria.
- **Salidas:** solo **una ruta o un día fijo por semana, con número de pedido**. La guía se emite en el panel de Nubefact (o en Odoo) y el WMS solo la **registra** (`guia_modo = PANEL`).
- **Sigue solo en Odoo:** stock oficial, facturación, compras, toma y validación de pedidos y las demás salidas.
- El stock del piloto **no tiene que cuadrar** con Odoo. Antes de producción, la información del piloto se **archiva** y la base del WMS se **recrea** con una carga definitiva (destructivo: lo aprueba Sebas, con respaldo).
- **Fuera del alcance (congelado):** comparador contra Odoo, importación de pedidos, prueba directa de Nubefact, almacén compartido de la demo.

## Qué hay aquí
- `hojas-por-rol/`: una hoja corta por rol (Dirección Técnica, Asistente de DT, Jefe de Almacén, Jefe de Transporte, Auxiliar, Conductor, Auditoría, Administrador).
- `go-no-go.md`: criterios para entrar al piloto y para pasar a producción (umbrales a confirmar por Sebas).
- En la app: **Salidas → Órdenes de salida → Registrar guía emitida**, e **Informe de la carga** en **Control → Carga inicial**.

## Pendientes de la ventana (qué falta para el piloto)
Marcados «Sebas» cuando necesitan su decisión. Cada uno tiene dueño.

1. **Aprobar los umbrales del Go/No-Go** (`go-no-go.md`). Dueño: **Sebas**.
2. **Aplicar la migración 0036** en la base del piloto (a mano, con respaldo; `docs/wms/aplicar-migraciones.md`) y verificar `guia_modo = PANEL`. Dueño: equipo técnico, con aprobación de **Sebas**.
3. **Elegir la ruta o el día fijo** de salidas del piloto y quién registra la guía. Dueño: **Roberto** y **Sebas**.
4. **Confirmar con la contadora:** serie y correlativo de las guías que se emiten en el panel (y que el WMS no vuelva a usar esos números), y la baja de guías ante SUNAT. Dueño: **Sebas**.
5. **Base del piloto:** crear o designar la base, con RLS, el bucket privado `wms-documentos` y la copia diaria de Supabase verificada en el panel. Dueño: equipo técnico.
6. **Usuarios y roles reales** (Katia, Sandra, Charlie, Roberto, auxiliares, Auditoría, Administrador). Hoy el conductor no tiene pantallas. Dueño: Administrador.
7. **Carga de ensayo:** armar el archivo con datos reales, pasar el **Informe de la carga**, corregir y volver a subir hasta «Lista para cargar». Dueño: **Katia** y el Administrador.
8. **Registros sanitarios y COA** de los productos del piloto, cargados y vigentes. Dueño: Katia y Sandra.
9. **Capacitación:** entregar las hojas por rol y hacer un recorrido de prueba con cada persona. Dueño: Charlie y Roberto.
10. **Plan de archivo y recreación** de la base (qué se archiva, dónde, con qué respaldo). Dueño: equipo técnico; lo aprueba **Sebas**.
11. **Registro de incidencias** del piloto (una lista simple con responsable y fecha) y el día de revisión semanal. Dueño: Charlie.
12. **Respaldo con restauración probada** antes de la primera semana. Dueño: equipo técnico.
11. **Pendiente de producción: respaldo de los archivos del Storage** (PDF de actas del bucket `wms-documentos`). Supabase respalda la lista de archivos, no su contenido; hay que definir cómo se copian antes de firmar actas reales. Dueño: equipo técnico; lo aprueba **Sebas**.
