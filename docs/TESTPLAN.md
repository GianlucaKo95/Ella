# Ella – Testkonzept & Akzeptanzkriterien (Rolle: QS)

## 1. Prüfebenen
1. **Datenbank/RLS** — Constraints, Trigger und Policies direkt gegen Supabase (SQL/REST), unabhängig von der PWA.
2. **PWA-Funktionen** — manuelle Klickpfade je Rolle (Mitarbeiter/Admin).
3. **Regelkonformität** — die fachlichen Rahmenbedingungen (Öffnungszeiten, Backtage, Truppen) werden nie verletzt, auch nicht über Umwege (API direkt, manipulierte Requests) — und bleiben es auch nach einer Änderung der admin-einstellbaren Regeln (§2.7).

## 2. Testfälle

### 2.1 Verfügbarkeiten
| # | Szenario | Erwartung |
|---|---|---|
| V1 | Mitarbeiter trägt "Donnerstags kann" (wiederkehrend) ein | Eintrag mit `kind='recurring'`, `day_of_week=3` wird gespeichert und beim nächsten Laden angezeigt |
| V2 | Mitarbeiter trägt für ein konkretes Datum "kann nicht" ein, obwohl er an diesem Wochentag wiederkehrend verfügbar ist | Admin-Planung zeigt für dieses Datum "kann nicht" (Ausnahme schlägt Regel) |
| V3 | Mitarbeiter A versucht, Verfügbarkeit von Mitarbeiter B zu lesen/ändern (direkter API-Call mit eigenem Token) | Von RLS verweigert (403 / leere Ergebnismenge) |
| V4 | Admin liest Verfügbarkeiten aller Mitarbeiter | Erfolgreich, vollständige Liste |

### 2.2 Verfügbarkeits-Stichtag (monatlich)
| # | Szenario | Erwartung |
|---|---|---|
| D1 | Mitarbeiter hat nicht für alle relevanten Tage (§2.7, Vereinigung Service-/Back-Tage) des nächsten Monats einen wiederkehrenden Eintrag | "Einreichen"-Button bleibt deaktiviert |
| D2 | Mitarbeiter hat alle relevanten Tage eingetragen | "Einreichen"-Button aktiv, Klick erzeugt `availability_submissions`-Eintrag mit Zeitstempel |
| D3 | Mitarbeiter reicht ein zweites Mal für denselben Monat ein | Kein Duplikat (unique employee_id+month), zweiter Versuch aktualisiert nichts sichtbar Neues |
| D4 | Heutiges Datum liegt nach dem Stichtag, Mitarbeiter hat nicht eingereicht | Eigene Ansicht zeigt "überfällig"; Admin-Ansicht zeigt ihn als "ausstehend" |
| D5 | Admin ändert den Stichtag für den nächsten Monat | Neuer Stichtag gilt sofort für alle Mitarbeiter-Ansichten |
| D6 | Mitarbeiter versucht, `availability_submissions` für einen Kollegen einzutragen (direkter API-Call) | RLS verweigert |

### 2.3 Aktuelles (Ankündigungen)
| # | Szenario | Erwartung |
|---|---|---|
| A1 | Admin verfasst eine Ankündigung auf dem Home-Screen | Eintrag landet in `announcements`, erscheint sofort (nach Reload der Liste) bei allen Mitarbeitern auf Home |
| A2 | Mitarbeiter versucht, per direktem API-Call eine Ankündigung zu schreiben | RLS verweigert (`announcements_write_admin` nur für `admin`) |
| A3 | Mitarbeiter ruft Ankündigungen ab | Sieht alle (kein Truppen-/Rollenfilter vorgesehen — News sind für alle) |

