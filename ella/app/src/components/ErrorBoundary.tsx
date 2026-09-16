import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Ohne Error Boundary lässt jeder unabgefangene Render-Fehler React den
// gesamten Baum abbauen — die Seite bleibt dann komplett weiß, ohne jeden
// Hinweis (Feedback: "Ich hab immer noch den fehlgeschlagenen Refresh. Der
// Bildschirm bleibt dann weiß."). Zeigt stattdessen einen Hinweis mit
// Neu-laden-Button, egal wodurch der Fehler ausgelöst wurde.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell" style={{ padding: "2rem", textAlign: "center" }}>
          <p>Etwas ist schiefgelaufen. Bitte die Seite neu laden.</p>
          <button onClick={() => window.location.reload()}>Neu laden</button>
        </div>
      );
    }
    return this.props.children;
  }
}
