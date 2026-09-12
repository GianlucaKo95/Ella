import { useEffect, useState } from "react";
import { fetchLoginNames, loginByName, type LoginName } from "../lib/supabase";

export function Login() {
  const [names, setNames] = useState<LoginName[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoginNames().then(setNames);
  }, []);

  async function handlePick(id: string) {
    setLoadingId(id);
    setError(null);
    const err = await loginByName(id);
    if (err) setError(err);
    setLoadingId(null);
  }

  return (
    <div className="app-shell" style={{ paddingBottom: "2rem" }}>
      <div className="brand-header" style={{ justifyContent: "center", border: "none" }}>
        <img
          className="avatar"
          style={{ width: 56, height: 56 }}
          src="./logo.png"
          alt="Frau Ella Kaufladen &amp; Café"
        />
      </div>
      <h1 style={{ textAlign: "center", letterSpacing: "0.08em" }}>ELLA</h1>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", marginTop: "-0.5rem" }}>
        Wer bist du?
      </p>
      <div className="card">
        {names.length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>Noch keine Mitarbeiter angelegt.</p>
        )}
        <div className="name-picker">
          {names.map((n) => (
            <button key={n.id} disabled={loadingId !== null} onClick={() => handlePick(n.id)}>
              {loadingId === n.id ? "…" : n.name}
            </button>
          ))}
        </div>
        {error && (
          <p style={{ color: "var(--attention)", marginTop: "0.9rem" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
