# Integración WMS → Compras (D-36) — opciones, sin implementar

**Estado:** enfoque **aprobado en dos fases** por Sebas (2026-10-08); **nada está implementado en Compras ni en el WMS** y se hará **después del Batch 3 y antes de la salida a producción**, con aprobación previa del cambio concreto en Compras.

> **Fase 1 — solo lectura:** Compras muestra, junto a su campo de cantidad recibida, la «cantidad confirmada en el WMS» (vista aditiva del WMS; equivale a la opción A de abajo, sin el botón de copiar).
> **Fase 2 — automática:** Compras toma la cantidad del WMS y se elimina la copia manual (opción B/C, a definir con Compras cuando llegue el momento).

**Estado anterior:** abierta. Este documento solo plantea las opciones y lo que
cada una le exige a Compras, para que Sebas decida con quien lleve Compras.

## Punto de partida (decidido)

- **El dueño de la cantidad física es el WMS.** Es quien cuenta, verifica contra la Solicitud de Ingreso y confirma con el acta firmada.
- Hoy la integración es **manual y temporal**: el WMS muestra el bloque «Cantidad física confirmada» y alguien copia ese número a la recepción
  de la OC en Compras (`ordenes_compra_items.cantidad_recibida`). El WMS concilia (`estado_registro_compras`: OK / FALTA / NO COINCIDE) y avisa
  (`POR_REGISTRAR_EN_COMPRAS` a las 24 h, `NO_COINCIDE_CON_COMPRAS`, `EXCEDE_OC`).
- El problema: **doble registro** (el WMS confirma, una persona vuelve a teclear en Compras) con riesgo de error y de atraso.
- El WMS solo **lee** de Compras (`v_oc_lineas`, `v_oc_items`, cantidad facturada) y nunca escribe en sus tablas.

## Opciones

### A. Compras lee la cantidad del WMS (vista de solo lectura) — *recomendada como primer paso*
El WMS expone una vista aditiva `wms.v_cantidad_fisica_confirmada` (OC, línea de OC, cantidad física confirmada, fecha, acta). Compras la muestra
en su pantalla de recepción como **«Recibido según almacén»** con un botón «Usar esta cantidad» que la copia a `cantidad_recibida`.
- **Para Compras:** un cambio de pantalla y un permiso de lectura sobre el schema `wms` (grant a la vista). Su tabla y sus reglas no cambian.
- **Pros:** reversible, aditivo, no hay doble tecleo (un clic), la persona de Compras sigue siendo quien cierra su registro.
- **Contras:** sigue habiendo una acción humana; dependencia de lectura entre módulos (Compras conoce la existencia de la vista).

### B. Sincronización automática (el WMS escribe en Compras)
Al confirmar el ingreso, una función del WMS actualiza `cantidad_recibida` de la línea de OC.
- **Para Compras:** debe aceptar que otro módulo escriba en sus tablas: revisar triggers, estados de OC (`parcialmente_recibida`/`recibida`),
  cálculo de saldos, conciliación con facturas, auditoría y RLS. Hoy los tres módulos comparten proyecto pero **no** comparten escritura.
- **Pros:** desaparece el doble registro.
- **Contras:** rompe la regla «cambios en Compras solo aditivos»; las reversas del WMS tendrían que revertir en Compras; riesgo alto si Compras
  tiene lógica derivada de `cantidad_recibida`. Requiere pruebas de regresión en Compras y aprobación explícita.

### C. Compras deriva su «recibido» del WMS (el WMS es la fuente única)
Compras deja de guardar `cantidad_recibida` como dato propio y lo calcula desde la vista del WMS.
- **Para Compras:** el cambio más grande: migrar datos históricos, cambiar todos los reportes y flujos que usan `cantidad_recibida`, y cubrir
  recepciones que no pasan por el WMS (si existen).
- **Pros:** una sola fuente de verdad, sin conciliación. **Contras:** costo y riesgo altos; sin vuelta atrás fácil.

### D. Seguir como hoy (copia manual + conciliación)
Sin cambios en Compras. Se mantienen las alertas del WMS. Aceptable como estado temporal, no como destino (D-36).

## Qué necesitamos decidir

1. ¿Quién lleva Compras y cuándo puede revisar la opción A (o B/C)?
2. ¿Hay recepciones en Compras que **no** pasen por el WMS (otros almacenes, servicios)? Si sí, C queda descartada.
3. ¿Quién cierra el registro en Compras: una persona (A) o el sistema (B)?
4. ¿Qué pasa con una **reversa** en el WMS cuando ya se copió a Compras? (en A la persona ajusta; en B hay que revertir automáticamente).

## Recomendación

Empezar por **A**: es aditiva (una vista del WMS + una columna/botón en Compras), no cambia reglas de Compras y elimina el tecleo de memoria.
Dejar B para después, con pruebas en Compras. Mientras tanto se mantiene la copia manual (D). **No se implementa nada hasta tu decisión.**
