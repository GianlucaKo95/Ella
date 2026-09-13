-- Supabase Security Advisor: "Function Search Path Mutable" für die Trigger-
-- Funktionen, die bisher keinen fest gesetzten search_path hatten. Ohne
-- `set search_path` könnte eine Rolle mit CREATE-Recht auf ein Schema in der
-- aktuellen search_path-Reihenfolge eine gleichnamige Funktion/Tabelle
-- unterschieben. Verhalten der Funktionen bleibt unverändert.

alter function check_swap_request_owner() set search_path = public;
alter function check_shift_service_day() set search_path = public;
alter function check_bake_plan_day() set search_path = public;
alter function log_shift_change() set search_path = public;
alter function log_bake_entry_change() set search_path = public;
