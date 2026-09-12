import { useEffect, useState } from "react";
import { fetchLoginNames, setInitialPassword, signInWithName, type LoginName } from "../lib/supabase";

export function Login() {
  const [names, setNames] = useState<LoginName[]>([]);
  const [selected, setSelected] = useState<LoginName | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoginNames().then(setNames);
  }, []);

  function pick(n: LoginName) {
    setSelected(n);
    setPassword("");
    setPassword2("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);

    if (!selected.has_account) {
      if (password.length < 6) {
        setError("Passwort muss mindestens 6 Zeichen haben");
        return;
      }
      if (password !== password2) {
        setError("Passwörter stimmen nicht überein");
        return;
      }
      setLoading(true);
      const createError = await setInitialPassword(selected.id, password);
      if (createError) {
        setError(createError);
        setLoading(false);
        return;
      }
    } else {
      setLoading(true);
    }

    const signInError = await signInWithName(selected.id, password);
    if (signInError) setError(signInError);
    setLoading(false);
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
        {selected ? selected.name : "Wer bist du?"}
      </p>
      <div className="card">
        {!selected && (
          <>
            {names.length === 0 && (
              <p style={{ color: "var(--ink-soft)" }}>Noch keine Mitarbeiter angelegt.</p>
            )}
            <div className="name-picker">
              {names.map((n) => (
                <button key={n.id} onClick={() => pick(n)}>
                  {n.name}
                </button>
              ))}
            </div>
          </>
        )}

        {selected && (
          <form onSubmit={handleSubmit}>
            {!selected.has_account && (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                Erster Login – leg dein Passwort fest.
              </p>
            )}
            <p>
              <label className="label-caps">
                Passwort
                <br />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: "100%", marginTop: 6 }}
                />
              </label>
            </p>
            {!selected.has_account && (
              <p>
                <label className="label-caps">
                  Passwort bestätigen
                  <br />
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    required
                    style={{ width: "100%", marginTop: 6 }}
                  />
                </label>
              </p>
            )}
            {error && <p style={{ color: "var(--attention)" }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Anmelden…" : selected.has_account ? "Anmelden →" : "Passwort festlegen & anmelden →"}
            </button>
            <p style={{ textAlign: "center", marginTop: "0.8rem" }}>
              <button type="button" className="ghost" onClick={() => setSelected(null)} disabled={loading}>
                ← Anderer Name
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
