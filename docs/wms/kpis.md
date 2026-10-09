# Indicadores (KPI) del WMS

Cada indicador tiene **nombre, definición, fórmula, fuente, frecuencia y responsable**. «Dónde se ve hoy» dice si ya sale de un reporte del WMS o si todavía se calcula a mano.
Los responsables son **roles** (no personas): quien ocupe el rol responde por el indicador. Las metas son propuestas para confirmar con Dirección Técnica; **no hay metas ni semáforos**: por decisión de Sebas (D-42) los KPI se miden **un mes con operación real** y después se fijan las metas con Katia y Charlie.

Todos los reportes se pueden filtrar, guardar como vista y descargar en CSV y Excel (`/reportes`).

## Exactitud y control del inventario

### 1. Exactitud del inventario
- **Definición:** qué tan bien coincide lo que dice el sistema con lo que se cuenta.
- **Fórmula:** líneas contadas sin diferencia ÷ líneas contadas, en conteos **cerrados** del periodo (× 100). La cantidad contada es la del reconteo si lo hubo; si no, la del primer conteo.
- **Fuente:** `wms.exactitud_conteos()` (conteos cerrados y sus líneas).
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén (la revisa Dirección Técnica).
- **Dónde se ve hoy:** reporte **Exactitud del inventario** (muestra el porcentaje sobre las filas filtradas).

### 2. Cumplimiento de los conteos cíclicos de la semana
- **Definición:** cuántos de los 3 conteos semanales se programaron y se hicieron.
- **Fórmula:** conteos de la semana con estado *Generado* y cerrados ÷ 3.
- **Fuente:** `wms.programacion_conteos` y `wms.conteos`.
- **Frecuencia:** semanal (cierre del viernes).
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** pantalla **Conteos → Conteos de la semana** (estado de cada uno). Aún no hay reporte histórico.

### 3. Cobertura de ubicaciones
- **Definición:** qué parte del almacén con stock se contó recientemente.
- **Fórmula:** ubicaciones con stock contadas en los últimos 90 días ÷ ubicaciones con stock.
- **Fuente:** `wms.ultima_cobertura_por_posicion()` y `wms.saldos`.
- **Frecuencia:** mensual.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** a mano (la rotación ya prioriza lo que hace más tiempo no se cuenta).

### 4. Diferencias en conteo
- **Definición:** peso de las diferencias encontradas.
- **Fórmula:** suma de |contado − sistema| ÷ suma de lo que decía el sistema, en conteos cerrados.
- **Fuente:** `wms.exactitud_conteos()`.
- **Frecuencia:** mensual.
- **Responsable:** Jefe de Almacén; Dirección Técnica autoriza los ajustes.
- **Dónde se ve hoy:** reporte **Exactitud** (columna Diferencia); el cociente se calcula a mano.

## Movimientos internos

### 5. Movimientos verificados a tiempo
- **Definición:** qué parte de los movimientos ejecutados la verifica otra persona dentro del plazo.
- **Fórmula:** movimientos con todas sus líneas verificadas en menos de 24 h ÷ movimientos ejecutados. El plazo es el parámetro `movimiento_sin_verificar_horas`.
- **Fuente:** `wms.ordenes_movimiento` (`ejecutado_en`, `verificado_en`).
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** reporte **Movimientos** (fecha y verificador de cada línea); el cociente se calcula a mano. La alerta *Movimiento sin verificar* avisa al Jefe cuando se pasa el plazo.

### 6. Movimientos sin verificar
- **Definición:** movimientos ejecutados que siguen esperando verificación (sus unidades están en tránsito).
- **Fórmula:** cantidad de líneas en estado *Por verificar*; y de ellas, las que pasaron de 24 h.
- **Fuente:** `wms.ordenes_movimiento_lineas`.
- **Frecuencia:** diaria.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** lista de **Movimientos** («Por atender»), mapa y búsqueda («X u en tránsito, por verificar»), reporte **Movimientos** filtrado por estado de línea.

### 7. Líneas con diferencia al verificar
- **Definición:** qué parte de las líneas verificadas no coincidió.
- **Fórmula:** líneas *Con diferencia* ÷ líneas verificadas (confirmadas + con diferencia).
- **Fuente:** `wms.ordenes_movimiento_lineas`.
- **Frecuencia:** mensual.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** reporte **Movimientos** (filtro por estado de la línea); el cociente se calcula a mano.

## Calidad y vencimientos

