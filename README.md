# Ella

Schicht- und Backplanung für Café Ella — als Home Assistant Add-on mit PWA.

Café-Öffnungszeiten (Service): Do–So.
Backtage: Mi, Do, Fr (außerhalb der Öffnungszeiten), aufgeteilt auf 3 feste Back-Truppen.

## Struktur

```
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
2. **Edge Function** deployen:
   ```
   supabase functions deploy ics-feed
   ```
3. Ersten Admin-Mitarbeiter anlegen: in Supabase Auth einen User erstellen, dann in der
   Tabelle `employees` eine Zeile mit `auth_user_id` = dessen User-ID und `role = 'admin'`
   eintragen.
4. **Addon installieren**: Repo in Home Assistant (Einstellungen → Add-ons → Add-on Store →
   Repositories) hinzufügen, "Ella" installieren, `supabase_url` und `supabase_anon_key`
   in den Addon-Optionen eintragen, starten.

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
- Admin-Anlegen neuer Mitarbeiter erzeugt aktuell nur einen Platzhalter-Datensatz ohne
  Login-Verknüpfung; die Verknüpfung mit `auth_user_id` muss noch automatisiert werden
  (z. B. Einladungslink per Edge Function).
