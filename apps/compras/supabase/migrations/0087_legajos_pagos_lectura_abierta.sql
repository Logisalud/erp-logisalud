-- "Ver voucher" fallaba para quien no es de Contabilidad, Tesorería,
-- Gerencia ni Admin (reportado por Sebas el 2026-10-30 con C-0155).
--
-- El acceso abierto temporal (0025) le abrió a todo usuario interno las
-- TABLAS de Cuentas por Pagar —por eso esa persona ve la obligación, el pago
-- y el número de voucher— pero no el bucket `legajos-pagos`, cuya lectura
-- sigue siendo solo de esas cuatro áreas (0021). El archivo existe; lo que
-- fallaba era firmar el link: "No se pudo generar el link del archivo."
--
-- Mismo criterio que 0025: una policy permissive MÁS, colgada del mismo
-- flag. Al apagarlo vuelve sola la regla por área de 0021, que no se toca.
--
-- Re-ejecutable.

drop policy if exists legajos_pagos_lectura_abierta on storage.objects;
create policy legajos_pagos_lectura_abierta on storage.objects
  for select to authenticated
  using (bucket_id = 'legajos-pagos' and public.compras_acceso_abierto());
