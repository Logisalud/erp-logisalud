# Seguimiento para el cliente (G.2)

**Estado (2026-11-11): ENCENDIDO por decisión de Sebas (migración 0054: basta el interruptor, también en el piloto).** Nada se envía a ningún cliente: es una página pública donde el cliente escribe su pedido y su RUC; el enlace con token lo genera el personal. Para apagarlo: `update wms.parametros set valor = 'false' where clave = 'seguimiento_cliente_habilitado'` (administrador de la base). El botón de Pedidos NO está implementado: queda planificado aquí para que Sebas lo apruebe.

## Qué ve el cliente
Una página pública (`/wms/seguimiento`, sin usuario, sin menú ni banner de empleados) donde escribe su **número de pedido y su RUC** y ve la **línea de tiempo con fecha y hora**: pedido recibido, en preparación, listo para salir, en ruta, entregado (o «no se pudo entregar» / «cancelado»). **Sin hora estimada, sin precios, lotes ni datos del personal.**
También hay un **enlace con token** (`/wms/seguimiento/<token>`): 4 UUID aleatorios pegados (≈488 bits), en la base solo queda su **hash SHA-256**, con **vigencia** (1 a 90 días) y **revocable**. Un enlace inválido, vencido o revocado responde siempre lo mismo.

## Seguridad
- **Límite de intentos** (migración 0047): 5 fallos por pedido, 8 por IP y 300 globales en 15 minutos; después, espera con mensaje en lenguaje llano. La respuesta es **idéntica** si el pedido no existe o el RUC no coincide (y el límite por pedido cuenta igual aunque no exista): no revela si el pedido existe. El límite por IP es de mejor esfuerzo (la IP la manda la aplicación); el límite por pedido y el global no se pueden esquivar.
- El cliente (rol `anon`) solo puede llamar a **dos funciones** (`seguimiento_consultar`, `seguimiento_por_token`); ninguna tabla ni la vista tienen permiso para él. Generar y revocar enlaces es del personal con permiso de preparar salidas.
- **Apagado:** el parámetro `seguimiento_cliente_habilitado` nace `false` y **solo lo cambia un administrador de la base** (un disparador lo impide a la aplicación). Aunque se encienda, con `modo_piloto = si` la página responde **«Seguimiento aún no disponible»**, no se genera ningún enlace y no se envía ningún correo (no hay código de correo en el WMS; tests `piloto-apagados`, `seguimiento`).

## Para encenderlo (go-live, con aprobación de Sebas)
`modo_piloto = no` (y `WMS_GO_LIVE=1`) **y** `update wms.parametros set valor = 'true' where clave = 'seguimiento_cliente_habilitado'` por un administrador de la base.

## Planificado en Pedidos (NO implementado; pendiente de aprobación)
1. Botón **«Copiar enlace de seguimiento»** en el pedido (solo para el vendedor dueño del pedido o el administrador de Pedidos).
2. Pedidos llama a una ruta del WMS firmada con HMAC (la misma firma de la integración) que ejecuta `crear_enlace_seguimiento(numero, 30)` y devuelve el enlace; Pedidos solo lo copia al portapapeles y **no lo guarda**.
3. «Revocar enlaces» en el mismo pedido (`revocar_enlaces_seguimiento`).
4. El vendedor lo pega en WhatsApp: el WMS no envía correos ni mensajes.
Riesgos a decidir: quién puede generar enlaces y la vigencia por defecto (propuesta: 30 días).

## Estado de pagos del cliente (0068, 13-nov-2026)
Debajo de la línea de tiempo del pedido, el cliente ve su **estado de pagos** (decisión de Sebas, ver `decisiones-pendientes.md`):
- **Con documentos vencidos:** «Tus pagos pendientes» y una **tabla simple** (Documento · Venció · Atraso · Saldo; hasta 30 documentos, los más atrasados primero) con el **total al pie**, y qué hacer («Si ya pagaste, puede que aún no lo hayamos registrado: avísale a tu asesor comercial… Gracias por tu comprensión.»). Tono tranquilo, a pedido de Sebas: tarjeta neutra, sin colores de alarma y sin las palabras «moroso», «deuda» ni «urgente».
- **Al día:** «¡Estás al día en tus pagos! 😊 Gracias por la confianza.»
- **Sin datos** (Cobranzas no conoce el RUC, está apagado o falta Cobranzas): no se muestra nada.
- Sale de `public.fn_documentos_cobranza(fecha)` y `public.clientes` (Cobranzas): el WMS solo los lee. Ver `supabase/migrations/0068_wms_seguimiento_estado_de_pagos_del_cliente.sql`.

**Para encenderlo (con aprobación de Sebas):** aplicar la 0068 a mano y, un administrador de la base: `update wms.parametros set valor = 'true' where clave = 'seguimiento_deuda_habilitado'`. Para apagarlo: `… valor = 'false'`. Depende de que el seguimiento (`seguimiento_cliente_habilitado`) esté encendido.
Pruebas: `tests/db/seguimiento-deuda.test.ts` (Cobranzas simulada), `tests/services/demo-seguimiento.test.ts`, `tests/components/seguimiento.test.tsx`, `tests/domain/seguimiento.test.ts`.
