# WMS — Decisiones pendientes

Cada decisión bloquea **solo su pieza**; el resto sigue. Tipo: N = negocio, S = sanitaria,
R = regulatoria, D = datos, O = operativa/permiso.
Actualizado: 2026-10-08 (aprobación del Batch 1; D-28 aceptada; D-29 nueva).

**Ninguna decisión abierta impide el Batch 1.** El Gate 0 fue confirmado y el Batch 1 está en curso.

## Abiertas

| ID | Tipo | Tema | Pieza que bloquea | ¿Bloquea Batch 1? | Propuesta mientras tanto | Decide |
|---|---|---|---|---|---|---|
| D-01 | S | Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena o conserva Aprobado? | Ingreso de compra a Diphasac (Batch 2) | No | Cuarentena (supuesto de reglas) | Katia |
| D-06 | D | E-9.1 y E-10.1 de Logissa | Carga de posiciones | No | Se crean de Logissa, "por verificar" | Charlie |
| D-08 | S | A-13.1, J-11.1, J-11.3, J-13.4: Odoo las trae en Stock; topología las pone en otra área | Carga inicial (Batch 3) | No | Área de topología; stock existente sin confirmar | Katia |
| D-09 | S | Estado sanitario del stock inicial de Odoo (supuesto: Aprobado) | Carga inicial en real (Batch 3) | No | La herramienta no confirma sin decisión | Katia |
| D-10 | R | Adenda AJR: solo se ve la firma de Logissa; el punto SEGUNDO no tiene contenido | Vigencia de AJR | No | Se registra "por confirmar firma" | Sebas |
| D-11 | R | Validez ante DIGEMID de la firma electrónica simple (usuario + hash) y de la firma táctil del transportista | Firma de actas (Batch 2) | No | Firma simple con hash; modelo abierto a firma digital | Katia / Sebas |
| D-12 | R | Cambios al formato controlado LS-FR.03.05 (agregar DNI del transportista; "Ingreso de cliente" no tiene casillero) y a LS-FR.05.05 | PDF del Acta de Recepción (Batch 2) | No | DNI como línea adicional; "Ingreso de cliente" en OTROS con texto | Katia (control documental) |
| D-13 | N | Numeración del Acta de Evaluación Organoléptica (LS-FR.55.02 no la tiene) | Acta organoléptica (Batch 2) | No | Correlativo interno `O-AAAAMM-NNNN` | Katia |
| D-15 | N | Movimientos: ¿el que prepara puede verificar? Roberto y Jasury no aparecen en los mapeos | Verificación de movimientos (Batch 3) | No (la regla verificador ≠ ejecutor sí se construye en la base del ledger) | Verificador ≠ ejecutor; el preparador puede verificar si no ejecutó | Charlie |
| D-17 | S | Pendientes 2–7 de reglas-negocio.md (destino de rechazados, hold, documentos de baja, contramuestra, muestreo, "Calidad") | Cada pieza respectiva (Batch 2/3) | No | No se implementan; muestreo parametrizado | Katia |
| D-22 | O | Exponer el schema `wms` en Data API y registrarlo en `schemas_compras_y_pagos()` | Pruebas contra Supabase real | No (con Postgres local no hace falta) | Pendiente | Sebas |
| D-23 | O | Fila en `public.modulos` y rewrite `/wms` en cobranzas | Acceso desde erp.logisalud.com | No | No se toca | Sebas |
| D-26 | N | Exportación de Odoo con stock real (producto, lote, vencimiento, cantidad por ubicación): no está en el repo; el Excel de `layouts/` es solo el árbol de ubicaciones | Carga inicial en real (Batch 3) | No | Herramienta con datos de prueba | Sebas |
| D-28b | O | **Plazo máximo de "Aprobado · por trasladar"**: tras ese tiempo el Jefe de Almacén recibe una alerta. Parámetro `plazo_por_trasladar_horas` en `wms.parametros` (por defecto **24 h**) | Valor definitivo y destinatario de la alerta (la alerta se construye en el Batch 2 con el valor por defecto) | No | 24 horas | Katia / Charlie |
| D-30 | S | **Alerta de vencimiento de lotes en el inventario:** días de anticipación (propuesta 90, parámetro `lote_dias_alerta_vencimiento`), quién recibe cada alerta (propuesta: por vencer → Jefe de Almacén; vencido → Dirección Técnica, que decide la baja) y si se excluye algún estado | Valores definitivos de la alerta (ya construida con la propuesta) | No | 90 días; excluye Bajas/Rechazados | Katia / Charlie |
| D-29 | D | **Código controlado del formato de Kardex de Logisalud.** El ejemplo de `formatos/` trae el código CF-FO-010, que parece de otra empresa. Hasta que se defina, el PDF del Kardex lleva un código provisorio configurable | PDF del Kardex (Batch 3) | No | Parámetro `kardex_codigo_formato`, vacío = "Código por asignar" | Katia (control documental) |

## Resueltas (2026-10-07)

