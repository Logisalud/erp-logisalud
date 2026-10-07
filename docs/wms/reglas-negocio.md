# Reglas de negocio WMS — CERRADAS
Fuente: docs/wms/procesos/ (hoja 03_TO-BE). Si este archivo y un mapeo difieren, avisa; no elijas.

## Roles
| Persona | Rol | Responsabilidad en WMS |
|---|---|---|
| Charlie Chancco | Responsable de Almacén | Cantidad física en Compras, lotes, registra Aprobado tras decisión DT, asigna VERDE/ÁMBAR, autoriza movimientos, programa conteos |
| Katia | Dirección Técnica | Decide aprobación y bajas/rechazos; valida documentos técnicos |
| Sandra López | Asistente DT | Aviso de llegada, evaluación organoléptica, cierre documental |
| Auxiliares | Almacén | Preparan, ejecutan y verifican movimientos; cuentan |

## Fuentes de verdad — un dato se escribe una sola vez
- Compras: OC, proveedor, factura, guías, cantidad física agregada.
- WMS: lote, vencimiento, cantidad por lote, ubicación, estado sanitario, condición, movimientos, conteos.
- Pedidos: pedido, cliente, reservas, disponible comercial, preferencias de lote.
- DT: decisiones sanitarias.

## Recepción (REC-01, REC-02, REC-03)
1. Recepción es un proceso, no un estado.
2. Todo inventario por compra nace en Cuarentena.
3. Invariante: SUM(cantidad por lote) = cantidad_fisica de la recepción en Compras. Si no cuadra, no se confirma.
4. Producto en varios lotes → una asignación por lote. Bonificados usan su propio código de producto.
5. Lote y vencimiento no vuelven al módulo económico de Compras.
6. La aprobación se sustenta con el Acta de Evaluación Organoléptica firmada. No existe Acta de Liberación.
7. El inventario referencia la recepción de Compras; la OC es la referencia del expediente documental.
8. WMS enlaza documentos de Compras; no los duplica.

## Estado sanitario y condición (INV-03)
- Estado, condición y ubicación son dimensiones distintas.
- Permitido: Cuarentena → Aprobado. Aprobado → Bajas/Rechazados (decisión DT + sustento).
- PROHIBIDO SIEMPRE: Aprobado → Cuarentena. Validar en dominio y en base de datos.
- Condición solo si estado = Aprobado: VERDE (listo para venta) o ÁMBAR (requiere acondicionamiento permitido). ÁMBAR → VERDE al terminar. Cualquier otro estado → condición NULL.
- ÁMBAR no se usa para ocultar dudas de calidad: se escala a DT.
- Cada cambio guarda producto, lote, cantidad, estado anterior y nuevo, motivo, sustento, usuario y fecha.
- Cambiar estado no mueve; mover no cambia estado.
- Devolución y Contramuestra no son estados sanitarios.

## Movimientos (INV-02)
- Preparar → ejecutar físicamente → verificar (persona distinta del ejecutor) → confirmar.
- Con diferencia: queda abierto hasta que Charlie lo resuelva. Nunca ajustar para cuadrar.
- Guarda origen, destino, producto, lote, cantidad, motivo, ejecutor y verificador.
- Corrección = movimiento inverso. El original no se borra.

## Conteos (INV-05)
- Primer conteo ciego: ve producto, lote, vencimiento y ubicación, no la cantidad esperada.
- Reconteo solo si hay diferencia, por otra persona, también ciego.
- Ubicación en pausa durante el conteo.
- Ajuste excepcional: autorizado, con motivo e historial.

## Revisión diaria (INV-04)
Registrar solo hallazgos no resueltos: qué pasó, responsable, estado.

## Stock vendible (INV-01)
- physical_sellable = Aprobado + VERDE. No se publica Cuarentena, ÁMBAR, Contramuestra, Bajas/Rechazados ni Devolución.
- Pedidos calcula commercial_available = physical_sellable − reservas.
- Hoy: Odoo → archivo → importador de Pedidos. WMS convive en modo sombra hasta decisión explícita.

## Selección de lotes al despachar (futuro, no Batch 1)
- Sin preferencia: lote vendible con vencimiento más próximo.
- Con preferencia (vencimiento más lejano o lote específico): respetarla si el lote es Aprobado + VERDE, sin bloqueo y con cantidad suficiente. No es una "excepción FEFO".
- Trazar criterio solicitado, criterio usado y lote despachado.

## Decisiones pendientes — no inventar
1. Bloqueo temporal (hold) de un lote Aprobado sin usar Cuarentena.
2. Flujo de Devoluciones.
3. Naturaleza de Contramuestra.
4. Documentos requeridos por tipo de Baja/Rechazo.
5. ¿En el WMS aprueba Katia directamente o Charlie registra tras su decisión?
6. ¿VERDE puede volver a ÁMBAR?
7. Propietario del stock: el AS-IS trata distinto a Difasar, Darepharma y Biosana. ¿Son dueños del stock? ¿Sirve inventory_source_id?
8. Temperatura de recepción: ¿se registra en Compras o en WMS?
9. Preferencia de lote por línea de pedido: requiere cambio en Pedidos.
10. Quién y cuándo apaga el importador Odoo y activa la proyección WMS.
11. Mapeos de despacho y transporte: pendientes de subir.
