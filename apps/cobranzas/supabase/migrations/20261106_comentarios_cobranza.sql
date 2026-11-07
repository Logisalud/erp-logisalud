-- Comentarios de cobranza: lo que se habló con el cliente, escrito.
--
-- Pedido del 2026-11-06: "que se pueda poner comentarios y que salgan ahí,
-- por ejemplo: Cliente pagará 200 soles diarios". Hasta ahora eso vivía en
-- la cabeza de quien llamó, o en un cuaderno.
--
-- DOS TABLAS Y NO UNA
--
-- El ejemplo del pedido es un acuerdo DEL CLIENTE —vale para todas sus
-- facturas y cambia cuando cambia el acuerdo— y el recuadro que marcó el
-- usuario estaba en la tabla de FACTURAS, donde lo que se anota es puntual
-- ("esta la paga el viernes", "la están revisando"). Son dos cosas
-- distintas: con una sola tabla por factura, un acuerdo del cliente habría
-- que escribirlo en cada una de sus facturas y corregirlo en todas cuando
-- cambie, y a la tercera ya no coinciden entre sí.
--
-- UNA NOTA VIGENTE, NO UN HILO
--
-- Cada cliente y cada factura tienen UN comentario, que se edita. No es un
-- historial de gestión: lo que la pantalla tiene que contestar es "¿qué
-- quedamos con este cliente?", y para eso diez comentarios viejos estorban
-- más de lo que ayudan. Queda `actualizado_en` para saber de cuándo es —un
-- acuerdo de hace tres meses no se lee igual que el de ayer— y
-- `escrito_por`, que como en el resto de este ERP es texto libre porque no
-- hay login (ver `pagos.registrado_por`).
--
-- Si más adelante hace falta el historial, se agrega una tabla de hilo al
-- lado; esto no lo impide.

create table if not exists comentarios_cliente (
  cliente_ruc     char(11) primary key references clientes (ruc) on delete cascade,
  -- Nunca vacío: la API borra la fila cuando se limpia el texto, así que
  -- "sin comentario" es que no haya fila y no una cadena en blanco.
  comentario      text not null check (btrim(comentario) <> ''),
  escrito_por     text,
  actualizado_en  timestamptz not null default now()
);

comment on table comentarios_cliente is
  'Una nota por cliente con lo acordado para su cobranza. Se edita, no se '
  'acumula. Ejemplo real: "Cliente pagará 200 soles diarios".';

create table if not exists comentarios_documento (
  documento_id    uuid primary key references documentos (id) on delete cascade,
  comentario      text not null check (btrim(comentario) <> ''),
  escrito_por     text,
  actualizado_en  timestamptz not null default now()
);

comment on table comentarios_documento is
  'Una nota por factura, para lo puntual de ese comprobante. Lo que vale '
  'para todas las facturas del cliente va en comentarios_cliente.';

-- RLS activado y sin policies, igual que el resto del esquema: todo el
-- acceso pasa por el service role desde las rutas de Next, que son las que
-- exigen el área (ver lib/autorizacion.ts).
alter table comentarios_cliente   enable row level security;
alter table comentarios_documento enable row level security;
