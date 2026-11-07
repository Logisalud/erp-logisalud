# Reinicio del piloto (1 de diciembre)

Script **manual** (no hay botón en la aplicación): `apps/wms/scripts/reinicio-piloto.mjs`. Probado en Postgres local con datos sembrados (`tests/db/reinicio-piloto.test.ts`). **No se ha ejecutado contra ninguna base real.**

1. **Antes:** copia de Supabase **del mismo día**, confirmada en el panel.
2. **Simular (por defecto):** `node apps/wms/scripts/reinicio-piloto.mjs --db-url <url>`. Cuenta filas por tabla, filas de la auditoría y (con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`) **lista el bucket `wms-documentos` y sus prefijos**, diciendo cuántos archivos se borran y cuántos se conservan. No borra ni registra nada.
3. **Ejecutar:** `--ejecutar --confirmo-copia-del-dia AAAA-MM-DD` (la fecha tiene que ser la de hoy, hora de Lima; sin ella el script se niega).
4. **Qué hace:** exporta `audit_events` a un archivo `.jsonl` fuera de la base y comprueba que quedó completo; en **una transacción** borra lo transaccional y registra el reinicio en `wms.reinicios` (migración 0044, solo se agregan filas, queda fuera de lo que se borra); después borra los archivos del bucket.
5. **Se borra:** todo lo transaccional, incluidas las copias de pedidos (`pedidos_despacho`, `importaciones_pedidos`) y de OC (`oc_versiones`), la carga de ensayo «piloto» (`cargas_iniciales` y sus líneas e informes), las firmas dibujadas (`acta_firmas` y sus imágenes), las fotos de entrega (`ruta_paradas_eventos` y `entregas/`), los COA de lote y todos los archivos del bucket **salvo** los de documentos regulatorios que se conservan (registro sanitario, BPM).
6. **Se conserva:** topología, propietarios, usuarios, roles, parámetros, datos regulatorios (lista en `plan-noviembre.md`), formatos versionados, configuración de proveedores y **los correlativos de actas y guías** (los números del piloto no se reutilizan).
7. **Lista cerrada:** si aparece una tabla nueva en `wms` que no está decidida (conservar o borrar), el script **aborta**.
8. Requiere una conexión que pueda usar `session_replication_role = replica` (dueño de la base), porque las tablas son «solo agregar».