### 2.4 Eigener Anzeigename
| # | Szenario | Erwartung |
|---|---|---|
| N1 | Mitarbeiter ändert im Profil seinen Namen und speichert | `update_my_name` aktualisiert nur `employees.name` der eigenen Zeile; Kopfzeile/Begrüßung zeigt danach den neuen Namen |
| N2 | Mitarbeiter versucht per RPC, den Namen eines Kollegen zu ändern (fremde `employee_id` einschleusen) | Nicht möglich — die Funktion verwendet ausschließlich `current_employee_id()`, es gibt keinen Parameter für eine fremde ID |
| N3 | Leerer oder nur aus Leerzeichen bestehender Name wird übergeben | Funktion wirft eine Exception, kein Update |

### 2.5 Home/Kalender/Profil (Mitarbeiter-Navigation)
| # | Szenario | Erwartung |
|---|---|---|
| H1 | Mitarbeiter ohne Back-Truppe (`bake_team_id = null`) öffnet Home | Karte "Nächste Backschicht" wird nicht angezeigt |
| H2 | Mitarbeiter mit Back-Truppe öffnet Home | Karte "Nächste Backschicht" zeigt die nächsten veröffentlichten Backtermine seiner Truppe |
| H3 | Mitarbeiter hat für den kommenden Monat noch nicht eingereicht (§2.2) | Popup erscheint beim Öffnen von Home; "Jetzt eintragen" führt zu `/profil`; "Später" blendet das Popup nur für die aktuelle Sitzung aus |
| H4 | Mitarbeiter hat bereits eingereicht | Kein Popup |
| H5 | Mitarbeiter öffnet Home an einem Tag, an dem mehrere Kollegen eingeteilt sind | Karte "Heute im Dienst" zeigt **alle** veröffentlichten Schichten des Tages (nicht nur die eigene), je mit Name und Zeit |
| H6 | An einem Tag ohne veröffentlichte Schicht | "Heute im Dienst" zeigt einen Leerzustand-Hinweis, keine Fehlermeldung |
| K1 | Mitarbeiter öffnet Kalender | Monatsgrid zeigt den aktuellen Monat, eigene Schichten sind optisch hervorgehoben, Klick auf einen Tag zeigt alle Schichten dieses Tages |
| K2 | Mitarbeiter navigiert zu einem anderen Monat | Grid aktualisiert sich auf den neu gewählten Monat; die Stundenstatistik bleibt unverändert (bezieht sich auf den Abrechnungszeitraum, §2.6, nicht auf den angezeigten Monat) |
| K3 | Mitarbeiter öffnet Detailansicht eines Tages mit eigener Schicht, klickt "Tauschen" | Kollegen-Auswahl erscheint; nach Auswahl + "Anbieten" wird eine `shift_swap_requests`-Zeile angelegt (siehe §2.15) |
| K4 | Für eine Schicht besteht bereits eine offene Tauschanfrage | Statt "Tauschen" erscheint der Hinweis "Tauschanfrage gestellt – wartet auf Antwort", kein erneutes Anbieten möglich |
| PR1 | Mitarbeiter öffnet Profil | Name-Feld, die Stichtag-/Einreichen-Karte, dauerhafte Verfügbarkeiten und Ausnahmen sind alle auf einem Screen verfügbar |

### 2.6 Admin-Einstellungen: Abrechnungszeitraum
| # | Szenario | Erwartung |
|---|---|---|
| E1 | Admin ändert den Start-Tag des Abrechnungszeitraums und speichert | `app_settings.billing_period_start_day` wird aktualisiert; Vorschau-Zeitraum in der Admin-Ansicht aktualisiert sich sofort |
| E2 | Mitarbeiter ruft danach den Kalender-Screen auf | "Voraussichtliche Stunden" und die Zeitraum-Anzeige basieren auf dem neuen Start-Tag |
| E3 | Mitarbeiter versucht, `app_settings` per direktem API-Call zu ändern | RLS verweigert (`app_settings_update_admin` nur für `admin`) |
| E4 | Ein Wert außerhalb 1–28 wird eingetragen | DB-Constraint lehnt ab (bewusst auf 28 begrenzt, damit der Start-Tag in jedem Monat existiert) |
| E5 | Admin ändert den Abrechnungszeitraum-Start-Tag | Die Admin-Planung (Dienst-/Backplan) zeigt weiterhin denselben vollen Kalendermonat — Anzahl und Auswahl der zu planenden Tage ändern sich **nicht** |

