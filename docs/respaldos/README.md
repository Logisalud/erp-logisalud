# Respaldos

**Supabase es el único respaldo.** No hay respaldo en GitHub: el flujo que había (`backup.yml`) falló en las 126 corridas desde el 24-jun-2026, nunca produjo un archivo, y se retiró.

## Qué cubre
- Las bases de los proyectos de Supabase en producción (consolidado: Cobranzas, Compras y, cuando entre, el WMS; y Pedidos), con los respaldos del propio Supabase.

## Qué no cubre
- **Los archivos del Storage** (por ejemplo los PDF del bucket `wms-documentos`). Se respalda la lista, no el contenido. Pendiente de producción: definir su respaldo antes de firmar actas reales.

## Cómo se restaura
- Se restaura **todo el proyecto** a un punto en el tiempo. **No se puede devolver solo un esquema** (por ejemplo solo `wms`): volver atrás también devuelve Cobranzas y Compras, que comparten el proyecto.

## Para cambios del WMS
- El seguro es la **reversa probada** de cada migración (`apps/wms/supabase/rollback/`), ensayada en Postgres 17 antes de la ventana. No se confía en restaurar el proyecto entero por un cambio del WMS.

## Antes de cada ventana
- Se verifica en el panel de Supabase que existe una **copia del mismo día** y se anota la hora. Sin esa copia, no hay ventana (criterio del Go/No-Go).