| ID | Resolución | Dónde quedó |
|---|---|---|
| D-02 | Quien registra Aprobado o Bajas/Rechazados es Katia, al firmar el acta organoléptica en el WMS. Charlie no ejecuta ese cambio. | reglas-negocio.md (Estado sanitario) |
| D-03 | *(Reemplazada por el addendum 2026-10-08)* Una OC puede tener varias **solicitudes**; cada solicitud es un ingreso distinto. | reglas-negocio.md (Tipos de ingreso); gate-0.md C.6 |
| D-05 | El rack A llega a A-27 (los planos lo dibujan). Se corrige `topologia.md` en la rama; llega a `main` con el PR del Batch 1. | topologia.md |
| D-14 | El cargo es "Jefe de Almacén" en la interfaz y en el acta. | reglas-negocio.md (Roles) |
| D-20 | Base de pruebas: Postgres local, sin costo adicional (ni branch de Supabase ni servicios pagos). | gate-0.md §G |
| D-04 | Lo rechazado en la puerta no entra al WMS: la **Solicitud final** es lo autorizado a ingresar (antes: lo que registraba Compras). | gate-0.md C.6 |
| D-07 | Las posiciones sin propietario (I-8.1..I-8.4, J-12.4) quedan libres. | Seed de topología |
| D-16 | Unidades enteras, las mismas de Compras. | gate-0.md C.6; CHECK de enteros en el ledger |
| D-18 | Los ajustes los aprueba Katia. | gate-0.md D |
| D-19 | *(Cambia de sentido con el addendum)* La cantidad física nace en el WMS; si lo que se copia a Compras no coincide, el WMS alerta (`POR_REGISTRAR_EN_COMPRAS` / `NO_COINCIDE_CON_COMPRAS`). Nunca cambia solo. | gate-0.md (alertas, Batch 2) |
| D-21 | Se crea el proyecto Vercel `erp-logisalud-wms`, solo Preview, con filtro para construir únicamente cuando cambie `apps/wms` o sus paquetes compartidos. Vercel Pro; costo de build aprobado. Tras configurarlo se recarga y verifica. | gate-0.md E.5; progreso.md |
| D-24 | Autorizada la lectura en producción, solo lectura, **del área y el rol** de `public.perfiles` (nada más: sin nombres). **Resultado:** 15 perfiles; `direccion_tecnica` tiene 2 (1 admin y 1 operativo), `almacen` tiene 3 (operativos). Es compatible con Katia y Sandra en Dirección Técnica, pero **no puedo decir quién es quién** sin leer nombres. Hay solo 3 perfiles de almacén para unas 6 personas: el resto aún no tiene perfil (hay 34 en `usuarios_esperados`). Los roles WMS se asignan en `wms.usuario_roles`. | progreso.md |
| D-25 | Del transportista se registran nombre, DNI y placa. | reglas-negocio.md; formato LS-FR.03.05 |
| D-28 | **Aceptada** el 2026-10-08: el estado "Aprobado · por trasladar" existe (cambio de estado en el lugar, ADR-006) con un plazo máximo configurable. El plazo lo definen Katia y Charlie (ver D-28b); por defecto 24 horas. | ADR-006; `wms.parametros` |
| D-31 | Una devolución espera su evaluación en el estado nuevo **DEVOLUCIONES («Devoluciones»)**, un estado sanitario propio, en el Área de Devoluciones, y nunca pasa por Cuarentena. Pasa a Aprobado o Bajas/Rechazados previa su Acta Organoléptica (2026-10-08). | reglas-negocio.md; migración 0005; ADR-009 |
| D-32 | Sandra y Katia autorizan las solicitudes; con el portal de clientes, el cliente la crea y ellos la autorizan (2026-10-08). | ADR-009 |
| D-33 | Si llega más que el saldo de la OC: el WMS registra lo físico y alerta `EXCEDE_OC` a Katia y a Compras; no lo resuelve (2026-10-08). | ADR-009 |
| D-34 | Solicitud con formato **SI-AAAA-NNNNN** (por año); toda diferencia entre solicitud inicial y final notifica a Sandra y a Katia (2026-10-08). | ADR-009 |
| D-35 | Un lote declarado distinto del físico deja de ser rechazo automático: es un **ajuste explícito con motivo** y con historial (2026-10-08). | ADR-009 |
| D-27 | Modo demostración con datos de prueba: **solo en Preview**, aviso visible "DEMO", sin conexión a ninguna base real, imposible de activar en producción. | gate-0.md §G; `apps/wms/lib/demo.ts` |
| — | Estado sanitario por unidad (no por lote): el lote ABC aprobado + nueva entrega del mismo lote nace en Cuarentena con su propia acta; la aprobación no se hereda y la anterior no vuelve a Cuarentena. | gate-0.md C.7 (`procedencia_id`) |
| — | Vencimiento: se registra la fecha completa del producto físico; solo si el producto muestra mes y año se usa el último día del mes. | reglas-negocio.md (Recepción 2) |
