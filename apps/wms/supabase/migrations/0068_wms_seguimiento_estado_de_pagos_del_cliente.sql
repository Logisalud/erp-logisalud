-- 0068 · WMS · Seguimiento del pedido: el estado de pagos del cliente (morosidad) — decisión de Sebas, 2026-11-13
--
-- Quien consulta el seguimiento de su pedido (con número de pedido + RUC, o con su enlace) ve además:
--   · si tiene documentos vencidos: el total vencido y cada documento (número, cuándo venció, días de atraso y saldo);
--   · si está al día: «¡Estás al día en tus pagos! 😊 Gracias por la confianza».
--   · si Cobranzas no conoce al cliente (su RUC no está en `public.clientes`), no se dice nada: nunca se afirma «al día» sin datos.
-- Sebas decidió mostrarlo en el seguimiento de pedido (no en un portal aparte), con el mismo acceso que ya tiene (pedido + RUC o enlace con token), el mismo límite de intentos y la misma respuesta idéntica
-- si el pedido no existe o el RUC no coincide.
--   · La deuda sale de la MISMA fuente que usa Finanzas en «Fases de cobranza»: `public.fn_documentos_cobranza(fecha)` (Cobranzas, mismo proyecto Supabase): saldo por documento y días vencidos con su regla
--     (letras, protestadas, céntimos). Esta migración solo LEE: no cambia nada de Cobranzas. Si esa función o `public.clientes` no existen, el bloque no sale (el seguimiento sigue igual).
--   · Solo documentos con más de 0 días vencidos y saldo; los que aún no vencen no se muestran. Se listan hasta 30 (los más atrasados primero) y se dice cuántos son en total.
--   · Interruptor `seguimiento_deuda_habilitado` APAGADO de fábrica; solo lo enciende un administrador de la base (un disparador se lo impide a la aplicación).
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0047 y 0054.

insert into wms.parametros (clave, valor, nota) values
  ('seguimiento_deuda_habilitado', 'false', 'Seguimiento del pedido: muestra al cliente su morosidad (o «estás al día»). Apagado de fábrica; solo lo enciende un administrador de la base, con aprobación de Sebas.')
on conflict (clave) do nothing;

-- La aplicación (authenticated o anon) no puede tocar los cuatro interruptores.
create or replace function wms.trg_proteger_acceso_clientes()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(new.clave, old.clave) in ('acceso_clientes_habilitado', 'seguimiento_cliente_habilitado', 'stock_cliente_habilitado', 'seguimiento_deuda_habilitado') then
    raise exception 'Este interruptor solo lo habilita un administrador de la base (D-68, G.2)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- El estado de pagos de un RUC: null (no se muestra nada), {estado: AL_DIA} o {estado: MOROSO, total, max_dias, cantidad, documentos[]}. Interna: solo la llaman las dos consultas del seguimiento.
create or replace function wms._deuda_cliente(p_ruc text) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_ruc text := btrim(coalesce(p_ruc, '')); v_hoy date := wms._hoy_lima(); r jsonb;
begin
  if coalesce((select valor from wms.parametros where clave = 'seguimiento_deuda_habilitado'), 'false') <> 'true' then return null; end if;
  if v_ruc !~ '^[0-9]{8,11}$' then return null; end if;
  -- Cobranzas vive en el mismo proyecto; si no está (o cambió su firma), el bloque simplemente no sale
  if to_regclass('public.clientes') is null or to_regprocedure('public.fn_documentos_cobranza(date, boolean)') is null then return null; end if;
  execute $q$
    with c as (select 1 as x from public.clientes where ruc::text = $1),
         d as (select f.comprobante, f.fecha_vencimiento_efectiva as vence, f.dias_vencido as dias, f.saldo
                 from public.fn_documentos_cobranza($2, true) f
                where f.cliente_ruc::text = $1 and f.dias_vencido > 0 and f.saldo > 0)
    select case
             when not exists (select 1 from c) and not exists (select 1 from d) then null
             when not exists (select 1 from d) then jsonb_build_object('estado', 'AL_DIA', 'al', $2)
             else jsonb_build_object('estado', 'MOROSO', 'al', $2, 'total', (select round(sum(saldo), 2) from d), 'max_dias', (select max(dias) from d), 'cantidad', (select count(*) from d),
                    'documentos', (select jsonb_agg(jsonb_build_object('documento', x.comprobante, 'vence', x.vence, 'dias', x.dias, 'saldo', round(x.saldo, 2)) order by x.dias desc, x.comprobante)
                                     from (select * from d order by dias desc, comprobante limit 30) x))
           end
  $q$ into r using v_ruc, v_hoy;
  return r;
end $$;

-- Las dos consultas del seguimiento devuelven además la deuda (null si no corresponde mostrarla).
do $$ begin
  perform wms._parchar_funcion('seguimiento_consultar',
    $q$  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos);$q$,
    $q$  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos, 'deuda', wms._deuda_cliente(v_ruc));$q$);
  perform wms._parchar_funcion('seguimiento_por_token',
    $q$  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos);$q$,
    $q$  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos,
    'deuda', wms._deuda_cliente((select pd.cliente_ruc from wms.pedidos_despacho pd where pd.pedido_id = t.pedido_id and pd.vigente limit 1)));$q$);
end $$;

revoke execute on all functions in schema wms from public;
grant usage on schema wms to anon;
revoke all on all tables in schema wms from anon;
grant execute on function wms.seguimiento_consultar(text, text, text), wms.seguimiento_por_token(text, text) to anon, authenticated;
