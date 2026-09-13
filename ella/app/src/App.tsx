import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { supabase, fetchCurrentEmployee, type Employee } from "./lib/supabase";
import { NotificationBell } from "./components/NotificationBell";
import { NavBar } from "./components/NavBar";
import { Avatar } from "./components/Avatar";
import { IconLogout } from "./components/icons";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Kalender } from "./pages/Kalender";
import { Profil } from "./pages/Profil";
import { AdminPlanning } from "./pages/AdminPlanning";
import { AdminEmployees } from "./pages/AdminEmployees";

export default function App() {
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);

  async function refresh() {
    const emp = await fetchCurrentEmployee();
    setEmployee(emp);
  }

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  if (employee === undefined) {
    return (
      <div className="app-shell">
        <p>Lädt…</p>
      </div>
    );
  }

  if (!employee) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="brand-header">
          <div className="brand-left">
            <img className="brand-logo" src="./logo.png" alt="Frau Ella Kaufladen &amp; Café" />
            <h1>ELLA</h1>
          </div>
          <div className="who">
            <NotificationBell employee={employee} />
            <span>
              {employee.name}
              <br />
              {employee.role === "admin" ? "Admin" : "Mitarbeiterin"}
            </span>
            <Avatar name={employee.name} avatarUrl={employee.avatar_url} />
            <button className="notif-bell" onClick={() => supabase.auth.signOut()} aria-label="Abmelden" title="Abmelden">
              <IconLogout />
            </button>
          </div>
        </div>
        <NavBar employee={employee} />
        <Routes>
          <Route path="/home" element={<Home employee={employee} />} />
          <Route path="/kalender" element={<Kalender employee={employee} />} />
          <Route path="/profil" element={<Profil employee={employee} onEmployeeChanged={refresh} />} />
          {employee.role === "admin" && (
            <>
              <Route path="/admin/planung" element={<AdminPlanning />} />
              <Route path="/admin/mitarbeiter" element={<AdminEmployees />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
