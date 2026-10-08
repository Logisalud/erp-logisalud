# ADR-009 — La Solicitud de Ingreso es primaria; la recepción la verifica; Devoluciones es un estado

**Estado:** aceptada (decisiones D-31..D-35 confirmadas por el usuario, 2026-10-08). **Reemplaza** el flujo de ADR-008 en lo que contradice.

## Contexto
El Batch 2 modelaba el ingreso a partir de una recepción ya registrada en Compras y se tecleaban los lotes en el almacén. El addendum del 2026-10-08
corrigió el flujo real: se **anuncia** (solicitud), se **verifica** al llegar, se firma el acta y recién entonces nace el inventario.

## Decisión
1. **Solicitud de Ingreso primaria** (`SI-AAAA-NNNNN`, correlativo por año, sin inventario). Una compra se prepara desde la OC (lectura de Compras);
   la línea de la OC se divide en lotes. La preparan y autorizan Sandra y Katia (D-32). Se corrige **en el mismo correlativo**, sin límite de vueltas,
   con historial campo a campo (antes/después/quién/cuándo/motivo) y versiones; lo anunciado (`cantidad_inicial`) no se reescribe.
2. **La recepción verifica**: por línea, "Coincide" o "Hay una diferencia" (cantidad, lote o vencimiento) que actualiza la solicitud con motivo (D-35: un lote
   distinto es un ajuste explícito, no un rechazo). Toda diferencia avisa a Sandra y a Katia (D-34). El acta sale prellenada de la solicitud final.
3. **Seis cantidades separadas** (OC, solicitud inicial, final, factura, física confirmada, inventario); el WMS no toca OC ni factura.
   Exceso sobre el saldo de la OC → `EXCEDE_OC` a Katia; el WMS registra lo físico y no lo resuelve (D-33).
4. **Integración con Compras manual**: el bloque "Cantidad física confirmada" muestra el valor para copiarlo; `estado_registro_compras` compara
   lo esperado (lo que Compras tenía + lo físico de las solicitudes cerradas) con `cantidad_recibida` → OK / FALTA / NO COINCIDE, con alertas
   `POR_REGISTRAR_EN_COMPRAS` (plazo 24 h) y `NO_COINCIDE_CON_COMPRAS`. Sin sincronización automática.
5. **Estado sanitario `DEVOLUCIONES`** (D-31): la devolución nace en el Área de Devoluciones y **nunca pasa por Cuarentena**; su Acta Organoléptica la
   lleva a Aprobado o Bajas/Rechazados. Compras y clientes nacen en Cuarentena. Aprobado nunca vuelve a Cuarentena ni a Devoluciones.
6. Actas: anular exige motivo; la reemisión usa número nuevo; un número anulado no se reutiliza.

## Consecuencias
Migración 0005 (re-ejecutable, **sin aplicar**). `/entradas/[id]` es el id de la solicitud. El adaptador Supabase no se ejecutó contra una base real.
Reversible: es un cambio de modelo en código y migración aún no aplicados.
