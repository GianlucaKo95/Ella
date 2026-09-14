-- Aus Foto-Rezepten extrahierte Kuchen für Ella. Kein Migrations-Skript,
-- sondern ein eigenständiges Datenblatt (per DO-Block idempotent, geprüft
-- über den Kuchennamen — mehrfaches Ausführen legt keine Duplikate an).
-- Voraussetzung: Migration 0018 (cake_recipe_ingredients) muss angewendet sein.

-- ============================================================
-- Birnenkuchen mit Streusel (Quelle: "einfach backen", Foto von Luca)
-- ============================================================
-- ACHTUNG — bitte vor dem Verwenden prüfen:
-- Die Buttermenge im Teig war auf dem Foto durch einen Lichtreflex teilweise
-- verdeckt ("...g weiche B..."). Auf Basis der übrigen Mengen (250g Mehl,
-- 170g Zucker, 3 Eier) als 150g angenommen — bitte gegen das Original prüfen
-- und ggf. korrigieren.
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Birnenkuchen mit Streusel') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Birnenkuchen mit Streusel',
      'stück',
      E'Quelle: einfach backen. Ergibt ca. 12 Stücke, Springform Ø 26 cm.\n' ||
      E'Gesamtzeit 55 Min (Vorbereitung 20 Min, Backen 35 Min bei 180°C Ober-/Unterhitze bzw. 160°C Umluft). Niveau: Einfach.\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Ofen auf 180°C Ober-/Unterhitze (Umluft 160°C) vorheizen, Boden einer Springform (Ø 26 cm) fetten. Birnen schälen, vierteln, Kerngehäuse entfernen, Viertel in ca. 2 cm dicke Spalten schneiden.\n' ||
      E'2. Mehl, Zucker und Backpulver in einer Schüssel mischen. Eier, weiche Butter und Milch zugeben und mit den Schneebesen des Handrührgeräts auf höchster Stufe ca. 1 Minute schlagen. Teig in die vorbereitete Form geben und glattstreichen, anschließend die Birnenspalten darauf verteilen.\n' ||
      E'3. Für die Streusel Mehl, Butter, Zucker und eine Prise Salz in einer Schüssel mischen und zwischen den Händen zu Streuseln verreiben. Die Streusel gleichmäßig auf dem Kuchen verteilen und den Birnen-Streuselkuchen im vorgeheizten Ofen ca. 35 Minuten backen. Den Kuchen etwas auskühlen lassen, dann aus der Form lösen und servieren.\n\n' ||
      E'Hält sich gekühlt mindestens 2 Tage.\n\n' ||
      E'ACHTUNG: Die Buttermenge im Teig (150 g) war auf dem Foto durch einen Lichtreflex teilweise verdeckt und wurde anhand der übrigen Mengen angenommen — bitte gegen das Original prüfen.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Reife Birnen', 800, 'g', 'für den Teig; alternativ 1 große Dose Birnenhälften'),
      (v_cake_id, 2, 'Weizenmehl (Type 405)', 250, 'g', 'für den Teig'),
      (v_cake_id, 3, 'Zucker', 170, 'g', 'für den Teig'),
      (v_cake_id, 4, 'Backpulver', 2, 'TL', 'für den Teig'),
      (v_cake_id, 5, 'Eier (Gr. M)', 3, 'Stück', 'für den Teig'),
      (v_cake_id, 6, 'Weiche Butter', 150, 'g', 'für den Teig — Menge auf dem Foto verdeckt, bitte prüfen'),
      (v_cake_id, 7, 'Milch', 70, 'ml', 'für den Teig; alternativ Sahne'),
      (v_cake_id, 8, 'Fett für die Form', null, null, 'für den Teig; Menge "etwas"'),
      (v_cake_id, 9, 'Weizenmehl (Type 405)', 130, 'g', 'für die Streusel'),
      (v_cake_id, 10, 'Butter', 70, 'g', 'für die Streusel'),
      (v_cake_id, 11, 'Zucker', 70, 'g', 'für die Streusel'),
      (v_cake_id, 12, 'Salz', 1, 'Prise', 'für die Streusel');
  end if;
