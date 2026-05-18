import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
export default function RoleRedirect() {
    const { user, isLocked, isLoading } = useAuth();
    // While auth is initializing, show nothing / spinner to avoid redirecting to login.
    if (isLoading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>);
    }
    // If the session is locked, keep the user on this route and let the global
    // PIN overlay prompt for the PIN instead of navigating away.
    if (isLocked)
        return null;
    if (!user)
        return <Navigate to="/login" replace/>;
    if (user.role === "ambassador")
        return <Navigate to="/ambassador-dashboard" replace/>;
    if (user.role === "cashier" || user.role === "manager")
        return <Navigate to="/pos" replace/>;
    return <Navigate to="/dashboard" replace/>;
}
