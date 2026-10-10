# Indicadores (KPI) del WMS

Cada indicador tiene **nombre, definición, fórmula, fuente, frecuencia y responsable**. «Dónde se ve hoy» dice si ya sale de un reporte del WMS o si todavía se calcula a mano.
Los responsables son **roles** (no personas): quien ocupe el rol responde por el indicador. Las metas son propuestas para confirmar con Dirección Técnica; **no hay metas ni semáforos**: por decisión de Sebas (D-42) los KPI se miden **un mes con operación real** y después se fijan las metas con Katia y Charlie.

Todos los reportes se pueden filtrar, guardar como vista y descargar en CSV y Excel (`/reportes`). **Todos los indicadores** están en **Reportes → Indicadores** (agrupados por tema, con periodo —últimos 7, 30 y 90 días o un rango— y filtro por propietario). **Inicio → «Inventario y almacén»** muestra solo **3**: **Exactitud de inventario**, **Por vencer y vencidos** y **Tiempo de disponibilidad**; en Indicadores llevan la marca «En Inicio». *Recepciones con diferencia* y *Ocupación del almacén* salieron de Inicio y quedan en Indicadores. Lo ven quienes gestionan el inventario (el contador no lee saldos).

**La tarjeta** (la misma en Inicio y en Indicadores) trae el valor, **hacia dónde va** frente al periodo anterior, un **mini gráfico de los últimos 30 días**, «¿Cómo se calcula?» y un clic al reporte. Lo de «hacia dónde va»:
- **Color por tendencia, no por meta:** verde si **mejoró**, ámbar si **empeoró**, gris si no cambió. Siempre con **ícono y palabra** («↑ 15,6 puntos · mejoró»): el color nunca es la única señal. No dice si el valor está bien o mal, solo hacia dónde va (sin metas ni semáforos: D-42).
- **Cada indicador declara si «más» es mejor o peor** (tabla de abajo; vive en `MAS_ES_MEJOR`, `domain/indicadores.ts`). Un indicador sin sentido declarado muestra la flecha y el cambio, sin palabra ni color.
- Los cambios en porcentajes se dicen en **puntos** (la diferencia entre dos porcentajes: de 68,8 % a 84,4 % son 15,6 puntos), nunca como porcentaje de un porcentaje.
- **El mini gráfico** tiene un punto cada 3 días (11 puntos, de hace 30 días a hoy), calculado con la misma ventana del periodo elegido; los de «foto» (stock, vencimientos, alertas, movimientos sin verificar) se reconstruyen del libro mayor. *Cobertura de ubicaciones* y *Pendientes de la revisión* no guardan su historia: no llevan gráfico.

**¿Más es mejor o peor?** (Dirección Técnica la confirma):

| Más es mejor | Más es peor | Sin sentido declarado |
|---|---|---|
| Exactitud de inventario · Cumplimiento de conteos semanales · Cobertura de ubicaciones · Movimientos verificados a tiempo · Cumplimiento de la revisión diaria | Diferencias en conteo · Movimientos sin verificar · Líneas con diferencia al verificar · Stock en Cuarentena y por trasladar · Por vencer y vencidos · Ciclo de recepción · Recepciones con diferencia · Tiempo en Cuarentena · **Tiempo de disponibilidad** · Pendientes de la revisión · Ajustes de inventario · Alertas abiertas | Ocupación del almacén (más ocupado puede ser buen uso del espacio o falta de lugar) |

**Cómo se compara con el periodo anterior:** los indicadores de periodo se comparan con el periodo anterior del mismo largo; los de «foto» (ocupación, vencimientos, Cuarentena, movimientos sin verificar, alertas) con cómo estaban al comienzo del periodo, reconstruido desde el libro mayor (`wms.saldos_al`) y las fechas de cada registro. Los que no tienen historial (cobertura, pendientes de la revisión) lo dicen y no muestran variación.

## Exactitud y control del inventario