end $$;

-- ============================================================
-- Aprikosenkuchen mit Mandelkruste (Quelle: Rezeptmappe, kein Herkunftsvermerk)
-- ============================================================
-- ACHTUNG: "100 g Mandel(n) geho..." war auf dem Foto durch einen Lichtreflex
-- verdeckt; laut Zubereitungstext ("Mandelblättchen unterheben") als
-- Mandelblättchen angenommen — bitte prüfen.
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Aprikosenkuchen mit Mandelkruste') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Aprikosenkuchen mit Mandelkruste',
      'stück',
      E'Quelle: Rezeptmappe (kein Herkunftsvermerk auf dem Foto).\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Das Mehl mit dem Backpulver mischen und sieben. Die restlichen Teigzutaten (außer Semmelbrösel) hinzugeben und zu einem glatten Teig verkneten. 2/3 des Teiges auf den Boden der Springform drücken. Mit dem Rest einen 2–3 cm hohen Rand formen. Den Teigboden mehrmals mit einer Gabel einstechen und mit den Semmelbröseln bestreuen.\n' ||
      E'2. Die Aprikosen darauf verteilen. Eigelb, Zucker, Vanillezucker, Sahne und Stärke verrühren und die Mandelblättchen unterheben. Auf den Aprikosen verteilen.\n' ||
      E'3. Bei 165°C ca. 45 Minuten backen.\n\n' ||
      E'ACHTUNG: "100 g Mandel(n) geho..." war auf dem Foto verdeckt, als Mandelblättchen angenommen — bitte prüfen.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Mehl', 150, 'g', 'für den Teig'),
      (v_cake_id, 2, 'Backpulver', 0.5, 'TL', 'für den Teig'),
      (v_cake_id, 3, 'Zucker', 50, 'g', 'für den Teig'),
      (v_cake_id, 4, 'Vanillezucker', 1, 'Pck.', 'für den Teig'),
      (v_cake_id, 5, 'Eiweiß', 1, 'Stück', 'für den Teig'),
      (v_cake_id, 6, 'Butter', 100, 'g', 'für den Teig'),
      (v_cake_id, 7, 'Semmelbrösel', 1, 'EL', 'für den Teig, zum Bestreuen des Bodens'),
      (v_cake_id, 8, 'Aprikosen', 1, 'Dose', 'für den Belag'),
      (v_cake_id, 9, 'Eigelb', 1, 'Stück', 'für den Belag'),
      (v_cake_id, 10, 'Zucker', 75, 'g', 'für den Belag'),
      (v_cake_id, 11, 'Vanillezucker', 1, 'Pck.', 'für den Belag'),
      (v_cake_id, 12, 'Sahne', 3, 'EL', 'für den Belag'),
      (v_cake_id, 13, 'Speisestärke', 15, 'g', 'für den Belag'),
      (v_cake_id, 14, 'Mandelblättchen', 100, 'g', 'für den Belag — auf dem Foto teilweise verdeckt, bitte prüfen');
  end if;
end $$;

