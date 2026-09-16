# Ella – Architekturkonzept (Rolle: Architekt)

## 1. Fachlicher Kontext
Café „Ella" — Kaffee & Kuchen. Zwei Planungsprobleme werden digitalisiert:

1. **Schichtplanung**: Mitarbeiter melden Verfügbarkeiten, Admin/Chef erstellt daraus den Dienstplan, veröffentlichter Plan geht an alle Mitarbeiter.
2. **Kuchenplanung**: Planung, wann/wie viel von welchem Kuchen gebacken werden muss, je Back-Truppe.

## 2. Rollen
- **Mitarbeiter**: trägt Verfügbarkeit ein, sieht veröffentlichten Plan + Kuchenplan (eigene Truppe), erhält Ankündigungen.
- **Admin/Chef**: sieht alle Verfügbarkeiten, baut/ändert Schicht- und Backplan, veröffentlicht beides, verwaltet Mitarbeiter/Back-Truppen/Einstellungen.

## 3. Tech-Stack (konsistent mit bestehenden Projekten: Polaris, SwapBid, Daily Nest Plans)
- **Frontend**: React + Vite + TypeScript, PWA (installierbar, offline-fähiger Grundshell)
- **Backend**: Supabase (Postgres, Auth, Row Level Security, Edge Functions für ICS-Feed und Erstpasswort-Vergabe)
- **Paketierung**: Home Assistant Add-on (Docker-Container, `config.yaml`, eigener Host-Port statt Ingress — siehe §17), analog zu DNSHome-Updater / mg2abrp-Addon-Struktur

## 4. Kernmodule
1. **Auth & Mitarbeiterverwaltung** (Login wie bei Wizzo: Name + eigenes Passwort in normalen Textfeldern, keine E-Mail; Rollen: `admin`, `employee`)
2. **Verfügbarkeiten** (dauerhaft wiederkehrend + Ausnahmen je Datum, monatlicher Einreichungs-Stichtag)
3. **Schichtplanung** (Admin erstellt Plan auf Basis der Verfügbarkeiten, Veröffentlichung)
4. **Kuchenplanung** (Backliste pro Tag, Mengen, Zuordnung zu einer Back-Truppe)
5. **Ankündigungen** ("Aktuelles" vom Admin/Chef an alle Mitarbeiter)
6. **Admin-Einstellungen** (Abrechnungszeitraum, Service-/Back-Tage, Back-Truppen)
7. **In-App-Benachrichtigungen** (Glocke im Header, pro Mitarbeiter: Plan veröffentlicht, Ankündigung)
8. **Schichttausch** (Mitarbeiter bietet eigene Schicht einem Kollegen an, Kollege nimmt an/ab, Admin bestätigt final)

## 5. Rahmendaten
Alle drei sind inzwischen admin-einstellbar (Details in §8), mit diesen Startwerten:
- Café-Öffnungszeiten (Theke/Service): standardmäßig **Donnerstag–Sonntag**.
- Backen: standardmäßig **Mittwoch, Donnerstag, Freitag**, ausschließlich **außerhalb der Öffnungszeiten** — Backen und Service überlappen sich nie am selben Tag in der Zeit, aber das System erzwingt das aktuell nicht automatisch (offene Frage, §14).
- Back-Truppen: standardmäßig **3** (Seed-Daten), Anzahl ergibt sich aus den Zeilen in `bake_teams`, nicht mehr aus einer fixen Annahme.
- Nur die **Frühschicht** unterscheidet Küche/Service; die **Spätschicht** kennt diese Aufteilung nicht.
- **Samstags** ist die Spätschicht in der Praxis zwei Slots mit unterschiedlicher Startzeit: 13 Uhr (meist 1 Person) und 14 Uhr (meist 2 Personen), beide bis 18 Uhr (offizieller Ladenschluss; danach wird nur noch aufgeräumt). Kein eigenes Datenmodell dafür nötig — `shifts.start_time` trägt das schon, die Schichtplanung (§10) zeigt an Samstagen deshalb neben "+ Spät" ein Uhrzeit-Dropdown (13:00/14:00) statt der sonst festen 13:00.

## 6. Datenmodell

```
employees
  id, auth_user_id, name, role ('admin'|'employee'), active,
  bake_team_id (nullable FK -> bake_teams, admin-gepflegt; Name vom MA selbst
    über update_my_name() änderbar),
  created_at

bake_teams
  id, name                      -- Back-Truppen, per Admin-UI CRUD-verwaltet

-- Verfügbarkeit: entweder dauerhaft wiederkehrend ("immer Mo verfügbar")
-- oder einmalig für ein bestimmtes Datum (Override/Ausnahme, schlägt die Regel)
availability_entries
  id, employee_id,
  kind ('recurring'|'one_time'),
  day_of_week (bei 'recurring', 0=Mo..6=So), specific_date (bei 'one_time'),
  from_time, to_time, available (bool),
  note, created_at
  -- unique index (employee_id, specific_date) where kind='one_time'
  -- (Migration 0022): garantiert auf DB-Ebene, dass pro Mitarbeiter und Tag
  -- nur eine 'one_time'-Verfügbarkeit existieren kann — zuvor gab es nur die
  -- Client-Prüfung in setDayAvailability() (Profil.tsx, erst nachschauen ob
  -- eine Zeile existiert, dann UPDATE statt INSERT), die bei zwei schnell
  -- hintereinander angeklickten Tagesoptionen theoretisch zwei Zeilen für
  -- denselben Tag hätte anlegen können.

-- Monatlicher Einreichungs-Stichtag (siehe §9)
availability_deadlines
  month (date, 1. des Monats, unique), deadline (date)
availability_submissions
  employee_id, month, submitted_at   -- unique(employee_id, month)

shifts                                    -- Service-Schichten
  id, date, start_time, end_time,
  shift_type ('frueh'|'spaet'),
  role_tag (nur bei 'frueh' relevant: 'kueche'|'service'; bei 'spaet' null),
  employee_id (nullable solange ungeplant),
  status ('draft'|'published'),
  created_by, created_at
  -- Tages-Validierung gegen app_settings.service_days per Trigger, siehe §7

staffing_requirements                     -- Mindestbesetzung je Wochentag/Schicht
  id, day_of_week (0-6), shift_type ('frueh'|'spaet'),
  role_tag (nullable, nur für 'frueh'),
  required_count

cake_items                                -- Kuchen-Stammdaten, nur vom Admin gepflegt
  id, name, default_unit ('stück'|'blech'|...),
  ingredients (Zutaten, Freitext, Fallback), recipe_note (Backanleitung, Freitext),
  is_favorite (bool, Default false, Migration 0024_cake_favorites.sql)

cake_recipe_ingredients                   -- strukturierte Zutatenliste je Kuchen
  id, cake_item_id (-> cake_items, on delete cascade), sort_order,
  ingredient, quantity (nullable numeric), unit (nullable), note (nullable)
  -- ersetzt `cake_items.ingredients` nicht, ergänzt es: existieren Zeilen hier,
  -- zeigt die Backen-Sicht (§9) diese strukturiert an, sonst den Freitext.

bake_team_days                            -- feste Truppe je Wochentag (optional)
  day_of_week (0=Mo..6=So, primary key),
  bake_team_id (-> bake_teams)
  -- rein für den Admin-Komfort: befüllt beim Anlegen eines Backeintrags (§10)
  -- automatisch `bake_team_id`, ersetzt keine manuelle Zuordnung, kann pro
  -- Eintrag weiterhin überschrieben werden.

bake_plan_entries                         -- Backplan, außerhalb Öffnungszeiten
  id, date, cake_item_id, quantity,
  bake_team_id (nullable solange ungeplant, siehe bake_team_days-Vorbelegung),
  status ('draft'|'published'),
  note (Freitext, seit Migration 0001 im Schema, erst später im UI editierbar gemacht — §10)
  -- Tages-Validierung gegen app_settings.bake_days per Trigger, siehe §7

announcements                             -- "Aktuelles" (Home-Screen)
  id, body, image_url (nullable, optionales Bild),
  created_by (-> employees), created_at

app_settings                              -- Singleton (genau 1 Zeile, id=true)
  billing_period_start_day (1-28, Default 1),
  service_days (smallint[], 0=Mo..6=So, nicht leer, Default {3,4,5,6}),
  bake_days   (smallint[], 0=Mo..6=So, nicht leer, Default {2,3,4}),
  frueh_days (smallint[], 0=Mo..6=So, leer erlaubt, Default {5,6}) -- steuert nur die UI, siehe §8

notifications_log                         -- In-App-Benachrichtigungen (Glocke) + Web-Push-Protokoll
  id, type ('shift_published'|'bake_plan_published'|'announcement'|
            'swap_accepted'|'availability_submitted'|'reminder'),
  target_employee_id, body, read_at (nullable),
  sent_at, channel ('ha_notify'|'web_push')   -- 'ha_notify' bleibt ungenutzt, siehe §7a

push_subscriptions                        -- Web-Push-Abos, siehe §7a
  id, employee_id, endpoint (eindeutig, 1 Zeile je Browser/Gerät),
  p256dh, auth (Push-Verschlüsselung), created_at

shift_swap_requests                       -- Schichttausch
  id, shift_id (-> shifts),
  requested_by (-> employees, muss aktuell eingeteilt sein, per Trigger erzwungen),
  offered_to (-> employees, <> requested_by),
  status ('pending'|'accepted'|'declined'|'confirmed'|'cancelled'),
  created_at, responded_at
  -- 'confirmed' wird nur vom Admin gesetzt und ist der Zeitpunkt, an dem
  -- shifts.employee_id tatsächlich auf offered_to umgeschrieben wird.

plan_audit_log                            -- Änderungsprotokoll (nur Admin lesbar)
  id, entity ('shift'|'bake_entry'), entity_id, date,
  change_summary (Freitext), changed_at
  -- wird ausschließlich per Trigger befüllt (AFTER UPDATE/DELETE), und nur
  -- für Einträge, die zum Zeitpunkt der Änderung bereits status='published'
  -- waren — normale Planungsarbeit an draft-Einträgen wird nicht protokolliert.
```

