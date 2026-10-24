# Respaldos de las bases en producción

Qué respalda, dónde queda, quién lo abre y cómo se restaura. Escrito en lenguaje llano a propósito.

## Qué se respalda
Cada noche (05:17 UTC, medianoche en Perú) el flujo `Database Backup` (`.github/workflows/backup.yml`) respalda **dos bases**:

| Base | Proyecto Supabase | Contiene |
|---|---|---|
| consolidado | `qpkigzniatidsvnxikox` | Cobranzas y Compras (y el WMS cuando esté en producción): todos los esquemas nuestros (`public`, `wms`, `almacen`, `compras`, `catalogo`…; un esquema nuevo entra solo) más `auth` (usuarios) y `storage` (lista de archivos) |
| pedidos | `dfqhxwkdflnkcjnysbwu` | Pedidos |

Solo se dejan fuera los esquemas que administra Supabase y que se recrean solos (`extensions`, `graphql`, `realtime`, `vault`…).

**Lo que NO está en el respaldo:** los archivos en sí del Storage (por ejemplo los PDF del bucket `wms-documentos`): se guarda la lista, no el contenido. Hay que resolverlo antes de que el WMS firme actas reales (pendiente).

## Dónde se guarda, quién accede, cuánto dura
- **Dónde:** como *artifact* del propio flujo en GitHub (pestaña Actions → corrida → Artifacts).
- **Quién accede:** cualquiera con acceso de lectura al repositorio puede **descargar** el archivo, pero **no puede abrirlo**: está cifrado con `age` y solo se abre con la **llave privada**, que debe tener únicamente Sebas (guardada en un gestor de contraseñas, nunca en GitHub). En GitHub solo vive la llave pública (`BACKUP_AGE_PUBLIC_KEY`). **Sin la llave privada no hay restauración**: guárdala en dos lugares.
- **Retención:** 90 días (el máximo de GitHub); luego se borra solo. Es una ventana corta. **Recomendado:** una copia mensual fuera de GitHub (Google Drive o un bucket S3/R2) — decisión pendiente de Sebas.
- **Cifrado:** `age` (X25519 + ChaCha20-Poly1305), antes de subir. El archivo sin cifrar nunca sale del runner. Cada archivo trae su suma de control (`.sha256`).

## Cómo sabemos que sirve
Cada respaldo se **restaura de prueba** en un Postgres 17 desechable dentro del mismo flujo; si no cuadra (faltan tablas, errores que no son de plataforma), el respaldo **no se sube** y el flujo falla. Un segundo flujo, `Vigía de respaldos`, revisa a diario que exista un respaldo de cada base de menos de 30 horas.

## Avisos
Si algo falla se abre una incidencia «🔴 …» con etiqueta `respaldo`, **asignada a Sebas** (GitHub le manda el correo). Opcional, correo directo: cargar `BACKUP_SMTP_HOST`, `BACKUP_SMTP_PORT`, `BACKUP_SMTP_USER`, `BACKUP_SMTP_PASSWORD` y `BACKUP_AVISO_CORREO`.

## Secretos que hay que cargar (Settings → Secrets → Actions)
| Secreto | Qué es |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personal nuevo de Supabase (cuenta con acceso a los dos proyectos). **El actual está vencido o inválido.** |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base del proyecto consolidado |
| `SUPABASE_DB_PASSWORD_PEDIDOS` | Contraseña de la base del proyecto de Pedidos (nuevo) |
| `BACKUP_AGE_PUBLIC_KEY` | Llave pública: en tu computador, `age-keygen -o llave.txt`; la línea «Public key: age1…» va aquí; **`llave.txt` queda solo contigo** |

## Cómo restaurar
1. Descargar el `.age` y su `.sha256` del artifact; comprobar: `sha256sum -c respaldo-….age.sha256`.
2. Descifrar: `age -d -i llave.txt respaldo-….dump.age > respaldo.dump`.
3. Ver el contenido sin tocar nada: `pg_restore --list respaldo.dump`.
4. Restaurar en una base **nueva** (nunca encima de producción sin decidirlo): `pg_restore --no-owner --no-acl --dbname=<url-de-la-base-nueva> respaldo.dump`. Necesita Postgres 17 (o superior) y que existan los roles de Supabase (`anon`, `authenticated`, `service_role`); `scripts/respaldos/verificar.sh` los crea en la prueba.
5. Prueba completa de ejemplo: `scripts/respaldos/verificar.sh respaldo.dump postgresql://postgres@localhost:5432/postgres` (usa una base desechable).

## Si falla
1. Abrir la corrida enlazada en la incidencia y ver qué paso falló: los mensajes dicen la causa.
2. «HTTP 401/403 al pedir el pooler» → el token venció: crear uno nuevo en Supabase y cargarlo en `SUPABASE_ACCESS_TOKEN`.
3. «pg_dump falló» con autenticación → la contraseña de la base cambió: actualizar el secreto.
4. «Falta el secreto…» → cargarlo.
5. Re-ejecutar con *Run workflow* y cerrar la incidencia.

## Historia (para no repetirla)
Desde el 24-jun-2026 se ejecutaron **126 corridas y ninguna terminó bien**: nunca existió un respaldo en GitHub. Causas, en orden: la base directa de Supabase es solo IPv6 y el runner no la alcanza; el pooler respondía «tenant not found»; una opción de `pg_dump` inválida; y desde entonces el token de la API rechazado. Además el flujo viejo tenía dos fallas latentes que aparecían apenas pasara lo anterior: instalaba `pg_dump` 16 (Supabase es Postgres 17, `pg_dump` se niega) y respaldaba **solo** el esquema `public` (dejaba fuera `wms`, `almacen`, `compras` y `catalogo`). Y como nadie probaba el archivo, nadie se habría enterado de que no servía.