-- ============================================================
-- Apfelkuchen, sehr fein (Dr. Oetker)
-- Quelle: https://www.oetker.de/rezepte/r/apfelkuchen-sehr-fein
-- ============================================================
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Apfelkuchen, sehr fein') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Apfelkuchen, sehr fein',
      'stück',
      E'Quelle: Dr. Oetker (https://www.oetker.de/rezepte/r/apfelkuchen-sehr-fein). Ergibt etwa 12 Stücke, Zubereitung ca. 40 Min, gelingt leicht. Springform Ø 26 cm oder Ø 28 cm.\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Vorbereiten: Boden der Springform fetten. Äpfel schälen, vierteln, Kerngehäuse entfernen. Die Oberseiten mehrmals der Länge nach einritzen (für schöne Optik und gleichmäßiges Garen). Backofen vorheizen: Ober-/Unterhitze ca. 180°C, Heißluft ca. 160°C.\n' ||
      E'2. Rührteig: Butter oder Margarine in einer Rührschüssel mit dem Mixer geschmeidig rühren. Nach und nach Zucker, Vanillin-Zucker, Salz und Zitronen-Aroma unter Rühren hinzufügen, bis eine gebundene Masse entsteht. Jedes Ei ca. 1/2 Min. auf höchster Stufe unterrühren. Mehl und Backin mischen und abwechselnd mit der Milch in 2 Portionen kurz auf mittlerer Stufe unterrühren. Teig in die Springform füllen und glattstreichen. Die Apfelviertel kranzförmig auf den Teig legen. Form auf dem Rost ins untere Drittel des Backofens schieben. Backzeit ca. 45 Min. Anschließend auf einen Kuchenrost stellen.\n' ||
      E'3. Aprikotieren: Aprikosenkonfitüre durch ein Sieb streichen und mit Wasser in einem kleinen Topf unter Rühren aufkochen. Den Apfelkuchen sofort nach dem Backen damit bestreichen. Springformrand lösen und entfernen, Kuchen auch vom Springformboden lösen und darauf erkalten lassen.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Fett für die Form', null, null, 'Menge "etwas"'),
      (v_cake_id, 2, 'Äpfel (z.B. Elstar)', 750, 'g', 'für den Belag'),
      (v_cake_id, 3, 'Weiche Butter oder Margarine', 125, 'g', 'für den Rührteig'),
      (v_cake_id, 4, 'Zucker', 100, 'g', 'für den Rührteig'),
      (v_cake_id, 5, 'Dr. Oetker Vanillin-Zucker', 1, 'Pck.', 'für den Rührteig'),
      (v_cake_id, 6, 'Salz', 1, 'Prise', 'für den Rührteig'),
      (v_cake_id, 7, 'Dr. Oetker Natürliches Zitronen-Aroma', 0.5, 'Röhrchen', 'für den Rührteig'),
      (v_cake_id, 8, 'Eier (Größe M)', 3, 'Stück', 'für den Rührteig'),
      (v_cake_id, 9, 'Weizenmehl', 200, 'g', 'für den Rührteig'),
      (v_cake_id, 10, 'Dr. Oetker Original Backin', 2, 'gestr. TL', 'für den Rührteig'),
      (v_cake_id, 11, 'Milch', 2, 'EL', 'für den Rührteig; Menge "etwa"'),
      (v_cake_id, 12, 'Aprikosenkonfitüre', 2, 'EL', 'zum Aprikotieren'),
      (v_cake_id, 13, 'Wasser', 1, 'EL', 'zum Aprikotieren');
  end if;
end $$;

