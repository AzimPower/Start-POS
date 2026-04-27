import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CustomerReceipts from './pages/CustomerReceipts';
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NotificationProvider } from './contexts/NotificationContext';
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Pin from "./pages/Pin";
import { useState, useEffect, useRef } from 'react';
import { getDB } from "@/lib/db";
import SubscriptionExpired from "./components/SubscriptionExpired";
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
import StockAdjustmentHistory from './pages/StockAdjustmentHistory';
import useAndroidBackButton from './hooks/useAndroidBackButton';
import SubscriptionPayments from './pages/SubscriptionPayments';
import Notifications from './pages/Notifications';
import { getStoreAccessState } from './lib/status';
import { toast } from 'sonner';
const queryClient = new QueryClient();
const STORES_STATUS_URL = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php?include_inactive=1';

function normalizeStoreIds(storeIds?: Array<string | null | undefined>, fallbackStoreId?: string | null) {
    const ids = Array.isArray(storeIds) ? storeIds : [];
    const candidates = ids.length > 0 ? ids : [fallbackStoreId];

    return Array.from(new Set(candidates
        .map((storeId) => String(storeId || '').trim())
        .filter(Boolean)));
}

function ProtectedRoute({ children }: {
    children: React.ReactNode;
}) {
    const { user, isLocked, isLoading } = useAuth();
    if (isLoading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>);
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
        return <Navigate to="/login" replace/>;
    }
    return <Layout>{children}</Layout>;
}
function AdminRoute({ children }: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();
    if (user?.role !== 'admin' && user?.role !== 'super_admin' && user?.role !== 'manager') {
        return <Navigate to="/dashboard" replace/>;
    }
    return <>{children}</>;
}
function SuperAdminRoute({ children }: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();
    if (user?.role !== 'super_admin') {
        return <Navigate to="/dashboard" replace/>;
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
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>);
    }
    // If unlocked, redirect to appropriate role page
    if (user && !isLocked) {
        if (user.role === 'cashier')
            return <Navigate to="/pos" replace/>;
        return <Navigate to="/dashboard" replace/>;
    }
    // If there is no stored session awaiting PIN, don't show PIN page
    if (!user)
        return <Navigate to="/login" replace/>;
    return <Pin />;
}
// Vérificateur du statut de l'abonnement du magasin
// Bloque l'accès si le magasin est désactivé (sauf pour le super admin)
function StoreStatusChecker({ children }: {
    children: React.ReactNode;
}) {
    const { user, isLoading, setActiveStore } = useAuth();
    const [storeStatus, setStoreStatus] = useState<{
        active: boolean;
        reason: 'inactive' | 'expired' | null;
        name: string;
        loading: boolean;
    }>({
        active: true,
        reason: null,
        name: '',
        loading: true
    });
    const [checkKey, setCheckKey] = useState(0);
    const switchingStoreRef = useRef(false);
    useEffect(() => {
        let cancelled = false;
        let intervalId: number | undefined;

        const checkStoreStatus = async () => {
            // Skip si pas de user ou si c'est le super admin (accès illimité)
            if (!user || user.role === 'super_admin' || isLoading) {
                if (!cancelled) {
                    setStoreStatus({ active: true, reason: null, name: '', loading: false });
                }
                return;
            }

            try {
                const db = await getDB();
                const localStore = user.storeId ? await db.get('stores', user.storeId) : null;
                const fallbackName = localStore?.name || 'Votre magasin';
                const allowedStoreIds = normalizeStoreIds((user as any)?.storeIds, user.storeId);
                const buildStatus = (store: any, fallbackStoreName: string) => {
                    const access = getStoreAccessState(store);
                    return {
                        active: access.active,
                        reason: access.reason,
                        name: store?.name || fallbackStoreName,
                        loading: false
                    };
                };
                const findAlternativeStore = (stores: any[]) => {
                    return stores.find((store: any) => {
                        const storeId = String(store?.id || '').trim();
                        if (!storeId || storeId === String(user.storeId || '').trim()) {
                            return false;
                        }
                        if (!allowedStoreIds.includes(storeId)) {
                            return false;
                        }
                        return getStoreAccessState(store).active;
                    }) || null;
                };
                const switchToAlternativeStore = async (nextStore: any, reason: 'inactive' | 'expired' | null) => {
                    const nextStoreId = String(nextStore?.id || '').trim();
                    if (!nextStoreId || switchingStoreRef.current) {
                        return false;
                    }

                    switchingStoreRef.current = true;
                    if (!cancelled) {
                        setStoreStatus({
                            active: true,
                            reason: null,
                            name: nextStore?.name || fallbackName,
                            loading: true
                        });
                    }

                    try {
                        await setActiveStore(nextStoreId);
                        toast.success(reason === 'expired'
                            ? `Magasin expiré, bascule automatique vers : ${nextStore?.name || nextStoreId}`
                            : `Magasin désactivé, bascule automatique vers : ${nextStore?.name || nextStoreId}`);
                        return true;
                    }
                    catch (error) {
                        return false;
                    }
                    finally {
                        switchingStoreRef.current = false;
                    }
                };

                if (!navigator.onLine) {
                    const localCurrentAccess = getStoreAccessState(localStore);
                    if (!localCurrentAccess.active) {
                        const localStores = (await db.getAll('stores'))
                            .filter((store: any) => allowedStoreIds.includes(String(store?.id || '').trim()));
                        const alternativeStore = findAlternativeStore(localStores);
                        if (alternativeStore && await switchToAlternativeStore(alternativeStore, localCurrentAccess.reason)) {
                            return;
                        }
                    }

                    if (!cancelled) {
                        setStoreStatus(localStore
                            ? buildStatus(localStore, fallbackName)
                            : { active: true, reason: null, name: fallbackName, loading: false });
                    }
                    return;
                }

                try {
                    const response = await fetch(`${STORES_STATUS_URL}&_ts=${Date.now()}`, { cache: 'no-store' });
                    if (!response.ok) {
                        if (!cancelled) {
                            setStoreStatus(localStore
                                ? buildStatus(localStore, fallbackName)
                                : { active: true, reason: null, name: fallbackName, loading: false });
                        }
                        return;
                    }

                    const stores = await response.json();
                    const userStore = Array.isArray(stores)
                        ? stores.find((store: any) => String(store?.id) === String(user.storeId))
                        : null;
                    const allowedRemoteStores = Array.isArray(stores)
                        ? stores.filter((store: any) => allowedStoreIds.includes(String(store?.id || '').trim()))
                        : [];

                    if (userStore) {
                        const access = getStoreAccessState(userStore);
                        const normalizedRemoteStore = access.active ? userStore : { ...userStore, active: false };
                        await db.put('stores', normalizedRemoteStore);
                        if (!access.active) {
                            const alternativeStore = findAlternativeStore(allowedRemoteStores);
                            if (alternativeStore && await switchToAlternativeStore(alternativeStore, access.reason)) {
                                return;
                            }
                        }
                        if (!cancelled) {
                            setStoreStatus(buildStatus(normalizedRemoteStore, fallbackName));
                        }
                        return;
                    }

                    const alternativeStore = findAlternativeStore(allowedRemoteStores);
                    if (alternativeStore && await switchToAlternativeStore(alternativeStore, 'inactive')) {
                        return;
                    }

                    if (!cancelled) {
                        setStoreStatus({
                            active: false,
                            reason: 'inactive',
                            name: fallbackName,
                            loading: false
                        });
                    }
                }
                catch (error) {
                    if (!cancelled) {
                        setStoreStatus(localStore
                            ? buildStatus(localStore, fallbackName)
                            : { active: true, reason: null, name: fallbackName, loading: false });
                    }
                }
            }
            catch (error) {
                if (!cancelled) {
                    setStoreStatus({ active: true, reason: null, name: '', loading: false });
                }
            }
        };

        checkStoreStatus();

        if (user && user.role !== 'super_admin' && !isLoading) {
            intervalId = window.setInterval(checkStoreStatus, 30000);

            const handleVisibility = () => {
                if (document.visibilityState === 'visible') {
                    checkStoreStatus();
                }
            };

            window.addEventListener('focus', checkStoreStatus);
            document.addEventListener('visibilitychange', handleVisibility);

            return () => {
                cancelled = true;
                if (intervalId) {
                    window.clearInterval(intervalId);
                }
                window.removeEventListener('focus', checkStoreStatus);
                document.removeEventListener('visibilitychange', handleVisibility);
            };
        }

        return () => {
            cancelled = true;
            if (intervalId) {
                window.clearInterval(intervalId);
            }
        };
    }, [user, isLoading, checkKey]);
    // Affichage du loader pendant la vérification
    if (storeStatus.loading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>);
    }
    // Si le magasin est désactivé, afficher l'écran de blocage
    if (!storeStatus.active && user && user.role !== 'super_admin') {
        return (<SubscriptionExpired storeName={storeStatus.name} reason={storeStatus.reason} onCheckAgain={() => setCheckKey(prev => prev + 1)}/>);
    }
    // Sinon, afficher l'application normalement
    return <>{children}</>;
}
// Render a PIN overlay when a stored session is pending unlock. This component
// must be rendered inside the AuthProvider so `useAuth()` is available.
function PinOverlay() {
    const { isLocked } = useAuth();
    if (isLocked) {
        return <Pin overlay/>;
    }
    return null;
}
const App = () => (<ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <InnerApp />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>);
function InnerApp() {
    return (<BrowserRouter>
      {/* Back button initializer must be inside Router so useNavigate/useLocation work */}
      <BackButtonInitializer />
      <AuthProvider>
        <NotificationProvider>
        <PinOverlay />
        <StoreStatusChecker>
          <Routes>
            <Route path="/login" element={<Login />}/>
            <Route path="/pin" element={<PinRoute />}/>
            <Route path="/" element={<RoleRedirect />}/>
            <Route path="/customer-receipts/:id" element={<ProtectedRoute>
                  <CustomerReceipts />
                </ProtectedRoute>}/>
            <Route path="/dashboard" element={<ProtectedRoute>
                  <DashboardOnlyAdmin />
                </ProtectedRoute>}/>
            <Route path="/pos" element={<ProtectedRoute>
                  <POS {...({} as any)}/>
                </ProtectedRoute>}/>
            <Route path="/shifts" element={<ProtectedRoute>
                  <Shifts />
                </ProtectedRoute>}/>
            <Route path="/customers" element={<ProtectedRoute>
                  <Customers />
                </ProtectedRoute>}/>
            <Route path="/products" element={<ProtectedRoute>
                  <AdminRoute>
                    <Products />
                  </AdminRoute>
                </ProtectedRoute>}/>
            <Route path="/categories" element={<ProtectedRoute>
                  <AdminRoute>
                    <Categories />
                  </AdminRoute>
                </ProtectedRoute>}/>
            <Route path="/stores" element={<ProtectedRoute>
                  <AdminRoute>
                    <Stores />
                  </AdminRoute>
                </ProtectedRoute>}/>
            
            <Route path="/users" element={<ProtectedRoute>
                  <AdminRoute>
                    <Users />
                  </AdminRoute>
                </ProtectedRoute>}/>
            <Route path="/receipts" element={<ProtectedRoute>
                  <Receipts />
                </ProtectedRoute>}/>
            <Route path="/expenses" element={<ProtectedRoute>
                    <Expenses />
                </ProtectedRoute>}/>
            <Route path="/stock-signals" element={<ProtectedRoute>
                  <StockSignals />
                </ProtectedRoute>}/>
            <Route path="/stock-adjustments" element={<ProtectedRoute>
                  <AdminRoute>
                    <StockAdjustmentHistory />
                  </AdminRoute>
                </ProtectedRoute>}/>
            <Route path="/subscription-payments" element={<ProtectedRoute>
                  <SuperAdminRoute>
                    <SubscriptionPayments />
                  </SuperAdminRoute>
                </ProtectedRoute>}/>
            <Route path="/notifications" element={<ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>}/>
            <Route path="*" element={<NotFound />}/>
      
            <Route path="/settings" element={<ProtectedRoute>
                  <Settings />
                </ProtectedRoute>}/>
            {/* Printer debug page removed for production builds */}
          </Routes>
        </StoreStatusChecker>
        </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>);
}
export default App;