### 2.7 Einstellbare Service-/Back-Tage & Back-Truppen (Admin)
| # | Szenario | Erwartung |
|---|---|---|
| C1 | Admin deaktiviert einen bisherigen Service-Tag (z. B. Sonntag) und klickt "Tage speichern" | Dieser Wochentag taucht in der Monatsplanung (Dienstplan) nicht mehr auf; bereits existierende Schichten an diesem Tag bleiben unverändert bestehen |
| C2 | Admin reduziert die Back-Tage auf nur noch einen Tag pro Woche und speichert | Backplan-Monatsplanung zeigt nur noch diesen einen Wochentag je Woche; Mitarbeiter müssen für das Einreichen nur noch für die jetzt relevanten Tage (Service ∪ Backen) eine Verfügbarkeit eintragen |
| C3 | Direkter Insert eines `shifts`-Eintrags an einem laut `app_settings.service_days` nicht erlaubten Wochentag (API-Call, nicht über UI) | Trigger `check_shift_service_day` lehnt mit Exception ab |
| C4 | Direkter Insert eines `bake_plan_entries`-Eintrags an einem laut `app_settings.bake_days` nicht erlaubten Wochentag | Trigger `check_bake_plan_day` lehnt ab |
| C5 | `service_days`/`bake_days` auf ein leeres Array gesetzt (API-Call) | DB-Constraint (`array_length(...) > 0`) lehnt ab |
| C6 | Admin legt eine vierte Back-Truppe an | Erscheint sofort in allen Truppen-Auswahlfeldern (Mitarbeiter-Profil, Backplan) |
| C7 | Admin löscht eine Back-Truppe, der noch Mitarbeiter zugeordnet sind | `bake_team_id` dieser Mitarbeiter wird `null` (FK `on delete set null`); Admin muss sie danach neu zuordnen |
| C8 | Mitarbeiter versucht, `app_settings`/`bake_teams` per direktem API-Call zu ändern | RLS verweigert (nur `admin`) |
| C9 | Admin fügt in der Truppen-Karte einen noch nicht zugeordneten Mitarbeiter zu Truppe A hinzu | `employees.bake_team_id` wird gesetzt; Mitarbeiter erscheint sofort unter Truppe A, nicht mehr in der Auswahl der anderen Truppen |
| C10 | Admin wählt in Truppe B einen Mitarbeiter, der aktuell Truppe A zugeordnet ist | Mitarbeiter wird zu Truppe B umgehängt (nicht doppelt zugeordnet), verschwindet aus Truppe A |
| C11 | Admin klickt "entfernen" bei einem Truppenmitglied | `bake_team_id` wird `null`; Mitarbeiter taucht danach bei jeder Truppe wieder in der Auswahlliste auf |
| C12 | Admin togglet Service-/Back-Tage, klickt aber **nicht** "Tage speichern" | Dienstplan/Backplan-Listen unten zeigen weiterhin die zuletzt gespeicherten Tage, nicht die ungespeicherte Auswahl; "Tage speichern" ist deaktiviert, solange die Auswahl unverändert ist, und zeigt einen Hinweis, sobald sie vom gespeicherten Stand abweicht |

### 2.8 Monatsplanung (Admin)
| # | Szenario | Erwartung |
|---|---|---|
| M1 | Admin öffnet die Planung | Alle aktuell konfigurierten Service- und Back-Tage (§2.7) des angezeigten Kalendermonats werden aufgelistet, nicht nur eine einzelne Woche |
| M2 | Admin navigiert zum nächsten/vorherigen Monat | Liste aktualisiert sich auf den neu gewählten Kalendermonat |
| M3 | Admin klickt "Plan & Backplan veröffentlichen" | Alle `draft`-Einträge des gesamten angezeigten Monats werden `published`, nicht nur einer Woche |