`is_colleague_available(target_employee, check_date)` — `security definer`-Funktion, die beim Anbieten eines Schichttauschs prüft, ob der ausgewählte Kollege an dem Tag laut eigener Verfügbarkeitsangabe "kann nicht" eingetragen hat, ohne dass der anbietende Mitarbeiter dessen `availability_entries` direkt lesen darf (die bleiben weiterhin strikt "eigene oder Admin"). Liefert nur ein Bool, keine Rohdaten; `true`, wenn unbekannt.

RLS-Grundregel: `employee` sieht nur eigene Verfügbarkeiten + veröffentlichte (`status='published'`) Shifts/Backpläne (Backpläne nur der eigenen Truppe) + alle Ankündigungen; `admin` sieht/schreibt alles. `app_settings`/`bake_teams`/`staffing_requirements`/`cake_items` sind für alle eingeloggten Nutzer lesbar, aber nur für `admin` schreibbar.

## 7. Wochentags-Validierung (Trigger statt fixer CHECKs)
`service_days`/`bake_days` sind laufzeit-konfigurierbar, ein reiner `CHECK`-Constraint kann aber nicht gegen eine andere Tabelle prüfen. Deshalb validieren zwei `BEFORE INSERT/UPDATE OF date`-Trigger-Funktionen (`check_shift_service_day` auf `shifts`, `check_bake_plan_day` auf `bake_plan_entries`) jedes neue/geänderte Datum gegen die aktuellen `app_settings`-Werte und lehnen mit einer Exception ab, wenn der Wochentag nicht erlaubt ist. Das ersetzt die ursprünglichen festen `isodow`-Checks (Migration 0001) vollständig (Migration 0006).

**Nachtrag (Migration 0019, Migrations-Drift behoben)**: Die beiden Trigger waren in der laufenden Datenbank tatsächlich nie angehängt — die Funktionen existierten, aber ohne `CREATE TRIGGER` dazu, sodass serverseitig überhaupt keine Tages-Validierung mehr griff (nur noch die freiwillige Client-Prüfung in AdminPlanning). Migration 0019 hängt beide Trigger nach (`drop trigger if exists` + `create trigger`, idempotent). Dabei wurde `check_shift_service_day` zusätzlich um eine Sondertage-Ausnahme ergänzt: liegt für `NEW.date` ein `special_days`-Eintrag mit `service_exception = true` vor (§10), gibt die Funktion sofort `NEW` zurück, bevor sie gegen `service_days` prüft — sonst hätte das Nachrüsten des Triggers das Anlegen von Schichten an admin-deklarierten Zusatzterminen (Migration 0016) wieder unterbunden.

## 7a. Echte Push-Benachrichtigungen (Web Push, Migration 0021)
Löst den in §14 (alte Fassung) offenen Punkt "kein echter Push" ein: neben dem
In-App-Eintrag in `notifications_log` (Glocke, 60s-Poll) verschickt die App
jetzt zusätzlich eine echte, VAPID-signierte Web-Push-Nachricht, die auch bei
geschlossener App/Tab als System-Benachrichtigung ankommt (Voraussetzung:
HTTPS und ein Browser mit Push-API-Unterstützung — bei Nutzung über die
Home-Assistant-Companion-App hängt das von deren WebView-Version ab).

- **Abo** (`lib/push.ts`, `push_subscriptions`): pro Browser/Gerät ein Eintrag
  (`endpoint` eindeutig), angelegt über `enablePush(employeeId)` — fragt die
  Standard-Browser-Erlaubnis an und registriert das Abo beim Push-Dienst des
  Browsers (`PushManager.subscribe`) mit dem öffentlichen VAPID-Schlüssel.
  RLS: jede:r verwaltet ausschließlich das eigene Abo
  (`employee_id = current_employee_id()`). Jede Person muss das für ihr
  eigenes Gerät einmalig selbst aktivieren (Browser-Erlaubnis lässt sich nicht
  im Namen anderer erteilen) — ein "Push-Benachrichtigungen aktivieren"-Button
  (`usePushToggle`-Hook + `PushToggleButton`-Komponente, geteilt zwischen
  beiden Stellen) sitzt sowohl in den Admin-Einstellungen (§8, eigene
  "Benachrichtigungen"-Sektion) als auch im Profil jedes Mitarbeiters — ohne
  aktiviertes Abo kommt bei dieser Person nichts an, auch nicht bei einer
  Admin-Erinnerung.
- **Service Worker** (`src/sw.ts`): vite-plugin-pwa läuft dafür nicht mehr im
  Standard-Modus (`generateSW`, kein eigener Code möglich), sondern als
  `injectManifest` mit eigenem SW-Quelltext — der fügt `push`- und
  `notificationclick`-Handler hinzu (zeigt die System-Benachrichtigung,
  öffnet/fokussiert beim Antippen die App) und ruft `precacheAndRoute`
  weiterhin selbst auf. Von `tsc -b` bewusst ausgeschlossen
  (`tsconfig.json`), da WebWorker- und DOM-Typen sich in einem gemeinsamen
  Compile-Lauf nicht vertragen; vite/esbuild bauen die Datei unabhängig davon.
  `self.skipWaiting()` + `clients.claim()` sorgen dabei gleich mit dafür, dass
  eine neu deployte Version offene Tabs sofort übernimmt, statt (Standard-SW-
  Verhalten) bis zum manuellen Neustart der App zu warten — `main.tsx`
  registriert den Worker entsprechend selbst über `virtual:pwa-register`
  (`registerSW({ immediate: true })`) statt über das vorher injizierte
  Standard-Skript.
