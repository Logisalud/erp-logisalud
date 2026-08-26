-- Bucket privado para conservar el Excel original de cada lista de
-- precios publicada. Se sube/lee exclusivamente desde el cliente admin
-- (service role) en services/price-lists.ts — no se exponen policies
-- de storage.objects a authenticated/anon porque no hay acceso directo
-- desde el navegador a este bucket.

begin;

insert into storage.buckets (id, name, public)
values ('price-lists', 'price-lists', false)
on conflict (id) do nothing;

commit;
