import { useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import { Navigate } from "react-router-dom";

export default function DashboardOnlyAdmin() {
  const { user } = useAuth();
  if (user?.role !== "admin" && user?.role !== "super_admin") {
    return <Navigate to="/pos" replace />;
  }
  return <Dashboard />;
}