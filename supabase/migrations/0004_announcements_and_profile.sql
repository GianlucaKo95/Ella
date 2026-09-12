-- "Aktuelles"-News vom Admin/Chef an alle Mitarbeiter
create table announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_by uuid references employees (id),
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

create policy "announcements_select" on announcements for select
  using (auth.uid() is not null);
create policy "announcements_write_admin" on announcements for all
  using (is_admin()) with check (is_admin());

-- Mitarbeiter dürfen ihren eigenen Anzeigenamen ändern, aber sonst nichts an ihrem
-- employees-Datensatz (Rolle, Truppe, aktiv-Status bleiben admin-exklusiv). Dafür eine
-- SECURITY DEFINER Funktion statt einer offenen Update-Policy auf die ganze Zeile.
create or replace function update_my_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_name is null or length(trim(new_name)) = 0 then
    raise exception 'Name darf nicht leer sein';
  end if;
  update employees
  set name = trim(new_name)
  where id = current_employee_id();
end;
$$;

revoke all on function update_my_name(text) from public;
grant execute on function update_my_name(text) to authenticated;
