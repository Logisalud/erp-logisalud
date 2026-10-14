# Facturas incobrables — 2026-10-12

Pedido de aromero@logisalud.com: una factura que nunca se va a cobrar —una
estafa— no puede seguir inflando la cartera y la morosidad del vendedor.

## Qué se construyó

Una factura así **no se borra ni se anula**: se emitió y SUNAT la tiene. Lo
que se hace es sacarla de la cobranza dejando escrito por qué.

- **`documentos_incobrables`** (migración `20261012_documentos_incobrables.sql`):
  factura, **motivo obligatorio** (mínimo 15 caracteres), quién la marcó y
  cuándo. Borrar la fila revierte la baja.
- **`v_cobros`** la trata como saldada, igual que el factoring: saldo 0,
  fuera del vencido y de la morosidad. Si tuviera letras, también dejan de
  sumar.
- **`v_saldos`** gana tres columnas al final: `incobrable`,
  `incobrable_motivo`, `incobrable_fecha`.
- **Botón en `/cobranzas/registrar-pago`**, la pantalla donde se ve una
  factura con su desglose: "Dar de baja por incobrable…" pide el motivo, y
  "Devolver a la cartera" revierte. **Solo admin** (`AREAS_INCOBRABLE`, lista
  vacía + el pase de admin de `exigirArea`).
- **Visible donde ya se mira**, sin pantalla nueva: badge negro "Incobrable"
  en la tarjeta de la factura y en la tabla de facturas del estado de
  cuenta, con el motivo como tooltip; la línea **"Dada de baja por
  incobrable"** en el desglose del saldo (`lib/desglose.ts`) y en el extracto
  del cliente (`lib/estado-cuenta.ts`). El estado nunca dice "Pagado":
  nadie pagó.

## La primera factura dada de baja

**FFF1-2078 — CONSTRUCTION INVESTMENTS S.A.C.** (RUC 20551523226), emitida
el 12/08/2026, CONTADO, **S/ 12.000,00**, vencida hacía 61 días, sin un solo
pago ni letra. Cartera de Teresa Samanez (CKA2003). Motivo guardado: estafa,
el cliente recibió la mercadería y desapareció.

| | Antes | Después |
|---|---:|---:|
| Cartera total | 628.754,59 | **616.754,59** |
| Vencido total | 204.682,37 | **192.682,37** |
| Morosidad general | 32,6% | **31,2%** |
| Teresa Samanez — saldo | 66.479,97 | **54.479,97** |
| Teresa Samanez — morosidad | 34,1% | **19,6%** |

## Verificación

- Las dos vistas se reemplazaron **antes** de marcar nada y la cartera quedó
  idéntica (628.754,59 con 0 incobrables): el cambio de reglas por sí solo
  no movió un peso.
- Después de marcar la factura, la cartera bajó **exactamente S/ 12.000**, y
  el vencido lo mismo. Nada más se movió.
- `npm run build:cobranzas` en verde.

## Lo que esto NO hace

Es **cobranza, no contabilidad**. No anula la factura ante SUNAT, no emite
nota de crédito y no recupera el IGV ya pagado por esos S/ 12.000. El
castigo tributario de la deuda incobrable es un trámite aparte, con sus
propios requisitos (gestión de cobro documentada, antigüedad, protesto).

## Cómo revertirlo

Una factura puntual, desde la pantalla ("Devolver a la cartera") o:

```sql
delete from documentos_incobrables where documento_id = '<id>';
```

La función entera (vuelve todo a como estaba el 12/10):

```sql
drop view if exists v_saldos;  -- recrear desde la definición anterior
drop view if exists v_cobros;
drop table if exists documentos_incobrables;
```