-- ============================================================
-- Apfelkuchen mit karamellisierten Walnüssen (Quelle: Rezeptmappe)
-- ============================================================
-- ACHTUNG — bitte vor dem Verwenden prüfen:
-- Der Streusel-Abschnitt war auf dem Foto durch einen Lichtreflex teilweise
-- verdeckt: eine Zeile "?kg Vanillinzucker" (als 1 Pck. Vanillinzucker
-- angenommen) und eine weitere Zeile direkt darunter war komplett
-- unleserlich (nicht übernommen). Ebenso war der vorletzte
-- Zubereitungsschritt (Streusel verteilen + finale Backangabe) teilweise
-- verdeckt; unten so gut wie möglich rekonstruiert.
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Apfelkuchen mit karamellisierten Walnüssen') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Apfelkuchen mit karamellisierten Walnüssen',
      'stück',
      E'Quelle: Rezeptmappe (kein Herkunftsvermerk auf dem Foto). Teig reicht für ein Blech oder 2x Springform Ø 26 cm.\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Äpfel schälen, entkernen, vierteln und in Scheiben schneiden.\n' ||
      E'2. Butter zerlassen und mit Zucker schaumig rühren.\n' ||
      E'3. Eier trennen und Eiweiß zu Schnee schlagen.\n' ||
      E'4. Dotter mit Butter/Zucker-Masse schlagen.\n' ||
      E'5. Restliche Zutaten unterrühren, Eischnee unterheben.\n' ||
      E'6. Teig auf Blech oder in zwei Springformen geben.\n' ||
      E'7. Äpfel aufrecht und sehr eng in den Teig drücken.\n' ||
      E'8. Päckchen Walnüsse zerdrücken und rösten. Währenddessen etwas Zucker drüber geben und am Ende das Vanillearoma. Über die Äpfel verteilen.\n' ||
      E'9. Für die Streusel alles kneten und über die Äpfel geben. (Auf dem Foto an dieser Stelle durch Lichtreflex verdeckt — bitte Original prüfen.)\n' ||
      E'10. Bei ca. 160°C ca. 40 Minuten backen. Stäbchenprobe.\n\n' ||
      E'ACHTUNG: Zwei Zeilen im Streusel-Zutatenabschnitt waren durch einen Lichtreflex verdeckt (siehe Zutatenliste) — bitte gegen das Original prüfen.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Butter', 330, 'g', 'für den Teig'),
      (v_cake_id, 2, 'Zucker', 300, 'g', 'für den Teig'),
      (v_cake_id, 3, 'Mehl', 350, 'g', 'für den Teig'),
      (v_cake_id, 4, 'Eier', 6, 'Stück', 'für den Teig'),
      (v_cake_id, 5, 'Vanillinzucker', 1, 'Pck.', 'für den Teig'),
      (v_cake_id, 6, 'Backpulver', 1, 'Pck.', 'für den Teig'),
      (v_cake_id, 7, 'Salz', 1, 'Prise', 'für den Teig'),
      (v_cake_id, 8, 'Äpfel (Boskop optimal)', 11, 'Stück', 'für den Teig; ca. 10–12 Stück'),
      (v_cake_id, 9, 'Mehl', 200, 'g', 'für die Streusel'),
      (v_cake_id, 10, 'Zucker', 150, 'g', 'für die Streusel'),
      (v_cake_id, 11, 'Vanillinzucker', 1, 'Pck.', 'für die Streusel — auf dem Foto durch Lichtreflex verdeckt, Menge angenommen, bitte prüfen'),
      (v_cake_id, 12, 'Butter', 100, 'g', 'für die Streusel'),
      (v_cake_id, 13, 'Walnüsse, zerstoßen', 1, 'Pck.', 'für die Streusel/Topping'),
      (v_cake_id, 14, 'Zucker', null, null, 'für die Streusel/Topping; Menge "etwas", zum Karamellisieren der Walnüsse'),
      (v_cake_id, 15, 'Vanille-Aroma', 1, 'Pck.', 'für die Streusel/Topping');
      -- Eine weitere Zutatenzeile zwischen "Vanillinzucker" und "Butter" war
      -- auf dem Foto komplett unleserlich und wurde bewusst nicht ergänzt.
  end if;
end $$;