- **Versand — Edge Function `send-push`** (ersetzt den bisherigen direkten
  Insert in `notifications_log` aus `notifyEmployees()`): schreibt weiterhin
  die `notifications_log`-Zeile(n), verschickt zusätzlich die Web-Push-
  Nachricht an jedes Abo der Ziel-Mitarbeiter (`npm:web-push`, VAPID-Secrets
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`) und räumt bei einer
  410/404-Antwort (Abo beim Push-Dienst nicht mehr gültig) die betroffene
  `push_subscriptions`-Zeile gleich mit auf. Berechtigung je Typ:
  - `swap_accepted`/`availability_submitted` (`notifyAdmins()`, von jeder
    angemeldeten Person aus aufrufbar): Ziel sind serverseitig **immer** alle
    aktiven Admins, die vom Client mitgeschickte Mitarbeiterliste wird
    ignoriert — sonst könnte eine Mitarbeiter-Session darüber beliebige
    andere Mitarbeiter anschreiben.
  - `shift_published`/`bake_plan_published`/`announcement`/`reminder`
    (`notifyEmployees()`): nur Admins, Ziel-Mitarbeiter kommen vom Client.
  `verify_jwt` bewusst aus (`supabase/config.toml`, gleicher Grund wie bei
  `reset-password`/`delete-employee`), Berechtigung wird im Code anhand des
  mitgeschickten Bearer-Tokens geprüft.
- **Auslöser**: `respondToSwap()` (Home.tsx) benachrichtigt die Admins erst
  bei "angenommen" (nicht schon bei der ursprünglichen Anfrage) — erst dann
  wartet der Tausch auf die finale Bestätigung durch einen Admin
  (`Schichttausch-Bestätigungen`, §10). `submitMonth()` (Profil.tsx)
  benachrichtigt die Admins direkt beim Einreichen. Admin-seitig gibt es in
  den Einstellungen (§8) einen "Erinnerung senden"-Button direkt bei der
  Verfügbarkeits-Stichtag-Übersicht, der an alle dort als "ausstehend"
  markierten Mitarbeiter eine Erinnerung schickt.
- **Setup-Voraussetzung**: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
  `VAPID_SUBJECT` müssen als Secrets der Edge Function `send-push` gesetzt
  sein (Supabase-Dashboard oder `supabase secrets set`) — das kann nicht per
  Migration/Deploy automatisiert werden, da der private Schlüssel nirgends im
  Repo landen darf.

## 8. Admin-Einstellungen (`app_settings`)
Eine globale, admin-editierbare Konfiguration, gebündelt im eigenen "Einstellungen"-Tab der
Admin-Planung (§10) — bewusst getrennt von der eigentlichen Schicht-/Backplanung, damit dort nur
die tagesaktuelle Planungsarbeit sichtbar ist. Der Tab besteht aus einzelnen, standardmäßig
zugeklappten Abschnitten (`SettingsSection`-Komponente, `AdminPlanning.tsx`) — jeder zeigt
zugeklappt Titel + eine knappe Zusammenfassung des aktuellen Stands (z. B. "3 Truppen",
"7 Kuchen hinterlegt"), damit ein Überblick über alle Themen auch ohne Aufklappen möglich ist
(Feedback: eine einzige lange Karte mit allem offen war unübersichtlich). Themen:
- **Abrechnungszeitraum** (`billing_period_start_day`): an welchem Tag des Monats der Zeitraum beginnt, der für die „voraussichtlichen Stunden" im Mitarbeiter-Kalender zählt. `1` = klassischer Kalendermonat. Betrifft **ausschließlich** diese Stundenanzeige.
- **Service-/Back-Tage** (`service_days`/`bake_days`): Wochentags-Toggle, bestimmen welche Wochentage in der Monatsplanung (§10) als Service- bzw. Back-Tage gelten, z. B. um die Back-Tage zu reduzieren, wenn weniger gebacken werden muss. Nur `service_days` bestimmt, für welche Tage ein Mitarbeiter vor dem Einreichen eine Verfügbarkeit braucht (§9) — Back-Tage nicht, da Backeinträge per Truppe (`bake_team_id`) zugewiesen werden, nicht anhand individueller Verfügbarkeit.
- **Frühschicht-Tage** (`frueh_days`, Migration 0012): Wochentags-Toggle wie `service_days`/`bake_days`, an welchen Tagen normalerweise eine Frühschicht stattfindet (Default nur Sa/So, wie im echten Café-Betrieb — Mo–Fr nur Spätschicht). Kein reines An/Aus: an Tagen außerhalb `frueh_days` zeigt die Schichtplanung (§10) statt der "+ Früh"-Buttons einen "+ Ausnahme: Frühschicht"-Link, der sie für genau diesen Tag freischaltet — Frühschichten "aus der Reihe" bleiben damit weiterhin möglich, ohne dass sie an jedem Tag als gleichwertige Standardoption erscheinen. Leeres Array ist gültig (nie normalerweise, nur Ausnahmen). `staffing_requirements` mit `shift_type = 'frueh'` werden unabhängig davon weiter angezeigt (Bedarfstext).
- **Back-Truppen** (`bake_teams`): eigene Karte zum Anlegen/Umbenennen/Löschen einer Truppe sowie zur Mitgliederverwaltung (Mitarbeiter zuordnen/entfernen/umhängen), technisch weiterhin über `employees.bake_team_id`.
- **Kuchen-Stammdaten**: Name, Einheit, Backanleitung (`recipe_note`, Freitext) — CRUD, nur hier gepflegte Kuchen stehen im Backplan als Auswahl zur Verfügung, kein Freitext. Jeder Kuchen ist eingeklappt (nur Name antippbar) und öffnet sich erst beim Antippen für Details/Bearbeitung — bei vielen Kuchen bleibt die Liste sonst unübersichtlich. Die Zutaten sind seit Migration 0018 strukturiert: eine "Zutatenliste" (`cake_recipe_ingredients`, je Zeile Zutat/Menge/Einheit/Anmerkung, mit Sortierung, hinzufügen/löschen direkt im aufgeklappten Kuchen) statt reinem Fließtext, damit die Backen-Sicht (§9) sie tabellarisch darstellen kann. Das alte Freitextfeld `cake_items.ingredients` bleibt als Fallback erhalten (Kuchen ohne strukturierte Zeilen zeigen weiterhin nur den Text) und ist im UI entsprechend als "Zutaten (Freitext, Fallback ohne Liste oben)" beschriftet. Ein ★/☆-Button links neben dem Namen (außerhalb des Auf-/Zuklapp-Buttons, damit er ohne Aufklappen erreichbar ist) markiert einen Kuchen als Favorit (`is_favorite`, Migration `0024_cake_favorites.sql`) — Favoriten erscheinen im Kuchen-Dropdown der Backplanung (§10) zusätzlich oben in einer eigenen `<optgroup>` "Favoriten", bleiben aber auch unten in der vollständigen Gruppe "Kuchen" enthalten (Feedback: "sollen aber auch weiterhin in der zweiten Gruppe Kuchen weiterhin angezeigt werden").
- **Feste Truppe je Back-Tag** (`bake_team_days`, optional): je Back-Tag (aus `bake_days`) ein Dropdown zur Wahl einer festen Back-Truppe. Rein ein Komfortfeature für den Admin — beim Anlegen eines neuen Backeintrags an diesem Wochentag (§10) wird `bake_team_id` automatisch vorbelegt, statt bei jedem Eintrag erneut manuell ausgewählt werden zu müssen; die Vorbelegung lässt sich pro Eintrag weiterhin überschreiben.
- **Verfügbarkeits-Stichtag** (§11) samt Einreichungsstatus je Mitarbeiter für den kommenden Monat.
- **Personalbedarf** (`staffing_requirements`): je Service-Tag (aus `service_days`) drei Zahlenfelder — Früh/Küche, Früh/Service, Spät —, wie viele Personen mindestens gebraucht werden. Die Tabelle existierte technisch schon länger, war aber einmalig mit Platzhalterwerten geseedet (Migration `0002_seed.sql`) und hatte bis dahin **keine Admin-Oberfläche** zum Ansehen oder Ändern — nur ein reiner Lesetext ("Bedarf: ...") in der aufgeklappten Tageskarte der Schichtplanung. `setStaffingRequirement()` schreibt gezielt per gefundener `id` (UPDATE) oder legt neu an (INSERT), statt über `upsert`/`onConflict` zu gehen — Postgres behandelt zwei `NULL`-Werte in `role_tag` (immer der Fall bei `shift_type = 'spaet'`) für den `unique (day_of_week, shift_type, role_tag)`-Index als **ungleich**, ein Upsert würde eine bestehende Spät-Zeile also nicht zuverlässig treffen, sondern eine zweite anlegen.

**Wichtig**: Der Abrechnungszeitraum und die Planungs-Zeiträume sind bewusst entkoppelt — die Schicht-/Backplanung durch den Admin läuft immer über den vollen Kalendermonat (§10), unabhängig vom eingestellten Abrechnungszeitraum.

## 9. Mitarbeiter-Ansicht: Home / Kalender / Verfügbarkeit / Profil
Über die Navbar erreichbare Screens (Admin sieht zusätzlich „Planung" und „Team", aber **nicht** „Verfügbarkeit", s. u.). Reihenfolge in der Navbar: Home, Kalender, Verfügbarkeit (nur Mitarbeiter), Backen (nur mit Truppe), Planung/Team (nur Admin), **Profil ganz rechts** — Profil ist der einzige Tab mit fester Position am Ende, alle anderen ordnen sich davor ein, je nachdem was für die jeweilige Person zutrifft.

- **Home** (`/home`): "Heute im Dienst" (alle veröffentlichten Schichten des heutigen Tages, nicht nur die eigene); offene/abgeschickte Schichttausch-Anfragen (eingehend: Annehmen/Ablehnen; ausgehend: Status); "Meine Woche" (rollierende 7-Tage-Ansicht ab heute, je Tag die eigene Schicht oder "frei", mit direktem "Tauschen"-Button je Schicht — keine Notwendigkeit, dafür erst in den Kalender zu wechseln); falls einer Back-Truppe zugeordnet, zusätzlich deren nächste Backtermine; Hinweiskarte, falls die Verfügbarkeit für den kommenden Monat noch nicht eingereicht wurde (verlinkt in den Verfügbarkeit-Tab, dismissable, **nur für Mitarbeiter** — Admins müssen keine Verfügbarkeit abgeben, s. u.); "Aktuelles" mit den News aus `announcements` — **nur Admins können posten** (UI blendet das Formular für Mitarbeiter aus, RLS `announcements_write_admin` erzwingt es zusätzlich serverseitig), optional mit Bild (`image_url`, Storage-Bucket `announcement-images`, Migration `0023_announcement_images.sql` — öffentlich lesbar, Schreiben admin-exklusiv, kein Ordner pro Person nötig da eh nur Admins schreiben). Posten löst eine Benachrichtigung an alle übrigen aktiven Mitarbeiter aus.
- **Kalender** (`/kalender`): Apple-Kalender-artige Monatsansicht aller veröffentlichten Schichten. Tage, die laut `app_settings.service_days` kein Service-Tag sind, werden schraffiert/gedimmt dargestellt statt wie ein leerer Tag auszusehen (Detailkarte zeigt dort "Café geschlossen"). Eigene Schicht wird als gefüllter Punkt (Früh) bzw. Ring (Spät) dargestellt, ein eigener Backtermin (eigene Truppe) als rautenförmiger Punkt — alles auf einen Blick ohne den Tag antippen zu müssen; mehr als 3 Kolleg:innen an einem Tag werden als "+N" statt als einzelne Punkte angezeigt. Beim Öffnen ist der heutige Tag bereits ausgewählt. Klick auf einen Tag zeigt die Details inkl. eines "Tauschen"-Buttons auf eigenen Schichten (öffnet eine Kollegen-Auswahl, legt eine `shift_swap_requests`-Zeile an; warnt per `is_colleague_available` dezent, falls der gewählte Kollege laut eigener Angabe an dem Tag nicht kann — keine harte Sperre). Stat-Kacheln zeigen die voraussichtlichen eigenen Stunden und die Anzahl eigener Schichten **im admin-eingestellten Abrechnungszeitraum** (§8), nicht im angezeigten Kalendermonat. ICS-Abo-Link.
- **Verfügbarkeit** (`/verfuegbarkeit`, `pages/Verfuegbarkeit.tsx`, **nur für Mitarbeiter** — Route und Navbar-Eintrag sind für `role = 'admin'` komplett ausgeblendet): eigener Tab statt Teil des Profils (vorher dort unten in einer einzigen langen Karte — Feedback: "geht neben Profilbild/Name optisch unter"). Admins müssen laut Hausregel keine Verfügbarkeit abgeben (sie werden nur im Notfall direkt in der Schichtplanung zugewiesen, §10) — sie tauchen deshalb weder in diesem Tab noch in der "Verfügbarkeit fehlt"-Hinweiskarte auf Home noch im Verfügbarkeits-Stichtag/den Erinnerungen der Admin-Planung (§10/§11) auf.
- **Profil** (`/profil`): eigenes Profilbild (Upload/Entfernen, siehe unten), editierbarer Anzeigename (`update_my_name`), Push-Benachrichtigungen (`PushToggleButton`), **App installieren** (`lib/pwaInstall.ts`, `usePwaInstall`) — s. u.
- **Backen** (`/backen`, nur sichtbar für Mitarbeiter mit gesetztem `bake_team_id`, eigener Navbar-Eintrag): zeigt ausschließlich die **veröffentlichten** Backeinträge der eigenen Truppe ab heute, als aufklappbare Karten (Datum, Kuchenname, Menge). Aufklappen zeigt die strukturierte Zutatenliste (`cake_recipe_ingredients`, sortiert) sowie `recipe_note` (Backanleitung); ohne strukturierte Zeilen fällt die Karte auf `cake_items.ingredients` (Freitext) zurück. Ohne zugeordnete Truppe zeigt die Route gar nicht in der Navbar, ein direkter Aufruf wäre ohnehin leer.

  **Verfügbarkeit direkt pro Tag statt wiederkehrender Regel + Ausnahmen** (Korrektur nach Feedback: "jeden Freitag anlegen und dann Ausnahmen auswählen" war zu umständig): die Karte listet für den einreichbaren Monat jeden Tag einzeln auf, dessen Wochentag in `service_days` liegt (§8 — bewusst nicht die Back-Tage, s. o.; nur Tage, an denen das Café offen hat, brauchen eine Verfügbarkeitsangabe) — via `monthDaysMatching` (`lib/dates.ts`), mit direktem "kann"/"kann nicht" je Zeile — außer an Tagen mit Frühschicht (`frueh_days`, §8, oder einem Sondertag mit `frueh_exception`, §10): dort vier Optionen **"kann nicht" / "Früh" / "Spät" / "ganztags"**, da "kann" allein an solchen Tagen nicht unterscheidet, ob jemand nur morgens oder nur nachmittags kann (Feedback: "das wäre noch ein Painpoint"). Jede Auswahl schreibt/aktualisiert sofort einen `'one_time'`-Eintrag auf das exakte Datum (`specific_date`) — es gibt keine wiederkehrende Wochentags-Regel (`kind = 'recurring'`) mehr, die im UI editierbar wäre. Vom Admin angelegte Sondertage mit `service_exception` **oder** `frueh_exception` (§10) erscheinen automatisch zusätzlich in dieser Liste, auch wenn ihr Wochentag kein normaler Service-Tag ist (`mergeUniqueDates`, `lib/dates.ts`), samt der Bezeichnung als kleiner Hinweistext unter dem Datum — damit landet eine admin-seitig entschiedene Ausnahme wie ein zusätzlicher Feiertags-Öffnungstag auch wirklich in der Verfügbarkeitsabfrage der Mitarbeiter, statt nur in der Planung sichtbar zu sein. Ursprünglich wurde hier nur `service_exception` geprüft — ein Sondertag mit ausschließlich `frueh_exception` (ohne zusätzliche Öffnung) tauchte dadurch nirgends auf, nicht mal in der Admin-Planung selbst (dort dieselbe Lücke in der `svcDays`-Berechnung, §10), sodass der Admin die besondere Frühschicht für diesen Tag gar nicht hätte anlegen können.

  **Kein "Weitere Termine" mehr** (entfernt, nachdem obiger Bug behoben war): gab bis dahin eine zweite, kleinere Liste, über die Mitarbeiter per Tag/Monat/Jahr-Auswahl manuell einen Termin außerhalb der Hauptliste eintragen konnten — gedacht für Tage, von denen der Admin noch nichts weiß. Da es diesen Fall in der Praxis nicht gibt (jeder besondere Tag läuft über die Sondertage-Verwaltung, §10, und landet damit automatisch oben in der Hauptliste), war die zusätzliche, manuell zu bedienende Liste nur verwirrend, ohne einen echten Anwendungsfall abzudecken.

  **Bugfix Datums-Umrechnung (`toDateStr`, `lib/dates.ts`)**: Datumsobjekte wurden bislang teils per `date.toISOString().slice(0, 10)` in einen `YYYY-MM-DD`-String umgewandelt. `toISOString()` rechnet dabei intern über UTC — in jeder Zeitzone mit positivem UTC-Offset (z. B. Deutschland, UTC+1/+2) liegt lokale Mitternacht noch im UTC-Vortag, wodurch das Ergebnis systematisch einen Tag zu früh war. Betroffen waren u. a. der beim Antippen eines Kalendertags angezeigte Vortag (Kalender), das Datum, unter dem eine Verfügbarkeitsangabe tatsächlich gespeichert wurde (Profil/Admin-Planung — sichtbar z. B. als Diskrepanz zwischen der Verfügbarkeitsliste im Profil und der Zuweisungs-Anzeige in der Schichtplanung), sowie vereinzelt fehlschlagende Einträge am Monatsersten in der Backplanung. `toDateStr` baut den String jetzt direkt aus den lokalen Datumsteilen (`getFullYear`/`getMonth`/`getDate`) zusammen, ohne den Umweg über UTC. Historische, durch den Bug bereits falsch gespeicherte `availability_entries` wurden einmalig per direkter SQL-Korrektur bereinigt.

  **Früh/Spät-Zeitfenster** (`availability_entries.from_time`/`to_time`, ursprünglich im Schema angelegt, bis dahin aber ungenutzt): "Früh" setzt `00:00–13:00`, "Spät" `13:00–23:59`, "ganztags"/"kann nicht" lassen beide leer (13:00 ist die feste Grenze, da Frühschichten laut `addShift()`-Default immer um 13:00 enden und Spätschichten frühestens um 13:00 beginnen). `is_colleague_available` (SQL) und `availabilityFor` (AdminPlanning, Client) vergleichen bei gesetztem Fenster die Startzeit der konkreten Schicht (`shifts.start_time`) dagegen — ohne Fenster (ganztags oder alte Einträge vor dieser Umstellung) zählt die Verfügbarkeit weiterhin für jede Schicht des Tages. `is_colleague_available` bekam dafür den optionalen dritten Parameter `check_start_time` (Migration `0015_frueh_spaet_availability.sql`); die alte Zwei-Parameter-Signatur wurde explizit per `drop function` entfernt statt nur ersetzt, da eine zusätzliche Signatur mit Default-Parameter sonst einen Aufruf mit nur zwei Argumenten mehrdeutig gemacht hätte. Aufrufer, die die Schichtzeit kennen (Tauschanfragen in Home/Kalender, Zuweisungs-Dropdown in AdminPlanning), geben sie mit.

**Header** (`App.tsx`, überall sichtbar): links das App-Logo (`public/logo.png`) neben dem Schriftzug "ELLA", rechts Glocke, Name/Rolle, eigenes Profilbild (`employees.avatar_url`) und ein Logout-Icon-Button (`IconLogout`, ersetzt den früheren separaten "Abmelden"-Button unterhalb des Headers). Ohne gesetztes Profilbild zeigt die `Avatar`-Komponente (`components/Avatar.tsx`) ersatzweise einen Kreis mit dem Großbuchstaben des Vornamens (erstes Zeichen von `employee.name`) — kein eigenes Datenfeld nötig, rein clientseitig aus dem Namen abgeleitet. Upload läuft über den öffentlichen Storage-Bucket `avatars` (Migration `0013_avatars.sql`): jede:r Mitarbeiter:in darf ausschließlich in den eigenen Ordner `<auth.uid()>/…` schreiben (RLS auf `storage.objects`), Lesen ist öffentlich (Profilbilder sind unkritisch, vereinfacht das Anzeigen ohne Signed URLs). Jeder Upload bekommt einen neuen Dateinamen (`Date.now()`), damit die neue öffentliche URL nicht durch Cache eine alte Version zeigt. Das Schreiben von `employees.avatar_url` läuft — wie bei `update_my_name` — über eine SECURITY-DEFINER-Funktion (`update_my_avatar_url`), da die normale Update-Policy auf `employees` admin-exklusiv ist.

**Bugfix Benachrichtigungs-Panel abgeschnitten** (`NotificationBell.tsx`, `.who`/`.notif-panel` in `styles/index.css`): das Panel positionierte sich per `right: 0` relativ zu einem eigenen, nur bell-breiten Wrapper-Div — auf schmalen Screens lief es dadurch links über den Bildschirmrand hinaus, da die Glocke selbst nicht am rechten Fensterrand sitzt (rechts davon stehen noch Name, Profilbild, Logout-Button). Der Positionierungs-Kontext ist jetzt `.who` (die ganze rechte Header-Gruppe, die dank `margin-left: auto` tatsächlich am rechten Rand anliegt) statt des bell-eigenen Wrappers — das Panel bleibt dadurch auf jeder Bildschirmbreite vollständig sichtbar.

**Farbschema** (`styles/index.css`, CSS-Variablen in `:root`): an den Logo-Farben ausgerichtet — helles/weißes `--bg`/`--surface` statt des vorherigen warmen Creme-Tons, `--accent` ein aus dem Logo abgeleitetes Türkis/Mint-Grün (`#1b7e71`, kontrastgeprüft ≥4.5:1 für weißen Buttontext) statt des vorherigen Orange. `--mint` (positive/"kann"/"veröffentlicht"-Zustände), `--warn` und `--attention` (Warnungen/"kann nicht") bleiben unverändert, da sie als eigenständige Signalfarben schon vorher vom Haupt-Akzent getrennt waren. `theme_color`/`background_color` in `vite.config.ts` (PWA-Manifest) sowie `index.html` sind entsprechend mitgezogen.

**Mobile-only, kein horizontales Scrollen** (Nutzung findet ausschließlich am Handy statt, kein Desktop-Case): `html, body` erzwingen `overflow-x: hidden` als Sicherheitsnetz, dazu `select`/`input`/`textarea`/`img` mit `max-width: 100%` — kein einzelnes Element darf die Seite je horizontal aufsprengen. Mehrspaltige Datentabellen mit Formularelementen (Schichtzuweisung, Backplan, Mitarbeiterverwaltung in `AdminEmployees.tsx`) bekommen dafür die CSS-Klasse `.stack`: ab `max-width: 700px` lösen sie sich per Media Query in einzelne, gerahmte Zeilen auf statt nebeneinander zu stehen — jede Zelle zeigt ihre Spaltenbeschriftung über ein `data-label`-Attribut vor dem eigentlichen Wert. Auf breiteren Screens bleibt die normale Tabellenform erhalten. Die Verfügbarkeits-Liste im Verfügbarkeit-Tab (§9) verzichtet dagegen ganz auf ein `<table>` (`.avail-row`, einfache Flex-Zeile) — die bis zu vierteilige Früh/Spät-Auswahl an Frühschicht-Tagen bricht darüber bei Bedarf einfach in die nächste Zeile um, statt eine Tabellenspalte in die Breite zu zwingen.

**App installieren ohne Store** (`lib/pwaInstall.ts`, Karte in Profil, §9): Android/Desktop-Chrome/Edge feuern das `beforeinstallprompt`-Event, das sich aufheben und über einen eigenen Button per `.prompt()` erneut auslösen lässt (`usePwaInstall()`-Hook, Status `"prompt"`) — ein Klick zeigt dort den echten, nativen Install-Dialog. iOS (Safari wie auch iOS-Chrome/Firefox, die dieselbe WebKit-Engine nutzen) kennt dieses Event technisch nicht — es gibt dort **keine** Möglichkeit, die Installation programmgesteuert auszulösen, einzig der Weg über das Safari-Teilen-Menü ("Zum Home-Bildschirm") funktioniert. Der Button zeigt für diesen Fall (Status `"ios"`, erkannt per User-Agent) stattdessen eine ausklappbare Schritt-für-Schritt-Anleitung statt eines Dialogs. Ist die App schon installiert (`display-mode: standalone` bzw. `navigator.standalone` unter iOS), zeigt die Karte nur einen Bestätigungstext (Status `"installed"`); auf Browsern ohne jede Unterstützung (z. B. Desktop-Firefox, Status `"unsupported"`) blendet sich die ganze Karte aus, statt einen Button zu zeigen, der nichts tun könnte.

## 10. Admin-Ansicht: Planung / Team
- **Planung** (`/admin/planung`): drei Tabs (segmentierter Umschalter oben, wie das kann/kann-nicht-Segment in der Verfügbarkeit), bewusst getrennt, damit nicht alles auf einer langen Seite untereinandersteht. Ein Tab-Wechsel scrollt per `useEffect` auf `tab` wieder nach oben — sonst bliebe man z. B. nach dem Scrollen durch einen langen Dienstplan mitten in der neu ausgewählten Backplanung/Einstellungen stehen. Dasselbe gilt global für den Seitenwechsel über die Navbar (`ScrollToTop`-Komponente in `App.tsx`, reagiert auf `useLocation().pathname`) — React Router scrollt beim Routenwechsel nicht von selbst nach oben.
  - **Schichtplanung**: eigene Monatsnavigation (`planMonth`, Default und "Heute"-Button laufen über `defaultPlanningMonth()`, `lib/dates.ts` — s. u.), "Schichttausch-Bestätigungen" (angenommene Tauschanfragen, Admin bestätigt final → `shifts.employee_id` wird umgeschrieben → Status `confirmed`, oder lehnt ab), "Änderungsprotokoll" gefiltert auf `entity = 'shift'`, eigener "Dienstplan veröffentlichen"-Button (nur Schichten, löst `shift_published`-Benachrichtigungen an die zugewiesenen Mitarbeiter aus), Dienstplan für den **gesamten angezeigten Kalendermonat** (alle Tage laut `service_days`, ergänzt um Sondertage mit Zusatzöffnung, s. u.) mit Zuweisung inkl. Verfügbarkeits-Hinweis; "+ Früh"-Buttons direkt sichtbar an Tagen aus `frueh_days` oder an Sondertagen mit Zusatz-Frühschicht; samstags zusätzlich ein Uhrzeit-Dropdown (13/14 Uhr, §5) neben "+ Spät". Ein Tag mit hinterlegtem Sondertag zeigt dessen Bezeichnung als Badge neben dem Datum (z. B. "🎉 Muttertag"). Die Tageskarten sind ein **Akkordeon** (`expandedShiftDay`, immer höchstens ein Tag gleichzeitig offen, startet mit dem heutigen Tag) statt wie sonst mehrerer unabhängiger Klapp-Zustände (Kuchen, Mitarbeiter, §8/§10) — bei einem vollen Kalendermonat als Tageskarten wäre die Liste sonst schnell wieder ewig lang, sobald mehrere Tage gleichzeitig offen bleiben. Zugeklappt zeigt jede Karte Wochentag/Datum + eine Zusammenfassung getrennt nach Früh/Spät (`shiftSummary()`, z. B. "Früh 2/2 · Spät 2/3") statt nur einer Gesamtzahl — eine Lücke bei Früh wäre sonst hinter genug besetzten Spät-Schichten in einer einzigen Zahl verschwunden, "besetzt/geplant" macht auf einen Blick sichtbar, wo noch wer fehlt. Der zweite Wert ist nicht einfach die Anzahl angelegter Schichten, sondern `Math.max(angelegte Schichten, staffing_requirements)` (§8) — sind für einen Tag z. B. zwei Frühschichten als Mindestbesetzung hinterlegt, aber erst eine angelegt und besetzt, zeigt die Karte "Früh 1/2" und macht die Lücke sichtbar, statt fälschlich "Früh 1/1" (100 %) zu melden, nur weil noch keine zweite Schicht existiert.

    **Default-Monat springt ab dem ersten Wochenende weiter** (`defaultPlanningMonth()`, `lib/dates.ts`, Feedback: "sobald das erste Wochenende eines Monats erreicht ist soll dieser Monat nicht mehr im Planungsscreen auftauchen sondern dann der Folgemonat"): sowohl der initiale Ladezustand von `planMonth` als auch der "Heute"-Button berechnen den anzuzeigenden Monat über diese Funktion statt einfach den echten Kalendermonat zu nehmen. Ab dem ersten Samstag eines Monats (Beginn des ersten Wochenendes) gilt der Monat als "schon dran" — ab diesem Tag zeigen beide automatisch den Folgemonat. Betrifft nur den *Default*; über "‹"/"›" lässt sich weiterhin jeder beliebige Monat (auch der übersprungene) manuell ansteuern, z. B. für nachträgliche Korrekturen. Ein Monat, der auf einen Samstag fällt (Tag 1 = Samstag), wird dadurch als Default nie angezeigt — sein "erstes Wochenende" beginnt sofort am 1., der Sprung zum Folgemonat greift also schon ab Tag 1.

    **Start-/Endzeit bleiben nach dem Anlegen editierbar** (`updateShiftTime()`, Feedback: "auch wenn vorverlegt zusätzlich bearbeitbar"): die "Zeit"-Spalte einer Schicht zeigt statt reinem Text vier `<select>`-Felder (Stunde/Minute je für Start und Ende, `timeParts()`/`HOUR_OPTIONS`/`MINUTE_OPTIONS`) — die per `addShift()` vorbelegten Standardzeiten (Früh 07:00–13:00, Spät 13:00–18:00, samstags per Dropdown 13:00 oder 14:00) lassen sich damit jederzeit für eine einzelne Schicht anpassen, z. B. wenn eine Frühschicht ausnahmsweise später beginnt. Kein neuer Trigger nötig: `log_shift_change` (Migration `0008_audit_log_and_week_swap.sql`) protokolliert eine Zeitänderung an einer bereits veröffentlichten Schicht ohnehin schon im Änderungsprotokoll.

    **Bewusst kein natives `<input type="time">`** (Korrektur nach Feedback: "ich möchte bei den Zeiten weiterhin das 24h Format haben und nicht 12h AM/PM"): dessen 12h/24h-Darstellung folgt der Geräte-/Browser-Locale, nicht dem `lang`-Attribut der Seite, und ließ sich nicht erzwingen — auf manchen Geräten erschien "13:00" als "01:00 PM" und lief dabei aus der festen Feldbreite heraus. Zwei `<select>` (Stunde 00–23, Minute in 5-Minuten-Schritten) garantieren stattdessen überall dieselbe 24h-Darstellung, analog zur bewussten `<select>`-Datumsauswahl bei den Sondertagen (statt `<input type="date">`, s. o.).

    **Bugfix: Felder liefen aus dem Kartenhintergrund heraus** (Feedback: "die Felder sind aus dem Kasten-Hintergrund raus"): die `.stack`-Mobilansicht (§9) erlaubt select/input, sich per `flex: 1; min-width: 0` auf die verfügbare Zeilenbreite zu schrumpfen — diese Regel griff aber nur für *direkte* select/input-Kinder einer Zelle. Die neue Zeit-Zelle bündelt ihre vier `<select>` stattdessen in einer `.row-actions`, wodurch die Regel nicht mehr griff und das Div mit voller Inhaltsbreite über den Kartenrand hinausragte. Eine ergänzende CSS-Regel (`table.stack td > .row-actions`) behandelt jetzt auch diesen Fall.

    **Zuweisungs-Dropdown: Admins gesondert am Ende** (`<optgroup>`, Feedback: "Admins müssen keine Verfügbarkeit eintragen ... sollten am Ende gesondert angezeigt werden um im Notfall auswählbar zu sein"): die Mitarbeiter-Auswahl je Schicht ist in zwei `<optgroup>`s aufgeteilt — "Mitarbeiter" (alle mit `role = 'employee'`) zuerst, "Admins" danach. Admins bleiben damit als Notfall-Besetzung wählbar, ohne die normale Liste zu überfrachten oder fälschlich wie reguläre Mitarbeiter mit einer erwarteten Verfügbarkeitsangabe zu wirken (sie haben i. d. R. keine, siehe §9 — `availabilityFor()` zeigt für sie deshalb meist "(unbekannt)").
  - **Backplanung**: **eigene, unabhängige Wochennavigation** (`planWeek`, `weekStartOf`/`addWeeks`/`weekDaysMatching`/`weekLabel` in `lib/dates.ts`) statt der gemeinsamen Monatsnavigation der Schichtplanung — Feedback: "der Backplan gilt immer nur für eine Woche und nicht den ganzen Monat". "Änderungsprotokoll" gefiltert auf `entity = 'bake_entry'` **und** auf die angezeigte Woche (vorher wie die Schichtplanung auf den ganzen Monat), eigener "Backplan veröffentlichen"-Button (nur Backeinträge der Woche; Backeintrag ohne Truppe zeigt zuerst eine Warnung mit der Möglichkeit, trotzdem zu veröffentlichen), Backplan für alle Back-Tage (`bake_days`) der angezeigten Woche. Ein Truppenmitglied, das am selben Tag auch eine Service-Schicht hat, löst eine Kollisions-Warnung aus. Gleiches Akkordeon-Muster wie die Schichtplanung (`expandedBakeDay`, unabhängiger State), Zusammenfassung zeigt Kuchenanzahl und wie viele davon noch keine Truppe haben. Ein neu angelegter Backeintrag startet mit **Menge 2** statt 1 (Feedback: "sollte immer direkt bei Menge 2 stehen" — in der Praxis wird fast nie nur ein einzelnes Stück/Blech gebacken), individuell weiterhin frei änderbar. Eine zusätzliche **Notiz**-Spalte (Feedback: "Ich bräuchte für die Backplanung auch noch ein Notizfeld", z. B. "glutenfrei" oder ein Sondertag-Hinweis) macht `bake_plan_entries.note` erstmals im UI editierbar — die Spalte existierte im Schema bereits seit Migration `0001_init.sql`, war aber nie an ein Formularfeld angebunden. Wie bei den Kuchen-Stammdaten (§8) läuft das Feld über `defaultValue`/`onBlur` statt `onChange`, damit nicht bei jedem Tastendruck ein Refetch ausgelöst wird.
  - **Einstellungen** (§8): Abrechnungszeitraum, Service-/Back-/Frühschicht-Tage, **Sondertage**, Back-Truppen, Kuchen-Stammdaten, **Personalbedarf**, Verfügbarkeits-Stichtag — alles, was Konfiguration statt tagesaktueller Planung ist.

  **Sondertage** (`special_days`, Migration `0016_special_days.sql`): der Admin legt einzelne Tage (Feiertage, Muttertag, ...) mit Datum, Bezeichnung und zwei unabhängigen Häkchen an — **"zusätzlich geöffnet"** (`service_exception`, ergänzt den Tag um einen Dienstplan-Eintrag auch an einem sonst schichtfreien Wochentag) und **"zusätzlich Frühschicht"** (`frueh_exception`, schaltet die "+ Früh"-Buttons an diesem Tag frei, unabhängig von `frueh_days`). Ersetzt die frühere, rein clientseitige und nicht persistierte "+ Ausnahme: Frühschicht"-Freischaltung — der entscheidende Unterschied: ein Sondertag ist in der DB hinterlegt und taucht deshalb automatisch auch in der Verfügbarkeitsabfrage der Mitarbeiter auf (§9), statt nur admin-seitig für die aktuelle Sitzung sichtbar zu sein. Die Tageskarte in der Schichtplanung selbst (`svcDays`) erscheint für jeden Sondertag mit `service_exception` **oder** `frueh_exception` — ein Sondertag mit ausschließlich `frueh_exception` braucht ebenfalls eine Karte, sonst gäbe es dort gar keinen "+ Früh"-Button zum Anlegen der besonderen Schicht (ursprünglich fälschlich nur bei `service_exception`, siehe §9). RLS: Lesen für alle angemeldeten Mitarbeiter (Profil braucht das), Schreiben admin-exklusiv (gleiches Muster wie `bake_teams`/`cake_items`). Die Datumsauswahl beim Anlegen ist bewusst `<select>` (Tag/Monat/Jahr) statt `<input type="date">` — dessen natives Kalender-Popup öffnet sich in manchen eingebetteten WebViews (beobachtet in der Home-Assistant-Companion-App) nicht zuverlässig, `<select>` funktioniert dort überall gleich.

  Dienstplan- und Backplan-Veröffentlichung sind seit dieser Trennung bewusst **unabhängig** voneinander (vorher ein gemeinsamer Button für beides).
- **Team** (`/admin/mitarbeiter`): Mitarbeiterliste, jede Person eingeklappt (nur Name + kurze Statuszeile "Mitarbeiter/Admin · aktiv/inaktiv · Truppe" antippbar) und öffnet sich erst beim Antippen für Rolle/Aktiv/Back-Truppe/Login/Löschen — bei mehr als ein, zwei Mitarbeitern ging der Name sonst zwischen all den Auswahlfeldern unter (gleiches Auf-/Zuklapp-Muster wie die Kuchen-Liste, §8). Ein frisch angelegter Mitarbeiter startet direkt aufgeklappt, damit man ihn ohne zusätzlichen Klick fertig einrichten kann. Rolle, aktiv und Back-Truppe einzeln änderbar, "Passwort zurücksetzen" je Mitarbeiter mit bestehendem Login (§12). Mitarbeiter **ohne** Login zeigen stattdessen zwei Einladungs-Buttons: **"Einladen (WhatsApp)"** öffnet `https://wa.me/?text=…` mit vorausgefülltem, mehrzeiligem Einladungstext (Begrüßung, nummerierte Schritte, App-Link) — ohne Telefonnummer, die Admin-Person wählt den Kontakt selbst in WhatsApp aus (kein `phone`-Feld in `employees` nötig); **"Text kopieren"** legt denselben Text in die Zwischenablage (mit `prompt()`-Fallback, falls `navigator.clipboard` im aktuellen Kontext nicht verfügbar ist, z. B. kein HTTPS) für Versand über einen anderen Kanal. Der Link im Text ist die feste Konstante `APP_URL = "https://ella.heimdns.de"` (geplante Produktions-Domain) statt `window.location.origin` — bewusst hart codiert, damit der Einladungstext immer die öffentlich erreichbare Adresse nennt, unabhängig davon, von welcher internen URL aus die Admin-Person die App gerade selbst aufruft.

  **"Löschen"** je Mitarbeiter (außer dem eigenen Account, per `currentEmployeeId`-Prop ausgeblendet) ruft die Edge Function `delete-employee` auf: löscht zuerst den verknüpften Auth-User (falls vorhanden, sonst bliebe ein Login-Konto ohne employees-Zeile zurück), dann die employees-Zeile selbst. Migration `0014_employee_delete.sql` ergänzt bei den beiden einzigen Fremdschlüsseln ohne eigene Regel (`shifts.created_by`, `announcements.created_by`) `ON DELETE SET NULL` — alle anderen Referenzen (Schichtzuweisung, Verfügbarkeiten, Tauschanfragen, Benachrichtigungen) waren bereits CASCADE/SET NULL. Die Funktion prüft serverseitig zusätzlich, dass niemand den eigenen Account löscht.

## 11. Monatlicher Verfügbarkeits-Stichtag
`availability_deadlines` (ein Stichtag pro Monat) + `availability_submissions` (ein Eintrag pro Mitarbeiter+Monat, sobald eingereicht). Einreichen ist erst möglich, wenn für jeden relevanten Tag (§8/§9) ein `'one_time'`-Verfügbarkeits-Eintrag existiert. Admin sieht den Einreichungsstatus aller Mitarbeiter vor dem Stichtag in der Planungsansicht.

**Gilt nicht für Admins** (Feedback: "Admins müssen keine Verfügbarkeiten eintragen"): die Einreichungs-Tabelle, die "X Ausstehende"-Zählung und die "Erinnerung senden"-Funktion in der Admin-Planung (§10) filtern `employees` auf `role != 'admin'` — ohne diesen Filter stünde ein Admin dort dauerhaft als "ausstehend" und könnte sich sogar selbst eine Erinnerung schicken. Admins tauchen dafür stattdessen gesondert am Ende der Zuweisungs-Auswahl in der Schichtplanung auf (§10) — für den Notfall wählbar, ohne dass für sie je eine Verfügbarkeit erwartet wird.

**"Eingereicht" sperrt nichts, erst "veröffentlicht" tut es:** weder die Buttons in der Tagesliste (§9) noch die RLS-Policy auf `availability_entries` prüfen `submitted_at` — ein Mitarbeiter kann seine Angaben nach dem Einreichen und auch nach dem Stichtag beliebig ändern. Die Admin-Planung liest bei jedem Laden live die aktuellen `availability_entries`, es gibt keinen Schnappschuss zum Zeitpunkt des Einreichens — "Einreichen" bedeutet nur "vollständig, bereit zur Planung", nicht "eingefroren". Die Karte im Verfügbarkeit-Tab weist nach dem Einreichen explizit darauf hin, dass Änderungen weiterhin möglich sind.

Erst mit der **Veröffentlichung des Dienstplans** (`shifts.status = 'published'` für den jeweiligen Tag) wird die Verfügbarkeit für genau diesen Tag gesperrt — Anforderung: eine Person soll nicht nach der Zuweisung noch unbemerkt "kann nicht" eintragen können, ohne dass sich das im bereits veröffentlichten Plan widerspiegelt. Migration `0017_lock_availability_after_publish.sql` erweitert die `availability_own_write`-Policy: ein `'one_time'`-Eintrag (mit `specific_date`) lässt sich nicht mehr schreiben/löschen, sobald für dieses Datum irgendeine veröffentlichte Schicht existiert — geprüft direkt per `EXISTS`-Subquery gegen `shifts`, ohne eigene Helper-Funktion (`shifts.date` ist für veröffentlichte Zeilen ohnehin für jede angemeldete Person lesbar, siehe `shifts_select`). `'recurring'`-Einträge (kein `specific_date`, seit der Tagesauswahl-Umstellung ohnehin nicht mehr im UI erzeugt) bleiben von der Sperre unberührt. Die Sperre gilt serverseitig, nicht nur im UI — der Verfügbarkeit-Tab zeigt gesperrte Tage in der Tagesliste nur noch als reinen Text mit 🔒-Symbol statt anklickbarer Buttons. Ein bereits veröffentlichter, aber von der Person noch nicht ausgefüllter Tag zählt beim Einreichen nicht mehr als "offen" — sonst wäre ein vollständiges Einreichen für diesen Monat gar nicht mehr möglich.

## 12. Login mit Name + Passwort, ohne E-Mail (wie bei Wizzo)
Login-Bildschirm ist ein normales Formular mit zwei Textfeldern, Name und Passwort — kein
E-Mail-Feld. Der eingetippte Name wird gegen `list_login_names()` aufgelöst (security-definer
Funktion, vor dem Login aufrufbar, liefert je aktivem Mitarbeiter `id`, `name`, `has_account`).
Erster Login (`has_account = false`): Passwort wird beim Absenden gleich mit festgelegt, die
Edge Function `set-password` legt dafür per Service-Role-Key das
Auth-Konto an (`admin.createUser`, verknüpft `employees.auth_user_id`) — mit einer aus der
`employee.id` abgeleiteten, nie versendeten Adresse anstelle einer echten E-Mail, da Supabase
Auth ein E-Mail-Feld erwartet. Jeder spätere Login läuft ganz regulär über
`supabase.auth.signInWithPassword()` mit derselben Adresse, ohne weiteren Edge-Function-Umweg.
Ein bereits vergebenes Passwort kann darüber nicht überschrieben werden (`set-password` lehnt
ab, wenn `auth_user_id` schon gesetzt ist) — dafür gibt es "Passwort zurücksetzen" im
Mitarbeiter-Tab (Admin-Ansicht, §10): Edge Function `reset-password` löscht den Auth-User des
Mitarbeiters und setzt `auth_user_id` auf `null`, die Person landet damit wieder im
"Erster Login"-Zustand. Anders als `set-password`/`ics-feed` prüft `reset-password` die
Berechtigung nicht über die employeeId, sondern verifiziert per mitgeschicktem
Access-Token, dass der Aufrufer selbst ein Admin ist (`admin.auth.getUser(token)` +
`employees.role`) — `verify_jwt` bleibt trotzdem aus (siehe unten), sonst würde die
Plattform-Prüfung wieder vor diesem eigenen Check greifen. `verify_jwt` ist für `set-password`
(wie für `ics-feed`) bewusst
aus (`supabase/config.toml`) — mit `verify_jwt = true` prüft die Supabase-Plattform den
Auth-Header schon vor dem eigenen CORS-Code der Function, was den Browser-Preflight (OPTIONS)
blockieren und im Frontend als "Failed to send a request to the Edge Function" aufschlagen
kann. Berechtigung prüft die Funktion ohnehin selbst über die `employeeId` in der DB, nicht
über den Aufrufer-JWT.

## 13. Kalender-Export (ICS)
Pro Mitarbeiter ein ICS-Feed (Edge Function, per `employee_id` abrufbare URL) mit seinen veröffentlichten Service-Schichten **und** Back-Terminen seiner Truppe. Kein Speichern von ICS-Dateien nötig — wird aus `shifts`/`bake_plan_entries` zur Abrufzeit generiert.

## 14. Offene Architekturfragen (für die nächste Iteration)
- **Kollisions-Warnung statt harter Sperre**: Truppenmitglied + Service-Schicht am selben Tag wird jetzt angezeigt, aber nicht verhindert — bleibt eine bewusste Entscheidung des Admins.
- **Kein Fallback ohne Push-API**: Ältere/eingebettete WebViews ohne `PushManager`-Unterstützung zeigen entsprechend "wird nicht unterstützt" und bleiben auf die In-App-Glocke (60s-Poll) beschränkt — es gibt aktuell keinen zweiten Kanal (z. B. `ha_notify` über die Supervisor-API) als Ersatz dafür.
- **Schichttausch-Eignungsprüfung nur als Hinweis**: Beim Anbieten wird jetzt per `is_colleague_available` gewarnt, falls der Kollege laut eigener Angabe an dem Tag nicht kann (§6) — es wird aber weiterhin nicht geprüft, ob er an dem Tag bereits selbst eine Schicht hat; das sieht der Admin erst bei der finalen Bestätigung.
- **Kein "Abmelden ohne Ersatz"**: Ein Mitarbeiter kann eine Schicht nur per Tausch an einen konkreten Kollegen abgeben, nicht allgemein als "kann ich nicht übernehmen" ohne selbst einen Ersatz zu finden (bewusst zurückgestellte Idee aus der Workshop-Runde).
- **ICS-Link ohne Auth-Token**: Die Edge Function nimmt aktuell jede `employee_id` entgegen, ohne zu prüfen, ob der Aufrufer berechtigt ist — sollte vor Launch durch einen separaten, nicht erratbaren `calendar_token` ersetzt werden.
- Mehrere Cafés/Standorte: aktuell bewusst single-tenant angenommen.
- **Kein armv7 (32-bit) mehr unterstützt**: Der aktuelle `home-assistant/builder` (2026.06.0) baut nur noch aarch64/amd64 — 32-bit-Hosts (ältere Raspberry-Pi-Installationen mit 32-bit-OS) können das Add-on-Image daher nicht mehr ziehen; sie müssten es lokal aus dem Dockerfile bauen, was mangels 32-bit-Basis-Image ebenfalls nicht mehr funktioniert.

## 15. Addon-Grundgerüst
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

## 16. CI: Image-Build & Veröffentlichung
`.github/workflows/build-addon.yaml` baut bei Push auf `main` (Pfad `ella/**`) die
Multi-Arch-Images (aarch64, amd64) über die offiziellen `home-assistant/builder`-
Actions und veröffentlicht sie unter der in `config.yaml` hinterlegten `image`-Adresse
(`ghcr.io/gianlucako95/addon-ella`) auf GHCR — der Supervisor zieht dieses Image dann fertig
gebaut, statt es beim Installieren lokal auf dem HA-Host zu bauen. Ohne diesen Workflow (oder
ohne `image` in `config.yaml`) funktioniert die Installation als lokales Add-on trotzdem, der
Supervisor baut dann selbst aus dem Dockerfile.

Zwei manuelle Schritte bleiben nötig: das GHCR-Package muss nach dem ersten erfolgreichen Lauf
einmalig auf "Public" gestellt werden (sonst kann der Supervisor es nicht ziehen), und
`version` in `config.yaml` muss bei jedem Release erhöht werden — der Workflow taggt exakt mit
diesem Wert, ohne Änderung erkennt der Supervisor kein Update.

Kein `build.yaml` mehr: Die aktuelle `build-image`-Action wertet die alte
`build_from`-Zuordnung je Architektur nicht mehr aus, sie übergibt dem Dockerfile nur noch
`BUILD_ARCH`/`BUILD_VERSION` als Build-Args. Das Basis-Image steht deshalb direkt als
Default in `ella/Dockerfile` (`ARG BUILD_FROM=ghcr.io/home-assistant/base:<alpine>-<version>`)
— ein generisches Multi-Arch-Image, buildx zieht darüber automatisch die passende
Architektur.

## 17. Eigener Host-Port statt Ingress
Bewusst **kein** `ingress: true`: Ella hat ihr eigenes Login (Name + Passwort über Supabase,
§12), der Hauptvorteil von Ingress (SSO über die laufende HA-Session, kein offener Port) greift
hier also nicht. Dazu kommt: die App nutzt React Router mit absoluten Pfaden (`/home`,
`/kalender`, …) — unter dem dynamischen, token-behafteten Ingress-Pfad hätte clientseitige
Navigation den Präfix verloren und wäre gebrochen. Stattdessen exponiert `config.yaml` einen
festen `ports`-Eintrag (`8099/tcp: 3050`, Container lauscht weiterhin intern auf 8099, siehe
`ella/nginx.conf`), sodass ein eigener Reverse-Proxy (z. B. nginx auf dem HA-Host oder extern)
direkt auf `http://<host>:3050` zeigen kann, unabhängig von Supervisors Ingress-Proxy und ohne
HA-Sidebar-Eintrag.

Host-Port `3050` wurde gewählt, weil auf demselben HA-Host bereits andere eigene Add-ons feste
Host-Ports belegen: `re-assistant` (3000), `polier-pro` (3001), `swap-bid` (3045),
`daily-nest-plans` (8099 — deshalb *nicht* für Ella verwendet, obwohl der Container intern
weiterhin auf 8099 lauscht). `mg2abrp` hat keine Web-UI (nur MQTT) und belegt keinen Port.
