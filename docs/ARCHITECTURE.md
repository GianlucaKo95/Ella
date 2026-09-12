# Ella – Architekturkonzept (v0.1, Rolle: Architekt)

## 1. Fachlicher Kontext
Café „Ella" — Kaffee & Kuchen. Zwei Planungsprobleme sollen digitalisiert werden:

1. **Schichtplanung**: Mitarbeiter melden Verfügbarkeiten, Admin/Chef erstellt daraus den Dienstplan, veröffentlichter Plan geht an alle Mitarbeiter.
2. **Kuchenplanung**: Planung, wann/wie viel von welchem Kuchen gebacken werden muss (vermutlich an Schichten/Tage/Wochenendspitzen gekoppelt).

## 2. Rollen
- **Mitarbeiter**: trägt Verfügbarkeit ein, sieht veröffentlichten Plan + Kuchenplan, erhält Benachrichtigungen.
- **Admin/Chef**: sieht alle Verfügbarkeiten, baut/ändert Schichtplan, plant Kuchenproduktion, veröffentlicht beides, verwaltet Mitarbeiter/Rezepte.

## 3. Tech-Stack (konsistent mit bestehenden Projekten: Polaris, SwapBid, Daily Nest Plans)
- **Frontend**: React + Vite + TypeScript, PWA (installierbar, offline-fähiger Grundshell, Push-fähig)
- **Backend**: Supabase (Postgres, Auth, Row Level Security, Edge Functions für Benachrichtigungslogik)
- **Paketierung**: Home Assistant Add-on (Docker-Container, `config.yaml`, optional Ingress in HA-UI), analog zu DNSHome-Updater / mg2abrp-Addon-Struktur
- **Benachrichtigungen**: HA Notify-Service als ein Kanal (Addon läuft ja in HA) + optional Web-Push für die PWA direkt, damit es auch ohne HA-Companion-App funktioniert

## 4. Kernmodule
1. **Auth & Mitarbeiterverwaltung** (Supabase Auth, Rollen: `admin`, `employee`)
2. **Verfügbarkeiten** (Mitarbeiter tragen pro Woche/Zeitraum ein, wann sie können/nicht können)
3. **Schichtplanung** (Admin erstellt Plan auf Basis der Verfügbarkeiten, Konfliktprüfung, Veröffentlichung)
4. **Kuchenplanung** (Backliste pro Tag/Woche, Mengen, ggf. Zuordnung "wer backt was")
5. **Benachrichtigungen** (Plan veröffentlicht → Push/HA-Notify an betroffene Mitarbeiter)

## 5. Rahmendaten (fachlich fix)
- Café-Öffnungszeiten (Theke/Service): **Donnerstag–Sonntag** → nur an diesen Tagen gibt es `shifts`.
- Backen: **Mittwoch, Donnerstag, Freitag**, ausschließlich **außerhalb der Öffnungszeiten** (an Do/Fr also vor Öffnung bzw. nach Schließung, nicht parallel zum Service).
- Es gibt **3 feste Back-Truppen**; jede Back-Schicht (Mi/Do/Fr) wird einer Truppe zugeordnet, nicht einzelnen Personen direkt.

## 6. Datenmodell (Entwurf)

```
employees
  id, auth_user_id, name, role ('admin'|'employee'), active,
  bake_team_id (nullable FK -> bake_teams, vom Admin im MA-Profil gepflegt),
  created_at

bake_teams
  id, name                      -- die 3 festen Back-Truppen

-- Verfügbarkeit: entweder dauerhaft wiederkehrend ("immer Mo frei/verfügbar")
-- oder einmalig für eine bestimmte Woche/Datum (Override/Ausnahme)
availability_entries
  id, employee_id,
  kind ('recurring'|'one_time'),
  day_of_week (bei 'recurring'), specific_date (bei 'one_time'),
  from_time, to_time, available (bool),   -- auch "explizit NICHT verfügbar" abbildbar
  note, created_at

shifts                                    -- nur Do-So (Service)
  id, date, start_time, end_time,
  shift_type ('früh'|'spät'),
  role_tag (nur bei 'früh' relevant: 'küche'|'service'; bei 'spät' null),
  employee_id (nullable solange ungeplant),
  status ('draft'|'published'),
  created_by, created_at

staffing_requirements                     -- Planungsregeln fürs Admin-UI
  id, day_of_week, shift_type ('früh'|'spät'),
  role_tag (nullable, nur für 'früh'),
  required_count                          -- z.B. Fr/früh/küche = 2, Fr/früh/service = 1


cake_items
  id, name, default_unit ('stück'|'blech'|...), recipe_note

bake_plan_entries                         -- nur Mi/Do/Fr, außerhalb Öffnungszeiten
  id, date, cake_item_id, quantity,
  bake_team_id (nullable solange ungeplant),
  status ('draft'|'published'), note

notifications_log
  id, type ('shift_published'|'bake_plan_published'), target_employee_id,
  sent_at, channel ('ha_notify'|'web_push')
```

