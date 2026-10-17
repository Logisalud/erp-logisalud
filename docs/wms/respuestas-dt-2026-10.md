# Respuestas de Dirección Técnica y de Gerencia — octubre 2026

Registro de lo que se respondió el **2026-10-17** (Sebas, con lo aprobado por Katia) y cómo lo recoge el WMS. Si algo de aquí
contradice un documento anterior, **gana este** y se corrige el otro. Cada punto dice en qué PR del bloque «Orden de Salida» (OS-1 … OS-8) se construye.

## 1. Flujo nuevo: la Orden de Salida (OS-2, OS-3)

Las dos salidas (pedido de Logissa y orden de un cliente de almacenamiento) pasan a llamarse **Orden de Salida**, con correlativo **OS-AAAA-NNNNN**.

1. Llega el pedido (tipo A, desde Pedidos) o el cliente de almacenamiento crea su orden (tipo B).
2. **Orden de Salida**: el sistema la genera y propone lote (el que vence primero en A; el del cliente en B), vencimiento y ubicación, en el orden del recorrido. El auxiliar, el Jefe de Almacén y el Jefe de Transporte pueden cambiar el lote en la tabla; el vencimiento se actualiza solo (reglas de S2b). Se **imprime**.
3. **Picking**: con la hoja impresa o con el celular. Queda registrado **quién picó** (se elige al imprimir o al iniciar).
4. **Conformidad** (reemplaza la «confirmación» separada; el auxiliar no confirma nada en el sistema): quien tiene el permiso de conformidad (hoy Sandra) revisa lo picado contra la Orden de Salida en una tabla en PC. Todo coincide → «Conforme» con un click. Si hay diferencias, por línea: otro lote (el vencimiento se actualiza solo), menos cantidad o no encontrado. Registra el **número de bultos** (bulto = caja master). **Regla de dos personas:** quien picó no da la conformidad. Al conformar, el stock pasa al área de **Despacho**.
5. **Ruta** (tipo A): el Jefe de Transporte asigna la orden a una ruta con vehículo, conductor y auxiliar de transporte del día; puede planificarla antes, desde el paso 2. Va **antes** de la guía para que esta tome sus datos.
6. **Guía electrónica** (tipo A) con la API de **Nubefact**, desde la Orden de Salida conformada. Se completa sola (destinatario, productos línea por lote en BX, punto de partida Lurín con ubigeo, punto de llegada, motivo VENTA, modalidad TRANSPORTE PRIVADO, bultos, vehículo y conductor, observación de almacenamiento). El Jefe de Transporte solo completa o confirma **fecha de inicio del traslado** y **peso bruto** (12 kg por defecto, editable; el peso por producto queda **preparado en el maestro** y se usará después). «Emitir guía» envía a Nubefact y guarda número, estado de SUNAT, PDF y XML; si SUNAT rechaza, se muestra el error en lenguaje humano, se corrige y se reenvía. **Tipo B: no se genera guía**; se despacha con la GRE que sube el cliente con su orden.
7. Después: paquete documental, embalaje (solo pedidos a provincia, en Despacho), carga, Liberar unidad y Salida confirmada (A), o entrega al transportista del cliente (B).

**Nubefact:** credenciales solo como variables de entorno. Entorno de pruebas si existe; si no, un simulador con el mismo contrato. Nada se emite en producción hasta que Sebas lo apruebe.

**Integración con Pedidos:** Pedidos emite la factura y necesita la guía. Al emitirse la guía, el WMS envía a Pedidos el número de guía y las líneas conformadas con lote, vencimiento y cantidad. Esto vuelve **indispensable la conexión real con Pedidos antes de producción** (D-80): no se ejecuta hasta la aprobación de Sebas y queda como requisito de salida a producción.

**Anulación de guía y reversa (Jefe de Transporte, con motivo; una guía nunca se borra ni se edita):**
- **Caso 1** — error en datos del traslado (placa, conductor, fecha, peso) antes de la salida: se anula la guía, la Orden de Salida no cambia, se corrige y se emite otra.
- **Caso 2** — error de contenido (lote o cantidad) antes de la salida: se anula la guía, la Orden vuelve a conformidad, se corrige la línea, otra persona confirma de nuevo, el sistema hace los movimientos de stock entre Despacho y el rack y se emite otra guía.
- **Caso 3** — después de la salida confirmada: no se anula desde el WMS; se corrige con el retorno como recepción (devolución) y una nueva Orden de Salida con su guía.
- Con la guía anulada y sin guía nueva, la Orden queda **bloqueada para carga y salida**.
- Al anular, el WMS avisa a Pedidos para que Contabilidad decida (anulación o nota de crédito); **el WMS no toca la factura**.
- Las reglas de SUNAT para dar de baja una guía (plazo, medio, si aplica tras iniciar el traslado) y el soporte en la API de Nubefact: **configurable y pendiente de validar con Contabilidad y Nubefact**. No se inventa la regla tributaria.

## 2. Guía dentro de la app (OS-4)

Cada Orden de Salida (y cada ingreso) muestra su avance por pasos (hechos, actual, pendientes), quién debe hacer el siguiente y un botón directo; «Mis tareas» en Inicio por rol y urgencia; estados vacíos que dicen qué hacer; breve guía la primera vez en cada pantalla (se puede volver a ver); Salidas en **tabla en PC**; el teléfono queda como opción para el picking. Después de cada acción se confirma qué pasó y qué sigue.

## 3. Áreas y estados (OS-1)

