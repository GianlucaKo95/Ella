import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";
import { DAY_NAMES, isoDayOfWeek, parseDateStr, toDateStr, formatDayMonth } from "../lib/dates";

type BakeEntry = {
  id: string;
  date: string;
  quantity: number;
  cake_item_id: string;
  category: "kuchen" | "boden";
  // Feedback: "Es gibt vereinzelt Kuchen, die in der Planung ein Notizfeld
  // benötigen. Käse-Sahne-Torte, Blaubeer-Mascarpone (oder anderes Obst) und
  // Veganer Kuchen mit Zimtstreusel" — muss hier sichtbar sein, sonst weiß
  // die Back-Truppe nicht, welche Sorte gemeint ist.
  note: string | null;
  // Feedback: "Können wir die Sichtbarkeit so umstellen, dass jeder
  // Backtrupp nach Tagen sortiert die wöchentlichen Kuchen der anderen sehen
  // kann?" — bisher sah eine Truppe ausschließlich ihre eigenen Einträge
  // (RLS-Filter auf `bake_team_id = eigene Truppe`), jetzt alle
  // veröffentlichten. Ohne sichtbaren Truppennamen wäre das verwirrend, wer
  // welchen Kuchen backt — deshalb hier mitgeladen.
  bake_team_id: string | null;
};
type BakeTeam = { id: string; name: string };
type CakeItem = {
  id: string;
  name: string;
  default_unit: string;
  ingredients: string | null;
  recipe_note: string | null;
};
type RecipeIngredient = {
  id: string;
  cake_item_id: string;
  sort_order: number;
  ingredient: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

// Für Mitglieder einer Back-Truppe: welche Kuchen sind für sie an welchem Tag
// eingeplant, mit Detailansicht (Zutaten + Backanleitung) per Antippen.
export function Backen({ employee }: { employee: Employee }) {
  const [entries, setEntries] = useState<BakeEntry[]>([]);
  const [cakeItems, setCakeItems] = useState<CakeItem[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [bakeTeams, setBakeTeams] = useState<BakeTeam[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.bake_team_id) {
      setLoading(false);
      return;
    }
    const todayStr = toDateStr(new Date());
    Promise.all([
      // Feedback: "jeder Backtrupp ... die wöchentlichen Kuchen der anderen
      // sehen kann" — kein `.eq("bake_team_id", ...)` mehr, zeigt jetzt alle
      // Truppen (RLS erlaubt das jeder Person mit eigener Truppe, s. Migration).
      supabase
        .from("bake_plan_entries")
        .select("id,date,quantity,cake_item_id,category,note,bake_team_id")
        .eq("status", "published")
        .gte("date", todayStr)
        .order("date"),
      supabase.from("cake_items").select("*").order("name"),
      supabase.from("cake_recipe_ingredients").select("*").order("sort_order"),
      supabase.from("bake_teams").select("id,name")
    ]).then(([entriesRes, cakesRes, ingrRes, teamsRes]) => {
      setEntries((entriesRes.data as BakeEntry[]) || []);
      setCakeItems((cakesRes.data as CakeItem[]) || []);
      setIngredients((ingrRes.data as RecipeIngredient[]) || []);
      setBakeTeams((teamsRes.data as BakeTeam[]) || []);
      setLoading(false);
    });
  }, [employee.bake_team_id]);

  if (!employee.bake_team_id) {
    return (
      <div>
        <h2>Backen</h2>
        <p style={{ color: "var(--ink-soft)" }}>Du bist aktuell keiner Back-Truppe zugeordnet.</p>
      </div>
    );
  }

  const cakeById = new Map(cakeItems.map((c) => [c.id, c]));
  const teamById = new Map(bakeTeams.map((t) => [t.id, t]));

  const renderEntry = (entry: BakeEntry) => {
    const cake = cakeById.get(entry.cake_item_id);
    const expanded = expandedId === entry.id;
    const structuredIngredients = ingredients
      .filter((i) => i.cake_item_id === entry.cake_item_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const teamName = entry.bake_team_id ? teamById.get(entry.bake_team_id)?.name ?? "?" : "Keine Truppe";
    return (
      <div className="card" key={entry.id}>
        <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
          {teamName}
          {entry.bake_team_id === employee.bake_team_id ? " · meine Truppe" : ""}
        </p>
        <button
          type="button"
          className="ghost"
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => setExpandedId(expanded ? null : entry.id)}
        >
          <span>
            {cake?.name ?? "—"}
            {entry.note ? ` (${entry.note})` : ""} · {entry.quantity} {cake?.default_unit ?? ""}
          </span>
          <span style={{ color: "var(--ink-soft)" }}>{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && cake && (
          <div style={{ marginTop: "0.6rem" }}>
            <p className="label-caps" style={{ marginBottom: "0.3rem" }}>
              Zutaten
            </p>
            {structuredIngredients.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {structuredIngredients.map((i) => (
                  <li key={i.id} style={{ padding: "0.2rem 0", fontSize: "0.85rem" }}>
                    {i.quantity != null && `${i.quantity} `}
                    {i.unit && `${i.unit} `}
                    {i.ingredient}
                    {i.note && <span style={{ color: "var(--ink-soft)" }}> — {i.note}</span>}
                  </li>
                ))}
              </ul>
            ) : cake.ingredients ? (
              <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.85rem" }}>{cake.ingredients}</p>
            ) : (
              <p style={{ color: "var(--ink-soft)", margin: 0, fontSize: "0.85rem" }}>Keine Zutaten hinterlegt.</p>
            )}
            {cake.recipe_note && (
              <>
                <p className="label-caps" style={{ margin: "0.6rem 0 0.3rem" }}>
                  Backanleitung
                </p>
                <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.85rem" }}>{cake.recipe_note}</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Feedback: "jeder Backtrupp nach Tagen sortiert die wöchentlichen Kuchen
  // der anderen sehen kann" — Tag ist jetzt die oberste Gruppierung statt
  // Kategorie (Kuchen/Böden bleibt als Unterteilung je Tag erhalten), damit
  // auf einen Blick sichtbar ist, was an welchem Tag über alle Truppen
  // hinweg gebacken wird.
  const dates = Array.from(new Set(entries.map((e) => e.date))).sort();

  return (
    <div>
      <h2>Backen</h2>
      {loading ? (
        <p>Lädt…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Aktuell sind keine Backtermine veröffentlicht.</p>
      ) : (
        dates.map((date) => {
          const dayEntries = entries.filter((e) => e.date === date);
          const kuchenEntries = dayEntries.filter((e) => e.category === "kuchen");
          const bodenEntries = dayEntries.filter((e) => e.category === "boden");
          const d = parseDateStr(date);
          return (
            <div key={date} style={{ marginBottom: "1.2rem" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>
                {DAY_NAMES[isoDayOfWeek(d)]}, {formatDayMonth(d)}
              </h3>
              {kuchenEntries.length > 0 && (
                <div style={{ marginBottom: bodenEntries.length > 0 ? "0.8rem" : 0 }}>
                  <p className="label-caps" style={{ marginBottom: "0.5rem" }}>
                    Kuchen &amp; Torten
                  </p>
                  {kuchenEntries.map(renderEntry)}
                </div>
              )}
              {bodenEntries.length > 0 && (
                <div>
                  <p className="label-caps" style={{ marginBottom: "0.5rem" }}>
                    Böden
                  </p>
                  {bodenEntries.map(renderEntry)}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