### 8. Stock en Cuarentena y por trasladar
- **Definición:** unidades que esperan una decisión de calidad o un traslado a su ubicación definitiva.
- **Fórmula:** suma de unidades en estado *Cuarentena* + *Aprobado en área de Cuarentena o Recepción* (por trasladar).
- **Fuente:** `wms.saldos` y `wms.posiciones`.
- **Frecuencia:** diaria.
- **Responsable:** Dirección Técnica decide el estado; el Jefe de Almacén traslada.
- **Dónde se ve hoy:** reporte **Calidad** (filtro *Situación*). La alerta *Por trasladar* avisa pasadas 24 h.

### 9. Stock vencido y por vencer
- **Definición:** unidades de lotes vencidos o que vencen dentro del umbral (90 días, configurable).
- **Fórmula:** suma de unidades con `vence` < hoy (vencido) y con `vence` ≤ hoy + 90 días (por vencer).
- **Fuente:** `wms.lotes` y `wms.saldos`.
- **Frecuencia:** diaria.
- **Responsable:** Jefe de Almacén; Dirección Técnica decide el destino de lo vencido.
- **Dónde se ve hoy:** reporte **Vencimientos** (el primero de Reportes; tramos de 3, 6 y 12 meses con su total de lotes y unidades) y reporte **Calidad**.

### 10. Ciclo de recepción
- **Definición:** cuánto tarda una solicitud de ingreso en cerrarse.
- **Fórmula:** promedio de (cierre − creación) de las solicitudes cerradas del periodo, en días; y cuántas quedan con diferencias.
- **Fuente:** `wms.solicitudes_ingreso`.
- **Frecuencia:** mensual.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** reporte **Recepciones** (fecha de creación, estado y diferencias); el promedio se calcula a mano.

## Espacio y orden

### 11. Ocupación por propietario
- **Definición:** qué parte de las ubicaciones asignadas a cada propietario tiene stock.
- **Fórmula:** ubicaciones asignadas con stock ÷ ubicaciones asignadas vigentes.
- **Fuente:** `wms.asignaciones_posicion` y `wms.saldos`.
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén (Dirección Técnica negocia las asignaciones).
- **Dónde se ve hoy:** reporte **Ocupación por propietario**.

### 12. Cumplimiento de la revisión diaria
- **Definición:** en cuántos días de trabajo se hizo y cerró el recorrido de 4 focos.
- **Fórmula:** días de trabajo con revisión *Cerrada* ÷ días de trabajo del periodo.
- **Fuente:** `wms.revisiones_diarias`.
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén.
- **Dónde se ve hoy:** pantalla **Revisión diaria → Revisiones anteriores** (lista por fecha); el cociente se calcula a mano.

### 13. Pendientes de la revisión
- **Definición:** pendientes anotados que siguen sin resolver o sin verificar, y cuántos son críticos.
- **Fórmula:** pendientes en estado *Abierto* o *Resuelto* (por verificar); aparte, los críticos o que pueden afectar producto.
- **Fuente:** `wms.revision_pendientes`.
- **Frecuencia:** diaria.
- **Responsable:** cada pendiente tiene su responsable; el Jefe de Almacén verifica.
- **Dónde se ve hoy:** pantalla **Revisión diaria → Pendientes por resolver** (con el filtro «Solo los importantes»).

## Trazabilidad

### 14. Ajustes de inventario
- **Definición:** cuánto stock se corrigió por ajuste autorizado.
- **Fórmula:** cantidad de ajustes autorizados y suma de unidades (aumentos y disminuciones por separado) del periodo.
- **Fuente:** `wms.ajustes` y el libro mayor.
- **Frecuencia:** mensual.
- **Responsable:** Dirección Técnica (autoriza); Jefe de Almacén (propone).
- **Dónde se ve hoy:** **Conteos → Ajustes** y reporte **Auditoría** (eventos de ajuste); la suma se calcula a mano.

### 15. Alertas abiertas
- **Definición:** avisos del sistema que nadie atendió.
- **Fórmula:** alertas *Abiertas* por tipo y destinatario; tiempo medio entre la creación y la atención.
- **Fuente:** `wms.alertas`.
- **Frecuencia:** diaria.
- **Responsable:** el destinatario de cada alerta (Dirección Técnica, Jefe de Almacén, Asistente de Dirección Técnica).
- **Dónde se ve hoy:** pantalla **Alertas** (insignia en el menú).

## Lo que falta para cerrar los indicadores
- Medir un mes con operación real y fijar metas y semáforos con Katia y Charlie (D-42).
- Los indicadores marcados «a mano» pasan a un reporte propio cuando Dirección Técnica los confirme; hoy son cálculos sobre los reportes existentes.