- Áreas habilitadas: **Recepción, Cuarentena, Aprobados, Contramuestra, Bajas, Devoluciones y Despacho**.
- El picking solo sale del área **Aprobados**.
- Se eliminan «Observado», «Retorno reservado» y «Pendiente de conformidad». **Embalaje no es un área**: K-M2 pasa a formar parte de Despacho.
- **Contramuestra**: solo cuando Logissa sea titular del registro sanitario o del certificado de registro (fabricación por encargo, cada lote nuevo). Hoy no aplica a Logissa. Sigue siendo un área con una o más ubicaciones.
- **RESERVA** (reemplaza el «hold» y el acondicionamiento de «Calidad»): es un **estado**, no un área. El lote sigue Aprobado pero no se puede picar ni asignar. Lo aplican y lo quitan el Jefe de Transporte y Dirección Técnica, con motivo. Físicamente se mueven a ubicaciones de nivel 4; el sistema no lo exige.

## 4. Retornos (OS-5)

Todo lo que salió y vuelve, rechazado o no entregado, entra como una **recepción tipo devolución**: estado Devoluciones, acta de recepción y acta organoléptica al 100 %, y Aprobado o Bajas. Un pedido no entregado que se reprograma se prepara desde cero con una **nueva Orden de Salida**. (Ajusta S11 del plan.)

## 5. Liberación de productos — LS-POE.04.05 (OS-5)

- Productos de Logissa: Sandra hace la evaluación organoléptica y Katia emite el dictamen (como hoy).
- Productos de clientes de almacenamiento: libera el **DT del cliente**. Hasta tener los accesos de clientes, Sandra o Katia registran el dictamen del DT del cliente (adjuntan el documento recibido por correo, con cantidades liberadas y rechazadas) y confirman el cambio de estado. Después (con SEC1), un rol **«DT de cliente»**, ligado a su propietario, podrá liberar o rechazar el stock de su propietario con ese único permiso.
- Una observación reversible deja el producto en Cuarentena hasta la disposición final.
- El WMS reemplaza el LS-FR.04 Control de Status (el procedimiento se actualizará después).

## 6. Muestreo — tabla LS-TB.02.02 (reemplaza √n+1) (OS-5)

- Lotes de menos de 100 unidades: 100 %. Devoluciones: 100 %.
- **Simplificada** (por defecto): 100–1.000 → 20; 1.001–10.000 → 30; 10.001–100.000 → 80; más de 100.000 → 150.
- **Normal** (automática si es producto o proveedor nuevo, primera recepción): 50; 150; 300; 500.
- **Estricta** (productos con antecedentes de calidad, a marcar por DT): 100 %.
- La tabla va como parámetro, con su código y vigencia.

## 7. Vencidos, devoluciones a proveedor y salidas sin venta (OS-6)

- **Stock de Logissa** (distribuidora): la **devolución al proveedor** es una salida normal (Biosana, Prades Lab…) y solo se permite **antes del vencimiento**, según la política de canje. Lo vencido de Logissa solo va a Bajas.
- **Stock de clientes de almacenamiento** (AJR, Diphasac, Medic Pharma, Triamed): lo vencido solo va a Bajas y sale a **destrucción** cuando el cliente lo indica, coordinado entre ambos DT. No se devuelve vencido a nadie.
- Salidas sin venta de Logissa: muestras (y devolución al proveedor, antes del vencimiento).
- Motivos de la Orden de Salida tipo B: **venta, pesquisa DIGEMID (nunca de vencidos), muestra y destrucción (solo desde Bajas)**.

## 8. Bajas (OS-6)

- Sustento por motivo (aprobado por Katia): **vencido** → la fecha (el sistema propone y DT confirma); **deterioro o daño** → evaluación tipo acta organoléptica; **alerta o retiro de DIGEMID** → adjuntar la alerta; **observación del proveedor o fabricante** → adjuntar su comunicación.
- Documento obligatorio: la **Orden de Baja LS-FR.56.01**: solicitante (Katia), motivo de traslado, N.° de documento, fecha, nombre, cargo y por línea producto, presentación, registro sanitario, lote, vencimiento, cantidad y motivo, con V°B°. Se integra con BJ1.

## 9. LS-FR.43.03 (OS-7)

- **USUARIO** = el Jefe de Transporte (Roberto). **N.° de cajas = bultos** (caja master).
- **Temperatura:** data logger **Elitech GSP-6**. Al cerrar la ruta se adjunta el archivo descargado y se registran la temperatura mínima y máxima (el formato del archivo lo pasa Sebas después).
- Se imprime una copia **antes de la salida**, que viaja con el conductor.
- Firmas físicas (conductor y DT); se sube el escaneo firmado.
- Conservación: **5 años**, en físico y en digital (el escaneo en el WMS).

## 10. Carga inicial — cambio de sistema, no reproceso (OS-7)

El stock de Odoo entra **directo a su estado y ubicación**: Aprobados en su ubicación, Bajas en Bajas y Cuarentena en Cuarentena, **sin acta organoléptica**. En el historial y el Kardex se ve el recorrido: *ingreso por carga inicial en Cuarentena → liberación → ubicación final*. Katia valida la carga con **una sola confirmación**; todo lote debe tener lote y vencimiento.

## 11. Permisos y otros (OS-1)

- **Auxiliares de transporte:** Alberto, Christians, Sandra y Jose Carlos; rotan, y en cada ruta se elige quién va ese día.
- **Jefe de Almacén y Jefe de Transporte tienen también TODOS los permisos del auxiliar.**
- El cargo de Roberto es «Jefe de Transporte».
- **Kardex:** código controlado **LS-FR.41** (reemplaza el provisional).
- Acta de Recepción **LS-FR.03.05**: sin cambios.
