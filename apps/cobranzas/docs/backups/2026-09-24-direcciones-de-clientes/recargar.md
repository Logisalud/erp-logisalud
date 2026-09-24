# Volver a copiar las direcciones desde Pedidos

Los dos proyectos Supabase están separados, así que esto no se puede hacer
con un solo `JOIN`: hay que leer de uno y escribir en el otro.

## 1. Leer, en el proyecto de PEDIDOS (`dfqhxwkdflnkcjnysbwu`)

Genera el bloque `VALUES` ya listo para pegar. Se corre por tramos de RUC
porque el resultado entero no entra en una sola respuesta.

```sql
select string_agg(
  '(' || quote_literal(c.ruc_o_documento) || ',' || quote_literal(btrim(a.direccion)) || ')',
  ',' order by c.ruc_o_documento
) vals, count(*) n
from pedidos.customer_addresses a
join pedidos.customers c on c.id = a.customer_id
where a.estado = 'activo'
  and btrim(coalesce(a.direccion, '')) <> ''
  and c.ruc_o_documento >= '00000000000'   -- mover el tramo
  and c.ruc_o_documento <  '10400000000';
```

Tramos que se usaron el 2026-09-24 (unas 150 filas cada uno):
`< 10400000000`, `10400000000–10460000000`, `10460000000–10800000000`,
`10800000000–20600000000`, `20600000000–20606000000`, `>= 20606000000`.

Saltear los RUCs de prueba de Pedidos: `20999999999` y `99999999002`.

## 2. Escribir, en el proyecto de COBRANZAS (`qpkigzniatidsvnxikox`)

```sql
with d(ruc, direccion) as (values <pegar acá el resultado de arriba>)
update public.clientes c
   set direccion = d.direccion
  from d
 where c.ruc = d.ruc
   and coalesce(btrim(c.direccion), '') = '';   -- no pisar lo ya cargado
```

El `and coalesce(...) = ''` es lo que hace que esto sea seguro de repetir:
sólo completa lo que falta. **Si lo que se quiere es actualizar direcciones
que cambiaron en Pedidos, hay que sacar esa condición** — y ahí sí pisa lo
que haya en Cobranzas, así que conviene mirar antes qué se va a cambiar.

## 3. Verificar

```sql
select count(*) total,
       count(*) filter (where coalesce(btrim(direccion),'') <> '') con_direccion
from public.clientes;

-- Cobertura sobre lo que realmente se ve en el link del vendedor:
select count(distinct s.cliente_ruc) con_saldo,
       count(distinct s.cliente_ruc) filter (where coalesce(btrim(c.direccion),'') <> '') con_direccion
from public.v_saldos s
join public.clientes c on c.ruc = s.cliente_ruc
where s.saldo_pendiente > 0.005;
```

El 2026-09-24 esto dio 902 de 3.594 en total, y 315 de 371 (84.9%) sobre la
cartera con saldo.