### 2.9 Dienstplan (Service)
| # | Szenario | Erwartung |
|---|---|---|
| S1 | Admin legt Schicht für einen laut aktuellen Einstellungen nicht erlaubten Wochentag an (Insert direkt gegen DB versucht) | Trigger `check_shift_service_day` lehnt ab (siehe C3) |
| S2 | Admin legt Spätschicht mit `role_tag='kueche'` an | DB-Constraint `role_tag_only_frueh` lehnt ab |
| S3 | Admin weist Mitarbeiter zu, der laut Verfügbarkeit an dem Tag nicht kann | UI warnt/zeigt "kann nicht" in der Auswahl — **keine** harte Sperre (bewusste Entscheidung: Admin kann übersteuern, z. B. bei kurzfristigem Einspringen) |
| S4 | Admin veröffentlicht den Monat | Alle `draft`-Schichten dieses Monats werden `published`; Mitarbeiter sehen sie danach im Dienstplan |
| S5 | Mitarbeiter ruft Dienstplan ab, bevor veröffentlicht wurde | Sieht nichts für diesen Zeitraum (nur `published` sichtbar) |
| S6 | Mitarbeiter ruft `shifts` mit Filter auf andere Mitarbeiter-IDs aber Status `draft` ab | RLS verweigert — Entwürfe sind für Mitarbeiter nie sichtbar, auch nicht die eigenen |

### 2.10 Backplan
| # | Szenario | Erwartung |
|---|---|---|
| B1 | Admin legt Backeintrag für einen laut aktuellen Einstellungen nicht erlaubten Wochentag an | Trigger `check_bake_plan_day` lehnt ab (siehe C4) |
| B2 | Mitarbeiter aus Truppe 2 ruft veröffentlichten Backplan ab | Sieht nur Einträge mit `bake_team_id` = Truppe 2 |
| B3 | Mitarbeiter aus Truppe 2 ruft Backplan-Einträge von Truppe 1 direkt per ID ab | RLS verweigert |
| B4 | Admin klickt "veröffentlichen", während mindestens ein Backeintrag im Monat keine Truppe hat | Veröffentlichung wird nicht sofort ausgeführt; eine Warnung mit Anzahl der betroffenen Einträge erscheint, mit Möglichkeit "Trotzdem veröffentlichen" oder "Abbrechen" |
| B5 | Admin klickt in der Warnung (B4) "Trotzdem veröffentlichen" | Veröffentlichung läuft wie gewohnt durch, Backeintrag bleibt ohne Truppe (für Mitarbeiter weiterhin unsichtbar, kein `bake_team_id`-Match) |
| B6 | Ein Truppenmitglied ist am selben Tag auch für eine Service-Schicht eingeteilt | Inline-Warnung direkt am betroffenen Backeintrag zeigt den Namen des Mitglieds — **keine** harte Sperre, Admin kann trotzdem speichern/veröffentlichen |

### 2.11 Rollen & Rechte
| # | Szenario | Erwartung |
|---|---|---|
| R1 | Mitarbeiter versucht, eigene `role` auf `admin` zu setzen | RLS verweigert (nur Admin darf `employees` schreiben) |
| R2 | Mitarbeiter versucht, `staffing_requirements` zu ändern | RLS verweigert |
| R3 | Admin ändert Back-Truppe eines Mitarbeiters (im Mitarbeiter-Profil **oder** in der Truppen-Karte, §2.7) | Erfolgreich, Änderung wirkt sich ab sofort auf sichtbaren Backplan dieses Mitarbeiters aus, unabhängig davon über welchen der beiden Wege sie vorgenommen wurde |

