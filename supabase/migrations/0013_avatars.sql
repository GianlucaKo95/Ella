-- Profilbilder: eigenes Foto im Header (rechts), Fallback ist der
-- Anfangsbuchstabe des Vornamens (clientseitig, kein eigenes Feld nötig).

alter table employees add column avatar_url text;

-- Storage-Bucket "avatars": öffentlich lesbar (Profilbilder sind unkritisch),
-- Schreiben nur im eigenen Ordner (Pfad "<auth.uid()>/...").
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_insert_own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own" on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Mitarbeiter dürfen ihren eigenen avatar_url setzen, aber sonst nichts an
-- ihrem employees-Datensatz — gleiches Muster wie update_my_name.
create or replace function update_my_avatar_url(new_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update employees
  set avatar_url = new_url
  where id = current_employee_id();
end;
$$;

revoke all on function update_my_avatar_url(text) from public;
grant execute on function update_my_avatar_url(text) to authenticated;
