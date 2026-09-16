-- Eigene Sortierreihenfolge je Schicht (analog zu cake_recipe_ingredients.sort_order)
-- statt der bisherigen reinen Anlagereihenfolge über created_at — Admins sollen
-- eine Schicht innerhalb eines Tages nach Startzeit einreihen können, sobald der
-- Tag zugeklappt wird (Feedback: "wenn der Tag zugeklappt wird, sollen die
-- Schichten im Hintergrund nach Startzeitpunkt geordnet werden"). Neue Schichten
-- werden weiterhin ans Ende angehängt (client-seitig wie bei addRecipeIngredient),
-- bestehende Zeilen werden hier einmalig nach ihrer bisherigen Anlagereihenfolge
-- (created_at) je Tag durchnummeriert, damit sich die aktuell sichtbare Reihenfolge
-- durch die Migration nicht ändert.
alter table shifts add column sort_order integer not null default 0;

update shifts s
set sort_order = ranked.rn
from (
  select id, row_number() over (partition by date order by created_at) - 1 as rn
  from shifts
) ranked
where ranked.id = s.id;
