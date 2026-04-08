import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, } from 'recharts';
import { Store, Users, TrendingUp, AlertTriangle, CheckCircle, XCircle, RefreshCw, Crown, Building2, UserCheck, ShoppingCart, Calendar, ArrowUpRight, ArrowDownRight, Clock, CreditCard, Activity, ShieldCheck, Wallet, BarChart3, Settings, Eye, } from 'lucide-react';
import { format, isAfter, isBefore, addDays, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
const BACKEND = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
interface StoreData {
    id: string;
    name: string;
    address?: string;
    active: number;
    createdAt: number;
    subscriptionStart?: number;
    subscriptionEnd?: number;
    lastPayment?: number;
    balance?: number;
    [key: string]: any;
}
interface UserData {
    id: string;
    username: string;
    role: 'super_admin' | 'admin' | 'cashier' | 'manager';
    storeId?: string;
    storeIds?: string[];
    email?: string;
    createdAt?: number;
}
interface StoreStats {
    storeId: string;
    storeName: string;
    revenue: number;
    transactions: number;
}
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
function StatCard({ title, value, subtitle, icon: Icon, trend, color, onClick, }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    trend?: {
        value: number;
        label: string;
    };
    color?: string;
    onClick?: () => void;
}) {
    return (<Card className={`cursor-pointer hover:shadow-md transition-shadow ${onClick ? 'hover:border-primary/50' : ''}`} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend && (<div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend.value >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                {Math.abs(trend.value).toFixed(1)}% {trend.label}
              </div>)}
          </div>
          <div className={`p-2.5 rounded-xl ${color || 'bg-primary/10'}`}>
            <Icon size={20} className={color ? 'text-white' : 'text-primary'}/>
          </div>
        </div>
      </CardContent>
    </Card>);
}
function SubscriptionBadge({ store }: {
    store: StoreData;
}) {
    const now = Date.now();
    if (!store.subscriptionEnd) {
        return <Badge variant="secondary" className="text-xs">Sans abonnement</Badge>;
    }
    const end = store.subscriptionEnd;
    const daysLeft = differenceInDays(end, now);
    if (daysLeft < 0) {
        return <Badge variant="destructive" className="text-xs">Expiré</Badge>;
    }
    if (daysLeft <= 7) {
        return <Badge className="bg-orange-500 text-white text-xs">{daysLeft}j restants</Badge>;
    }
    if (daysLeft <= 30) {
        return <Badge className="bg-yellow-500 text-white text-xs">{daysLeft}j restants</Badge>;
    }
    return <Badge className="bg-green-500 text-white text-xs">Actif · {daysLeft}j</Badge>;
}
export default function SuperAdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stores, setStores] = useState<StoreData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [monthlyRevenue, setMonthlyRevenue] = useState<{
        month: string;
        revenue: number;
    }[]>([]);
    interface PaymentRecord {
        id: string;
        storeId: string;
        storeName: string;
        months: number;
        amount: number;
        paidAt: number;
        note?: string;
    }
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [paymentsTotal, setPaymentsTotal] = useState(0);
    const [paymentsFilter, setPaymentsFilter] = useState<string>('all');
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [storesRes, usersRes] = await Promise.all([
                fetch(`${BACKEND}/api/stores.php?include_inactive=1`),
                fetch(`${BACKEND}/api/users.php`),
            ]);
            if (storesRes.ok) {
                const data: StoreData[] = await storesRes.json();
                setStores(data);
                // Load per-store stats for the current month
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                const endOfMonth = now.getTime();
                const statsPromises = data.map((store) => fetch(`${BACKEND}/api/sales_stats.php?storeId=${store.id}&start=${startOfMonth}&end=${endOfMonth}&groupBy=months`)
                    .then((r) => (r.ok ? r.json() : null))
                    .then((json) => ({
                    storeId: store.id,
                    storeName: store.name,
                    revenue: json?.recapStats?.ventesNettes ?? json?.recapStats?.ventesBrutes ?? 0,
                    transactions: json?.recapStats?.transactions ?? 0,
                }))
                    .catch(() => ({ storeId: store.id, storeName: store.name, revenue: 0, transactions: 0 })));
                const statsResults = await Promise.all(statsPromises);
                setStoreStats(statsResults);
                // Fetch last 6 months global revenue
                const monthsData: {
                    month: string;
                    revenue: number;
                }[] = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const start = d.getTime();
                    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
                    try {
                        const res = await fetch(`${BACKEND}/api/sales_stats.php?start=${start}&end=${end}&groupBy=months`);
                        if (res.ok) {
                            const json = await res.json();
                            monthsData.push({
                                month: format(d, 'MMM yy', { locale: fr }),
                                revenue: json?.recapStats?.ventesNettes ?? json?.recapStats?.ventesBrutes ?? 0,
                            });
                        }
                        else {
                            monthsData.push({ month: format(d, 'MMM yy', { locale: fr }), revenue: 0 });
                        }
                    }
                    catch {
                        monthsData.push({ month: format(d, 'MMM yy', { locale: fr }), revenue: 0 });
                    }
                }
                setMonthlyRevenue(monthsData);
            }
            if (usersRes.ok) {
                const data: UserData[] = await usersRes.json();
                setUsers(data);
            }
            // Load encaissements
            try {
                const pRes = await fetch(`${BACKEND}/api/subscription_payments.php?limit=500`);
                if (pRes.ok) {
                    const pJson = await pRes.json();
                    setPayments(pJson.data || []);
                    setPaymentsTotal(pJson.total || 0);
                }
            }
            catch (e) {
                // non-blocking
            }
        }
        catch (err) {
            toast.error('Erreur lors du chargement des données');
        }
        finally {
            setIsLoading(false);
            setLastRefresh(new Date());
        }
    }, []);
    useEffect(() => {
        loadData();
    }, [loadData]);
    // ── Computed stats ──────────────────────────────────────────────────────────
    const activeStores = stores.filter((s) => s.active === 1 || s.active as any === true);
    const inactiveStores = stores.filter((s) => !activeStores.includes(s));
    const now = Date.now();
    const expiringStores = activeStores.filter((s) => {
        if (!s.subscriptionEnd)
            return false;
        const d = differenceInDays(s.subscriptionEnd, now);
        return d >= 0 && d <= 30;
    });
    const expiredStores = stores.filter((s) => s.subscriptionEnd && s.subscriptionEnd < now);
    const totalRevThisMonth = storeStats.reduce((acc, s) => acc + (s.revenue || 0), 0);
    const topStores = [...storeStats].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const roleCount = users.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const roleChartData = [
        { name: 'Super Admin', value: roleCount['super_admin'] || 0 },
        { name: 'Admin', value: roleCount['admin'] || 0 },
        { name: 'Manager', value: roleCount['manager'] || 0 },
        { name: 'Caissier', value: roleCount['cashier'] || 0 },
    ].filter((d) => d.value > 0);
    const storeStatusData = [
        { name: 'Actifs', value: activeStores.length },
        { name: 'Inactifs', value: inactiveStores.length },
    ].filter((d) => d.value > 0);
    const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n);
    if (isLoading) {
        return (<div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"/>
        <p className="text-muted-foreground text-sm">Chargement du tableau de bord…</p>
      </div>);
    }
    return (<div className="min-h-screen bg-background">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-4 pt-6 pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown size={18} className="text-yellow-300"/>
                <span className="text-indigo-200 text-sm font-medium">Propriétaire SAS</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                Bonjour, {user?.username || 'Super Admin'} 👋
              </h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-indigo-200 text-xs">Dernière sync</p>
                <p className="text-white text-xs font-medium">{format(lastRefresh, 'HH:mm:ss')}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadData} className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/stores')} className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                <Settings size={14}/>
              </Button>
            </div>
          </div>

          {/* ── Alert banners ─────────────────────────────────────────── */}
          {(expiringStores.length > 0 || expiredStores.length > 0) && (<div className="mt-4 flex flex-wrap gap-2">
              {expiredStores.length > 0 && (<div className="flex items-center gap-1.5 bg-red-500/20 border border-red-400/40 rounded-lg px-3 py-1.5 text-sm text-red-100">
                  <XCircle size={14}/>
                  <span>{expiredStores.length} abonnement{expiredStores.length > 1 ? 's' : ''} expiré{expiredStores.length > 1 ? 's' : ''}</span>
                </div>)}
              {expiringStores.length > 0 && (<div className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-400/40 rounded-lg px-3 py-1.5 text-sm text-yellow-100">
                  <AlertTriangle size={14}/>
                  <span>{expiringStores.length} expir{expiringStores.length > 1 ? 'ent' : 'e'} bientôt</span>
                </div>)}
            </div>)}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-4 pb-10 space-y-6">
        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="Magasins actifs" value={activeStores.length} subtitle={`${inactiveStores.length} inactif${inactiveStores.length !== 1 ? 's' : ''}`} icon={Store} color="bg-indigo-500" onClick={() => navigate('/stores')}/>
          <StatCard title="Utilisateurs" value={users.length} subtitle={`${roleCount['admin'] || 0} admins · ${roleCount['cashier'] || 0} caissiers`} icon={Users} color="bg-purple-500" onClick={() => navigate('/users')}/>
          <StatCard title="CA ce mois" value={formatCurrency(totalRevThisMonth)} subtitle="Toutes boutiques confondues" icon={TrendingUp} color="bg-emerald-500"/>
          <StatCard title="Alertes abonnements" value={expiredStores.length + expiringStores.length} subtitle={`${expiredStores.length} expirés · ${expiringStores.length} proches`} icon={AlertTriangle} color={expiredStores.length > 0 ? 'bg-red-500' : expiringStores.length > 0 ? 'bg-orange-500' : 'bg-slate-400'}/>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full md:w-auto md:inline-flex">
            <TabsTrigger value="overview"><BarChart3 size={14} className="mr-1.5"/>Vue globale</TabsTrigger>
            <TabsTrigger value="stores"><Store size={14} className="mr-1.5"/>Boutiques</TabsTrigger>
            <TabsTrigger value="subscriptions"><CreditCard size={14} className="mr-1.5"/>Abonnements</TabsTrigger>
            <TabsTrigger value="users"><Users size={14} className="mr-1.5"/>Utilisateurs</TabsTrigger>
          </TabsList>

          {/* ── TAB: Overview ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Revenue trend (6 months) */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity size={16} className="text-indigo-500"/>
                    Chiffre d'affaires mensuel (6 derniers mois)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}/>
                      <Tooltip formatter={(v: number) => formatCurrency(v)}/>
                      <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name="Revenus"/>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Store status pie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Building2 size={16} className="text-purple-500"/>
                    Statut des boutiques
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={storeStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value">
                        {storeStatusData.map((_, i) => (<Cell key={i} fill={i === 0 ? '#22c55e' : '#94a3b8'}/>))}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950">
                      <p className="text-lg font-bold text-green-600">{activeStores.length}</p>
                      <p className="text-xs text-muted-foreground">Actives</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <p className="text-lg font-bold text-slate-500">{inactiveStores.length}</p>
                      <p className="text-xs text-muted-foreground">Inactives</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top stores by revenue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500"/>
                  Top boutiques — CA du mois
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topStores.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-4">Aucune donnée disponible</p>) : (topStores.map((s, i) => {
            const maxRev = topStores[0].revenue || 1;
            const pct = maxRev > 0 ? Math.round((s.revenue / maxRev) * 100) : 0;
            return (<div key={s.storeId} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-sm font-medium truncate">{s.storeName}</span>
                            <span className="text-sm font-semibold text-emerald-600 ml-2 shrink-0">{formatCurrency(s.revenue)}</span>
                          </div>
                          <Progress value={pct} className="h-1.5"/>
                        </div>
                      </div>);
        }))}
              </CardContent>
            </Card>

            {/* Role distribution */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <UserCheck size={16} className="text-blue-500"/>
                    Répartition des rôles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={roleChartData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {roleChartData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]}/>))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck size={16} className="text-indigo-500"/>
                    Résumé des accès
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  {[
            { label: 'Super Admins', count: roleCount['super_admin'] || 0, color: 'bg-indigo-500', icon: Crown },
            { label: 'Admins boutique', count: roleCount['admin'] || 0, color: 'bg-purple-500', icon: ShieldCheck },
            { label: 'Managers', count: roleCount['manager'] || 0, color: 'bg-blue-500', icon: UserCheck },
            { label: 'Caissiers', count: roleCount['cashier'] || 0, color: 'bg-emerald-500', icon: ShoppingCart },
        ].map((r) => (<div key={r.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${r.color}`}>
                          <r.icon size={12} className="text-white"/>
                        </div>
                        <span className="text-sm">{r.label}</span>
                      </div>
                      <Badge variant="secondary" className="font-bold">{r.count}</Badge>
                    </div>))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── TAB: Stores ────────────────────────────────────────────── */}
          <TabsContent value="stores" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{stores.length} boutique{stores.length !== 1 ? 's' : ''} au total</p>
              <Button size="sm" variant="outline" onClick={() => navigate('/stores')}>
                <Settings size={13} className="mr-1.5"/>
                Gérer
              </Button>
            </div>
            <div className="space-y-2">
              {stores.map((store) => {
            const stats = storeStats.find((s) => s.storeId === store.id);
            const storeUsers = users.filter((u) => u.storeId === store.id ||
                (u.storeIds && u.storeIds.includes(store.id)));
            return (<Card key={store.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg mt-0.5 ${store.active ? 'bg-green-100 dark:bg-green-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <Store size={16} className={store.active ? 'text-green-600' : 'text-slate-400'}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <h3 className="font-semibold text-sm truncate">{store.name}</h3>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={store.active ? 'default' : 'secondary'} className={`text-xs ${store.active ? 'bg-green-500' : ''}`}>
                                {store.active ? 'Actif' : 'Inactif'}
                              </Badge>
                              <SubscriptionBadge store={store}/>
                            </div>
                          </div>
                          {store.address && (<p className="text-xs text-muted-foreground mt-0.5 truncate">{store.address}</p>)}
                          <div className="flex flex-wrap gap-3 mt-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users size={11}/>
                              <span>{storeUsers.length} utilisateur{storeUsers.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Wallet size={11}/>
                              <span>{formatCurrency(stats?.revenue || 0)} / mois</span>
                            </div>
                            {store.subscriptionEnd && (<div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar size={11}/>
                                <span>
                                  {store.subscriptionEnd < now
                        ? `Expiré le ${format(store.subscriptionEnd, 'dd/MM/yy')}`
                        : `Expire le ${format(store.subscriptionEnd, 'dd/MM/yy')}`}
                                </span>
                              </div>)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>);
        })}
              {stores.length === 0 && (<div className="text-center py-10 text-muted-foreground text-sm">
                  Aucune boutique enregistrée
                </div>)}
            </div>
          </TabsContent>

          {/* ── TAB: Subscriptions ─────────────────────────────────────── */}
          <TabsContent value="subscriptions" className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="text-center">
                <CardContent className="p-4">
                  <CheckCircle size={20} className="text-green-500 mx-auto mb-1"/>
                  <p className="text-xl font-bold">
                    {activeStores.filter((s) => s.subscriptionEnd && s.subscriptionEnd > now).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Abonnements actifs</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-4">
                  <Clock size={20} className="text-orange-500 mx-auto mb-1"/>
                  <p className="text-xl font-bold">{expiringStores.length}</p>
                  <p className="text-xs text-muted-foreground">Expirent ≤ 30j</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-4">
                  <XCircle size={20} className="text-red-500 mx-auto mb-1"/>
                  <p className="text-xl font-bold">{expiredStores.length}</p>
                  <p className="text-xs text-muted-foreground">Expirés</p>
                </CardContent>
              </Card>
            </div>

            {/* Expiring soon */}
            {expiringStores.length > 0 && (<Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
                    <AlertTriangle size={15}/>
                    Expirent bientôt (30 jours)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3 pt-0">
                  {expiringStores
                .sort((a, b) => (a.subscriptionEnd || 0) - (b.subscriptionEnd || 0))
                .map((store) => {
                const days = differenceInDays(store.subscriptionEnd!, now);
                return (<div key={store.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900">
                          <div className="flex items-center gap-2">
                            <Store size={14} className="text-orange-500"/>
                            <span className="text-sm font-medium">{store.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-orange-600 font-medium">
                              {format(store.subscriptionEnd!, 'dd/MM/yyyy')}
                            </span>
                            <Badge className="bg-orange-500 text-white text-xs">{days}j</Badge>
                          </div>
                        </div>);
            })}
                </CardContent>
              </Card>)}

            {/* Expired */}
            {expiredStores.length > 0 && (<Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
                    <XCircle size={15}/>
                    Abonnements expirés
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3 pt-0">
                  {expiredStores.map((store) => (<div key={store.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                      <div className="flex items-center gap-2">
                        <Store size={14} className="text-red-500"/>
                        <span className="text-sm font-medium">{store.name}</span>
                      </div>
                      <span className="text-xs text-red-600 font-medium">
                        Expiré le {format(store.subscriptionEnd!, 'dd/MM/yyyy')}
                      </span>
                    </div>))}
                </CardContent>
              </Card>)}

            {/* ── Encaissements ─────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wallet size={15} className="text-emerald-500"/>
                  Encaissements abonnements
                  <span className="ml-auto text-base font-bold text-emerald-600">
                    {new Intl.NumberFormat('fr-FR').format(paymentsTotal)} F
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-3">
                {/* Filter by store */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Filtrer :</span>
                  <button className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${paymentsFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`} onClick={() => setPaymentsFilter('all')}>
                    Tous
                  </button>
                  {stores.map(s => (<button key={s.id} className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${paymentsFilter === s.id ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`} onClick={() => setPaymentsFilter(s.id)}>
                      {s.name}
                    </button>))}
                </div>

                {/* Per-store summary */}
                {paymentsFilter === 'all' && (<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {stores.map(s => {
                const storePayments = payments.filter(p => p.storeId === s.id);
                const storeTotal = storePayments.reduce((a, p) => a + Number(p.amount), 0);
                if (storeTotal === 0)
                    return null;
                return (<div key={s.id} className="p-2.5 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
                          <p className="text-xs font-semibold truncate">{s.name}</p>
                          <p className="text-sm font-bold text-emerald-700 mt-0.5">
                            {new Intl.NumberFormat('fr-FR').format(storeTotal)} F
                          </p>
                          <p className="text-xs text-muted-foreground">{storePayments.length} paiement{storePayments.length > 1 ? 's' : ''}</p>
                        </div>);
            })}
                  </div>)}

                {/* Payment list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Boutique</th>
                        <th className="text-center p-2.5 text-xs font-semibold text-muted-foreground">Mois</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments
            .filter(p => paymentsFilter === 'all' || p.storeId === paymentsFilter)
            .slice(0, 50)
            .map(p => (<tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {format(p.paidAt, 'dd/MM/yyyy HH:mm')}
                            </td>
                            <td className="p-2.5 font-medium">{p.storeName}</td>
                            <td className="p-2.5 text-center">
                              <Badge variant="secondary" className="text-xs">{p.months} mois</Badge>
                            </td>
                            <td className="p-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">
                              {new Intl.NumberFormat('fr-FR').format(Number(p.amount))} F
                            </td>
                          </tr>))}
                    </tbody>
                  </table>
                  {payments.filter(p => paymentsFilter === 'all' || p.storeId === paymentsFilter).length === 0 && (<p className="text-center py-6 text-sm text-muted-foreground">Aucun encaissement enregistré</p>)}
                </div>
              </CardContent>
            </Card>

            {/* All subscriptions table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard size={15} className="text-indigo-500"/>
                  Récapitulatif abonnements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Boutique</th>
                        <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Début</th>
                        <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Fin</th>
                        <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((store) => (<tr key={store.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 font-medium">{store.name}</td>
                          <td className="p-3 text-muted-foreground">
                            {store.subscriptionStart ? format(store.subscriptionStart, 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {store.subscriptionEnd ? format(store.subscriptionEnd, 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="p-3">
                            <SubscriptionBadge store={store}/>
                          </td>
                        </tr>))}
                    </tbody>
                  </table>
                  {stores.length === 0 && (<p className="text-center py-6 text-sm text-muted-foreground">Aucune boutique</p>)}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: Users ─────────────────────────────────────────────── */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{users.length} utilisateur{users.length !== 1 ? 's' : ''} au total</p>
              <Button size="sm" variant="outline" onClick={() => navigate('/users')}>
                <Settings size={13} className="mr-1.5"/>
                Gérer
              </Button>
            </div>
            {/* Per-store user breakdown */}
            {activeStores.map((store) => {
            const storeUsers = users.filter((u) => u.storeId === store.id ||
                (u.storeIds && u.storeIds.includes(store.id)));
            if (storeUsers.length === 0)
                return null;
            return (<Card key={store.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Store size={14} className="text-indigo-500"/>
                      {store.name}
                      <Badge variant="secondary" className="ml-auto">{storeUsers.length} utilisateur{storeUsers.length !== 1 ? 's' : ''}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-1.5">
                    {storeUsers.map((u) => (<div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.username}</p>
                            {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                          </div>
                        </div>
                        <Badge variant="secondary" className={`text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                        : u.role === 'manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                          {u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager' : 'Caissier'}
                        </Badge>
                      </div>))}
                  </CardContent>
                </Card>);
        })}

            {/* Users without a store */}
            {(() => {
            const orphans = users.filter((u) => u.role !== 'super_admin' &&
                !u.storeId &&
                (!u.storeIds || u.storeIds.length === 0));
            if (orphans.length === 0)
                return null;
            return (<Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <AlertTriangle size={14} className="text-yellow-500"/>
                      Utilisateurs sans boutique assignée ({orphans.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-1.5">
                    {orphans.map((u) => (<div key={u.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                        <span className="text-sm">{u.username}</span>
                        <Badge variant="secondary" className="text-xs">{u.role}</Badge>
                      </div>))}
                  </CardContent>
                </Card>);
        })()}
          </TabsContent>
        </Tabs>

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
            { label: 'Gérer les boutiques', icon: Store, path: '/stores', color: 'bg-indigo-500' },
            { label: 'Gérer les utilisateurs', icon: Users, path: '/users', color: 'bg-purple-500' },
            { label: 'Voir les rapports', icon: BarChart3, path: '/dashboard', color: 'bg-emerald-500' },
            { label: 'Paramètres', icon: Settings, path: '/settings', color: 'bg-slate-500' },
        ].map((action) => (<button key={action.path} onClick={() => navigate(action.path)} className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:bg-muted/40 transition-colors text-center">
                  <div className={`p-2.5 rounded-xl ${action.color}`}>
                    <action.icon size={18} className="text-white"/>
                  </div>
                  <span className="text-xs font-medium">{action.label}</span>
                </button>))}
            </div>
          </CardContent>
        </Card>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="text-center text-xs text-muted-foreground py-2">
          <Crown size={12} className="inline mr-1 text-yellow-500"/>
          Accès propriétaire · SAS · Données en temps réel
        </div>
      </div>
    </div>);
}
