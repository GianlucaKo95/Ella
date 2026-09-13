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

staffing_requirements                     -- Personalbedarf fürs Admin-UI
  id, day_of_week (0-6), shift_type ('frueh'|'spaet'),
  role_tag (nullable, nur für 'frueh'),
  required_count

cake_items                                -- Kuchen-Stammdaten, nur vom Admin gepflegt
  id, name, default_unit ('stück'|'blech'|...),
  ingredients (Zutaten, Freitext), recipe_note (Backanleitung, Freitext)

bake_plan_entries                         -- Backplan, außerhalb Öffnungszeiten
  id, date, cake_item_id, quantity,
  bake_team_id (nullable solange ungeplant),
  status ('draft'|'published'), note
  -- Tages-Validierung gegen app_settings.bake_days per Trigger, siehe §7

announcements                             -- "Aktuelles" (Home-Screen)
  id, body, created_by (-> employees), created_at

app_settings                              -- Singleton (genau 1 Zeile, id=true)
  billing_period_start_day (1-28, Default 1),
  service_days (smallint[], 0=Mo..6=So, nicht leer, Default {3,4,5,6}),
  bake_days   (smallint[], 0=Mo..6=So, nicht leer, Default {2,3,4})

notifications_log                         -- In-App-Benachrichtigungen (Glocke)
  id, type ('shift_published'|'bake_plan_published'|'announcement'),
  target_employee_id, body, read_at (nullable),
  sent_at, channel ('ha_notify'|'web_push')   -- Kanal vorbereitet für später, aktuell nur in-app angezeigt

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

## 8. Admin-Einstellungen (`app_settings`)
Eine globale, admin-editierbare Konfiguration, in der Admin-Planung unter „Einstellungen":
- **Abrechnungszeitraum** (`billing_period_start_day`): an welchem Tag des Monats der Zeitraum beginnt, der für die „voraussichtlichen Stunden" im Mitarbeiter-Kalender zählt. `1` = klassischer Kalendermonat. Betrifft **ausschließlich** diese Stundenanzeige.
- **Service-/Back-Tage** (`service_days`/`bake_days`): Wochentags-Toggle, bestimmen welche Wochentage in der Monatsplanung (§10) als Service- bzw. Back-Tage gelten, z. B. um die Back-Tage zu reduzieren, wenn weniger gebacken werden muss. Die Vereinigung beider Mengen (`relevantDays`) bestimmt, für welche Wochentage ein Mitarbeiter vor dem Einreichen eine wiederkehrende Verfügbarkeit braucht (§9).
- **Back-Truppen** (`bake_teams`): eigene Karte zum Anlegen/Umbenennen/Löschen einer Truppe sowie zur Mitgliederverwaltung (Mitarbeiter zuordnen/entfernen/umhängen), technisch weiterhin über `employees.bake_team_id`.

**Wichtig**: Der Abrechnungszeitraum und die Planungs-Zeiträume sind bewusst entkoppelt — die Schicht-/Backplanung durch den Admin läuft immer über den vollen Kalendermonat (§10), unabhängig vom eingestellten Abrechnungszeitraum.

## 9. Mitarbeiter-Ansicht: Home / Kalender / Profil
Über die Navbar erreichbare Screens (Admin sieht zusätzlich „Planung" und „Team"):

- **Home** (`/home`): "Heute im Dienst" (alle veröffentlichten Schichten des heutigen Tages, nicht nur die eigene); offene/abgeschickte Schichttausch-Anfragen (eingehend: Annehmen/Ablehnen; ausgehend: Status); "Meine Woche" (rollierende 7-Tage-Ansicht ab heute, je Tag die eigene Schicht oder "frei", mit direktem "Tauschen"-Button je Schicht — keine Notwendigkeit, dafür erst in den Kalender zu wechseln); falls einer Back-Truppe zugeordnet, zusätzlich deren nächste Backtermine; Hinweiskarte, falls die Verfügbarkeit für den kommenden Monat noch nicht eingereicht wurde (verlinkt ins Profil, dismissable); "Aktuelles" mit den News aus `announcements` (Admin kann dort direkt posten, löst eine Benachrichtigung an alle übrigen aktiven Mitarbeiter aus).
- **Kalender** (`/kalender`): Apple-Kalender-artige Monatsansicht aller veröffentlichten Schichten. Tage, die laut `app_settings.service_days` kein Service-Tag sind, werden schraffiert/gedimmt dargestellt statt wie ein leerer Tag auszusehen (Detailkarte zeigt dort "Café geschlossen"). Eigene Schicht wird als gefüllter Punkt (Früh) bzw. Ring (Spät) dargestellt, ein eigener Backtermin (eigene Truppe) als rautenförmiger Punkt — alles auf einen Blick ohne den Tag antippen zu müssen; mehr als 3 Kolleg:innen an einem Tag werden als "+N" statt als einzelne Punkte angezeigt. Beim Öffnen ist der heutige Tag bereits ausgewählt. Klick auf einen Tag zeigt die Details inkl. eines "Tauschen"-Buttons auf eigenen Schichten (öffnet eine Kollegen-Auswahl, legt eine `shift_swap_requests`-Zeile an; warnt per `is_colleague_available` dezent, falls der gewählte Kollege laut eigener Angabe an dem Tag nicht kann — keine harte Sperre). Stat-Kacheln zeigen die voraussichtlichen eigenen Stunden und die Anzahl eigener Schichten **im admin-eingestellten Abrechnungszeitraum** (§8), nicht im angezeigten Kalendermonat. ICS-Abo-Link.
- **Profil** (`/profil`): editierbarer Anzeigename (`update_my_name`), die Stichtag-/Einreichen-Karte, dauerhafte Verfügbarkeiten je Wochentag, Ausnahmen je Einzeldatum. Welche Wochentage für das Einreichen vollständig sein müssen, ergibt sich dynamisch aus `relevantDays` (§8) statt fest Mi–So zu sein.

