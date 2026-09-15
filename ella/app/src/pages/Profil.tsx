import { useRef, useState } from "react";
import { removeMyAvatar, supabase, uploadMyAvatar, type Employee } from "../lib/supabase";
import { usePushToggle } from "../lib/push";
import { PushToggleButton } from "../components/PushToggleButton";
import { usePwaInstall } from "../lib/pwaInstall";
import { Avatar } from "../components/Avatar";

export function Profil({ employee, onEmployeeChanged }: { employee: Employee; onEmployeeChanged?: () => void }) {
  const push = usePushToggle(employee.id);
  const pwaInstall = usePwaInstall();
  const [showIosHint, setShowIosHint] = useState(false);

  const [name, setName] = useState(employee.name);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    if (!name.trim() || name.trim() === employee.name) return;
    setSavingName(true);
    setNameSaved(false);
    const { error } = await supabase.rpc("update_my_name", { new_name: name.trim() });
    setSavingName(false);
    if (!error) {
      setNameSaved(true);
      onEmployeeChanged?.();
    }
  }

  async function handleAvatarFile(file: File) {
    setAvatarUploading(true);
    setAvatarError(null);
    const error = await uploadMyAvatar(file);
    setAvatarUploading(false);
    if (error) {
      setAvatarError(error);
    } else {
      onEmployeeChanged?.();
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    setAvatarError(null);
    const error = await removeMyAvatar();
    setAvatarUploading(false);
    if (error) {
      setAvatarError(error);
    } else {
      onEmployeeChanged?.();
    }
  }

  return (
    <div>
      <h2>Profil</h2>

      <div className="card">
        <h3>Profilbild</h3>
        <div className="row-actions" style={{ alignItems: "center" }}>
          <Avatar name={employee.name} avatarUrl={employee.avatar_url} size={64} />
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleAvatarFile(file);
            }}
          />
          <button className="ghost" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}>
            {avatarUploading ? "Lädt hoch…" : "Foto ändern"}
          </button>
          {employee.avatar_url && (
            <button className="ghost" onClick={handleAvatarRemove} disabled={avatarUploading}>
              Entfernen
            </button>
          )}
        </div>
        {avatarError && <p style={{ color: "var(--attention)", margin: "0.5rem 0 0", fontSize: "0.8rem" }}>{avatarError}</p>}
      </div>

      <div className="card">
        <h3>Name</h3>
        <div className="row-actions">
          <input
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
          />
          <button onClick={saveName} disabled={savingName || !name.trim() || name.trim() === employee.name}>
            Speichern
          </button>
        </div>
        {nameSaved && <p style={{ color: "var(--mint)", margin: "0.5rem 0 0", fontSize: "0.8rem" }}>Gespeichert ✅</p>}
      </div>

      <div className="card">
        <h3>Benachrichtigungen</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Aktiviert für dieses Gerät/diesen Browser eine echte Push-Benachrichtigung (auch außerhalb der App), z. B.
          wenn der Dienstplan veröffentlicht wurde oder eine neue Ankündigung da ist.
        </p>
        <PushToggleButton state={push.state} busy={push.busy} error={push.error} onToggle={push.toggle} />
      </div>

      {pwaInstall.status !== "unsupported" && (
        <div className="card">
          <h3>App installieren</h3>
          {pwaInstall.status === "installed" && (
            <p className="hint" style={{ marginTop: 0 }}>
              ✅ Bereits als App installiert.
            </p>
          )}
          {pwaInstall.status === "prompt" && (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                Installiert Ella als eigene App auf diesem Gerät — eigenes Icon auf dem Home-Bildschirm, kein
                Browser-Rahmen mehr.
              </p>
              <button onClick={pwaInstall.install}>App installieren</button>
            </>
          )}
          {pwaInstall.status === "ios" && (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                iOS erlaubt die Installation nur über das Teilen-Menü von Safari, nicht per Knopfdruck aus der App
                heraus.
              </p>
              <button className="ghost" onClick={() => setShowIosHint((v) => !v)}>
                {showIosHint ? "Anleitung ausblenden" : "Anleitung anzeigen"}
              </button>
              {showIosHint && (
                <ol style={{ margin: "0.6rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
                  <li>Unten in Safari auf das Teilen-Symbol ⬆️ tippen.</li>
                  <li>"Zum Home-Bildschirm" auswählen.</li>
                  <li>Mit "Hinzufügen" bestätigen.</li>
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
