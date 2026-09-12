-- Login wie bei Wizzo: kein E-Mail-Feld, stattdessen Name antippen + eigenes
-- Passwort. Zwei Bausteine dafür:
--   1. list_login_names() – vor dem Login (kein auth.uid()) aufrufbar, liefert
--      id + name aktiver Mitarbeiter sowie has_account (ob schon ein Passwort
--      vergeben wurde), keine sonstigen Felder.
--   2. Das Anlegen des Login-Kontos beim allerersten Mal (Passwort festlegen)
--      passiert in der Edge Function set-password mit dem Service-Role-Key.
--      Die eigentliche Anmeldung danach läuft über den normalen
--      supabase.auth.signInWithPassword-Weg mit einer aus der employee-id
--      abgeleiteten, nie versendeten Adresse als Ersatz für "Benutzername".

drop function if exists list_login_names();

create function list_login_names()
returns table (id uuid, name text, has_account boolean)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, auth_user_id is not null as has_account
  from employees
  where active
  order by name;
$$;

revoke all on function list_login_names() from public;
grant execute on function list_login_names() to anon, authenticated;