RLS-Grundregel: `employee` sieht nur eigene Verfügbarkeiten + veröffentlichte (status='published') Shifts/Backpläne (inkl. seiner eigenen Back-Truppe); `admin` sieht/schreibt alles.

## 7. Kalender-Export (ICS)
Pro Mitarbeiter ein ICS-Feed (Edge Function, per token abrufbare URL) mit seinen veröffentlichten Service-Schichten **und** Back-Terminen seiner Truppe. Kein Speichern von ICS-Dateien nötig — wird aus `shifts`/`bake_plan_entries` zur Abrufzeit generiert.

## 6a. Monatlicher Verfügbarkeits-Stichtag
Siehe Datenmodell: `availability_deadlines` (ein Stichtag pro Monat, vom Admin gesetzt) und `availability_submissions` (ein Eintrag pro Mitarbeiter+Monat, sobald eingereicht). Einreichen ist erst möglich, wenn für alle relevanten Wochentage (Mi–So) ein wiederkehrender Verfügbarkeits-Eintrag existiert. Admin sieht den Einreichungsstatus aller Mitarbeiter vor dem Stichtag in der Planungsansicht.

## 6b. Ankündigungen ("Aktuelles") & eigener Anzeigename
- `announcements`: einfache News/Ankündigungen vom Admin/Chef an alle Mitarbeiter (lesbar für alle eingeloggten Nutzer, schreibbar nur von `admin`). Erscheinen auf dem Home-Screen.
- `update_my_name(new_name text)`: `SECURITY DEFINER`-Funktion, über die sich ein Mitarbeiter ausschließlich seinen eigenen Anzeigenamen ändern kann (Rolle, Truppe, Aktiv-Status bleiben admin-exklusiv, da es dafür keine offene Update-Policy auf `employees` gibt).

## 6c. Mitarbeiter-Ansicht: 3 Screens (Bottom-Navigation)
Die Mitarbeiter-Sicht ist in genau drei über die Navbar erreichbare Screens gegliedert (Admin behält zusätzlich "Planung" und "Team"):

- **Home** (`/home`): Übersicht der eigenen anstehenden (veröffentlichten) Schichten; falls der Mitarbeiter einer Back-Truppe zugeordnet ist (`bake_team_id` gesetzt), zusätzlich die nächsten Backtermine dieser Truppe; ein Hinweis-Popup, falls die Verfügbarkeit für den kommenden Monat noch nicht eingereicht wurde (verlinkt direkt ins Profil, dismissable); Rubrik "Aktuelles" mit den News aus `announcements` (Admin kann dort direkt neue Einträge verfassen).
- **Kalender** (`/kalender`): Monatsansicht im Stil von Apple Kalender (Grid mit führenden/nachfolgenden Tagen der Nachbarmonate). Zeigt alle veröffentlichten Schichten des Monats, eigene Schichten werden farblich hervorgehoben (Punkt/Hintergrund), Klick auf einen Tag zeigt die Details (wer arbeitet wann). Oben eine Statistik-Zeile mit den voraussichtlichen eigenen Stunden im aktuell angezeigten Kalendermonat (= angenommener Abrechnungszeitraum, siehe offene Fragen) sowie der Anzahl eigener Schichten. ICS-Abo-Link bleibt hier verfügbar.
- **Profil** (`/profil`): editierbarer Anzeigename (über `update_my_name`), darunter die dauerhaften (wiederkehrenden) Verfügbarkeiten je Wochentag sowie die Ausnahmen (Override je Einzeldatum) — inklusive der Stichtag-/Einreichen-Karte aus §6a.

Die früheren eigenständigen Screens "Verfügbarkeit", "Plan" und "Backplan" wurden zugunsten dieser drei Screens entfernt; ihre Inhalte sind in Profil bzw. Kalender/Home aufgegangen.

## 8. Offene Architekturfragen (für nächste Iteration)
- **Abrechnungszeitraum**: Für die "voraussichtlichen Stunden" im Kalender wird aktuell der Kalendermonat als Abrechnungszeitraum angenommen. Falls das Café einen abweichenden Abrechnungszeitraum hat (z. B. nicht am Monatsersten beginnend), muss das noch konfigurierbar gemacht werden.
- Mehrere Cafés/Standorte jemals relevant, oder bewusst single-tenant? (Aktuell: single-tenant angenommen)
- Annahme (bitte bestätigen): In der **Spätschicht gibt es keine Küche/Service-Trennung** — alle machen dort Service/Theke. Nur in der **Frühschicht** wird nach Küche/Service unterschieden. `staffing_requirements` bildet das je Wochentag + Schichttyp (+ Rolle bei Früh) ab, damit der Admin beim Planen sofort sieht, ob eine Schicht unter-/überbesetzt ist.

## 7. Addon-Grundgerüst (geplant)
```
ella/
  config.yaml
  Dockerfile
  run.sh
  rootfs/...
  app/                 # React/Vite PWA build
  supabase/
    migrations/
    functions/
```
