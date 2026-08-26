-- Perfiles de usuario, uno por cada auth.users. Se crean automáticamente
-- vía trigger cuando Supabase Auth crea el usuario.

create table pedidos.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pedidos.profiles enable row level security;

-- Cada usuario lee y actualiza únicamente su propio perfil.
create policy "profiles_select_own"
  on pedidos.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on pedidos.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Crea el perfil automáticamente al registrarse en Supabase Auth.
create function pedidos.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  insert into pedidos.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function pedidos.handle_new_user();
