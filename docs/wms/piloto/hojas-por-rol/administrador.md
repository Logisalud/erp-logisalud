# Hoja del piloto · Administrador

**Quién:** Sebas y Andrés. **Entras por:** `/wms/login` → menú lateral. **Piloto:** Odoo sigue siendo el sistema oficial; el Administrador puede hacer todo lo operativo y de configuración, pero **no** las decisiones sanitarias (aprobar, dar de baja, autorizar ajustes, validar un producto): esas son de Dirección Técnica.

## Qué hago
1. **Control → Carga inicial:** subo el archivo de la carga de ensayo (**Elegir un archivo CSV** o pegar las filas), pulso **Revisar la carga** y luego **Armar el informe**. Si dice «No lista para cargar», corrijo lo que indica cada línea y vuelvo a subir.
2. Cuando el informe dice «Lista para cargar» y lo vieron Katia y Sebas, pulso **Guardar como borrador**. La confirmación la hace Katia.
3. Descargo el informe con **Descargar Excel** o **Descargar CSV** y se lo paso a Katia.
4. **Control → Propietarios:** reviso de quién es cada ubicación, con su vigencia y el documento que la respalda (cambiar una asignación nunca mueve stock).
5. Cada semana reviso el Go/No-Go (`docs/wms/piloto/go-no-go.md`): saldos negativos, `verificar_saldos()`, incidencias abiertas y el respaldo diario.
6. El modo de la guía (`guia_modo`) es hoy **WMS** (el WMS prepara la guía y la envía a Nubefact en modo PRUEBA); `PANEL` es la contingencia. Se cambia en la base de datos, con el equipo técnico y con aprobación de Sebas. No hay pantalla para eso.
7. **Control → Seguimiento a clientes:** cargo el teléfono de cada vendedor (uno por uno o con un **CSV de nombre y teléfono**; el nombre debe ser como llega de Pedidos) y reviso las opciones de la pantalla del cliente: mostrar «Van X de Y», cuándo se ve la guía, número de prueba del piloto y dirección propia. Sin número cargado, el cliente no ve el botón «Escribir a mi vendedor». En el piloto el botón va al número de prueba.
8. **Control → Propietarios:** genero, copio y revoco el **enlace de stock** de cada cliente que guarda mercadería con nosotros (solo lectura).

## Qué NO hago
- No apruebo lotes, no autorizo ajustes ni bajas, no valido productos.
- No aplico migraciones ni toco la base real sin el respaldo y la aprobación de Sebas.
- No creo usuarios de cliente: ese acceso sigue apagado.

## A quién aviso
- Un error en la carga que no se entiende: **el equipo técnico**.
- Una decisión sanitaria pendiente: **Katia**.

## Esto sigue en Odoo
Stock oficial, facturación, compras y órdenes de compra, toma y validación de pedidos de venta, y todo lo que no es del alcance del piloto.