-- ============================================================
-- Apfel-Amarettini-Kuchen mit Puddingsahne (Quelle: Rezeptmappe/Blog, Name nicht erkennbar)
-- ============================================================
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Apfel-Amarettini-Kuchen mit Puddingsahne') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Apfel-Amarettini-Kuchen mit Puddingsahne',
      'stück',
      E'Quelle: Rezeptmappe (Blogname auf dem Foto nicht lesbar). Ergibt einen Kuchen, Springform Ø 26 cm.\n\n' ||
      E'Zubereitung Mürbeteig:\n' ||
      E'Alle Zutaten rasch zu einem glatten Teig verkneten. Eine Springform (26 cm) fetten. Den Mürbeteig zwischen 2 Bögen Backpapier ausrollen und die Springform damit auslegen. Der Teigrand sollte ca. 5 cm hoch sein. Für mind. 1 Stunde kalt stellen.\n\n' ||
      E'Zubereitung Apfelfüllung:\n' ||
      E'Backofen auf 175°C Ober-/Unterhitze vorheizen. Die Äpfel schälen, vierteln und vom Kerngehäuse befreien. Die Apfelviertel in schmale Streifen schneiden und in einer Schüssel mit Zitronensaft und Zimt vermischen. 500 ml Apfelsaft in einem Topf erhitzen. Die restlichen 200 ml Apfelsaft mit Puddingpulver und Zucker klümpchenfrei verquirlen. Angerührte Flüssigkeit in den kochenden Apfelsaft gießen und nochmals unter Rühren aufkochen. Von der Herdplatte ziehen.\n' ||
      E'Preiselbeeren auf dem Mürbeteigboden verteilen. Die Hälfte der Apfelscheiben in die Form füllen. Amarettini darauf verteilen. Die Hälfte des heißen Apfelpuddings darüber gießen. Nun die restlichen Apfelscheiben und danach den übrigen Pudding einfüllen. Die Form ein paar Mal locker auf die Arbeitsplatte klopfen, damit sich Hohlräume in der Füllung schließen. Für 60 Minuten backen. Danach den Apfel-Amarettini-Kuchen auskühlen lassen. (In dieser Zeit kann schon der Pudding für das Topping gekocht werden, denn er muss ebenfalls längere Zeit auskühlen.)\n\n' ||
      E'Zubereitung Puddingsahne:\n' ||
      E'300 ml Milch in einem Topf zum Kochen bringen. In der Zwischenzeit Puddingpulver mit Zucker und 100 ml Milch in einer Tasse verquirlen. In die kochende Milch rühren und nochmals aufkochen lassen. In eine Schüssel füllen und sofort mit Klarsichtfolie belegen (wichtig: Folie direkt auf dem Pudding auflegen, damit sich keine Haut bildet). Komplett erkalten lassen.\n' ||
      E'Sahne cremig aufschlagen, dann unter Rühren langsam 1 TL San Apart einrieseln lassen und weiterschlagen, bis die Sahne steif ist. Pudding cremig-glatt rühren, dann 1 TL San Apart einrühren. Nun die Schlagsahne behutsam unter den Pudding ziehen. Auf dem Apfel-Amarettini-Kuchen verteilen. Mind. 30 Minuten kalt stellen.\n\n' ||
      E'Tipp: Nach Belieben mit zerbröselten Amarettini bestreuen — das sollte erst kurz vor dem Servieren passieren, denn die Kekse ziehen Feuchtigkeit und werden nach einiger Zeit weich.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Mehl', 250, 'g', 'für den Mürbeteig'),
      (v_cake_id, 2, 'Butter', 125, 'g', 'für den Mürbeteig'),
      (v_cake_id, 3, 'Zucker', 100, 'g', 'für den Mürbeteig'),
      (v_cake_id, 4, 'Ei', 1, 'Stück', 'für den Mürbeteig'),
      (v_cake_id, 5, 'Äpfel', 1, 'kg', 'für die Apfelfüllung'),
      (v_cake_id, 6, 'Apfelsaft', 700, 'ml', 'für die Apfelfüllung; davon 500 ml zum Erhitzen, 200 ml zum Anrühren mit dem Puddingpulver'),
      (v_cake_id, 7, 'Zimt', 1, 'TL', 'für die Apfelfüllung'),
      (v_cake_id, 8, 'Puddingpulver, Vanille', 2, 'Pck.', 'für die Apfelfüllung'),
      (v_cake_id, 9, 'Zucker', 6, 'EL', 'für die Apfelfüllung'),
      (v_cake_id, 10, 'Zitronensaft', 3, 'EL', 'für die Apfelfüllung'),
      (v_cake_id, 11, 'Amarettini', 45, 'g', 'für die Apfelfüllung; ca. 40–50 g'),
      (v_cake_id, 12, 'Wild-Preiselbeeren (Glas)', 4.5, 'EL', 'für die Apfelfüllung; ca. 4–5 EL'),
      (v_cake_id, 13, 'Milch', 400, 'ml', 'für die Puddingsahne; davon 300 ml zum Aufkochen, 100 ml zum Anrühren mit dem Puddingpulver'),
      (v_cake_id, 14, 'Puddingpulver, Vanille', 1, 'Pck.', 'für die Puddingsahne'),
      (v_cake_id, 15, 'Zucker', 3, 'EL', 'für die Puddingsahne'),
      (v_cake_id, 16, 'Sahne', 250, 'ml', 'für die Puddingsahne'),
      (v_cake_id, 17, 'San Apart (Sahnesteif)', 2, 'TL', 'für die Puddingsahne; je 1 TL für Sahne und Pudding'),
      (v_cake_id, 18, 'Amarettini', null, null, 'zum Bestreuen kurz vor dem Servieren, Menge "nach Belieben"');
  end if;
