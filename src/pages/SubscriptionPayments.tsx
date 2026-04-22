import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, } from 'recharts';
import { CreditCard, RefreshCw, Plus, Trash2, Search, Store, TrendingUp, Calendar, Wallet, ArrowLeft, ChevronLeft, ChevronRight, Crown, Filter, FileDown, AlertTriangle, CheckCircle2, DollarSign, } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
const BACKEND = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
const PAGE_SIZE = 20;
interface PaymentRecord {
    id: string;
    storeId: string;
    storeName: string;
    months: number;
    amount: number;
    paidAt: number;
    note?: string;
}
interface StoreData {
    id: string;
    name: string;
    active: number;
}
type PeriodFilter = 'all' | 'month' | '3months' | '6months' | 'year';
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
function formatCFA(n: number) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        maximumFractionDigits: 0,
  })
    .format(n)
  .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s*F\s*CFA$/, ' F');
}
function KPICard({ title, value, subtitle, icon: Icon, color, }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    color: string;
}) {
    return (<Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground break-words">{title}</p>
          <div className={`shrink-0 p-2.5 rounded-xl ${color}`}>
            <Icon size={20} className="text-white"/>
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <p className="text-base font-bold leading-tight tracking-tight break-words sm:text-2xl">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground break-words">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>);
}
export default function SubscriptionPayments() {
    const { user } = useAuth();
    const navigate = useNavigate();
  const isMobile = useIsMobile();
    // ── Data ──────────────────────────────────────────────────────────────────
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [stores, setStores] = useState<StoreData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    // ── Filters ───────────────────────────────────────────────────────────────
    const [storeFilter, setStoreFilter] = useState<string>('all');
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    // ── Add dialog ────────────────────────────────────────────────────────────
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({
        storeId: '',
        months: '1',
        amount: '',
        note: '',
        paidAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    });
    const [isSaving, setIsSaving] = useState(false);
    // ── Delete confirm ────────────────────────────────────────────────────────
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // ── Load data ─────────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [paymentsRes, storesRes] = await Promise.all([
                fetch(`${BACKEND}/api/subscription_payments.php?limit=2000`),
                fetch(`${BACKEND}/api/stores.php?include_inactive=1`),
            ]);
            if (paymentsRes.ok) {
                const json = await paymentsRes.json();
                setPayments((json.data || []).map((p: PaymentRecord) => ({
                    ...p,
                    amount: Number(p.amount),
                })));
            }
            if (storesRes.ok) {
                const data = await storesRes.json();
                setStores(data);
            }
        }
        catch {
            toast.error('Erreur lors du chargement');
        }
        finally {
            setIsLoading(false);
            setLastRefresh(new Date());
        }
    }, []);
    useEffect(() => {
        if (user?.role !== 'super_admin') {
            navigate('/dashboard');
            return;
        }
        loadData();
    }, [loadData, user, navigate]);
    // ── Period range ──────────────────────────────────────────────────────────
    const periodRange = useMemo<{
        start: number;
        end: number;
    } | null>(() => {
        const now = new Date();
        if (periodFilter === 'month') {
            return { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() };
        }
        if (periodFilter === '3months') {
            return { start: startOfMonth(subMonths(now, 2)).getTime(), end: endOfMonth(now).getTime() };
        }
        if (periodFilter === '6months') {
            return { start: startOfMonth(subMonths(now, 5)).getTime(), end: endOfMonth(now).getTime() };
        }
        if (periodFilter === 'year') {
            return { start: startOfMonth(subMonths(now, 11)).getTime(), end: endOfMonth(now).getTime() };
        }
        return null;
    }, [periodFilter]);
    // ── Filtered payments ─────────────────────────────────────────────────────
    const filteredPayments = useMemo(() => {
        return payments.filter((p) => {
            if (storeFilter !== 'all' && p.storeId !== storeFilter)
                return false;
            if (periodRange) {
                if (p.paidAt < periodRange.start || p.paidAt > periodRange.end)
                    return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (!p.storeName.toLowerCase().includes(q) &&
                    !(p.note || '').toLowerCase().includes(q) &&
                    !String(p.amount).includes(q))
                    return false;
            }
            return true;
        });
    }, [payments, storeFilter, periodRange, search]);
    // ── Pagination ────────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
    const pagedPayments = filteredPayments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    useEffect(() => {
        setPage(1);
    }, [storeFilter, periodFilter, search]);
    // ── KPIs ──────────────────────────────────────────────────────────────────
    const totalEncaisse = useMemo(() => filteredPayments.reduce((a, p) => a + p.amount, 0), [filteredPayments]);
    const now = new Date();
    const thisMonthStart = startOfMonth(now).getTime();
    const thisMonthEnd = endOfMonth(now).getTime();
    const thisMonthPayments = payments.filter((p) => p.paidAt >= thisMonthStart && p.paidAt <= thisMonthEnd);
    const thisMonthTotal = thisMonthPayments.reduce((a, p) => a + p.amount, 0);
    const uniqueStoresPaying = new Set(filteredPayments.map((p) => p.storeId)).size;
    const avgPerPayment = filteredPayments.length > 0 ? totalEncaisse / filteredPayments.length : 0;
    // ── Monthly chart data (last 12 months) ───────────────────────────────────
    const chartData = useMemo(() => {
        const data: {
            month: string;
            total: number;
            count: number;
        }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = subMonths(now, i);
            const start = startOfMonth(d).getTime();
            const end = endOfMonth(d).getTime();
            const monthPayments = payments.filter((p) => p.paidAt >= start &&
                p.paidAt <= end &&
                (storeFilter === 'all' || p.storeId === storeFilter));
            data.push({
                month: format(d, 'MMM yy', { locale: fr }),
                total: monthPayments.reduce((a, p) => a + p.amount, 0),
                count: monthPayments.length,
            });
        }
        return data;
    }, [payments, storeFilter, now]);
    // ── Per-store totals ──────────────────────────────────────────────────────
    const perStoreTotals = useMemo(() => {
        const map: Record<string, {
            name: string;
            total: number;
            count: number;
        }> = {};
        const source = periodRange
            ? payments.filter((p) => p.paidAt >= periodRange.start && p.paidAt <= periodRange.end)
            : payments;
        source.forEach((p) => {
            if (!map[p.storeId])
                map[p.storeId] = { name: p.storeName, total: 0, count: 0 };
            map[p.storeId].total += p.amount;
            map[p.storeId].count += 1;
        });
        return Object.entries(map)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => b.total - a.total);
    }, [payments, periodRange]);
    // ── Add payment ───────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!addForm.storeId || !addForm.amount) {
            toast.error('Veuillez remplir les champs obligatoires');
            return;
        }
        const amount = parseFloat(addForm.amount);
        if (isNaN(amount) || amount <= 0) {
            toast.error('Montant invalide');
            return;
        }
        const selectedStore = stores.find((s) => s.id === addForm.storeId);
        setIsSaving(true);
        try {
            const res = await fetch(`${BACKEND}/api/subscription_payments.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeId: addForm.storeId,
                    storeName: selectedStore?.name || '',
                    months: parseInt(addForm.months, 10) || 1,
                    amount,
                    paidAt: new Date(addForm.paidAt).getTime(),
                    note: addForm.note || null,
                }),
            });
            if (res.ok) {
                toast.success('Encaissement enregistré');
                setShowAdd(false);
                setAddForm({
                    storeId: '',
                    months: '1',
                    amount: '',
                    note: '',
                    paidAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                });
                await loadData();
            }
            else {
                toast.error("Erreur lors de l'enregistrement");
            }
        }
        catch {
            toast.error('Erreur réseau');
        }
        finally {
            setIsSaving(false);
        }
    };
    // ── Delete payment ────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId)
            return;
        setIsDeleting(true);
        try {
            const res = await fetch(`${BACKEND}/api/subscription_payments.php?id=${deleteId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                toast.success('Encaissement supprimé');
                setDeleteId(null);
                await loadData();
            }
            else {
                toast.error('Erreur lors de la suppression');
            }
        }
        catch {
            toast.error('Erreur réseau');
        }
        finally {
            setIsDeleting(false);
        }
    };
    // ── Export CSV ────────────────────────────────────────────────────────────
    const exportCSV = () => {
        const headers = ['Date', 'Boutique', 'Mois', 'Montant (XOF)', 'Note'];
        const rows = filteredPayments.map((p) => [
            format(p.paidAt, 'dd/MM/yyyy HH:mm'),
            `"${p.storeName}"`,
            p.months,
            p.amount,
            `"${p.note || ''}"`,
        ]);
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `encaissements_${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    if (isLoading) {
        return (<div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"/>
        <p className="text-muted-foreground text-sm">Chargement des encaissements…</p>
      </div>);
    }
    return (<div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 pt-6 pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <CreditCard size={22}/>
                Encaissements
              </h1>
              <p className="text-blue-200 text-sm mt-0.5">
                Suivi complet des paiements d'abonnements
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-blue-200 text-xs">Dernière sync</p>
                <p className="text-white text-xs font-medium">{format(lastRefresh, 'HH:mm:ss')}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadData} className="bg-white/20 text-white border-white/30 hover:bg-white/30">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/>
              </Button>
              <Button variant="secondary" size="sm" onClick={exportCSV} className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                <FileDown size={14} className="mr-1.5"/>
                Export CSV
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold">
                <Plus size={14} className="mr-1.5"/>
                Encaissement
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-4 pb-10 space-y-6">
        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPICard title={periodFilter === 'all' ? 'Total encaissé' : 'Encaissé (période)'} value={formatCFA(totalEncaisse)} subtitle={`${filteredPayments.length} paiement${filteredPayments.length !== 1 ? 's' : ''}`} icon={Wallet} color="bg-blue-500"/>
          <KPICard title="Ce mois-ci" value={formatCFA(thisMonthTotal)} subtitle={`${thisMonthPayments.length} paiement${thisMonthPayments.length !== 1 ? 's' : ''}`} icon={Calendar} color="bg-indigo-500"/>
          <KPICard title="Boutiques payantes" value={uniqueStoresPaying} subtitle={`sur ${stores.length} boutiques`} icon={Store} color="bg-purple-500"/>
          <KPICard title="Montant moyen" value={formatCFA(avgPerPayment)} subtitle="par encaissement" icon={DollarSign} color="bg-sky-500"/>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="flex-1 min-w-48">
                <Label className="text-xs mb-1.5 block text-muted-foreground">Recherche</Label>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                  <Input placeholder="Boutique, note, montant…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm"/>
                </div>
              </div>

              {/* Store filter */}
              <div className="min-w-40">
                <Label className="text-xs mb-1.5 block text-muted-foreground">Boutique</Label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les boutiques</SelectItem>
                    {stores.map((s) => (<SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {/* Period filter */}
              <div className="min-w-40">
                <Label className="text-xs mb-1.5 block text-muted-foreground">Période</Label>
                <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toute la période</SelectItem>
                    <SelectItem value="month">Ce mois</SelectItem>
                    <SelectItem value="3months">3 derniers mois</SelectItem>
                    <SelectItem value="6months">6 derniers mois</SelectItem>
                    <SelectItem value="year">12 derniers mois</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset filters */}
              {(storeFilter !== 'all' || periodFilter !== 'all' || search) && (<Button variant="outline" size="sm" className="h-9 self-end" onClick={() => {
                setStoreFilter('all');
                setPeriodFilter('all');
                setSearch('');
            }}>
                  <Filter size={13} className="mr-1.5"/>
                  Réinitialiser
                </Button>)}
            </div>
          </CardContent>
        </Card>

        {/* ── Charts ───────────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Area chart: 12 months trend */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-500"/>
                Évolution mensuelle des encaissements (12 mois)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}/>
                  <Tooltip formatter={(v: number) => [formatCFA(v), 'Encaissements']} labelStyle={{ fontWeight: 600 }}/>
                  <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} fill="url(#colorTotal)" name="Encaissements" dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }}/>
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top stores bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Store size={16} className="text-purple-500"/>
                Top boutiques
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  {periodFilter === 'all' ? 'Tous' : periodFilter === 'month' ? 'Ce mois' : periodFilter === '3months' ? '3 mois' : periodFilter === '6months' ? '6 mois' : '12 mois'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {perStoreTotals.length === 0 ? (<p className="text-center text-sm text-muted-foreground py-8">Aucune donnée</p>) : (<ResponsiveContainer width="100%" height={220}>
                  <BarChart data={perStoreTotals.slice(0, 6)} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted"/>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}/>
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70}/>
                    <Tooltip formatter={(v: number) => [formatCFA(v), 'Total']}/>
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {perStoreTotals.slice(0, 6).map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]}/>))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>)}
            </CardContent>
          </Card>
        </div>

        {/* ── Per-store summary cards ───────────────────────────────────────── */}
        {perStoreTotals.length > 0 && (<Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-500"/>
                Résumé par boutique
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {perStoreTotals.map((s, i) => (<button key={s.id} onClick={() => setStoreFilter(storeFilter === s.id ? 'all' : s.id)} className={`p-3 rounded-xl border text-left transition-all ${storeFilter === s.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-sm'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'}`}>
                    <div className="w-5 h-5 rounded-md mb-2" style={{ backgroundColor: COLORS[i % COLORS.length] }}/>
                    <p className="text-xs font-semibold truncate leading-tight">{s.name}</p>
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400 mt-1">
                      {formatCFA(s.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.count} paiement{s.count !== 1 ? 's' : ''}
                    </p>
                  </button>))}
              </div>
            </CardContent>
          </Card>)}

        {/* ── Payments table ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard size={16} className="text-indigo-500"/>
                Liste des encaissements
                <Badge variant="secondary" className="ml-1 font-semibold">
                  {filteredPayments.length}
                </Badge>
              </CardTitle>
              <div className="text-sm font-bold text-blue-600">
                Total : {formatCFA(totalEncaisse)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isMobile ? (<div className="space-y-3 p-3">
                {pagedPayments.length === 0 ? (<div className="py-10 text-center text-sm text-muted-foreground">
                    Aucun encaissement trouvé
                  </div>) : (pagedPayments.map((p) => (<div key={p.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight text-foreground">{p.storeName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {format(p.paidAt, 'dd MMM yyyy', { locale: fr })} a {format(p.paidAt, 'HH:mm')}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => setDeleteId(p.id)}>
                          <Trash2 size={14}/>
                        </Button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <Badge variant="secondary" className="text-xs">
                          {p.months} mois
                        </Badge>
                        <p className="text-base font-bold text-blue-600">{formatCFA(p.amount)}</p>
                      </div>

                      <div className="mt-3 rounded-xl bg-muted/30 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground break-words">
                          {p.note || <span className="text-muted-foreground/40">Aucune note</span>}
                        </p>
                      </div>
                    </div>)))}

                {filteredPayments.length > 0 && (<div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="text-xs font-semibold text-blue-700">Total ({filteredPayments.length} encaissements)</div>
                    <div className="mt-1 text-lg font-bold text-blue-700">{formatCFA(totalEncaisse)}</div>
                  </div>)}
              </div>) : (<div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Boutique</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Mois</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Montant</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Note</th>
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPayments.length === 0 ? (<tr>
                        <td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                          Aucun encaissement trouvé
                        </td>
                      </tr>) : (pagedPayments.map((p) => (<tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 group">
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {format(p.paidAt, 'dd MMM yyyy', { locale: fr })}
                            <span className="block text-muted-foreground/60">
                              {format(p.paidAt, 'HH:mm')}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{p.storeName}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary" className="text-xs">
                              {p.months} mois
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-blue-600 whitespace-nowrap">
                            {formatCFA(p.amount)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-40 truncate">
                            {p.note || <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDeleteId(p.id)}>
                              <Trash2 size={13}/>
                            </Button>
                          </td>
                        </tr>)))}
                  </tbody>
                  {filteredPayments.length > 0 && (<tfoot>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                          Total ({filteredPayments.length} encaissements)
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">
                          {formatCFA(totalEncaisse)}
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>)}
                </table>
              </div>)}

            {/* Pagination */}
            {totalPages > 1 && (<div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {page} sur {totalPages} · {filteredPayments.length} résultat{filteredPayments.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center justify-between gap-1 sm:justify-start">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft size={14}/>
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return (<Button key={p} variant={p === page ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setPage(p)}>
                        {p}
                      </Button>);
            })}
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight size={14}/>
                  </Button>
                </div>
              </div>)}
          </CardContent>
        </Card>
      </div>

      {/* ── Add payment dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <Plus size={16} className="text-blue-500"/>
              Nouvel encaissement
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm mb-1.5 block">Boutique *</Label>
              <Select value={addForm.storeId} onValueChange={(v) => setAddForm((f) => ({ ...f, storeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une boutique"/>
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (<SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm mb-1.5 block">Nombre de mois *</Label>
                <Input type="number" min="1" max="24" value={addForm.months} onChange={(e) => setAddForm((f) => ({ ...f, months: e.target.value }))}/>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Montant (XOF) *</Label>
                <Input type="number" min="0" placeholder="0" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}/>
              </div>
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">Date du paiement *</Label>
              <Input type="datetime-local" value={addForm.paidAt} onChange={(e) => setAddForm((f) => ({ ...f, paidAt: e.target.value }))}/>
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">Note (optionnel)</Label>
              <Input placeholder="Ex: Paiement Cash, Mobile Money..." value={addForm.note} onChange={(e) => setAddForm((f) => ({ ...f, note: e.target.value }))}/>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? (<>
                  <RefreshCw size={14} className="mr-1.5 animate-spin"/>
                  Enregistrement…
                </>) : (<>
                  <Plus size={14} className="mr-1.5"/>
                  Enregistrer
                </>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ──────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16}/>
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Cette action est irréversible. L'encaissement sera définitivement supprimé.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (<RefreshCw size={14} className="mr-1.5 animate-spin"/>) : (<Trash2 size={14} className="mr-1.5"/>)}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
