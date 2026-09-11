# Ella – Testkonzept & Akzeptanzkriterien (Rolle: QS)

## 1. Prüfebenen
1. **Datenbank/RLS** — Constraints und Policies direkt gegen Supabase (SQL/REST), unabhängig von der PWA.
2. **PWA-Funktionen** — manuelle Klickpfade je Rolle (Mitarbeiter/Admin).
3. **Regelkonformität** — die fachlichen Rahmenbedingungen (Öffnungszeiten, Backtage, Truppen) werden nie verletzt, auch nicht über Umwege (API direkt, manipulierte Requests).

## 2. Testfälle

### 2.1 Verfügbarkeiten
| # | Szenario | Erwartung |
|---|---|---|
| V1 | Mitarbeiter trägt "Donnerstags kann" (wiederkehrend) ein | Eintrag mit `kind='recurring'`, `day_of_week=3` wird gespeichert und beim nächsten Laden angezeigt |
| V2 | Mitarbeiter trägt für ein konkretes Datum "kann nicht" ein, obwohl er an diesem Wochentag wiederkehrend verfügbar ist | Admin-Planung zeigt für dieses Datum "kann nicht" (Ausnahme schlägt Regel) |
| V3 | Mitarbeiter A versucht, Verfügbarkeit von Mitarbeiter B zu lesen/ändern (direkter API-Call mit eigenem Token) | Von RLS verweigert (403 / leere Ergebnismenge) |
| V4 | Admin liest Verfügbarkeiten aller Mitarbeiter | Erfolgreich, vollständige Liste |

### 2.2 Dienstplan (Service)
| # | Szenario | Erwartung |
|---|---|---|
| S1 | Admin legt Schicht für einen Montag an (Insert direkt gegen DB versucht) | DB-Constraint `service_days_only` lehnt ab (nur Do–So erlaubt) |
| S2 | Admin legt Spätschicht mit `role_tag='kueche'` an | DB-Constraint `role_tag_only_frueh` lehnt ab |
| S3 | Admin weist Mitarbeiter zu, der laut Verfügbarkeit an dem Tag nicht kann | UI warnt/zeigt "kann nicht" in der Auswahl — **keine** harte Sperre (bewusste Entscheidung: Admin kann übersteuern, z. B. bei kurzfristigem Einspringen) |
| S4 | Admin veröffentlicht die Woche | Alle `draft`-Schichten dieser Woche werden `published`; Mitarbeiter sehen sie danach im Dienstplan |
| S5 | Mitarbeiter ruft Dienstplan ab, bevor veröffentlicht wurde | Sieht nichts für diese Woche (nur `published` sichtbar) |
| S6 | Mitarbeiter ruft `shifts` mit Filter auf andere Mitarbeiter-IDs aber Status `draft` ab | RLS verweigert — Entwürfe sind für Mitarbeiter nie sichtbar, auch nicht die eigenen |

### 2.3 Backplan
| # | Szenario | Erwartung |
|---|---|---|
| B1 | Admin legt Backeintrag für einen Montag an | DB-Constraint `bake_days_only` lehnt ab (nur Mi/Do/Fr) |
| B2 | Mitarbeiter aus Truppe 2 ruft veröffentlichten Backplan ab | Sieht nur Einträge mit `bake_team_id` = Truppe 2 |
| B3 | Mitarbeiter aus Truppe 2 ruft Backplan-Einträge von Truppe 1 direkt per ID ab | RLS verweigert |
| B4 | Backeintrag ohne zugewiesene Truppe wird veröffentlicht | Für Mitarbeiter nicht sichtbar (kein `bake_team_id`-Match) — Admin muss vor Veröffentlichung zuweisen; **Akzeptanzkriterium: UI soll das vor dem Veröffentlichen sichtbar machen** (offener Punkt, siehe §4) |

### 2.4 Rollen & Rechte
| # | Szenario | Erwartung |
|---|---|---|
| R1 | Mitarbeiter versucht, eigene `role` auf `admin` zu setzen | RLS verweigert (nur Admin darf `employees` schreiben) |
| R2 | Mitarbeiter versucht, `staffing_requirements` zu ändern | RLS verweigert |
| R3 | Admin ändert Back-Truppe eines Mitarbeiters | Erfolgreich, Änderung wirkt sich ab sofort auf sichtbaren Backplan dieses Mitarbeiters aus |

### 2.5 ICS-Export
| # | Szenario | Erwartung |
|---|---|---|
| I1 | Mitarbeiter ruft eigenen ICS-Link ab | Enthält nur seine veröffentlichten Schichten + Backtermine seiner Truppe |
| I2 | Unveröffentlichte Termine | Tauchen im ICS-Feed nicht auf |
| I3 | Fremde `employee_id` im ICS-Link eingesetzt | **Sicherheitslücke, siehe §4** — aktuell keine Auth-Prüfung in der Edge Function |

### 2.6 PWA / Offline
| # | Szenario | Erwartung |
|---|---|---|
| P1 | App wird auf dem Smartphone "zum Home-Bildschirm hinzufügen" | Installiert sich als eigenständige App (Manifest vorhanden) |
| P2 | Aufruf ohne Netzverbindung, nachdem die App einmal geladen wurde | Service Worker liefert zumindest die App-Shell aus (kein Totalausfall) |

## 3. Akzeptanzkriterien für "fertig" (Definition of Done, MVP)
- [ ] Mitarbeiter kann wiederkehrende Verfügbarkeit + Ausnahmen selbst pflegen.
- [ ] Admin sieht beim Planen pro Tag den Personalbedarf und die Verfügbarkeit der Mitarbeiter.
- [ ] Veröffentlichen einer Woche macht Dienst- *und* Backplan gleichzeitig für betroffene Mitarbeiter sichtbar.
- [ ] Jeder Mitarbeiter kann seinen Plan per ICS abonnieren.
- [ ] Kein Mitarbeiter kann Daten anderer Mitarbeiter einsehen oder verändern (per RLS erzwungen, nicht nur per UI verborgen).
- [ ] Alle Regelverstöße (falscher Wochentag für Schicht/Backen, Rollen-Tag in Spätschicht) werden von der Datenbank abgelehnt, nicht nur vom UI verhindert.

## 4. Offene Risiken / vor Launch zu klären
1. **ICS-Link ohne Auth-Token**: Die Edge Function nimmt aktuell jede `employee_id` entgegen, ohne zu prüfen, ob der Aufrufer berechtigt ist. Für einen Kalenderfeed ist das üblich (kein Login im Kalender-Client), aber die ID sollte durch einen nicht erratbaren Zugriffstoken ersetzt werden (z. B. separates `calendar_token`-Feld pro Mitarbeiter statt der UUID direkt), bevor das live geht.
2. **Benachrichtigungen**: `notifications_log` existiert, aber es versendet aktuell niemand etwas (kein HA-Notify-/Web-Push-Trigger beim Veröffentlichen). Muss vor Launch ergänzt werden, sonst merken Mitarbeiter eine Veröffentlichung nicht.
3. **Backplan ohne Truppe**: Siehe B4 — admin-seitige Warnung fehlt noch.
4. **Kapazität je Truppe**: Es gibt keine Prüfung, ob eine Truppe an einem Tag bereits anderweitig eingeteilt ist (z. B. Truppenmitglied hat an dem Tag auch Servicedienst). Sollte vor Launch zumindest als Hinweis in der Admin-Planung auftauchen.
