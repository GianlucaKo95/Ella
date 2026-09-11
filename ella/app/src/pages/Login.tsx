import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="app-shell">
      <div className="brand-header">
        <img src="./logo.png" alt="Frau Ella Kaufladen &amp; Café" />
        <h1>Ella</h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <p>
            <label>
              E-Mail
              <br />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </label>
          </p>
          <p>
            <label>
              Passwort
              <br />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </label>
          </p>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