## 10. Admin-Ansicht: Planung / Team
- **Planung** (`/admin/planung`): Einstellungen (§8), **Kuchen-Stammdaten** (Name, Einheit, Zutaten, Backanleitung — CRUD, nur hier gepflegte Kuchen stehen im Backplan weiter unten als Auswahl zur Verfügung, kein Freitext), Verfügbarkeits-Stichtag + Einreichungsstatus je Mitarbeiter für den kommenden Monat, "Schichttausch-Bestätigungen" (angenommene Tauschanfragen, Admin bestätigt final → `shifts.employee_id` wird umgeschrieben → Status `confirmed`, oder lehnt ab), "Änderungsprotokoll" (zeigt `plan_audit_log`-Einträge des angezeigten Monats — nachträgliche Änderungen an bereits veröffentlichten Schichten/Backeinträgen), Monatsnavigation mit Dienst- und Backplan für den **gesamten angezeigten Kalendermonat** (alle Tage, die laut `service_days`/`bake_days` gerade als Service- bzw. Back-Tag gelten), Zuweisung von Mitarbeitern inkl. Verfügbarkeits-Hinweis. Jeder Backeintrag ohne Truppe zeigt einen Hinweis, ein Truppenmitglied, das am selben Tag auch eine Service-Schicht hat, löst eine Kollisions-Warnung aus. Ein Veröffentlichen-Button je Monat: sind Backeinträge ohne Truppe offen, erscheint zuerst eine Warnung mit der Möglichkeit, trotzdem zu veröffentlichen; beim Veröffentlichen gehen Benachrichtigungen an alle betroffenen Mitarbeiter.
- **Team** (`/admin/mitarbeiter`): Mitarbeiterliste (Rolle, aktiv, Back-Truppe einzeln änderbar).

## 11. Monatlicher Verfügbarkeits-Stichtag
`availability_deadlines` (ein Stichtag pro Monat) + `availability_submissions` (ein Eintrag pro Mitarbeiter+Monat, sobald eingereicht). Einreichen ist erst möglich, wenn für alle relevanten Wochentage (§8/§9) ein wiederkehrender Verfügbarkeits-Eintrag existiert. Admin sieht den Einreichungsstatus aller Mitarbeiter vor dem Stichtag in der Planungsansicht.

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
ab, wenn `auth_user_id` schon gesetzt ist) — ein Passwort-Reset ist aktuell nur direkt in
Supabase möglich, siehe §14. `verify_jwt` ist für `set-password` (wie für `ics-feed`) bewusst
aus (`supabase/config.toml`) — mit `verify_jwt = true` prüft die Supabase-Plattform den
Auth-Header schon vor dem eigenen CORS-Code der Function, was den Browser-Preflight (OPTIONS)
blockieren und im Frontend als "Failed to send a request to the Edge Function" aufschlagen
kann. Berechtigung prüft die Funktion ohnehin selbst über die `employeeId` in der DB, nicht
über den Aufrufer-JWT.

## 13. Kalender-Export (ICS)
Pro Mitarbeiter ein ICS-Feed (Edge Function, per `employee_id` abrufbare URL) mit seinen veröffentlichten Service-Schichten **und** Back-Terminen seiner Truppe. Kein Speichern von ICS-Dateien nötig — wird aus `shifts`/`bake_plan_entries` zur Abrufzeit generiert.

## 14. Offene Architekturfragen (für die nächste Iteration)
- **Kollisions-Warnung statt harter Sperre**: Truppenmitglied + Service-Schicht am selben Tag wird jetzt angezeigt, aber nicht verhindert — bleibt eine bewusste Entscheidung des Admins.
- **Benachrichtigungen ohne externen Kanal**: `notifications_log` wird jetzt befüllt und in der App angezeigt, aber es gibt noch keinen echten Push (HA-Notify/Web-Push) außerhalb der App — nur die Glocke beim nächsten App-Öffnen/Poll (60s).
- **Schichttausch-Eignungsprüfung nur als Hinweis**: Beim Anbieten wird jetzt per `is_colleague_available` gewarnt, falls der Kollege laut eigener Angabe an dem Tag nicht kann (§6) — es wird aber weiterhin nicht geprüft, ob er an dem Tag bereits selbst eine Schicht hat; das sieht der Admin erst bei der finalen Bestätigung.
- **Kein "Abmelden ohne Ersatz"**: Ein Mitarbeiter kann eine Schicht nur per Tausch an einen konkreten Kollegen abgeben, nicht allgemein als "kann ich nicht übernehmen" ohne selbst einen Ersatz zu finden (bewusst zurückgestellte Idee aus der Workshop-Runde).
- **ICS-Link ohne Auth-Token**: Die Edge Function nimmt aktuell jede `employee_id` entgegen, ohne zu prüfen, ob der Aufrufer berechtigt ist — sollte vor Launch durch einen separaten, nicht erratbaren `calendar_token` ersetzt werden.
- **Kein Passwort-Reset im Admin-UI**: Vergisst ein Mitarbeiter sein Passwort, hilft aktuell nur ein manueller Eingriff direkt in Supabase (Auth-User löschen, `employees.auth_user_id` auf `null` setzen, danach kann der Name erneut ein Erstpasswort festlegen) — ein Admin-Button dafür ist eine naheliegende nächste Iteration.
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
