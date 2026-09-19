# Snapshot de `customers` — 2026-09-19

Foto del **estado anterior** a la carga de la Nueva Cartera Setiembre 2026,
tomada antes de tocar un solo registro.

## Qué hay acá

| Archivo | Qué contiene |
| --- | --- |
| `customers-antes.csv` | Las 3.419 filas: `ruc_o_documento,condicion_pago_habitual_id,limite_credito`. |
| `customers-antes.json` | Lo mismo en JSON, para scripts. |
| `revertir.sql` | Script de vuelta atrás, generado desde el JSON. |

`limite_credito` va vacío en todas las filas porque **la columna todavía no
existía** al momento del snapshot: se crea como parte de esta misma carga. Su
"antes" es, literalmente, que no había nada.

## Estado que retrata

- **3.419** clientes.
- **3.399** sin `condicion_pago_habitual_id` (NULL).
- **20** con condición cargada: 16 con la condición `1` y 4 con la `2`.
  De esos 20, seis son RUC de prueba o basura (`123`, `999999999`,
  `7888888888`, `20999999999`, `99999999002`, `74453492`, `74453492222`).

## Huella de verificación

    3dcf2f19d04f90b5c56a8fd6cc84cc46

Es el md5 de `ruc_o_documento:condicion_pago_habitual_id` de las 3.419 filas,
ordenadas byte a byte (`collate "C"`). Se calculó **dos veces** —una en la base
y otra sobre estos archivos— y dio igual, así que el snapshot es fiel y no una
copia parcial.

Para recalcularla contra la base en cualquier momento:

```sql
select count(*) filas,
       md5(string_agg(t, ';' order by t collate "C")) huella
  from (select ruc_o_documento || ':' || coalesce(condicion_pago_habitual_id::text,'') t
          from pedidos.customers) s;
```

## Cómo revertir

1. Abrir `revertir.sql` y correrlo entero contra el proyecto
   `Logisalud_pedidos` (MCP de Supabase o el SQL Editor). Viene con `begin;` …
   `rollback;`, así que **de entrada no confirma nada**.
2. Mirar el `select` final: tiene que devolver `3419` y la huella de arriba.
3. Recién ahí cambiar el `rollback;` por `commit;` y volver a correrlo.

El script pone las dos columnas en NULL y después repone las 20 condiciones que
existían. `ruc_o_documento` alcanza como llave: las 3.419 son distintas entre
sí, se verificó.

**Lo que este snapshot NO cubre:** clientes creados *después* del 2026-09-19.
El paso 1 del script les pondría la condición en NULL, y el default nuevo
(Crédito 30 días / S/ 1.500) es justamente lo que deberían tener. Si hay que
revertir con clientes nuevos de por medio, acotar los `update` del paso 1 con
`where created_at < '2026-09-19'`.