### 2.12 ICS-Export
| # | Szenario | Erwartung |
|---|---|---|
| I1 | Mitarbeiter ruft eigenen ICS-Link ab | Enthält nur seine veröffentlichten Schichten + Backtermine seiner Truppe |
| I2 | Unveröffentlichte Termine | Tauchen im ICS-Feed nicht auf |
| I3 | Fremde `employee_id` im ICS-Link eingesetzt | **Sicherheitslücke, siehe §4** — aktuell keine Auth-Prüfung in der Edge Function |

### 2.13 PWA / Offline
| # | Szenario | Erwartung |
|---|---|---|
| P1 | App wird auf dem Smartphone "zum Home-Bildschirm hinzufügen" | Installiert sich als eigenständige App (Manifest vorhanden) |
| P2 | Aufruf ohne Netzverbindung, nachdem die App einmal geladen wurde | Service Worker liefert zumindest die App-Shell aus (kein Totalausfall) |

### 2.14 In-App-Benachrichtigungen (Glocke)
| # | Szenario | Erwartung |
|---|---|---|
| NT1 | Admin veröffentlicht einen Monat | Jeder Mitarbeiter mit mind. einer neu veröffentlichten Schicht erhält eine Benachrichtigung vom Typ `shift_published` |
| NT2 | Admin postet eine Ankündigung | Alle anderen aktiven Mitarbeiter erhalten eine Benachrichtigung vom Typ `announcement` mit dem Ankündigungstext |
| NT3 | Mitarbeiter mit ungelesenen Benachrichtigungen öffnet die App | Glocke zeigt einen Badge mit der Anzahl ungelesener Einträge |
| NT4 | Mitarbeiter klickt eine einzelne Benachrichtigung im Dropdown an | Diese wird als gelesen markiert (`read_at` gesetzt), Badge-Zahl sinkt um 1 |
| NT5 | Mitarbeiter klickt "Alle als gelesen" | Alle eigenen offenen Benachrichtigungen werden als gelesen markiert, Badge verschwindet |
| NT6 | Mitarbeiter A versucht per direktem API-Call, Benachrichtigungen von Mitarbeiter B zu lesen oder als gelesen zu markieren | RLS verweigert (`target_employee_id` muss der eigenen entsprechen, außer Admin) |
| NT7 | Mitarbeiter versucht, selbst eine Benachrichtigung anzulegen (API-Call) | RLS verweigert (Insert nur für `admin`) |

### 2.15 Schichttausch
| # | Szenario | Erwartung |
|---|---|---|
| T1 | Mitarbeiter A bietet eine eigene veröffentlichte Schicht Kollegen B an | `shift_swap_requests`-Zeile mit `status='pending'` wird angelegt; Button zeigt danach "Tauschanfrage gestellt" statt erneut "Tauschen" |
| T2 | Mitarbeiter A versucht, eine Schicht zum Tausch anzubieten, auf die aktuell ein anderer Mitarbeiter eingeteilt ist (API-Call mit fremder `shift_id`) | Trigger `check_swap_request_owner` lehnt ab |
| T3 | Mitarbeiter A bietet sich selbst eine Schicht an (`offered_to = requested_by`) | DB-Constraint `swap_not_to_self` lehnt ab |
| T4 | Mitarbeiter B sieht auf Home eine eingehende Anfrage und klickt "Annehmen" | Status wird `accepted`, `responded_at` gesetzt; Anfrage erscheint danach bei Admin unter "Schichttausch-Bestätigungen" |
| T5 | Mitarbeiter B klickt "Ablehnen" | Status wird `declined`; Schicht bleibt unverändert bei A |
| T6 | Admin bestätigt eine angenommene Anfrage | `shifts.employee_id` wird auf B umgeschrieben, Anfrage-Status wird `confirmed` |
| T7 | Admin lehnt eine angenommene Anfrage ab | Status wird `declined`, `shifts.employee_id` bleibt bei A |
| T8 | Mitarbeiter C (weder A noch B) versucht, die Anfrage per API-Call zu lesen | RLS verweigert |

