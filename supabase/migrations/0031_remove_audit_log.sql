-- Feedback: "Ich brauche den Log nicht." — das Änderungsprotokoll
-- (`plan_audit_log`, Migration 0008, zuletzt in Migration 0029 auf
-- SECURITY DEFINER umgestellt) wird komplett entfernt: die beiden Trigger,
-- ihre Funktionen und die Tabelle selbst (inkl. ihrer RLS-Policy). Löst
-- damit auch die Ursache von Migration 0029 an der Wurzel, statt sie nur
-- reparieren zu müssen — ohne Insert in eine Log-Tabelle gibt es dort auch
-- keine RLS mehr, die beim Bearbeiten einer veröffentlichten Schicht/eines
-- veröffentlichten Backeintrags fehlschlagen könnte.
drop trigger if exists shifts_log_change on shifts;
drop trigger if exists bake_plan_entries_log_change on bake_plan_entries;
drop function if exists log_shift_change();
drop function if exists log_bake_entry_change();
drop table if exists plan_audit_log;
