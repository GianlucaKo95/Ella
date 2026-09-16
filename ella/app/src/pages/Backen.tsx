import { useEffect, useState } from "react";
import { supabase, type Employee } from "../lib/supabase";
import { DAY_NAMES, isoDayOfWeek, parseDateStr, toDateStr, formatDayMonth } from "../lib/dates";

type BakeEntry = {
  id: string;
  date: string;
  quantity: number;
  cake_item_id: string;
  category: "kuchen" | "boden";
};
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee.bake_team_id) {
      setLoading(false);
      return;
    }
    const todayStr = toDateStr(new Date());
    Promise.all([
      supabase
        .from("bake_plan_entries")
        .select("id,date,quantity,cake_item_id,category")
        .eq("bake_team_id", employee.bake_team_id)
        .eq("status", "published")
        .gte("date", todayStr)
        .order("date"),
      supabase.from("cake_items").select("*").order("name"),
      supabase.from("cake_recipe_ingredients").select("*").order("sort_order")
    ]).then(([entriesRes, cakesRes, ingrRes]) => {
      setEntries((entriesRes.data as BakeEntry[]) || []);
      setCakeItems((cakesRes.data as CakeItem[]) || []);
      setIngredients((ingrRes.data as RecipeIngredient[]) || []);
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

  const renderEntry = (entry: BakeEntry) => {
    const cake = cakeById.get(entry.cake_item_id);
    const expanded = expandedId === entry.id;
    const structuredIngredients = ingredients
      .filter((i) => i.cake_item_id === entry.cake_item_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const d = parseDateStr(entry.date);
    return (
      <div className="card" key={entry.id}>
        <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
          {DAY_NAMES[isoDayOfWeek(d)]}, {formatDayMonth(d)}
        </p>
        <button
          type="button"
          className="ghost"
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => setExpandedId(expanded ? null : entry.id)}
        >
          <span>
            {cake?.name ?? "—"} · {entry.quantity} {cake?.default_unit ?? ""}
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

  const kuchenEntries = entries.filter((e) => e.category === "kuchen");
  const bodenEntries = entries.filter((e) => e.category === "boden");

  return (
    <div>
      <h2>Backen</h2>
      {loading ? (
        <p>Lädt…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Aktuell sind für deine Truppe keine Backtermine veröffentlicht.</p>
      ) : (
        <>
          {kuchenEntries.length > 0 && (
            <div style={{ marginBottom: "1.2rem" }}>
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
        </>
      )}
    </div>
  );
}
