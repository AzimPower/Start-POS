import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, RefreshCw, Package, TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { BACKEND_BASE } from '@/lib/backend';

type PeriodFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type DeltaFilter = 'all' | 'plus' | 'moins';

interface AdjustmentHistory {
    id: string;
    sessionId: string;
    productId: string;
    productName: string;
    sku: string;
    userId: string;
    userName: string;
    storeId: string;
    oldStock: number | null;
    delta: number;
    newStock: number | null;
    reason: string;
    globalReason: string;
    createdAt: number;
}

  function parseTimeToMinutes(value: string): number | null {
    if (!value)
      return null;
    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes))
      return null;
    return hours * 60 + minutes;
  }

  function buildDateTimeBoundary(dateValue: string, timeValue: string, isEnd: boolean): number | null {
    if (!dateValue)
      return null;
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime()))
      return null;
    if (timeValue) {
      const [hours, minutes] = timeValue.split(':').map(Number);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        date.setHours(hours, minutes, isEnd ? 59 : 0, isEnd ? 999 : 0);
        return date.getTime();
      }
    }
    date.setHours(isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0);
    return date.getTime();
  }

export default function StockAdjustmentHistory() {
    const { user } = useAuth();
    const { isBackendReachable } = useNetwork();
    const [history, setHistory] = useState<AdjustmentHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
    const [deltaFilter, setDeltaFilter] = useState<DeltaFilter>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customStartTime, setCustomStartTime] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [customEndTime, setCustomEndTime] = useState('');
    const load = useCallback(async () => {
        if (!isBackendReachable) {
            toast.error('Serveur inaccessible. Vérifiez votre connexion.');
            return;
        }
        setLoading(true);
        try {
            const url = `${BACKEND_BASE}/api/stock_adjust.php?storeId=${user?.storeId}&limit=500`;
            const res = await fetch(url);
            if (!res.ok)
                throw new Error('Erreur serveur');
            const json = await res.json();
            if (json.ok) {
                const data: AdjustmentHistory[] = json.data || [];
                // Déduplication simple: privilégie l'`id` si présent,
                // sinon utilise une clé composite (session+product+delta+ts).
                const map = new Map<string, AdjustmentHistory>();
                for (const it of data) {
                    const key = it.id && String(it.id).trim() !== ''
                        ? String(it.id)
                        : `${it.sessionId}_${it.productId}_${it.delta}_${it.createdAt}`;
                    if (!map.has(key))
                        map.set(key, it);
                }
                const unique = Array.from(map.values());
                if (unique.length !== data.length) {
                }
                setHistory(unique);
            }
            else {
                toast.error('Erreur : ' + (json.error || 'inconnue'));
            }
        }
        catch (err) {
            toast.error('Erreur réseau lors du chargement.');
        }
        finally {
            setLoading(false);
        }
    }, [isBackendReachable, user?.storeId]);
    useEffect(() => {
        load();
    }, [load]);
    // Filtrage
    const filtered = history.filter((h) => {
        // Filtre texte
        if (search.trim()) {
            const q = search.toLowerCase();
            const match = (h.productName || '').toLowerCase().includes(q) ||
                (h.userName || '').toLowerCase().includes(q) ||
                (h.sku || '').toLowerCase().includes(q) ||
                (h.reason || '').toLowerCase().includes(q) ||
                (h.globalReason || '').toLowerCase().includes(q);
            if (!match)
                return false;
        }
        // Filtre delta
        if (deltaFilter === 'plus' && Number(h.delta) <= 0)
            return false;
        if (deltaFilter === 'moins' && Number(h.delta) >= 0)
            return false;
        // Filtre période
        if (periodFilter !== 'all') {
            const now = Date.now();
            const ts = Number(h.createdAt);
            if (periodFilter === 'today') {
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                if (ts < start.getTime())
                    return false;
            }
            else if (periodFilter === 'yesterday') {
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                const startYesterday = start.getTime() - 86400000;
                // keep items where ts is in [startYesterday, start)
                if (ts < startYesterday || ts >= start.getTime())
                    return false;
            }
            else if (periodFilter === 'week') {
                if (ts < now - 7 * 86400000)
                    return false;
            }
            else if (periodFilter === 'month') {
                if (ts < now - 30 * 86400000)
                    return false;
            }
            else if (periodFilter === 'custom') {
              const startBoundary = buildDateTimeBoundary(customStartDate, customStartTime, false);
              const endBoundary = buildDateTimeBoundary(customEndDate, customEndTime, true);
              if (startBoundary !== null && ts < startBoundary)
                return false;
              if (endBoundary !== null && ts > endBoundary)
                return false;
              if (!customStartDate && !customEndDate) {
                const startMinutes = parseTimeToMinutes(customStartTime);
                const endMinutes = parseTimeToMinutes(customEndTime);
                if (startMinutes !== null || endMinutes !== null) {
                  const itemDate = new Date(ts);
                  const itemMinutes = itemDate.getHours() * 60 + itemDate.getMinutes();
                  if (startMinutes !== null && endMinutes !== null) {
                    if (startMinutes <= endMinutes) {
                      if (itemMinutes < startMinutes || itemMinutes > endMinutes)
                        return false;
                    }
                    else if (itemMinutes < startMinutes && itemMinutes > endMinutes) {
                      return false;
                    }
                  }
                  else if (startMinutes !== null && itemMinutes < startMinutes) {
                    return false;
                  }
                  else if (endMinutes !== null && itemMinutes > endMinutes) {
                    return false;
                  }
                }
              }
            }
        }
        return true;
    });
    // Stats
    const totalPlus = filtered.filter(h => Number(h.delta) > 0).reduce((s, h) => s + Number(h.delta), 0);
    const totalMoins = filtered.filter(h => Number(h.delta) < 0).reduce((s, h) => s + Number(h.delta), 0);
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return (<div className="p-6 text-center text-muted-foreground">
        Accès réservé aux administrateurs.
      </div>);
    }
    return (<div className="p-4 sm:p-6 space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => window.history.back()} aria-label="Retour">
              <ArrowLeft className="w-5 h-5"/>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <History className="w-7 h-7"/>
              Historique des ajustements
            </h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Toutes les modifications manuelles de stock
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}/>
          Actualiser
        </Button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Opérations</div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-600"/> Entrées
            </div>
            <div className="text-2xl font-bold text-green-600">+{totalPlus}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-red-600"/> Sorties
            </div>
            <div className="text-2xl font-bold text-red-600">{totalMoins}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input className="flex-1" placeholder="Rechercher produit, utilisateur, motif..." value={search} onChange={(e) => setSearch(e.target.value)}/>
            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes dates</SelectItem>
                <SelectItem value="today">Aujourd'hui</SelectItem>
                <SelectItem value="yesterday">Hier</SelectItem>
                <SelectItem value="week">7 derniers jours</SelectItem>
                <SelectItem value="month">30 derniers jours</SelectItem>
                <SelectItem value="custom">Personnalisé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deltaFilter} onValueChange={(value) => setDeltaFilter(value as DeltaFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="plus">Entrées (+)</SelectItem>
                <SelectItem value="moins">Sorties (−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodFilter === 'custom' && (<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="stock-custom-start-date">Date début</Label>
                <Input id="stock-custom-start-date" type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-custom-start-time">Heure début</Label>
                <Input id="stock-custom-start-time" type="time" value={customStartTime} onChange={(e) => setCustomStartTime(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-custom-end-date">Date fin</Label>
                <Input id="stock-custom-end-date" type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-custom-end-time">Heure fin</Label>
                <Input id="stock-custom-end-time" type="time" value={customEndTime} onChange={(e) => setCustomEndTime(e.target.value)}/>
              </div>
            </div>)}
          {periodFilter === 'custom' && (<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Laissez un champ vide pour l'ignorer. Si seules les heures sont renseignées, le filtre s'applique sur l'heure de la journée.
              </p>
              <Button variant="ghost" size="sm" onClick={() => {
                setCustomStartDate('');
                setCustomStartTime('');
                setCustomEndDate('');
                setCustomEndTime('');
            }}>
                Réinitialiser la plage
              </Button>
            </div>)}
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} ajustement{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (<div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40"/>
              Chargement...
            </div>) : filtered.length === 0 ? (<div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30"/>
              <p>Aucun ajustement trouvé</p>
            </div>) : (<>
              {/* Desktop table (hidden on small screens) */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-center">Avant</TableHead>
                      <TableHead className="text-center">Delta</TableHead>
                      <TableHead className="text-center">Après</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead>Motif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((h) => {
                const deltaNum = Number(h.delta);
                const isPositive = deltaNum > 0;
                const date = new Date(Number(h.createdAt)).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
                return (<TableRow key={h.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {date}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{h.productName || '—'}</div>
                            {h.sku && <div className="text-xs text-muted-foreground">{h.sku}</div>}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {h.oldStock !== null && h.oldStock !== undefined ? h.oldStock : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={isPositive ? 'default' : 'destructive'} className="font-bold tabular-nums">
                              {isPositive ? '+' : ''}{deltaNum}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {h.newStock !== null && h.newStock !== undefined ? h.newStock : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {h.userName || h.userId || '—'}
                          </TableCell>
                          <TableCell className="max-w-[320px] text-xs text-muted-foreground whitespace-normal break-words leading-relaxed align-top">
                            {h.reason || h.globalReason || '—'}
                          </TableCell>
                        </TableRow>);
            })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile list (visible only on small screens) */}
              <div className="block sm:hidden space-y-3 p-3">
                {filtered.map((h) => {
                const deltaNum = Number(h.delta);
                const isPositive = deltaNum > 0;
                const date = new Date(Number(h.createdAt)).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
                return (<Card key={h.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{h.productName || '—'}</div>
                            {h.sku && <div className="text-xs text-muted-foreground">{h.sku}</div>}
                            <div className="mt-1 text-xs text-muted-foreground whitespace-normal break-words leading-relaxed">{h.reason || h.globalReason || '—'}</div>
                          </div>
                          <div className="text-right ml-2">
                            <div className="text-xs text-muted-foreground">{date}</div>
                            <div className="mt-2">
                              <Badge variant={isPositive ? 'default' : 'destructive'} className="font-bold tabular-nums">
                                {isPositive ? '+' : ''}{deltaNum}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                          <div>Avant: {h.oldStock !== null && h.oldStock !== undefined ? h.oldStock : '—'}</div>
                          <div>Après: {h.newStock !== null && h.newStock !== undefined ? h.newStock : '—'}</div>
                        </div>
                        <div className="mt-2 text-xs">Par: {h.userName || h.userId || '—'}</div>
                      </CardContent>
                    </Card>);
            })}
              </div>
            </>)}
        </CardContent>
      </Card>
    </div>);
}
