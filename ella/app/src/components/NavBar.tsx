import { NavLink } from "react-router-dom";
import type { Employee } from "../lib/supabase";
import { IconCalendarCheck, IconClipboard, IconCake, IconSliders, IconUsers } from "./icons";

export function NavBar({ employee }: { employee: Employee }) {
  return (
    <nav className="nav-bar">
      <NavLink to="/verfuegbarkeit" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconCalendarCheck />
        Verfügbar
      </NavLink>
      <NavLink to="/plan" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconClipboard />
        Plan
      </NavLink>
      <NavLink to="/backplan" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconCake />
        Backen
      </NavLink>
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
