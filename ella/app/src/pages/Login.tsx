import { useEffect, useState } from "react";
import {
  fetchLoginNames,
  findLoginName,
  setInitialPassword,
  signInWithName,
  type LoginName
} from "../lib/supabase";

export function Login() {
  const [names, setNames] = useState<LoginName[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoginNames().then(setNames);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const match = findLoginName(names, name);
    if (!match) {
      setError("Unbekannter Name");
      return;
    }

    setLoading(true);
    if (!match.has_account) {
      if (password.length < 6) {
        setError("Passwort muss mindestens 6 Zeichen haben");
        setLoading(false);
        return;
      }
      const createError = await setInitialPassword(match.id, password);
      if (createError) {
        setError(createError);
        setLoading(false);
        return;
      }
    }

    const signInError = await signInWithName(match.id, password);
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
        Schicht- &amp; Backplanung
      </p>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <p>
            <label className="label-caps">
              Name
              <br />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                style={{ width: "100%", marginTop: 6 }}
              />
            </label>
          </p>
          <p>
            <label className="label-caps">
              Passwort
              <br />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: "100%", marginTop: 6 }}
              />
            </label>
          </p>
          {error && <p style={{ color: "var(--attention)" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Anmelden…" : "Anmelden →"}
          </button>
        </form>
      </div>
    </div>
  );
}
