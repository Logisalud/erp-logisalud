# Flujo con pre-guía — diseño para aprobar (Sebas, 2026-11-11)

Orden nuevo: **Orden de Salida → picking → conformidad → PRE-GUÍA → ruteo → envío a Nubefact.** Este documento fija las reglas antes de tocar la numeración fiscal (es lo más delicado del WMS: SUNAT no admite saltos ni repetidos). Nada de esto está construido todavía.

## Estados de la guía
`PRE_GUIA` (número reservado, vehículo y conductor en blanco; no se envía) → `LISTA_PARA_ENVIAR` (la ruta ya le puso vehículo y conductor) → `ENVIADA` (Nubefact la recibió; espera a SUNAT) → `ACEPTADA` / `RECHAZADA`; además `CANCELADA` (la pre-guía se canceló). Con consulta automática del estado (ya existe).

## Numeración
- **Contador propio del WMS** para la serie TTT1: `wms.guia_contador` (siguiente número). En la demo, uno de prueba; en diciembre inicia en el correlativo que indique Sebas (hoy se confirma con «Numeración de guías»).
- La pre-guía se **crea al dar la conformidad** y **reserva el siguiente número en ese momento** (atómico). Nubefact permite que quien emite elija el campo `numero`; se envía **ese mismo número**.
- **Un número reservado nunca se reutiliza.** Si la pre-guía se cancela (con motivo), su número pasa a la lista **«Números sin usar»**, que se decide con la contadora (anularlo, usarlo en una guía de relleno, etc.). Nunca se asigna solo a otro pedido.
- **Salto:** como SUNAT pide correlativo, un número reservado y no enviado puede crear un hueco hasta que se envíe o se resuelva; por eso la pantalla de «Números sin usar» y las alertas de pre-guías sin ruta (más de X horas).
- Una guía por pedido (supuesto de Sebas; se corrige si no).

## Del pre-guía a la guía
- Al **asignar la ruta** (vehículo y conductor), el sistema copia vehículo y conductor a la pre-guía y la deja **«Lista para enviar»**. Si cambian después (otro vehículo o conductor), se actualizan mientras no se haya enviado.
- **Roberto la envía con el mismo número.** El botón queda **bloqueado con un mensaje claro** mientras no haya ruta (o vehículo y conductor).
- La pre-guía **se puede imprimir** (PDF con marca «PRUEBA, NO FACTURAR» en el piloto) y la **guía enviada a Nubefact también** (PDF con su serie-número y el enlace de Nubefact cuando SUNAT acepta).
- Si cambian líneas o lotes después del aviso a Arlette, se vuelve a avisar («cambio posterior al aviso»).

## Aviso a Arlette (contabilidad)
Por cada pre-guía: aviso **dentro del sistema** (bandeja) y **por correo** con el número reservado y las líneas con lote. En el piloto: «PRUEBA, NO FACTURAR». Correo sin costo adicional: enviar con el **SMTP del correo de la empresa** (Google o Microsoft 365, que ya pagan) desde una cuenta de servicio; las credenciales las carga Sebas en Vercel (no se piden aquí). Si no se puede, queda solo dentro del sistema. Su correo lo pasa Sebas.

## Lo que se toca en la base (migraciones nuevas, a mano)
0054: `guias_remision.fase`, `wms.guia_contador`, `wms.crear_pre_guia`, `wms.completar_pre_guia` (la ruta), lista «números sin usar», y el paso del envío para que **adopte** la pre-guía en vez de reservar un número nuevo (hoy reserva uno nuevo: «una sola guía en curso por serie», que no sirve con varias pre-guías a la vez). Pruebas de numeración: reserva concurrente, sin repetidos, cancelación → «sin usar», envío bloqueado sin ruta.

## Qué ya existe y no se rehace
- **Seguimiento para el cliente** (`/wms/seguimiento`: número de pedido + RUC, línea de tiempo; también enlace con token). Construido, **apagado en el piloto**: ver `docs/wms/piloto/seguimiento-cliente.md`.
- **Pantalla del transportista** (`Mis rutas`, celular): conductor y auxiliar de transporte reportan «llegué», «entregado» (con quién recibió y foto), «no entregado», «rechazado» e «incidencia».
