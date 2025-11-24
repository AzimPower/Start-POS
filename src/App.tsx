import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CustomerReceipts from './pages/CustomerReceipts';
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Pin from "./pages/Pin";
import Dashboard from "./pages/Dashboard";
import DashboardOnlyAdmin from "./DashboardOnlyAdmin";
import RoleRedirect from "./RoleRedirect";
import Products from "./pages/Products";
import POS from "./pages/POS";
import Shifts from "./pages/Shifts";
import Customers from "./pages/Customers";
import Stores from "./pages/Stores";
import Users from "./pages/Users";
import Receipts from "./pages/Receipts";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import Categories from "./pages/Categories";
import Expenses from "./pages/Expenses";
import StockSignals from "./pages/StockSignals";
import useAndroidBackButton from './hooks/useAndroidBackButton';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLocked, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If there's a stored session that needs unlocking, keep the current route
  // mounted and let the global PIN overlay prompt for the PIN. This avoids
  // navigating to /pin which causes remounts and makes users lose in-progress
  // input on the underlying page.
  if (isLocked) {
    // keep route mounted while locked
    return <Layout>{children}</Layout>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function BackButtonInitializer() {
  // Hook must be called inside a Router - this component is rendered just under BrowserRouter
  useAndroidBackButton();
  return null;
}

function PinRoute() {
  const { user, isLocked, isLoading } = useAuth();
  // Wait for auth init
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If unlocked, redirect to appropriate role page
  if (user && !isLocked) {
    if (user.role === 'cashier') return <Navigate to="/pos" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  // If there is no stored session awaiting PIN, don't show PIN page
  if (!user) return <Navigate to="/login" replace />;

  return <Pin />;
}

// Render a PIN overlay when a stored session is pending unlock. This component
// must be rendered inside the AuthProvider so `useAuth()` is available.
function PinOverlay() {
  const { isLocked } = useAuth();
  if (isLocked) {
    return <Pin overlay />;
  }
  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <InnerApp />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

function InnerApp() {
  return (
    <BrowserRouter>
      {/* Back button initializer must be inside Router so useNavigate/useLocation work */}
      <BackButtonInitializer />
      <AuthProvider>
        <PinOverlay />
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/pin" element={<PinRoute />} />
            <Route path="/" element={<RoleRedirect />} />
            <Route
              path="/customer-receipts/:id"
              element={
                <ProtectedRoute>
                  <CustomerReceipts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardOnlyAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute>
                  <POS {...({} as any)} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shifts"
              element={
                <ProtectedRoute>
                  <Shifts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Products />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Categories />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stores"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Stores />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Users />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/receipts"
              element={
                <ProtectedRoute>
                  <Receipts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                    <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-signals"
              element={
                <ProtectedRoute>
                  <StockSignals />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
      
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* Printer debug page removed for production builds */}
          </Routes>
        </AuthProvider>
      </BrowserRouter>
  );
}

export default App;
