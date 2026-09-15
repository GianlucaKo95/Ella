import type { PushState } from "../lib/push";

// Reiner Anzeige-Teil des Push-Umschalters (Zustand/Logik kommt aus
// usePushToggle) — wiederverwendet in AdminPlanning und Profil.
export function PushToggleButton({
  state,
  busy,
  error,
  onToggle
}: {
  state: PushState | "loading";
  busy: boolean;
  error: string | null;
  onToggle: () => void;
}) {
  return (
    <>
      {state === "unsupported" && <p className="hint warn">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>}
      {state === "denied" && (
        <p className="hint warn">
          Die Erlaubnis für Benachrichtigungen wurde verweigert — bitte in den Browser-/App-Einstellungen für diese
          Seite erlauben und danach neu laden.
        </p>
      )}
      {error && <p className="hint warn">{error}</p>}
      <button disabled={busy || state === "unsupported" || state === "denied" || state === "loading"} onClick={onToggle}>
        {state === "subscribed" ? "Push-Benachrichtigungen deaktivieren" : "Push-Benachrichtigungen aktivieren"}
      </button>
    </>
  );
}