end $$;

-- ============================================================
-- Apfel-Cheesecake mit Walnuss-Streuseln und Karamellsauce
-- Quelle: Andrea, https://zimtkeksundapfeltarte.com/rezept/apfel-cheesecake-mit-walnuss-streuseln/
-- ============================================================
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Apfel-Cheesecake mit Walnuss-Streuseln und Karamellsauce') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Apfel-Cheesecake mit Walnuss-Streuseln und Karamellsauce',
      'stück',
      E'Quelle: Andrea, zimtkeksundapfeltarte.com (https://zimtkeksundapfeltarte.com/rezept/apfel-cheesecake-mit-walnuss-streuseln/). Gesamtzeit ca. 1:30 Std. Für eine rechteckige Form von 23 x 30 cm.\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Backofen auf 175°C (150°C Umluft) vorheizen.\n' ||
      E'2. Für den Boden die drei Boden-Zutaten zusammen mit 3–4 EL kaltem Wasser mit den Knethaken des Handrührers krümelig zusammenkneten. Die Form mit Backpapier auslegen und den krümeligen Teig gleichmäßig auf dem Boden festdrücken (geht gut mit einem Löffelrücken oder dem Boden eines Glases).\n' ||
      E'3. In den vorgeheizten Backofen stellen und für 15 Minuten anbacken. Danach abkühlen lassen.\n' ||
      E'4. Inzwischen die Cheesecake-Creme (Füllung) mit dem Handrührer aufschlagen, beiseite stellen. Die Äpfel schälen, Kerngehäuse entfernen, vierteln und in Stücke schneiden, diese in einer Schüssel mit 1 gehäuften TL Zimt und dem Zitronenabrieb vermischen. Alle Zutaten für die Streusel in eine Schüssel geben, dabei die Butter in kleine Würfel schneiden, dann alles schnell mit den Händen zu Streuseln verarbeiten.\n' ||
      E'5. Die Cheesecake-Creme auf den abgekühlten Boden geben. Die Äpfel gleichmäßig darauf verteilen und zuletzt mit den Streuseln bedecken.\n' ||
      E'6. Den Kuchen auf der 2. Schiene von unten für ca. 30–40 Minuten goldbraun backen. Aus dem Ofen nehmen und abkühlen lassen.\n' ||
      E'7. In Stücke schneiden und mit Puderzucker oder Karamellsauce servieren (Rezept für Karamellsauce separat auf der Original-Seite verlinkt).'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Mehl', 350, 'g', 'für den Boden'),
      (v_cake_id, 2, 'Weiche Butter', 175, 'g', 'für den Boden'),
      (v_cake_id, 3, 'Brauner Zucker', 100, 'g', 'für den Boden'),
      (v_cake_id, 4, 'Kaltes Wasser', 3.5, 'EL', 'für den Boden; ca. 3–4 EL'),
      (v_cake_id, 5, 'Frischkäse', 400, 'g', 'für die Füllung'),
      (v_cake_id, 6, 'Zucker', 100, 'g', 'für die Füllung'),
      (v_cake_id, 7, 'Bourbon-Vanillezucker', 1, 'Pck.', 'für die Füllung'),
      (v_cake_id, 8, 'Eier', 2, 'Stück', 'für die Füllung'),
      (v_cake_id, 9, 'Große, säuerliche Äpfel', 3.5, 'Stück', 'für die Füllung; 3–4 Stück'),
      (v_cake_id, 10, 'Abrieb einer halben Bio-Zitrone', null, null, 'für die Füllung'),
      (v_cake_id, 11, 'Zimt', 1, 'TL', 'für die Füllung; 1 gehäufter TL laut Zubereitungstext'),
      (v_cake_id, 12, 'Mehl', 150, 'g', 'für die Streusel'),
      (v_cake_id, 13, 'Zucker', 100, 'g', 'für die Streusel'),
      (v_cake_id, 14, 'Feine Haferflocken', 70, 'g', 'für die Streusel'),
      (v_cake_id, 15, 'Gehackte Walnüsse', 50, 'g', 'für die Streusel'),
      (v_cake_id, 16, 'Butter', 125, 'g', 'für die Streusel');
  end if;
