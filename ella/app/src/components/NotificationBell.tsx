import { useEffect, useRef, useState } from "react";
import {
  type AppNotification,
  type Employee,
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../lib/supabase";
import { IconBell } from "./icons";

// Fragt periodisch (alle 60s) sowie beim Öffnen des Panels die eigenen
// Benachrichtigungen ab. Ein echtes Push/Realtime-Update ist bewusst nicht
// Teil dieser ersten Version (siehe ARCHITECTURE.md, offene Fragen).
export function NotificationBell({ employee }: { employee: Employee }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const loadedOnce = useRef(false);

  async function load() {
    const rows = await fetchMyNotifications(employee.id);
    setNotifications(rows);
    loadedOnce.current = true;
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function onOpen() {
    setOpen((o) => !o);
    if (!loadedOnce.current) await load();
  }

  async function onItemClick(n: AppNotification) {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  }

  async function onMarkAll() {
    await markAllNotificationsRead(employee.id);
    setNotifications((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="notif-bell" onClick={onOpen} aria-label="Benachrichtigungen">
        <IconBell />
        {unreadCount > 0 && <span className="badge-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-header">
              <h4>Benachrichtigungen</h4>
              {unreadCount > 0 && (
                <button className="ghost" onClick={onMarkAll}>
                  Alle als gelesen
                </button>
              )}
            </div>
            {notifications.length === 0 && <p className="notif-empty">Noch keine Benachrichtigungen.</p>}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`notif-item${n.read_at ? "" : " unread"}`}
                onClick={() => onItemClick(n)}
              >
                {n.body}
                <span className="notif-time">
                  {new Date(n.sent_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}{" "}
                  {new Date(n.sent_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
