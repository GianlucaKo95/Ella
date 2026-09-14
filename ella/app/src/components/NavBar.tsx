import { NavLink } from "react-router-dom";
import type { Employee } from "../lib/supabase";
import { IconHome, IconCalendar, IconUser, IconSliders, IconUsers, IconCake } from "./icons";

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
      <NavLink to="/profil" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconUser />
        Profil
      </NavLink>
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
    </nav>
  );
}
