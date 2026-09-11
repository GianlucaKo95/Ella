import { NavLink } from "react-router-dom";
import type { Employee } from "../lib/supabase";

export function NavBar({ employee }: { employee: Employee }) {
  return (
    <nav className="nav-bar">
      <NavLink to="/verfuegbarkeit" className={({ isActive }) => (isActive ? "active" : "")}>
        Meine Verfügbarkeit
      </NavLink>
      <NavLink to="/plan" className={({ isActive }) => (isActive ? "active" : "")}>
        Dienstplan
      </NavLink>
      <NavLink to="/backplan" className={({ isActive }) => (isActive ? "active" : "")}>
        Backplan
      </NavLink>
      {employee.role === "admin" && (
        <>
          <NavLink to="/admin/planung" className={({ isActive }) => (isActive ? "active" : "")}>
            Planung (Admin)
          </NavLink>
          <NavLink to="/admin/mitarbeiter" className={({ isActive }) => (isActive ? "active" : "")}>
            Mitarbeiter
          </NavLink>
        </>
      )}
    </nav>
  );
}
