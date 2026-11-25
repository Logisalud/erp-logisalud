-- Las cuatro consultas del Dashboard Comercial, como vistas.
--
-- Viven en la base y no como SQL suelto en la app por la misma razón que
-- `v_saldos`: son la definición de un número que alguien va a mirar para
-- decidir. Acá se leen, se comparan con la pantalla y se corrigen en un
-- solo lugar; metidas en una cadena de texto dentro de un Route Handler,
-- no las encuentra nadie.
--
-- Las cuatro son de SOLO LECTURA y se consultan con la service role key:
-- `v_saldos` y `documentos` tienen RLS activado y sin policies, así que el
-- cliente anónimo no lee nada (ver apps/cobranzas/CLAUDE.md).

-- Venta del ERP por mes. Montos CON IGV: `documentos` guarda el total del
-- comprobante, no la base imponible, así que no hay forma de separarlos
-- acá. El dashboard lo dice en pantalla, porque el resto de sus cifras
-- —las que salen del Excel de ventas— van sin IGV.
create or replace view public.v_dash_venta_mensual as
select to_char(d.fecha_emision,'YYYY-MM') as mes,
       (sum(d.importe_total) filter (where d.tipo in ('01','03')))::float8 as bruta,
       (coalesce(sum(d.importe_total) filter (where d.tipo='07'),0))::float8 as nc,
       (sum(d.importe_total) filter (where d.tipo in ('01','03'))
        - coalesce(sum(d.importe_total) filter (where d.tipo='07'),0))::float8 as neta,
       (count(*) filter (where d.tipo in ('01','03')))::int as comprobantes
from public.documentos d
where not d.anulado and d.aceptado_sunat is not false
  and d.fecha_emision >= (date_trunc('month', current_date) - interval '13 months')::date
group by 1;

-- Cartera y vencido por vendedor, hoy. Se apoya en v_saldos para que no
-- pueda contradecir al resto del ERP: si cambia la definición de vencido,
-- cambia acá sola.
create or replace view public.v_dash_cartera_vendedor as
select coalesce(v.codigo,'SIN') as codigo,
       coalesce(v.nombres||' '||v.apellidos,'(sin vendedor)') as vendedor,
       round(sum(s.saldo_pendiente),2)::float8 as saldo,
       round(sum(s.d0_7+s.d8_15+s.d16_30+s.d31_60+s.d61_mas),2)::float8 as vencido,
       round(100*sum(s.d0_7+s.d8_15+s.d16_30+s.d31_60+s.d61_mas)
             / nullif(sum(s.saldo_pendiente),0),1)::float8 as pct_mora,
       (count(*) filter (where (s.d0_7+s.d8_15+s.d16_30+s.d31_60+s.d61_mas) > 0))::int as docs_vencidos
from public.v_saldos s
left join public.vendedores v on v.id = s.vendedor_id
group by 1,2
having sum(s.saldo_pendiente) > 0;

-- Los totales de la cartera, en una fila.
create or replace view public.v_dash_cobranza_kpi as
select round(sum(saldo_pendiente),2)::float8 as cartera,
       round(sum(d0_7+d8_15+d16_30+d31_60+d61_mas),2)::float8 as vencido,
       round(100*sum(d0_7+d8_15+d16_30+d31_60+d61_mas)
             / nullif(sum(saldo_pendiente),0),1)::float8 as pct_mora,
       (count(distinct cliente_ruc) filter (where saldo_pendiente > 0))::int as clientes_con_deuda
from public.v_saldos;

-- Qué vendedor tiene HOY a cada cliente.
--
-- La clasificación oro/plata/bronce es una foto de abr–set 2026 y trae el
-- vendedor de entonces, así que listaba gente que ya no trabaja acá. Esto
-- es lo que la corrige. Se limita a los clientes con algún comprobante en
-- 18 meses: son los únicos que pueden aparecer en esa clasificación, y
-- traer los 6.600 de la cartera entera sería mover 400 KB por cada carga.
create or replace view public.v_dash_cartera_actual as
select c.ruc,
       coalesce(v.nombres||' '||v.apellidos,'(sin vendedor)') as vendedor,
       coalesce(v.codigo,'SIN') as codigo,
       c.codigo_zona as zona
from public.clientes c
left join public.vendedores v on v.id = c.vendedor_actual_id
where exists (
  select 1 from public.documentos d
  where d.cliente_ruc = c.ruc and not d.anulado
    and d.fecha_emision >= (current_date - interval '18 months')::date
);

-- ── Quién puede leerlas ────────────────────────────────────────────────
--
-- Supabase da `select` a `anon` y `authenticated` por defecto sobre todo
-- lo que se crea en `public`. Para una vista eso no es un detalle: una
-- vista corre con los permisos de su dueño (postgres) salvo que se diga
-- lo contrario, así que **ignora el RLS de las tablas de abajo**. Con el
-- default, cualquiera con la clave anon —que viaja en el JavaScript del
-- ERP, es pública por diseño— podía leer la cartera entera por PostgREST.
--
-- Dos candados, no uno:
--  · se le saca el permiso a anon y authenticated: solo lee la service
--    role key, desde el servidor, después de pasar por `exigirArea`;
--  · `security_invoker = on`, para que si alguna vez vuelve el grant por
--    default, el RLS de `documentos` y `v_saldos` siga aplicando.
revoke all on
  public.v_dash_venta_mensual,
  public.v_dash_cartera_vendedor,
  public.v_dash_cobranza_kpi,
  public.v_dash_cartera_actual
from anon, authenticated;

alter view public.v_dash_venta_mensual    set (security_invoker = on);
alter view public.v_dash_cartera_vendedor set (security_invoker = on);
alter view public.v_dash_cobranza_kpi     set (security_invoker = on);
alter view public.v_dash_cartera_actual   set (security_invoker = on);
