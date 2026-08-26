-- Catálogo inicial de roles del módulo de Pedidos.

insert into pedidos.roles (name, description) values
  ('vendedor', 'Toma pedidos desde campo, principalmente vía celular.'),
  ('control_pedidos', 'Valida pedidos antes de aprobación comercial.'),
  ('aprobador_comercial', 'Aprueba condiciones comerciales del pedido.'),
  ('operaciones', 'Confirma despacho y asigna fuente de stock.'),
  ('administrador', 'Gestión de usuarios, roles y configuración del módulo.')
on conflict (name) do nothing;
