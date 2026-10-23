-- Dos arreglos de Gastos/Anticipos reportados por Sebas el 2026-10-23.
--
-- Re-ejecutable.

-- ===================================================================
-- 1. Tipo de cambio en la solicitud
-- ===================================================================
-- Toda deuda en dólares exige tipo de cambio (`tipo_cambio_requerido`, en
-- obligaciones desde la 0001), pero la solicitud de gasto nunca lo pedía.
-- Resultado: ningún reembolso en USD se podía aprobar — los 14 de
-- suscripciones de software (G-2026-0056 a 0070) fallaban todos con el
-- error crudo de Postgres. Ahora el formulario lo pide cuando la moneda es
-- USD y la aprobación lo copia a la deuda.
--
-- Sin CHECK "USD ⇒ tipo de cambio": esas 14 ya existen sin él y se completan
-- editándolas. La regla vive en validarSolicitud (domain/gasto.ts) y en la
-- aprobación, que avisa en vez de reventar.
alter table gastos.solicitudes_gasto
  add column if not exists tipo_cambio numeric(10,4)
    check (tipo_cambio is null or tipo_cambio > 0);

comment on column gastos.solicitudes_gasto.tipo_cambio is
  'Soles por dólar, solo si moneda = USD. Se copia a la obligación al aprobar. Migración 0082.';

-- ===================================================================
-- 2. Los anticipos no llevan IGV
-- ===================================================================
-- Al aprobar un anticipo, el sistema partía el monto en base + 18% de IGV
-- "por si acaso". Un anticipo es plata adelantada a una persona, no una
-- compra: no tiene comprobante ni IGV ("en viáticos no hay IGV"). El IGV
-- real aparece después, en los comprobantes de la rendición.
--
-- Se corrigen las deudas ya creadas así: base = total, IGV = 0. El TOTAL NO
-- CAMBIA (base + IGV ya sumaba el monto del anticipo), así que lo que se
-- pagó o se va a pagar es exactamente lo mismo — solo deja de mostrarse un
-- IGV inventado. Mismo criterio para el reembolso adicional que sale de
-- liquidar un anticipo (lo que la persona puso de más de su bolsillo).
update cuentas_x_pagar.obligaciones o
   set base_imponible = o.base_imponible + o.igv,
       igv = 0,
       sin_igv = true
 where o.igv <> 0
   and (
     o.origen = 'anticipo'
     or o.id in (
       select l.obligacion_reembolso_id from gastos.liquidaciones_anticipo l
        where l.obligacion_reembolso_id is not null
     )
   );
