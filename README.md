# Ella

Schicht- und Backplanung für Café Ella — als Home Assistant Add-on mit PWA.

Café-Öffnungszeiten (Service): Do–So.
Backtage: Mi, Do, Fr (außerhalb der Öffnungszeiten), aufgeteilt auf 3 feste Back-Truppen.

## Struktur

```
.github/workflows/
  build-addon.yaml       # baut + published Multi-Arch-Image nach ghcr.io bei Push auf main
ella/                   # Home Assistant Add-on
  config.yaml           # Addon-Manifest (Optionen: supabase_url, supabase_anon_key)
  Dockerfile
  run.sh                 # schreibt runtime-config.js aus den Addon-Optionen, startet nginx
  nginx.conf
  app/                   # React/Vite/TypeScript PWA
    src/
      pages/             # Verfügbarkeit, Plan, Backplan, Admin-Planung, Admin-Mitarbeiter
      lib/               # Supabase-Client, Datumshilfen, ICS-Link
supabase/
  migrations/            # Datenbankschema inkl. RLS-Policies
  functions/
    ics-feed/            # Edge Function: ICS-Kalenderfeed pro Mitarbeiter
docs/
  ARCHITECTURE.md        # Architekturkonzept
```

## Setup

1. **Supabase-Projekt** anlegen, Migrationen ausführen:
   ```
   supabase link --project-ref <dein-projekt>
   supabase db push
   ```
2. **Edge Functions** deployen (`supabase/config.toml` setzt `verify_jwt = false` für
   alle vier — sonst kann die Supabase-Plattform-JWT-Prüfung den Browser-CORS-Preflight
   blockieren, siehe docs/ARCHITECTURE.md §12):
   ```
   supabase functions deploy ics-feed
   supabase functions deploy set-password
   supabase functions deploy reset-password
   supabase functions deploy delete-employee
   ```
3. Ersten Admin-Mitarbeiter anlegen: einen Eintrag in der Tabelle `employees` mit
   `role = 'admin'` erstellen (Name reicht, `auth_user_id` wird beim ersten Login mit
   Passwort automatisch verknüpft, siehe docs/ARCHITECTURE.md §12).
4. **Addon installieren**: Repo in Home Assistant (Einstellungen → Add-ons → Add-on Store →
   Repositories) hinzufügen, "Ella" installieren, `supabase_url` und `supabase_anon_key`
   in den Addon-Optionen eintragen, starten. Der Supervisor zieht dabei standardmäßig das
   von GitHub Actions gebaute Image (siehe unten) statt lokal zu bauen.

## Netzwerk: eigener Port statt Ingress

Ella läuft **ohne** Home-Assistant-Ingress (kein Sidebar-Eintrag) — stattdessen fest auf
Host-Port **3050** (`ports: 8099/tcp: 3050` in `config.yaml`, Container lauscht intern weiter
auf 8099). Damit kann ein eigener Reverse-Proxy (z. B. nginx) direkt auf
`http://<host>:3050` zeigen. Grund: Ella hat ihr eigenes Login (kein HA-SSO-Vorteil durch
Ingress) und nutzt clientseitiges Routing mit absoluten Pfaden, das unter Ingress' Token-Pfad
brechen würde (siehe docs/ARCHITECTURE.md §17).

Port `3050` wurde bewusst so gewählt, dass er nicht mit anderen eigenen Add-ons auf demselben
Host kollidiert: `re-assistant` (3000), `polier-pro` (3001), `swap-bid` (3045),
`daily-nest-plans` (8099).

## Image-Build (GitHub Actions)

`.github/workflows/build-addon.yaml` baut bei jedem Push auf `main` (der `ella/` betrifft)
Multi-Arch-Images (aarch64, amd64) und veröffentlicht sie nach
`ghcr.io/gianlucako95/addon-ella`. Der Supervisor zieht dieses Image, statt es beim
Installieren lokal auf dem HA-Host zu bauen.

Zwei Dinge, die dafür einmalig bzw. bei jedem Release nötig sind:
- **Package auf "public" stellen**: Nach dem allerersten erfolgreichen Workflow-Lauf unter
  https://github.com/GianlucaKo95?tab=packages das neue Package `addon-ella` öffnen und die
  Sichtbarkeit auf "Public" setzen — sonst kann der Supervisor es nicht ziehen.
- **Version hochzählen**: `version` in `ella/config.yaml` muss bei jeder Änderung erhöht
  werden. Der Workflow taggt das Image exakt mit diesem Wert; ohne Änderung erkennt der
  Supervisor kein Update.

## Lokale Entwicklung der PWA

```
cd ella/app
npm install
cp public/runtime-config.js public/runtime-config.local.js   # optional
# .env anlegen mit:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
npm run dev
```

## Offene Punkte (siehe docs/ARCHITECTURE.md)

- PWA-Icons (`icon-192.png`, `icon-512.png`) in `ella/app/public/` ergänzen.
- Benachrichtigungen bei Veröffentlichung (HA-Notify / Web-Push) sind als TODO markiert —
  aktuell wird beim Veröffentlichen nur der Status auf `published` gesetzt, ohne Push.
