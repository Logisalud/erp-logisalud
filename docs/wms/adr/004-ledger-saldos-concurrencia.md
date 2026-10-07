# ADR-004 — Ledger append-only, saldos derivados y candados

**Decisión.**
- `wms.partidas` es el ledger: solo se agrega (triggers rechazan UPDATE, DELETE y TRUNCATE, también al superusuario).
  Una corrección es un movimiento nuevo con `reversa_de`; un cambio de estado no se revierte.
- `wms.saldos` es **derivado**: lo mantiene un trigger del ledger y `wms.verificar_saldos()` lo reconcilia.
- Nadie escribe con DML directo (sin policies de INSERT/UPDATE): solo `wms.postear_movimiento` / `wms.revertir_movimiento`
  (security definer) que toman `pg_advisory_xact_lock` por celda en orden determinista y validan zona, propietario y estado.
  Un *constraint trigger* diferido repite las invariantes al confirmar (defensa en profundidad).
- Reversas: no re-evalúan la vigencia de la asignación (restituyen lo que estaba).

**Hallazgo de las pruebas.** `INSERT … ON CONFLICT DO UPDATE` valida el CHECK sobre la fila *propuesta* antes de detectar el
conflicto: una salida (delta negativo) fallaba aunque hubiera stock. El trigger actualiza primero y solo inserta si no existía.

**Consecuencias.** La concurrencia se prueba con dos conexiones (`tests/db/ledger.test.ts`, test 14).