end $$;

-- ============================================================
-- Apfelmus-Schmand-Kuchen
-- Quelle: Kai Kopireit, https://www.leckerschmecker.me/print/apfelmus-schmand-kuchen
-- ============================================================
do $$
declare
  v_cake_id uuid;
begin
  if not exists (select 1 from cake_items where name = 'Apfelmus-Schmand-Kuchen') then
    insert into cake_items (name, default_unit, recipe_note)
    values (
      'Apfelmus-Schmand-Kuchen',
      'blech',
      E'Quelle: Kai Kopireit, leckerschmecker.me (https://www.leckerschmecker.me/print/apfelmus-schmand-kuchen). Ergibt 1 Blech.\n\n' ||
      E'Zubereitung:\n' ||
      E'1. Verknete für den Mürbeteig Mehl, Butter, Zucker, Ei und eine Prise Salz in einer Schüssel zu einem geschmeidigen Teig. Stelle den Teig dann für etwa 30 Minuten in den Kühlschrank.\n' ||
      E'2. Heize den Backofen auf 180°C Ober-/Unterhitze vor und fette eine Springform oder ein Backblech ein.\n' ||
      E'3. Verteile den gekühlten Teig gleichmäßig in der Springform und forme einen Rand. Gib danach das Apfelmus auf den Teig.\n' ||
      E'4. Vermische für die Schmandschicht Schmand, Zucker, Eier und Vanillezucker und gib die Mischung über das Apfelmus.\n' ||
      E'5. Geheimtipp: Gib einen Hauch Zimt in die Schmandschicht, um dem Kuchen eine besondere Note zu verleihen.\n' ||
      E'6. Backe den Kuchen für etwa 45 Minuten im vorgeheizten Backofen. Lass ihn nach dem Backen etwa 1 Stunde abkühlen, bevor du ihn anschneidest. Verziere ihn vor dem Servieren mit Schokoraspeln.'
    )
    returning id into v_cake_id;

    insert into cake_recipe_ingredients (cake_item_id, sort_order, ingredient, quantity, unit, note) values
      (v_cake_id, 1, 'Mehl', 250, 'g', 'für den Mürbeteig'),
      (v_cake_id, 2, 'Butter', 125, 'g', 'für den Mürbeteig'),
      (v_cake_id, 3, 'Zucker', 75, 'g', 'für den Mürbeteig'),
      (v_cake_id, 4, 'Ei', 1, 'Stück', 'für den Mürbeteig'),
      (v_cake_id, 5, 'Salz', 1, 'Prise', 'für den Mürbeteig'),
      (v_cake_id, 6, 'Apfelmus', 500, 'g', 'als Schicht auf dem Teig'),
      (v_cake_id, 7, 'Schmand', 200, 'g', 'für die Schmandschicht'),
      (v_cake_id, 8, 'Zucker', 100, 'g', 'für die Schmandschicht'),
      (v_cake_id, 9, 'Eier', 2, 'Stück', 'für die Schmandschicht'),
      (v_cake_id, 10, 'Vanillezucker', 1, 'Pck.', 'für die Schmandschicht'),
      (v_cake_id, 11, 'Zimt', 0.5, 'TL', 'für die Schmandschicht; optional'),
      (v_cake_id, 12, 'Raspelschokolade', null, null, 'zum Verzieren vor dem Servieren, Menge nicht angegeben');
  end if;
end $$;
