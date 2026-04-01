import { ReactNode, useState, useEffect } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { refreshAllFromBackend, forceSyncNow } from '@/lib/sync';
import { getDB } from '@/lib/db';

import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  LogOut,
  Menu,
  Clock,
  Store,
  UserCircle,
  FileText,
  Shield,
  DollarSign,
  AlertTriangle,
  Wifi,
  ChevronDown,
  CreditCard,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const network = useNetwork();
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [storeCount, setStoreCount] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    getDB().then(db => db.getAll('stores')).then(stores => {
      if (user.role === 'super_admin') {
        setStoreCount(stores.filter(s => s.active !== false).length);
      } else {
        // Pour un admin, ne compter que les magasins auxquels il est lié
        const userStoreIds: string[] = (user as any).storeIds?.length > 0
          ? (user as any).storeIds
          : (user.storeId ? [user.storeId] : []);
        setStoreCount(stores.filter(s => s.active !== false && userStoreIds.includes(s.id)).length);
      }
    }).catch(() => {});
  }, [user]);

  // Handler pour synchronisation complète (queue + refresh)
  const handleFullSync = async () => {
    if (!network.isOnline || isFullSyncing) return;
    setIsFullSyncing(true);
    try {
      await forceSyncNow(); // flush la queue d'abord
      await refreshAllFromBackend(user?.storeId);
    } catch (e) {
      // Optionnel: toast ou log d'erreur
      console.warn('Erreur lors de la synchronisation complète', e);
    } finally {
      setIsFullSyncing(false);
    }
  };
  const navigate = useNavigate();
  const location = useLocation();
  // Save the last active path so we can restore it after PIN unlock.
  useEffect(() => {
    try {
      const path = location.pathname || '/dashboard';
      // Don't save the lock or login screens as 'last'
      if (path !== '/pin' && path !== '/login') {
        localStorage.setItem('pos-last-path', path);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [location.pathname]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    principal: true,
    vente: true,
    gestion: true,
    // Par défaut, garder l'admin ouvert pour le super_admin
    admin: (typeof window !== 'undefined' && JSON.parse(localStorage.getItem('pos-user') || 'null')?.role === 'super_admin') || false,
  }));

  const menuItems = [
    // Rendre 'Tableau' disponible pour tous les rôles
    { icon: LayoutDashboard, label: 'Tableau', path: '/dashboard', roles: ['admin', 'super_admin'], group: 'principal' },
    { icon: ShoppingCart, label: 'Vente', path: '/pos', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
    { icon: Clock, label: 'Services', path: '/shifts', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
    { icon: FileText, label: 'Reçus', path: '/receipts', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
    { icon: Users, label: 'Clients', path: '/customers', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
    { icon: DollarSign, label: 'Dépenses', path: '/expenses', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
    { icon: AlertTriangle, label: 'Stock', path: '/stock-signals', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
    { icon: Package, label: 'Produits', path: '/products', roles: ['admin', 'manager'], group: 'gestion' },
    { icon: UserCircle, label: 'Utilisateurs', path: '/users', roles: ['admin', 'super_admin'], group: 'admin' },
    { icon: Store, label: 'Magasins', path: '/stores', roles: ['admin', 'super_admin'], group: 'admin' },
    { icon: CreditCard, label: 'Encaissements', path: '/subscription-payments', roles: ['super_admin'], group: 'admin' },
    
    { icon: Menu, label: 'Paramètres', path: '/settings', roles: ['admin', 'cashier', 'manager'], group: 'admin' },
  ];

  const filteredMenu = menuItems.filter(item => {
    if (!item.roles.includes(user?.role || '')) return false;
    // Masquer "Magasins" pour les non-super_admin s'il y a moins de 2 magasins
    if (item.path === '/stores' && user?.role !== 'super_admin' && storeCount < 2) return false;
    return true;
  });
  const groupOrder = ['principal', 'vente', 'gestion', 'admin'] as const;
  const groupLabels: Record<(typeof groupOrder)[number], string> = {
    principal: 'Essentiel',
    vente: 'Vente',
    gestion: 'Gestion',
    admin: 'Administration',
  };
  const toggleGroup = (group: (typeof groupOrder)[number]) => {
    // Ne pas permettre le collapse pour le super_admin (toujours ouvert)
    // Ne pas permettre le collapse pour la section 'principal' (Essentiel) — toujours ouverte
    if (user?.role === 'super_admin' || group === 'principal') return;
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMenuOpen(false);
  };

  const NavContent = () => (
    <nav className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-md ring-1 ring-white/10">
            <ShoppingCart className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-sidebar-foreground">Système POS</h2>
            <p className="text-xs text-sidebar-foreground/60">
              {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
            </p>
          </div>
        </div>
        {/* État réseau pour desktop */}
        <div className="hidden lg:flex flex-col gap-2 mt-4">
          
          <div className="flex items-center gap-2">
            <span
              title={network.isBackendReachable ? 'Serveur OK' : 'Serveur inaccessible'}
              aria-live="polite"
            >
              <Wifi className={`w-4 h-4 mr-1 ${network.isBackendReachable ? 'text-green-700' : 'text-red-700'}`} />
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFullSync}
              disabled={!network.isBackendReachable || network.isSyncing || isFullSyncing}
              title={network.isSyncing || isFullSyncing ? 'Synchronisation...' : 'Synchroniser'}
              aria-label="Synchroniser"
              className="ml-2"
            >
              <svg className={`w-4 h-4 mr-1 animate-spin ${isFullSyncing ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.2"/><path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
              {isFullSyncing ? 'Synchronisation...' : (network.isSyncing ? 'Sync...' : 'Synchroniser')}
            </Button>
          </div>
          {network.pendingCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-semibold">{network.pendingCount}</span>
          )}
        </div>
      </div>

      <div className="flex-1 p-4">
        {groupOrder.map((group) => {
          const items = filteredMenu.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-4 last:mb-0">
              {(user?.role === 'super_admin' || group === 'principal') ? (
                <div className="flex w-full items-center justify-between px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  <span>{groupLabels[group]}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="group flex w-full items-center justify-between px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  aria-expanded={openGroups[group]}
                >
                  <span>{groupLabels[group]}</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${openGroups[group] ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
              )}
              <div className={`${group === 'principal' || user?.role === 'super_admin' || openGroups[group] ? 'block' : 'hidden'} space-y-1`}>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Button
                      key={item.path}
                      className={`relative w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-foreground border border-sidebar-border/60 shadow-sm'
                          : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/70'
                      }`}
                      onClick={() => { navigate(item.path); setMenuOpen(false); }}
                      variant="ghost"
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary" />
                      )}
                      <Icon className="w-5 h-5 mr-3" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="mb-3 p-3 bg-sidebar-accent/70 border border-sidebar-border/60 rounded-lg">
          <p className="text-sm font-medium text-sidebar-foreground">{user?.username}</p>
          <p className="text-xs text-sidebar-foreground/60">
            {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Administrateur' : user?.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full bg-white/10 text-white hover:bg-white/20 hover:shadow-sm"
          onClick={handleLogout}
          aria-label="Déconnexion"
        >
          <LogOut className="w-4 h-4 mr-2 text-white" />
          Déconnexion
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-sidebar flex-col border-r border-sidebar-border z-40 overflow-y-auto sidebar-scrollable max-h-screen" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <NavContent />
      </aside>

      {/* Main Content */}
  <div className="flex-1 flex flex-col lg:ml-64 min-h-screen max-h-screen overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-500 shadow-lg">
          <div className="flex items-center justify-between px-3 py-2.5">
            {/* Left: Menu button */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 px-2 py-2 text-white hover:bg-white/15 hover:text-white rounded-xl"
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <Menu className="w-6 h-6 text-white" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar" style={{ height: '100vh', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overflowY: 'auto' }}>
                <NavContent />
              </SheetContent>
            </Sheet>

            {/* Center: App title */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-base tracking-wide">Système POS</span>
            </div>

            {/* Right: Network status + sync */}
            <div className="flex items-center gap-2">
              {/* Badge réseau */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  network.isBackendReachable
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'bg-red-500 text-white shadow-sm'
                }`}
                title={network.isBackendReachable ? 'Serveur OK' : 'Serveur inaccessible'}
                aria-live="polite"
              >
                <Wifi className="w-4 h-4" />
                <span>{network.isBackendReachable ? 'OK' : 'Offline'}</span>
              </span>

              {/* Bouton sync */}
              <button
                onClick={handleFullSync}
                disabled={!network.isBackendReachable || network.isSyncing || isFullSyncing}
                title={network.isSyncing || isFullSyncing ? 'Synchronisation...' : 'Synchroniser'}
                aria-label="Synchroniser"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/25 hover:bg-white/40 disabled:opacity-30 transition-colors border border-white/30"
              >
                <svg
                  className={`w-5 h-5 text-white ${isFullSyncing || network.isSyncing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Badge opérations en attente */}
              {network.pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900 shadow">
                  {network.pendingCount}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
