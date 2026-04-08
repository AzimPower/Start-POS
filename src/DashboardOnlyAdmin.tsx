import { useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import { Navigate } from "react-router-dom";
export default function DashboardOnlyAdmin() {
    const { user } = useAuth();
    if (user?.role !== "admin" && user?.role !== "super_admin") {
        return <Navigate to="/pos" replace/>;
    }
    if (user?.role === "super_admin") {
        return <div style={{ width: "100%" }}><SuperAdminDashboard /></div>;
    }
    return <div style={{ width: "100%" }}><Dashboard /></div>;
}
