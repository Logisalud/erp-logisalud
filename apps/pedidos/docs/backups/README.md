# Respaldos

Copias de tablas que se vaciaron o transformaron a mano, guardadas antes de
tocar nada. No son un mecanismo de backup del sistema —eso lo hace
Supabase—, sino la evidencia de lo que había cuando se decidió borrarlo.

Cada carpeta es una fecha (`AAAA-MM-DD`) y dentro va un JSON por tabla, con
el contenido íntegro tal cual salió de la base:

```
docs/backups/2026-09-10/orders.json
docs/backups/2026-09-10/order_items.json
…
docs/backups/2026-09-10/RESUMEN.md   ← conteos y qué se borró, con fecha
```

Los JSON son un array de objetos, una entrada por fila, con los nombres de
columna de la base sin renombrar. Se generan con
`select json_agg(t) from pedidos.<tabla> t`, así que volver a insertarlos es
posible pero **no es un restore**: los uuid se conservan, pero las
secuencias y los datos que dependan de otras tablas (por ejemplo
`orders.numero`, que se reinició) no vuelven solos a su estado anterior.

Estos archivos pueden contener datos de clientes reales (razón social, RUC,
dirección). No se publican fuera del repo.
