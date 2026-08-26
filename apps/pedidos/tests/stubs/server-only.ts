/**
 * Stub de `server-only` para vitest.
 *
 * El paquete real lanza al importarse fuera de un Server Component, lo que
 * impide testear cualquier módulo de services/. Acá corremos en Node, no en
 * un bundle de cliente, así que la protección no aplica — pero se mantiene
 * el import en el código de producción, que es donde sí protege.
 */
export {};
