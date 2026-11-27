# Devoluciones en espera (diseño acordado, sin construir)

Decisión de Sebas del 27-nov-2026, tras la prueba del equipo. **No se construye todavía**: este documento fija el
diseño para cuando se haga. Fuente: `docs/wms/procesos/DEV-01` (el archivo del proceso aún no está en el repositorio;
subirlo antes de construir).

## El caso

- Cada devolución es un **caso** con correlativo **DEV-AAAA-NNNNN** (se reinicia cada año).
- **Lo abren** Maricielo (Jefe de Transporte) o Roberto, buscando la **salida original** por número de guía o de pedido.
  El caso queda ligado a esa salida (cliente, productos, lotes y cantidades salen de ahí; no se tipean).
- **El vendedor no opera el WMS**: solo reenvía el correo del cliente a la persona de devoluciones.

## Aprobación

- **Natalia** aprueba en el WMS con su usuario (rol nuevo `aprobador_devoluciones`).
- **Roberto puede autorizar en ruta** (el cliente rechaza en la entrega), con **motivo obligatorio** y **aviso a Natalia**.
- La autorización **crea la solicitud de ingreso preliminar** tipo **Devolución**, ligada al caso.

## Facturación

- **Arlette** (rol nuevo `facturacion`: ve casos y pre-guías, registra factura y nota de crédito) recibe un aviso con el
  **acta de recepción** y emite la **nota de crédito por lo recibido**, **sin esperar la evaluación sanitaria**.

## Cierre

- **Doble cierre**: comercial (nota de crédito registrada) y sanitario (acta organoléptica firmada por DT con su
  decisión). El caso se cierra cuando están los dos.
- **Alerta** si el caso pasa **2 días hábiles** sin avanzar (a quien tenga el siguiente paso).
- **La GRE original no se anula.**
- **Los no entregados** (la mercadería vuelve sin haber sido entregada) siguen como **recepción tipo devolución sin nota
  de crédito**.

## Después (fuera de este diseño)

- Rechazo desde el celular del conductor («Mis rutas», S9 y S10).
- Recojo de la mercadería y Green.
- Formato de Transporte.
- Canjes.

## Reglas que ya existen y se mantienen

- Lo devuelto nace en el **Área de Devoluciones** de su propietario con estado sanitario **Devoluciones** (no pasa por
  Cuarentena ni por Recepción como estado).
- Acta organoléptica por producto y lote, muestra al 100 % (LS-TB.02.02).