### 1. Exactitud del inventario
- **Definición:** qué tan bien coincide lo que dice el sistema con lo que se cuenta.
- **Fórmula:** líneas contadas (ubicación + lote) cuyo **primer conteo coincidió** con lo que decía el sistema ÷ líneas contadas, en conteos **cerrados** del periodo (× 100). Lo que se cuenta «a la primera» no depende del reconteo ni del ajuste posterior.
- **Fuente:** `wms.exactitud_conteos()` (conteos cerrados y sus líneas).
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén (la revisa Dirección Técnica).
- **Dónde se ve hoy:** **Inicio → Inventario y almacén** (últimos 30 días contra los 30 anteriores), **Reportes → Indicadores** y reporte **Exactitud del inventario** (columna «Primer conteo»; muestra el porcentaje sobre las filas filtradas).

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
- **Dónde se ve hoy:** **Inicio → Inventario y almacén** (lotes y unidades con vencimiento en 90 días o menos, más los vencidos; un clic abre el reporte filtrado), reporte **Vencimientos** (el primero de Reportes; tramos de 3, 6 y 12 meses con su total de lotes y unidades) y reporte **Calidad**.

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
- **Dónde se ve hoy:** **Reportes → Indicadores** (% de ubicaciones ocupadas, con detalle por propietario; ya no está en Inicio) y reporte **Ocupación por propietario**.

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

### 16. Recepciones con diferencia
- **Definición:** qué parte de las recepciones físicas llegó distinta de lo declarado.
- **Qué es «diferencia»** (sin importar quién la registró): la cantidad física confirmada **no coincide con la Solicitud de Ingreso o la OC** (cantidad final distinta de la inicial, incluida una línea retirada); hay una **línea no esperada** (agregada después de autorizar); o el **lote o el vencimiento es distinto al declarado** (D-35: es un ajuste explícito con motivo, no un rechazo).
- **Fórmula:** recepciones con diferencia ÷ recepciones **confirmadas** en el periodo (× 100). **El periodo se cuenta por la fecha en que se confirmó la recepción física**, no por la creación de la solicitud. Detalle por proveedor: cuántas con diferencia sobre el total y **el tipo de diferencia** (cantidad distinta, lote distinto, vencimiento distinto, línea no esperada).
- **Fuente:** `wms.solicitudes_ingreso` (cantidad inicial y final por línea), su historial de cambios campo a campo y `wms.ingresos` (`confirmado_en`).
- **Frecuencia:** mensual.
- **Responsable:** Jefe de Almacén; Compras sigue a los proveedores con más diferencias.
- **Dónde se ve hoy:** **Reportes → Indicadores** (ya no está en Inicio) y reporte **Recepciones** (columnas «Recepción confirmada», «Con diferencia» y «Tipo de diferencia»; filtro «Con diferencia»).

### 17. Tiempo en Cuarentena
- **Definición:** cuánto espera un lote en Cuarentena hasta que Dirección Técnica lo aprueba.
- **Fórmula:** promedio de (aprobación de Dirección Técnica − confirmación del ingreso), en días, de los ingresos aprobados en el periodo. Aparte, cuántos lotes están en Cuarentena ahora.
- **Fuente:** `wms.solicitudes_ingreso` (cierre) y `wms.actas_organolepticas` (decisión *Aprobado*).
- **Frecuencia:** mensual.
- **Responsable:** Dirección Técnica decide; el Jefe de Almacén lleva las muestras y el acta.
- **Dónde se ve hoy:** **Reportes → Indicadores** (tema Calidad) y reporte **Calidad**. **No va en Inicio.**

