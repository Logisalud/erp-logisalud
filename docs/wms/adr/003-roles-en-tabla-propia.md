# ADR-003 — Roles del WMS en `wms.usuario_roles`

**Contexto.** `public.perfiles.area/rol` tienen CHECK y pertenecen a otro módulo; agregar valores obliga a migrar una tabla
compartida y a tocar Compras.

**Decisión.** Tabla propia `wms.usuario_roles (user_id, rol, desde, hasta)` + `wms.permisos_rol`; helpers
`wms.tiene_rol()`/`wms.tiene_permiso()` (security definer, `search_path` fijo) usados por todas las policies. `perfiles` solo
da identidad y nombre. Los permisos se aplican en la base; la interfaz solo oculta botones.

**Consecuencias.** Cambio aditivo. Hay que cargar los roles de Katia, Sandra, Charlie, etc. al configurar (D-24).
