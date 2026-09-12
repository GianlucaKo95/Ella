-- Login wie bei Wizzo: Mitarbeiter tippt kein Passwort, sondern wählt nur seinen
-- Namen aus einer Liste. Zwei Bausteine dafür:
--   1. list_login_names() – vor dem Login (kein auth.uid()) aufrufbar, liefert nur
--      id + name aktiver Mitarbeiter, keine sonstigen Felder.
--   2. Die eigentliche Anmeldung (Session ausstellen) passiert in der Edge Function
--      login-by-name mit dem Service-Role-Key, nicht hier in der DB.

create or replace function list_login_names()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, name from employees where active order by name;
$$;

revoke all on function list_login_names() from public;
grant execute on function list_login_names() to anon, authenticated;