## 3. Akzeptanzkriterien für "fertig" (Definition of Done, MVP)
- [ ] Mitarbeiter kann wiederkehrende Verfügbarkeit + Ausnahmen selbst pflegen.
- [ ] Mitarbeiter kann Verfügbarkeit für den nächsten Monat erst einreichen, wenn sie für alle aktuell relevanten Tage (Service ∪ Backen, admin-einstellbar) vollständig ist; Admin sieht den Einreichungsstatus aller Mitarbeiter vor dem Stichtag.
- [ ] Admin sieht beim Planen pro Tag den Personalbedarf und die Verfügbarkeit der Mitarbeiter.
- [ ] Veröffentlichen eines Monats macht Dienst- *und* Backplan gleichzeitig für betroffene Mitarbeiter sichtbar.
- [ ] Jeder Mitarbeiter kann seinen Plan per ICS abonnieren.
- [ ] Kein Mitarbeiter kann Daten anderer Mitarbeiter einsehen oder verändern (per RLS erzwungen, nicht nur per UI verborgen).
- [ ] Alle Regelverstöße (falscher Wochentag für Schicht/Backen laut aktuellen Einstellungen, Rollen-Tag in Spätschicht) werden von der Datenbank abgelehnt, nicht nur vom UI verhindert.
- [ ] Admin kann Service-/Back-Tage, Abrechnungszeitraum und Back-Truppen ohne Code-Änderung anpassen.
- [ ] Mitarbeiter werden beim Veröffentlichen eines Plans und bei neuen Ankündigungen in der App benachrichtigt (Glocke mit Badge).
- [ ] Mitarbeiter können eigene veröffentlichte Schichten einem Kollegen zum Tausch anbieten; der Tausch wird erst nach Admin-Bestätigung tatsächlich wirksam.

## 4. Offene Risiken / vor Launch zu klären
1. **ICS-Link ohne Auth-Token**: Die Edge Function nimmt aktuell jede `employee_id` entgegen, ohne zu prüfen, ob der Aufrufer berechtigt ist. Für einen Kalenderfeed ist das üblich (kein Login im Kalender-Client), aber die ID sollte durch einen nicht erratbaren Zugriffstoken ersetzt werden (z. B. separates `calendar_token`-Feld pro Mitarbeiter statt der UUID direkt), bevor das live geht.
2. **Benachrichtigungen nur in-app**: `notifications_log` wird jetzt beim Veröffentlichen und bei Ankündigungen befüllt und in der Glocke angezeigt (§2.14), aber es gibt noch keinen echten externen Push (HA-Notify/Web-Push) — ein Mitarbeiter merkt eine Veröffentlichung erst, wenn er die App wieder öffnet oder die Glocke das nächste 60s-Poll macht.
3. **Backplan ohne Truppe**: jetzt mit Warnung vor dem Veröffentlichen abgefangen (§2.10, B4/B5) statt stillschweigend unsichtbar zu bleiben.
4. **Kapazität je Truppe**: jetzt als Inline-Warnung sichtbar (§2.10, B6), aber weiterhin keine harte Sperre — bleibt bewusst organisatorische Verantwortung des Admins.
5. **Abrechnungszeitraum im Kalender**: ist über `app_settings.billing_period_start_day` admin-einstellbar (Default: 1 = Kalendermonat), siehe §2.6. Offen bleibt, den tatsächlich gewünschten Start-Tag einmalig mit dem Admin/Chef abzustimmen.
6. **Schichttausch ohne Eignungsprüfung**: Beim Anbieten wird nicht automatisch geprüft, ob der Kollege laut Verfügbarkeit an dem Tag überhaupt könnte — Admin sieht das erst bei der finalen Bestätigung, nicht vorher im Tausch-Dialog selbst.
