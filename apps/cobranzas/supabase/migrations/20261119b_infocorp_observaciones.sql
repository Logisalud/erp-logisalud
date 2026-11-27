-- `motivo` pasa a llamarse `observaciones`.
--
-- Es el nombre con el que la pide cobranzas, y describe mejor para qué se
-- usa: no es solo por qué se marcó al cliente, es dónde queda anotado todo
-- lo que hay que saber de ese caso (que quedó en pagar el viernes, que el
-- local está cerrado, que lo lleva el abogado).
--
-- La tabla se creó hoy y está vacía, así que el rename no mueve datos.

alter table public.infocorp_clientes rename column motivo to observaciones;