### 18. Tiempo de disponibilidad (dock-to-stock)
- **Definición:** cuánto tarda la mercadería en estar lista para usarse desde que llega: horas desde la **recepción física confirmada** hasta que queda **Aprobada y verificada en una posición de Aprobados**.
- **Fórmula, por recepción:** (momento en que **todos sus lotes** quedaron disponibles − momento en que se confirmó la recepción física), en horas. Un lote queda disponible cuando otra persona (no quien lo movió) **verificó** —*Confirmada*— un movimiento que lo deja en una posición de un área de **Aprobados**, estando ya **Aprobado** y **después de que Dirección Técnica lo aprobó**. La recepción queda disponible con su **último** lote; si algún lote todavía no está en Aprobados, la recepción no entra (aún no hay una hora que medir).
- **Valor de la tarjeta:** la **mediana** de esas horas, de las recepciones que **quedaron disponibles** en el periodo (**últimos 30 días** en Inicio; 7, 30, 90 días o un rango en Indicadores). Se usa la mediana y no el promedio para que una recepción excepcional no distorsione el número. **Detalle por propietario:** la mediana y cuántas recepciones entran de cada uno.
- **Cómo se compara:** con la mediana del periodo anterior del mismo largo; menos horas es mejor.
- **Fuente:** `wms.solicitudes_ingreso` (`confirmado_en`), `wms.actas_organolepticas` (decisión *Aprobado*), `wms.ordenes_movimiento` y sus líneas (`verificado_en`, estado y destino).
- **Frecuencia:** semanal.
- **Responsable:** Jefe de Almacén (lleva el traslado a Aprobados); Dirección Técnica (aprueba).
- **Dónde se ve hoy:** **Inicio → Inventario y almacén** y **Reportes → Indicadores** (tema Recepciones). Un clic lleva al reporte **Recepciones** (todavía no hay un reporte propio de este indicador).
- **Ejemplo (los datos de las pruebas):** recepción confirmada el 1 oct 00:00; aprobada por Dirección Técnica el 1 oct 10:00; el movimiento a Aprobados verificado el 2 oct 00:00 → **24 h**. Con 24 h, 48 h y 96 h en el periodo, la mediana es **48 h**; con 100 h y 140 h en el periodo anterior (mediana 120 h), la tarjeta dice «↓ 72 horas · mejoró».

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

## Despacho (previstos: se agregan cuando existan las salidas)
Segundo grupo de 4 indicadores, ya con su lugar en Inicio y en Indicadores (se muestran como «previstos», sin valor). Ningún dato se inventa mientras no haya despachos.

### D1. OTIF (On Time In Full)
- **Definición:** pedidos entregados a tiempo y completos.
- **Fórmula:** pedidos despachados en la fecha comprometida y con todas sus unidades ÷ pedidos despachados.
- **Fuente:** salidas / pedidos (Batch de despacho). **Frecuencia:** semanal. **Responsable:** Jefe de Almacén.

### D2. Nivel de servicio
- **Definición:** qué parte de lo pedido se despacha.
- **Fórmula:** unidades despachadas ÷ unidades pedidas.
- **Fuente:** salidas / pedidos. **Frecuencia:** semanal. **Responsable:** Jefe de Almacén.

### D3. Exactitud de despacho
- **Definición:** pedidos despachados sin errores de producto, lote o cantidad.
- **Fórmula:** pedidos sin errores de producto, lote o cantidad ÷ pedidos despachados.
- **Fuente:** salidas y su verificación. **Frecuencia:** semanal. **Responsable:** Jefe de Almacén.

### D4. Tiempo de preparación
- **Definición:** cuánto tarda un pedido desde que se recibe hasta que se despacha.
- **Fórmula:** promedio de (despacho − recepción del pedido), en horas.
- **Fuente:** salidas / pedidos. **Frecuencia:** semanal. **Responsable:** Jefe de Almacén.

## Lo que falta para cerrar los indicadores
- Medir un mes con operación real y fijar metas y semáforos con Katia y Charlie (D-42).
- Los indicadores marcados «a mano» pasan a un reporte propio cuando Dirección Técnica los confirme; hoy son cálculos sobre los reportes existentes.
