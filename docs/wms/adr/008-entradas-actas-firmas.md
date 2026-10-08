# ADR-008 — Entradas, actas y firmas (Batch 2)

**Estado:** aceptada · 2026-10-08

## Decisiones
1. **Confirmar es un paso aparte de firmar.** El acta de recepción se firma por cuatro partes; después alguien con permiso de ejecutar (Jefe de Almacén, auxiliar…) **confirma** y recién ahí el inventario nace en Cuarentena. Motivo: Katia firma como Dirección Técnica pero no tiene el permiso de ejecutar movimientos, y el ledger exige permiso por tipo; así la última firma no depende de quién sea.
2. **Cada entrega es una procedencia.** `ingreso_lotes.id` es la `procedencia_id` del ledger (ADR-001). No hay FK desde `saldos` porque la carga inicial y los ajustes usan procedencias propias.
3. **Actas inmutables.** Recepción: solo pasa de FIRMADA a ANULADA (motivo, usuario, fecha) y se reemite otra con número nuevo, vinculada. La anulación **no revierte el stock**: corregir cantidades es una reversa del movimiento, aparte. Organoléptica: no se anula (lo que decidió ya cambió el estado; se corrige con un cambio hacia Bajas/Rechazados).
4. **Firma:** SHA-256 del contenido canónico (JSONB) guardado en cada firma. Las tres firmas de personas salen del usuario logueado y su rol; la del transportista guarda nombre, DNI (8 dígitos), placa y la imagen dibujada. Validez ante DIGEMID: D-11 abierta.
5. **Correlativos sin huecos:** `I-AAAAMM-NNNN` y `O-AAAAMM-NNNN` (D-13) con `INSERT … ON CONFLICT DO UPDATE` sobre `wms.correlativos`; si la transacción falla, el incremento se deshace.
6. **Compras manda en la compra local:** el WMS guarda una copia (`snapshot_compras`) y, si Compras cambia la cantidad, genera una alerta de divergencia (D-19); no cambia solo.
7. **Alertas idempotentes:** índice único parcial por `clave` mientras estén abiertas. `revisar_divergencias()` y `revisar_por_trasladar()` (D-28b, plazo en `wms.parametros`) se ejecutan al abrir Alertas; en producción conviene programarlas (pg_cron) — pendiente.
8. **Límite conocido:** el cambio de estado a Aprobado exige `sustento_id`, pero la base **no verifica** que ese sustento sea un acta organoléptica firmada si quien llama usa `postear_movimiento` directamente (solo Dirección Técnica puede). La ruta de la app (`decidir_acta_organoleptica`) sí lo garantiza. Endurecerlo exige adaptar las pruebas del Batch 1.
