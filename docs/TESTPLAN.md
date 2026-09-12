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

### 2.1a Verfügbarkeits-Stichtag (monatlich)
| # | Szenario | Erwartung |
|---|---|---|
| D1 | Mitarbeiter hat nicht für alle Tage Mi–So des nächsten Monats einen wiederkehrenden Eintrag | "Einreichen"-Button bleibt deaktiviert |
| D2 | Mitarbeiter hat alle Tage Mi–So eingetragen | "Einreichen"-Button aktiv, Klick erzeugt `availability_submissions`-Eintrag mit Zeitstempel |
| D3 | Mitarbeiter reicht ein zweites Mal für denselben Monat ein | Kein Duplikat (unique employee_id+month), zweiter Versuch aktualisiert nichts sichtbar Neues |
| D4 | Heutiges Datum liegt nach dem Stichtag, Mitarbeiter hat nicht eingereicht | Eigene Ansicht zeigt "überfällig"; Admin-Ansicht zeigt ihn als "ausstehend" |
| D5 | Admin ändert den Stichtag für den nächsten Monat | Neuer Stichtag gilt sofort für alle Mitarbeiter-Ansichten |
| D6 | Mitarbeiter versucht, `availability_submissions` für einen Kollegen einzutragen (direkter API-Call) | RLS verweigert |

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

### 2.1b Aktuelles (Ankündigungen)
| # | Szenario | Erwartung |
|---|---|---|
| A1 | Admin verfasst eine Ankündigung auf dem Home-Screen | Eintrag landet in `announcements`, erscheint sofort (nach Reload der Liste) bei allen Mitarbeitern auf Home |
| A2 | Mitarbeiter versucht, per direktem API-Call eine Ankündigung zu schreiben | RLS verweigert (`announcements_write_admin` nur für `admin`) |
| A3 | Mitarbeiter ruft Ankündigungen ab | Sieht alle (kein Truppen-/Rollenfilter vorgesehen — News sind für alle) |

### 2.1c Eigener Anzeigename
| # | Szenario | Erwartung |
|---|---|---|
| N1 | Mitarbeiter ändert im Profil seinen Namen und speichert | `update_my_name` aktualisiert nur `employees.name` der eigenen Zeile; Kopfzeile/Begrüßung zeigt danach den neuen Namen |
| N2 | Mitarbeiter versucht per RPC, den Namen eines Kollegen zu ändern (fremde `employee_id` einschleusen) | Nicht möglich — die Funktion verwendet ausschließlich `current_employee_id()`, es gibt keinen Parameter für eine fremde ID |
| N3 | Leerer oder nur aus Leerzeichen bestehender Name wird übergeben | Funktion wirft eine Exception, kein Update |

### 2.1d Home/Kalender/Profil (Mitarbeiter-Navigation)
| # | Szenario | Erwartung |
|---|---|---|
| H1 | Mitarbeiter ohne Back-Truppe (`bake_team_id = null`) öffnet Home | Karte "Nächste Backschicht" wird nicht angezeigt |
| H2 | Mitarbeiter mit Back-Truppe öffnet Home | Karte "Nächste Backschicht" zeigt die nächsten veröffentlichten Backtermine seiner Truppe |
| H3 | Mitarbeiter hat für den kommenden Monat noch nicht eingereicht (§2.1a) | Popup erscheint beim Öffnen von Home; "Jetzt eintragen" führt zu `/profil`; "Später" blendet das Popup nur für die aktuelle Sitzung aus |
| H4 | Mitarbeiter hat bereits eingereicht | Kein Popup |
| K1 | Mitarbeiter öffnet Kalender | Monatsgrid zeigt den aktuellen Monat, eigene Schichten sind optisch hervorgehoben, Klick auf einen Tag zeigt alle Schichten dieses Tages |
| K2 | Mitarbeiter navigiert zu einem anderen Monat | Grid und Stundenstatistik aktualisieren sich auf den neu gewählten Monat |
| P1b | Mitarbeiter öffnet Profil | Name-Feld, dauerhafte Verfügbarkeiten und Ausnahmen sind alle auf einem Screen verfügbar |

### 2.1e Admin-Einstellungen (Abrechnungszeitraum)
| # | Szenario | Erwartung |
|---|---|---|
| E1 | Admin ändert den Start-Tag des Abrechnungszeitraums und speichert | `app_settings.billing_period_start_day` wird aktualisiert; Vorschau-Zeitraum in der Admin-Ansicht aktualisiert sich sofort |
| E2 | Mitarbeiter ruft danach den Kalender-Screen auf | "Voraussichtliche Stunden" und die Zeitraum-Anzeige basieren auf dem neuen Start-Tag |
| E3 | Mitarbeiter versucht, `app_settings` per direktem API-Call zu ändern | RLS verweigert (`app_settings_update_admin` nur für `admin`) |
| E4 | Ein Wert außerhalb 1–28 wird eingetragen | DB-Constraint lehnt ab (bewusst auf 28 begrenzt, damit der Start-Tag in jedem Monat existiert) |
| E5 | Admin ändert den Abrechnungszeitraum-Start-Tag | Die Admin-Planung (Dienst-/Backplan) zeigt weiterhin denselben vollen Kalendermonat — Anzahl und Auswahl der zu planenden Tage ändern sich **nicht** |

### 2.2a Monatsplanung (Admin)
| # | Szenario | Erwartung |
|---|---|---|
| M1 | Admin öffnet die Planung | Alle Service-Tage (Do–So) und Back-Tage (Mi/Do/Fr) des aktuell angezeigten Kalendermonats werden aufgelistet, nicht nur eine einzelne Woche |
| M2 | Admin navigiert zum nächsten/vorherigen Monat | Liste aktualisiert sich auf den neu gewählten Kalendermonat |
| M3 | Admin klickt "Plan & Backplan veröffentlichen" | Alle `draft`-Einträge des gesamten angezeigten Monats werden `published`, nicht nur einer Woche |

### 2.6 PWA / Offline
| # | Szenario | Erwartung |
|---|---|---|
| P1 | App wird auf dem Smartphone "zum Home-Bildschirm hinzufügen" | Installiert sich als eigenständige App (Manifest vorhanden) |
| P2 | Aufruf ohne Netzverbindung, nachdem die App einmal geladen wurde | Service Worker liefert zumindest die App-Shell aus (kein Totalausfall) |

## 3. Akzeptanzkriterien für "fertig" (Definition of Done, MVP)
- [ ] Mitarbeiter kann wiederkehrende Verfügbarkeit + Ausnahmen selbst pflegen.
- [ ] Mitarbeiter kann Verfügbarkeit für den nächsten Monat erst einreichen, wenn sie für Mi–So vollständig ist; Admin sieht den Einreichungsstatus aller Mitarbeiter vor dem Stichtag.
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
5. **Abrechnungszeitraum im Kalender**: ist jetzt über `app_settings.billing_period_start_day` admin-einstellbar (Default: 1 = Kalendermonat), siehe §2.1e. Offen bleibt nur, den tatsächlich gewünschten Start-Tag einmalig mit dem Admin/Chef abzustimmen.
