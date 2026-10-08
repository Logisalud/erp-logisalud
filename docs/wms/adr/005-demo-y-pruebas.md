# ADR-005 — Modo demostración, pruebas con Postgres local y E2E sin PostgREST

**Contexto.** Sin base de pruebas con costo (Postgres local por decisión del usuario) y con la necesidad de una URL de
Preview que funcione sin base real (D-27).

**Decisión.**
- **Demo:** un repositorio en memoria con datos sintéticos (`services/demo`) detrás del mismo puerto que el repositorio de
  Supabase. Solo se activa con `WMS_DEMO=1` en un Preview de Vercel o `WMS_DEMO_LOCAL=1` fuera de Vercel; en producción la app
  se niega a arrancar si hay una bandera puesta (`lib/demo.ts`, probado). Banner "DEMO" en toda pantalla. Sin conexión a ninguna base.
- **Reglas de base de datos:** se prueban contra Postgres 16 local con un `auth.uid()` simulado (`tests/db`, 59 pruebas).
- **E2E:** corren sobre el repositorio demo (no ejercitan PostgREST/RLS por HTTP). Esto **cambia** lo propuesto en el Gate 0
  (adaptador `pg` para E2E): es más simple y la RLS/ledger ya se prueban en SQL. Lo que no cubre está en `gate-0.md §G.1`.

**Consecuencias.** El adaptador de Supabase está escrito pero **sin ejecutar contra una base real** hasta que exista una
(D-22, D-20).
