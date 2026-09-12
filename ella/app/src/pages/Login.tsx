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
              E-Mail
              <br />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
