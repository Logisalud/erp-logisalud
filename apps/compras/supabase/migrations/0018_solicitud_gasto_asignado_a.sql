-- Fase 1.4: un anticipo de viáticos hoy siempre paga a quien CREA la
-- solicitud (services/solicitudes-gasto.ts usaba `beneficiario_persona =
-- solicitante_id` sin excepción). Cuando Contabilidad o un jefe de área arma
-- el anticipo para un vendedor, la plata tiene que ir al vendedor, no a
-- quien llenó el formulario — `asignado_a` es ese destino explícito y
-- opcional; si queda null, el beneficiario sigue siendo el solicitante,
-- igual que antes.

alter table gastos.solicitudes_gasto
  add column if not exists asignado_a uuid references auth.users(id);
