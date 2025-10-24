import { ReactNode, useState, useEffect } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
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
  Building2,
  Shield,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const network = useNetwork();
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

  const menuItems = [
  { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard', roles: ['admin', 'super_admin'] },
  { icon: ShoppingCart, label: 'Caisse', path: '/pos', roles: ['admin', 'cashier'] },
  { icon: Clock, label: 'Shifts', path: '/shifts', roles: ['admin', 'cashier'] },
  { icon: FileText, label: 'Reçus', path: '/receipts', roles: ['admin', 'cashier'] },
  { icon: Users, label: 'Clients', path: '/customers', roles: ['admin', 'cashier'] },
  { icon: AlertTriangle, label: 'Signalement Stock', path: '/stock-signals', roles: ['admin', 'cashier'] },
  { icon: Package, label: 'Produits', path: '/products', roles: ['admin'] },
  { icon: DollarSign, label: 'Dépenses', path: '/expenses', roles: ['admin', 'cashier'] },
  { icon: Building2, label: 'Catégories', path: '/categories', roles: ['admin', 'super_admin'] },
  { icon: UserCircle, label: 'Utilisateurs', path: '/users', roles: ['admin', 'super_admin'] }, 
  { icon: Store, label: 'Magasins', path: '/stores', roles: ['admin', 'super_admin'] },
  // Ajout gestion des abonnements pour super admin
  { icon: Shield, label: 'Abonnements', path: '/subscriptions', roles: ['super_admin'] },
  { icon: Menu, label: 'Paramètres', path: '/settings', roles: ['admin', 'cashier'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role || ''));

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMenuOpen(false);
  };

  const NavContent = () => (
    <nav className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-sidebar-foreground">Système POS</h2>
            <p className="text-xs text-sidebar-foreground/60">
              {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Caissier'}
            </p>
          </div>
        </div>
        {/* État réseau et bouton sync pour desktop */}
        <div className="hidden lg:flex flex-col gap-2 mt-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${network.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} title={network.isOnline ? 'En ligne' : 'Hors ligne'} aria-live="polite">
              {network.isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={network.manualSync}
              disabled={!network.isOnline || network.isSyncing}
              title={network.isSyncing ? 'Synchronisation...' : 'Synchroniser'}
              aria-label="Synchroniser"
              className="ml-2"
            >
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 10-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {network.isSyncing ? 'Sync...' : 'Synchroniser'}
            </Button>
          </div>
          {network.pendingCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-semibold">{network.pendingCount}</span>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-1">
        {filteredMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Button
              key={item.path}
              className={`w-full justify-start text-white bg-blue-600 hover:bg-blue-700 ${isActive ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              onClick={() => { navigate(item.path); setMenuOpen(false); }}
              variant="ghost"
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </Button>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="mb-3 p-3 bg-sidebar-accent rounded-lg">
          <p className="text-sm font-medium text-sidebar-foreground">{user?.username}</p>
          <p className="text-xs text-sidebar-foreground/60">
            {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Administrateur' : 'Caissier'}
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
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
  <header className="lg:hidden border-b border-border bg-card px-3 py-2 flex items-center justify-between gap-2 sticky top-0 z-30">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar" style={{ height: '100vh', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overflowY: 'auto' }}>
              <NavContent />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-bold text-sm">POS</h1>
          </div>
          
          {/* Statut réseau et bouton sync pour mobile uniquement */}
          <div className="flex lg:hidden items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${network.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} title={network.isOnline ? 'En ligne' : 'Hors ligne'} aria-live="polite">
              {network.isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={network.manualSync}
              disabled={!network.isOnline || network.isSyncing}
              title={network.isSyncing ? 'Synchronisation...' : 'Synchroniser'}
              aria-label="Synchroniser"
              className="ml-2"
            >
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 10-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {network.isSyncing ? 'Sync...' : 'Synchroniser'}
            </Button>
            {network.pendingCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-semibold">{network.pendingCount}</span>
            )}
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
