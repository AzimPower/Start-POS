import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, } from 'recharts';
import { Store, Users, TrendingUp, AlertTriangle, CheckCircle, XCircle, RefreshCw, Crown, Building2, UserCheck, ShoppingCart, Calendar, ArrowUpRight, ArrowDownRight, Clock, CreditCard, Activity, ShieldCheck, Wallet, BarChart3, Settings, Eye, } from 'lucide-react';
import { format, isAfter, isBefore, addDays, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { BACKEND_BASE } from '@/lib/backend';
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
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground break-words">{title}</p>
            <p className="mt-1 break-words text-xl font-bold leading-tight sm:text-2xl">{value}</p>
            {subtitle && <p className="mt-1 break-words text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (<div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend.value >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                {Math.abs(trend.value).toFixed(1)}% {trend.label}
              </div>)}
          </div>
          <div className={`shrink-0 p-2.5 rounded-xl ${color || 'bg-primary/10'}`}>
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
                fetch(`${BACKEND_BASE}/api/stores.php?include_inactive=1`),
                fetch(`${BACKEND_BASE}/api/users.php`),
            ]);
            if (storesRes.ok) {
                const rawStores = await storesRes.json();
                const data: StoreData[] = Array.isArray(rawStores) ? rawStores : [];
                setStores(data);
                // Load per-store stats for the current month
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                const endOfMonth = now.getTime();
                const statsPromises = data.map((store) => fetch(`${BACKEND_BASE}/api/sales_stats.php?storeId=${store.id}&start=${startOfMonth}&end=${endOfMonth}&groupBy=months`)
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
            }
            if (usersRes.ok) {
                const rawUsers = await usersRes.json();
                const data: UserData[] = Array.isArray(rawUsers) ? rawUsers : [];
                setUsers(data);
            }
            // Load encaissements
            try {
                const pRes = await fetch(`${BACKEND_BASE}/api/subscription_payments.php?limit=500`);
                if (pRes.ok) {
                    const pJson = await pRes.json();
                const parsedPayments: PaymentRecord[] = (Array.isArray(pJson?.data) ? pJson.data : []).map((payment: PaymentRecord) => ({
                  ...payment,
                  amount: Number(payment.amount || 0),
                }));
                setPayments(parsedPayments);
                    setPaymentsTotal(pJson.total || 0);
                const currentDate = new Date();
                const monthsData: {
                  month: string;
                  revenue: number;
                }[] = [];
                for (let i = 5; i >= 0; i--) {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                  const start = date.getTime();
                  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).getTime();
                  const monthPayments = parsedPayments.filter((payment) => payment.paidAt >= start && payment.paidAt <= end);
                  monthsData.push({
                    month: format(date, 'MMM yy', { locale: fr }),
                    revenue: monthPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0),
                  });
                }
                setMonthlyRevenue(monthsData);
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
      return d >= 0 && d <= 14;
    });
    const expiredStores = stores.filter((s) => s.subscriptionEnd && s.subscriptionEnd < now);
    const currentMonth = new Date();
    const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getTime();
    const subscriptionPaymentsThisMonth = payments.filter((payment) => payment.paidAt >= currentMonthStart && payment.paidAt <= now);
    const subscriptionRevenueThisMonth = subscriptionPaymentsThisMonth.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
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
    const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 })
      .format(n)
      .replace(/\s*F\s*CFA$/, ' F');
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
          <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Crown size={18} className="text-yellow-300"/>
                <span className="text-indigo-200 text-sm font-medium">Propriétaire SAS</span>
              </div>
              <h1 className="break-words text-xl font-bold text-white sm:text-2xl">
                Bonjour, {user?.username || 'Super Admin'} 👋
              </h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <div className="text-right">
                <p className="text-indigo-200 text-xs">Dernière sync</p>
                <p className="text-white text-xs font-medium">{format(lastRefresh, 'HH:mm:ss')}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadData} className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/>
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
          <StatCard title="Abonnements ce mois" value={formatCurrency(subscriptionRevenueThisMonth)} subtitle={`${subscriptionPaymentsThisMonth.length} paiement${subscriptionPaymentsThisMonth.length !== 1 ? 's' : ''} encaissé${subscriptionPaymentsThisMonth.length !== 1 ? 's' : ''}`} icon={TrendingUp} color="bg-emerald-500"/>
          <StatCard title="Aonnements" value={expiredStores.length + expiringStores.length} subtitle={`${expiredStores.length} expirés · ${expiringStores.length} proches`} icon={AlertTriangle} color={expiredStores.length > 0 ? 'bg-red-500' : expiringStores.length > 0 ? 'bg-orange-500' : 'bg-slate-400'}/>
        </div>

        <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Subscription payments trend (6 months) */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity size={16} className="text-indigo-500"/>
                    Encaissements (6 derniers mois)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}/>
                      <Tooltip formatter={(v: number) => formatCurrency(v)}/>
                      <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name="Encaissements"/>
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
        </div>

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
