import { NavLink } from "react-router-dom";
import type { Employee } from "../lib/supabase";
import { IconHome, IconCalendar, IconUser, IconSliders, IconUsers, IconCake, IconCheck } from "./icons";

// Profil steht bewusst ganz rechts (letzter Tab) — alle übrigen, häufiger
// gebrauchten Tabs bleiben links davon in fester Reihenfolge. Verfügbarkeit
// ist ein eigener Tab statt Teil des Profils (vorher dort unten, ging neben
// Profilbild/Name optisch unter) und nur für Mitarbeiter sichtbar — Admins
// müssen keine Verfügbarkeit abgeben (§9/§11).
export function NavBar({ employee }: { employee: Employee }) {
  return (
    <nav className="nav-bar">
      <NavLink to="/home" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconHome />
        Home
      </NavLink>
      <NavLink to="/kalender" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconCalendar />
        Kalender
      </NavLink>
      {employee.role !== "admin" && (
        <NavLink to="/verfuegbarkeit" className={({ isActive }) => (isActive ? "active" : "")}>
          <IconCheck />
          Verfügbarkeit
        </NavLink>
      )}
      {employee.bake_team_id && (
        <NavLink to="/backen" className={({ isActive }) => (isActive ? "active" : "")}>
          <IconCake />
          Backen
        </NavLink>
      )}
      {employee.role === "admin" && (
        <>
          <NavLink to="/admin/planung" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconSliders />
            Planung
          </NavLink>
          <NavLink to="/admin/mitarbeiter" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconUsers />
            Team
          </NavLink>
        </>
      )}
      <NavLink to="/profil" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconUser />
        Profil
      </NavLink>
    </nav>
  );
}
