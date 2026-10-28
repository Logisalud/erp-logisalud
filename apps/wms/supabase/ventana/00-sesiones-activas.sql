-- SOLO LECTURA. Se corre al empezar la ventana: ¿hay alguien usando la base ahora?
-- Lo ideal: ninguna fila con "transaccion_abierta" de más de unos segundos, y 0 bloqueos esperando.
select pid, usename as usuario, application_name as aplicacion, state as estado,
       now() - xact_start  as transaccion_abierta,
       now() - query_start as consulta_desde,
       left(regexp_replace(query, '\s+', ' ', 'g'), 80) as consulta
  from pg_stat_activity
 where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
 order by xact_start nulls last;

select count(*) as bloqueos_esperando from pg_locks where not granted;
