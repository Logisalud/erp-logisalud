# Reglas de negocio WMS — CERRADAS
Fuentes: docs/wms/procesos/ (hoja 03_TO-BE), docs/wms/formatos/, docs/wms/layouts/, docs/wms/topologia.md. Si algo difiere, avisa; no elijas.

## Alcance actual
Solo entradas y movimientos internos. Las salidas (preparación, despacho, transporte) se construyen después de su mapeo; el modelo debe admitirlas sin rehacerse.

## Transición
- El WMS opera en paralelo a Odoo hasta tener salidas; recién entonces lo reemplaza.
- Carga inicial: exportación de Odoo tras el inventario general (dato real).
- En Odoo, LWDIP = almacén DHP (Diphasac).

## Roles
| Persona | Rol |
|---|---|
| Katia Zapata | Dirección Técnica: decide estados, valida productos, aprueba ajustes |
| Sandra López | Asistente DT: evaluación organoléptica, alta de productos, cierre documental |
| Charlie Chancco | Jefe de Almacén (así se llama el cargo en la interfaz y en el acta, como en LS-FR.03.05) |
| Roberto, Jasury | Reemplazos de Charlie (autorizan movimientos) |
| Christians, Jose Carlos, Alberto, Milka | Auxiliares de almacén |
El equipo usa teléfonos personales.

## Propietarios del stock
- Logissa: stock propio, comprado.
- Diphasac, Triamed, Medic Pharma Lab, AJR Labs: clientes que guardan su mercadería; no la comercializamos.
- Diphasac es también proveedor.
- Todo saldo tiene propietario.
- Posiciones de almacenamiento: un solo propietario fijo (ver topologia.md).
- Áreas compartidas (Recepción, Cuarentena, Embalaje, Despacho): una posición puede tener varios propietarios a la vez.
- La asignación de posiciones a un propietario tiene vigencia (desde/hasta) y referencia al contrato o adenda que la sustenta. Un cambio de asignación nunca mueve stock por sí solo.
- Diphasac → Logissa: solo por conducto regular (recepción de Compras con movimiento físico). El inventario nuevo nace en Cuarentena (supuesto, pendiente de Katia).

## Maestro de productos
- Maestro único para todo propietario; incluye productos que no compramos.
- Registro sanitario y su vencimiento son atributos del producto.
- Sandra crea el producto; Katia lo valida.
- No hay productos controlados.

## Fuentes de verdad — un dato se escribe una sola vez
- Compras: OC, proveedor, factura, guías, cantidad física agregada (compra local).
- WMS: todo lo físico y sanitario, y las entradas sin compra.
- Dirección Técnica: decisiones sanitarias.
- Pedidos: demanda.

## Tipos de ingreso (todos nacen en Cuarentena)
| Tipo | Cantidad de referencia | Documentos |
|---|---|---|
| Compra local | Recepción registrada en Compras | Guía y factura (ya en Compras) |
| Devolución | Guía + formulario de devolución del transportista | Referencia obligatoria a factura o boleta original |
| Ingreso de cliente | Guía del cliente | Guía |
- Importación y traslado: fuera de alcance (aún no se importa).
- Una OC puede tener varias recepciones en Compras; **cada recepción de Compras es un ingreso distinto en el WMS** (la referencia de cantidad es la de esa recepción, no la de la OC).
- Invariante: SUM(cantidad por lote) = cantidad de referencia.
- Unidad: la misma de Compras (unidades). Las cajas master no se cuentan.

## Recepción (REC-01, REC-02)
1. Recepción es un proceso, no un estado. Recepción (A-1 a A-5, A-M1) es tránsito: al confirmar, el inventario nace en Cuarentena en una posición A-6 a A-9.
2. Vencimiento: se registra la **fecha completa** que muestra el producto físico. Solo si el producto mismo muestra únicamente mes y año, se usa el último día del mes (y se conserva el texto original).
3. Temperatura (rango 15–25 °C) en el Acta de Recepción. Fuera de rango: se recibe y se alerta a Katia.
4. Registro sanitario vencido: alerta inmediata a Katia; el lote no puede aprobarse hasta que ella resuelva.
5. Solicitud de Ingreso (LS-FR.05.05): editable, con historial; el sistema la prellena.
6. Acta de Recepción (LS-FR.03.05):
   - Numeración I-AAAAMM-correlativo.
   - Se genera y firma en el sistema. Firman Jefe de Almacén, DT y responsable de conteo con su usuario logueado.
   - El transportista firma en pantalla y se registran su nombre, DNI y placa.
   - Firmada es inmutable: solo se anula con motivo y se emite otra vinculada.
