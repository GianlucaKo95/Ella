-- Mitarbeiter löschen (Admin, Team-Tab): admin-exklusive RLS-Policy
-- "employees_write_admin" erlaubt DELETE auf employees bereits. Fehlten nur
-- ON-DELETE-Regeln für die beiden einzigen "harten" Fremdschlüssel ohne
-- eigene Regel (alle anderen sind längst CASCADE/SET NULL) — sonst würde das
-- Löschen einer Person, die z. B. eine Ankündigung gepostet hat, mit einem
-- Fremdschlüssel-Fehler abbrechen.

alter table shifts drop constraint shifts_created_by_fkey;
alter table shifts add constraint shifts_created_by_fkey
  foreign key (created_by) references employees (id) on delete set null;

alter table announcements drop constraint announcements_created_by_fkey;
alter table announcements add constraint announcements_created_by_fkey
  foreign key (created_by) references employees (id) on delete set null;
