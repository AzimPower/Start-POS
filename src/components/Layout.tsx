import { ReactNode, useState, useEffect } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/NotificationBell';
import { refreshAllFromBackend, forceSyncNow, getPendingSyncSnapshot, type PendingSyncEntrySnapshot, type SyncLogSnapshot } from '@/lib/sync';
import { LayoutDashboard, ShoppingCart, Package, Users, LogOut, Menu, Clock, Store, UserCircle, FileText, DollarSign, AlertTriangle, Bell, Wifi, ChevronDown, CreditCard, Bug, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const network = useNetwork({ notifyOnStatusChange: true });
    const [isFullSyncing, setIsFullSyncing] = useState(false);
    const [showSyncDebug, setShowSyncDebug] = useState(false);
    const [isLoadingSyncDebug, setIsLoadingSyncDebug] = useState(false);
    const [pendingEntries, setPendingEntries] = useState<PendingSyncEntrySnapshot[]>([]);
    const [syncLogs, setSyncLogs] = useState<SyncLogSnapshot[]>([]);

    const loadSyncDebug = async () => {
        setIsLoadingSyncDebug(true);
        try {
            const snapshot = await getPendingSyncSnapshot();
            setPendingEntries(snapshot.pending);
            setSyncLogs(snapshot.logs);
        }
        catch (e) {
            setPendingEntries([]);
            setSyncLogs([]);
        }
        finally {
            setIsLoadingSyncDebug(false);
        }
    };

    // Handler pour synchronisation complete (queue + refresh)
    const handleFullSync = async () => {
        if (!network.isOnline || isFullSyncing)
            return;
        setIsFullSyncing(true);
        try {
            await forceSyncNow(); // flush la queue d'abord
            await refreshAllFromBackend(user?.storeId);
        }
        catch (e) {
        }
        finally {
            await network.refreshPendingCount();
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
        }
        catch (e) {
            // ignore storage errors
        }
    }, [location.pathname]);

    useEffect(() => {
        if (!showSyncDebug) {
            return;
        }
        loadSyncDebug().catch(() => { });
    }, [showSyncDebug]);

    const [menuOpen, setMenuOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
        principal: true,
        vente: true,
        gestion: true,
        // Par defaut, garder l'admin ouvert pour le super_admin
        admin: (typeof window !== 'undefined' && JSON.parse(localStorage.getItem('pos-user') || 'null')?.role === 'super_admin') || false,
    }));

    const menuItems = [
        // Rendre 'Tableau' disponible pour tous les roles
        { icon: LayoutDashboard, label: 'Tableau', path: '/dashboard', roles: ['admin', 'super_admin'], group: 'principal' },
        { icon: ShoppingCart, label: 'Vente', path: '/pos', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
        { icon: Clock, label: 'Services', path: '/shifts', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
        { icon: FileText, label: 'Recus', path: '/receipts', roles: ['admin', 'cashier', 'manager'], group: 'vente' },
        { icon: Users, label: 'Clients', path: '/customers', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
        { icon: DollarSign, label: 'Depenses', path: '/expenses', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
        { icon: AlertTriangle, label: 'Stock', path: '/stock-signals', roles: ['admin', 'cashier', 'manager'], group: 'gestion' },
        { icon: Package, label: 'Produits', path: '/products', roles: ['admin', 'manager'], group: 'gestion' },
        { icon: UserCircle, label: 'Utilisateurs', path: '/users', roles: ['admin', 'super_admin'], group: 'admin' },
        { icon: Store, label: 'Magasins', path: '/stores', roles: ['admin', 'super_admin'], group: 'admin' },
        { icon: CreditCard, label: 'Encaissements', path: '/subscription-payments', roles: ['super_admin'], group: 'admin' },
        { icon: Bell, label: 'Notifications', path: '/notifications', roles: ['super_admin'], group: 'admin' },
        { icon: Menu, label: 'Parametres', path: '/settings', roles: ['admin', 'cashier', 'manager'], group: 'admin' },
    ];

    const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role || ''));

    const groupOrder = ['principal', 'vente', 'gestion', 'admin'] as const;
    const groupLabels: Record<(typeof groupOrder)[number], string> = {
        principal: 'Essentiel',
        vente: 'Vente',
        gestion: 'Gestion',
        admin: 'Administration',
    };

    const toggleGroup = (group: (typeof groupOrder)[number]) => {
        // Ne pas permettre le collapse pour le super_admin (toujours ouvert)
        // Ne pas permettre le collapse pour la section 'principal' (Essentiel) - toujours ouverte
        if (user?.role === 'super_admin' || group === 'principal')
            return;
        setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
        setMenuOpen(false);
    };
    const formatTimestamp = (value?: number) => {
        if (!value) {
            return 'Inconnue';
        }
        return new Date(value).toLocaleString('fr-FR');
    };
    const NavContent = () => (<nav className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-md ring-1 ring-white/10">
            <ShoppingCart className="w-5 h-5 text-primary-foreground"/>
          </div>
          <div>
            <h2 className="font-bold text-sidebar-foreground">START POS</h2>
            <p className="text-xs text-sidebar-foreground/60">
              {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
            </p>
          </div>
        </div>
        {/* Etat reseau pour desktop */}
        <div className="hidden lg:flex flex-col gap-2 mt-4">
          
          <div className="flex items-center gap-2">
            <span title={network.isBackendReachable ? 'Serveur OK' : 'Serveur inaccessible'} aria-live="polite">
              <Wifi className={`w-4 h-4 mr-1 ${network.isBackendReachable ? 'text-green-700' : 'text-red-700'}`}/>
            </span>
            <NotificationBell align="start" buttonClassName="ml-1 h-8 w-8 rounded-full border border-sidebar-border/60 p-0 text-sidebar-foreground hover:bg-sidebar-accent/80" iconClassName="h-4 w-4"/>
            <Button variant="outline" size="sm" onClick={handleFullSync} disabled={!network.isBackendReachable || network.isSyncing || isFullSyncing} title={network.isSyncing || isFullSyncing ? 'Synchronisation...' : 'Synchroniser'} aria-label="Synchroniser" className="ml-2">
              <svg className={`w-4 h-4 mr-1 animate-spin ${isFullSyncing ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.2"/><path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
              {isFullSyncing ? 'Synchronisation...' : (network.isSyncing ? 'Sync...' : 'Synchroniser')}
            </Button>
          </div>
          {network.pendingCount > 0 && (<button type="button" onClick={() => setShowSyncDebug(true)} className="inline-flex items-center justify-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 transition-colors hover:bg-yellow-200" title="Voir le détail des synchronisations en attente">
              <Bug className="h-3.5 w-3.5"/>
              {network.pendingCount}
            </button>)}
        </div>
      </div>

      <div className="flex-1 p-4">
        {groupOrder.map((group) => {
            const items = filteredMenu.filter((item) => item.group === group);
            if (items.length === 0)
                return null;
            return (<div key={group} className="mb-4 last:mb-0">
              {(user?.role === 'super_admin' || group === 'principal') ? (<div className="flex w-full items-center justify-between px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  <span>{groupLabels[group]}</span>
                </div>) : (<button type="button" onClick={() => toggleGroup(group)} className="group flex w-full items-center justify-between px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors" aria-expanded={openGroups[group]}>
                  <span>{groupLabels[group]}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${openGroups[group] ? 'rotate-0' : '-rotate-90'}`}/>
                </button>)}
              <div className={`${group === 'principal' || user?.role === 'super_admin' || openGroups[group] ? 'block' : 'hidden'} space-y-1`}>
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (<Button key={item.path} className={`relative w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                            ? 'bg-sidebar-accent text-sidebar-foreground border border-sidebar-border/60 shadow-sm'
                            : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/70'}`} onClick={() => { navigate(item.path); setMenuOpen(false); }} variant="ghost">
                      {isActive && (<span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary"/>)}
                      <Icon className="w-5 h-5 mr-3"/>
                      {item.label}
                    </Button>);
                })}
              </div>
            </div>);
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="mb-3 p-3 bg-sidebar-accent/70 border border-sidebar-border/60 rounded-lg">
          <p className="text-sm font-medium text-sidebar-foreground">{user?.username}</p>
          <p className="text-xs text-sidebar-foreground/60">
            {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Administrateur' : user?.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
          </p>
        </div>
        <Button variant="ghost" className="w-full bg-white/10 text-white hover:bg-white/20 hover:shadow-sm" onClick={handleLogout} aria-label="Deconnexion">
          <LogOut className="w-4 h-4 mr-2 text-white"/>
          Deconnexion
        </Button>
      </div>
    </nav>);

    return (<div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-sidebar flex-col border-r border-sidebar-border z-40 overflow-y-auto sidebar-scrollable max-h-screen" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <NavContent />
      </aside>

      {/* Main Content */}
    <div className="flex-1 flex flex-col lg:ml-64 min-h-screen max-h-screen overflow-y-auto">
        {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-gradient-to-r from-blue-700 to-blue-500 shadow-lg">
          <div className="flex items-center justify-between px-3 py-2.5">
            {/* Left: Menu button */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 py-2 text-white hover:bg-white/15 hover:text-white rounded-xl" style={{ minWidth: 44, minHeight: 44 }}>
                  <Menu className="w-6 h-6 text-white"/>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar" style={{ height: '100vh', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overflowY: 'auto' }}>
                <NavContent />
              </SheetContent>
            </Sheet>

            {/* Center: App title */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-white"/>
              </div>
              <span className="font-bold text-white text-base tracking-wide">Systeme POS</span>
            </div>

            {/* Right: Network status + sync */}
            <div className="flex items-center gap-2">
              {/* Badge reseau */}
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${network.isBackendReachable
            ? 'bg-green-500 text-white shadow-sm'
            : 'bg-red-500 text-white shadow-sm'}`} title={network.isBackendReachable ? 'Serveur OK' : 'Serveur inaccessible'} aria-live="polite">
                <Wifi className="w-4 h-4"/>
              </span>

              <NotificationBell buttonClassName="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/25 p-0 text-white hover:bg-white/40" iconClassName="h-5 w-5"/>

              {/* Bouton sync */}
              <button onClick={handleFullSync} disabled={!network.isBackendReachable || network.isSyncing || isFullSyncing} title={network.isSyncing || isFullSyncing ? 'Synchronisation...' : 'Synchroniser'} aria-label="Synchroniser" className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/25 hover:bg-white/40 disabled:opacity-30 transition-colors border border-white/30">
                <svg className={`w-5 h-5 text-white ${isFullSyncing || network.isSyncing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Badge operations en attente */}
              {network.pendingCount > 0 && (<button type="button" onClick={() => setShowSyncDebug(true)} className="inline-flex min-w-[22px] items-center justify-center gap-1 rounded-full bg-yellow-400 px-1.5 text-[10px] font-bold text-yellow-900 shadow" title="Voir le détail des synchronisations en attente">
                  <Bug className="h-3 w-3"/>
                  {network.pendingCount}
                </button>)}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 pt-[64px] lg:pt-0">
          {children}
        </main>
      </div>
      <Dialog open={showSyncDebug} onOpenChange={setShowSyncDebug}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Diagnostic synchronisation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-sm text-muted-foreground">
                {network.pendingCount} élément(s) signalé(s) en attente
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => loadSyncDebug()} disabled={isLoadingSyncDebug}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingSyncDebug ? 'animate-spin' : ''}`}/>
                Actualiser
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Opérations en attente</h3>
              <div className="max-h-[34vh] space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-background p-2">
                {pendingEntries.length === 0 ? (<div className="px-2 py-3 text-sm text-muted-foreground">Aucune opération en attente dans les files locales.</div>) : (pendingEntries.map((entry) => (<div key={`${entry.source}-${entry.id}`} className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                        <span>{entry.table || 'table inconnue'}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] uppercase text-slate-700">{entry.source}</span>
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] uppercase text-blue-700">{entry.method || entry.operation || 'POST'}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>ID: {String(entry.id)}</div>
                        <div>URL: {entry.url || 'inconnue'}</div>
                        <div>Créée: {formatTimestamp(entry.createdAt)}</div>
                        <div>Tentatives: {entry.attempts ?? 0}</div>
                        {entry.storeId ? <div>Store: {entry.storeId}</div> : null}
                        {entry.lastError ? <div>Erreur: {entry.lastError}</div> : null}
                        {entry.data ? <div className="rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100">{JSON.stringify(entry.data, null, 2)}</div> : null}
                      </div>
                    </div>)))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Derniers logs de sync</h3>
              <div className="max-h-[26vh] space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-background p-2">
                {syncLogs.length === 0 ? (<div className="px-2 py-3 text-sm text-muted-foreground">Aucun log disponible.</div>) : (syncLogs.map((entry) => (<div key={entry.id} className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                        <span>{entry.message}</span>
                        <span className={`rounded px-2 py-0.5 text-[11px] uppercase ${entry.level === 'error' ? 'bg-red-100 text-red-700' : entry.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{entry.level}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>Quand: {formatTimestamp(entry.createdAt)}</div>
                        {entry.entity ? <div>Entité: {entry.entity}</div> : null}
                        {entry.details ? <div className="rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100">{JSON.stringify(entry.details, null, 2)}</div> : null}
                      </div>
                    </div>)))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>);
}