7. Datos del acta que no vienen de Compras: bultos, paletas, placa y marca del vehículo, temperatura, tipo de conteo, hora de inicio y fin, verificaciones del producto.

## Evaluación organoléptica y aprobación
- Acta de Evaluación Organoléptica (LS-FR.55.02): una por producto y lote, también en devoluciones. La llena Sandra; Katia decide y firma en el WMS.
- Muestra = techo(√unidades del lote) + 1. Vuelve completa a su caja: no descuenta stock.
- El acta firmada sustenta la decisión. No existe Acta de Liberación.
- Lo rechazado en Cuarentena nunca vuelve al proveedor.

## Estado sanitario (INV-03)
- Estados: Cuarentena, Aprobado, Bajas/Rechazados.
- **Quién registra el cambio:** Katia, al firmar el Acta de Evaluación Organoléptica en el WMS, registra Aprobado o Bajas/Rechazados. Charlie (Jefe de Almacén) no ejecuta ese cambio; solo mueve físicamente (movimientos internos) cuando corresponde.
- Permitido:
  - Cuarentena → Aprobado
  - Cuarentena → Bajas/Rechazados
  - Aprobado → Bajas/Rechazados (Katia + sustento)
- PROHIBIDO SIEMPRE: Aprobado → Cuarentena. Se valida en dominio y en base de datos.
- Estado, condición, ubicación, propietario y origen son datos distintos.
- VERDE/ÁMBAR: el modelo los soporta (solo con Aprobado); la interfaz se construye después.

## Zonas BPA y compatibilidad
Cada posición tiene tipo de área y propietario. El sistema bloquea combinaciones inválidas:
| Tipo de área | Estados admitidos |
|---|---|
| Recepción | Ninguno (tránsito) |
| Cuarentena (compartida) | Cuarentena |
| Devoluciones (por propietario) | Cuarentena con origen devolución |
| Aprobados (por propietario) | Aprobado |
| Bajas/Rechazados (por propietario) | Bajas/Rechazados |
| Contramuestra (por propietario) | Pendiente (solo importación) |
| Embalaje, Despacho | Fuera de alcance |
- Salir de Cuarentena hacia un rack: solo si está Aprobado con acta organoléptica firmada, y a una posición del mismo propietario.
- Rechazado: solo hacia Bajas/Rechazados del mismo propietario.

## Movimientos internos (INV-02)
- Flujo: preparar → mover → verificar (persona distinta del ejecutor) → confirmar.
- Autoriza Charlie (Jefe de Almacén), o Roberto/Jasury en su ausencia.
- Con diferencia, el movimiento queda abierto.
- Se guarda: origen, destino, producto, lote, propietario, cantidad, motivo, ejecutor y verificador.
- Corrección = movimiento inverso vinculado al original.
- Mover no cambia el estado.
- Se puede mover parte de un lote; una posición puede tener varios lotes.

## Inventarios cíclicos (INV-05)
- 3 por semana, programados.
- Primer conteo ciego.
- Reconteo por otra persona solo si hay diferencia.
- Posición en pausa durante el conteo.
- Causa registrada.
- Ajuste solo con aprobación de Katia, con antes, después, motivo y evidencia.

## Revisión diaria (INV-04)
Recorrido con 4 focos: orden, limpieza, ubicaciones y situaciones anormales. Solo se registran pendientes, con responsable.

## Expediente (REC-03)
- La OC (o el N° de acta, si no hay compra) agrupa los documentos.
- El WMS enlaza, no duplica.
- Faltantes con responsable y estado. Sandra cierra.

## Integridad
Ningún registro se oculta ni se borra. Toda corrección deja historia (usuario, fecha, motivo).

## Pendientes para Katia (no implementar hasta su respuesta)
1. Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena (supuesto actual) o conserva Aprobado?
2. Destino físico y documental de lo rechazado en Cuarentena y de las devoluciones no conformes.
3. Bloqueo temporal (hold) de un lote Aprobado.
4. Documentos obligatorios por tipo de Baja/Rechazo.
5. Naturaleza de Contramuestra (solo importaciones).
6. Confirmar muestreo techo(√unidades) + 1.
7. Acondicionamiento en la ubicación "Calidad" de Odoo: formalizarlo (ÁMBAR) o eliminarlo. No se migra.
