import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { supabase, fetchCurrentEmployee, type Employee } from "./lib/supabase";
import { NavBar } from "./components/NavBar";
import { Login } from "./pages/Login";
import { Availability } from "./pages/Availability";
import { Plan } from "./pages/Plan";
import { BakePlan } from "./pages/BakePlan";
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
          <h1>ELLA</h1>
          <div className="who">
            <span>
              {employee.name}
              <br />
              {employee.role === "admin" ? "Admin" : "Mitarbeiterin"}
            </span>
            <img className="avatar" src="./logo.png" alt="Frau Ella Kaufladen &amp; Café" />
          </div>
        </div>
        <p style={{ margin: "-0.6rem 0 1rem" }}>
          <button className="ghost" onClick={() => supabase.auth.signOut()} style={{ fontSize: "0.68rem", padding: "0.4rem 0.7rem" }}>
            Abmelden
          </button>
        </p>
        <NavBar employee={employee} />
        <Routes>
          <Route path="/verfuegbarkeit" element={<Availability employee={employee} />} />
          <Route path="/plan" element={<Plan employee={employee} />} />
          <Route path="/backplan" element={<BakePlan employee={employee} />} />
          {employee.role === "admin" && (
            <>
              <Route path="/admin/planung" element={<AdminPlanning />} />
              <Route path="/admin/mitarbeiter" element={<AdminEmployees />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/verfuegbarkeit" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
