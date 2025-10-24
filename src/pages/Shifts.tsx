import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, TrendingUp, AlertCircle, Eye, Wifi, WifiOff } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import ShiftReceiptDetails from './ShiftReceiptDetails';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';

interface Shift {
  id: string;
  userId: string;
  storeId: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  cashAmount?: number;
  mobileMoneyAmount?: number;
  otherAmount?: number;
  openedAt: number;
  closedAt: number | null;
  status: 'open' | 'closed';
}

export default function Shifts() {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const { user } = useAuth();
  const { isOnline, manualSync } = useNetwork();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filteredShifts, setFilteredShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState('');
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [selectedCashier, setSelectedCashier] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDate, setCustomDate] = useState('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [cashAmount, setCashAmount] = useState('');
  const [mobileMoneyAmount, setMobileMoneyAmount] = useState('');
  const [otherAmount, setOtherAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();

  // State to store computed expected/difference for closed shifts
  const [computedDiffs, setComputedDiffs] = useState<Record<string, {expected: number|null, difference: number|null}>>({});

  // Recalculate expected/difference for all closed shifts when filteredShifts changes
  useEffect(() => {
    let mounted = true;
    async function calcAll() {
      const results: Record<string, {expected: number|null, difference: number|null}> = {};
      for (const shift of filteredShifts) {
        if (shift.status === 'closed' && shift.closingAmount !== null) {
          try {
            const db = await getDB();
            const sales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
            const expenses = await db.getAllFromIndex('expenses', 'by-shift', shift.id);
            let salesTotal = 0;
            let expensesTotal = 0;
            for (const sale of sales) {
              salesTotal += (typeof sale.total === 'number' && !isNaN(sale.total)) ? Number(sale.total) : (Number(sale.total) || 0);
            }
            for (const ex of expenses) {
              expensesTotal += (typeof ex.amount === 'number' && !isNaN(ex.amount)) ? Number(ex.amount) : (Number(ex.amount) || 0);
            }
            const opening = shift.openingAmount ? Number(shift.openingAmount) : 0;
            const expected = opening + salesTotal - expensesTotal;
            const difference = Number(shift.closingAmount) - expected;
            results[shift.id] = {expected, difference};
          } catch {
            results[shift.id] = {expected: null, difference: null};
          }
        }
      }
      if (mounted) setComputedDiffs(results);
    }
    calcAll();
    return () => { mounted = false; };
  }, [filteredShifts]);

  const loadCashiers = async () => {
    const db = await getDB();
    const users = await db.getAll('users');
    // Filtrer les caissiers par établissement de l'utilisateur connecté
    let filtered = users.filter(u => u.role === 'cashier');
    if (user?.storeId) {
      filtered = filtered.filter(u => u.storeId === user.storeId);
    }
    setCashiers(filtered);
  };

  useEffect(() => {
    loadShifts();
    loadCashiers();
  }, []);

  useEffect(() => {
    let filtered = shifts;
    if (search) {
      filtered = filtered.filter(s => {
        const cashier = cashiers.find(u => u.id === s.userId);
        return (
          (cashier?.username?.toLowerCase().includes(search.toLowerCase()) || '') ||
          formatDate(s.openedAt).toLowerCase().includes(search.toLowerCase())
        );
      });
    }
    if (selectedCashier !== 'all') {
      filtered = filtered.filter(s => s.userId === selectedCashier);
    }
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(s => s.status === selectedStatus);
    }
    // Always sort by most recent
    filtered = filtered.sort((a, b) => b.openedAt - a.openedAt);
    setFilteredShifts(filtered);
  }, [search, selectedCashier, selectedStatus, shifts, cashiers]);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      
      // Si en ligne, charger depuis le backend et synchroniser
      if (isOnline) {
        try {
          // Charger les shifts depuis le backend
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php';
          if (user?.storeId) url += `?storeId=${user.storeId}`;
          const response = await fetch(url);
          if (response.ok) {
            const backendShifts = await response.json();
            // Mettre à jour la base locale
            const tx = db.transaction('shifts', 'readwrite');
            await Promise.all([
              ...backendShifts.map(s => tx.store.put(s)),
              tx.done
            ]);
            setLoadedCount(0);
            setHasMore(true);
            await loadShiftsPage(db, 0, pageSize, true);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale (paged)
          await loadShiftsPage(db, 0, pageSize, true);
        }
      } else {
        // Hors ligne : charger depuis la base locale (paged)
        await loadShiftsPage(db, 0, pageSize, true);
      }

      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount(db);
    } catch (error) {
      toast.error('Erreur lors du chargement des shifts');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFromLocal = async (db: any) => {
    return loadShiftsPage(db, 0, pageSize, true);
  };

  const loadShiftsPage = async (db: any, offset: number, limit: number, reset = false) => {
    try {
      const all = await db.getAll('shifts');
      all.sort((a: any, b: any) => b.openedAt - a.openedAt);
      const normalized = all.map((s: any) => ({ ...s, storeId: s.storeId || '' }));
      // Filter depending on role
      let visible = normalized;
      if (user?.role === 'admin' && user?.storeId) {
        visible = normalized.filter((s: any) => s.storeId === user.storeId);
      } else {
        visible = normalized.filter((s: any) => s.userId === user?.id);
      }
      const page = visible.slice(offset, offset + limit);

      if (reset) {
        setShifts(page);
        setLoadedCount(page.length);
      } else {
        setShifts(prev => [...prev, ...page]);
        setLoadedCount(prev => prev + page.length);
      }
      setHasMore(page.length === limit);
      setFilteredShifts(prev => {
        // keep filters applied in effect
        return [...(reset ? [] : prev), ...page];
      });
      const active = (reset ? page : [...shifts, ...page]).find(s => s.status === 'open' && s.userId === user?.id);
      setActiveShift(active || null);
      return page;
    } catch (e) {
      console.error('Erreur chargement paginé shifts:', e);
      const all = await db.getAll('shifts');
      all.sort((a: any, b: any) => b.openedAt - a.openedAt);
      const page = all.slice(offset, offset + limit);
      if (reset) setShifts(page); else setShifts(prev => [...prev, ...page]);
      setHasMore(page.length === limit);
      setFilteredShifts(reset ? page : [...shifts, ...page]);
      return page;
    }
  };

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const handleListScroll = async () => {
    const el = listScrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setLoadingMore(true);
      try {
        const db = await getDB();
        await loadShiftsPage(db, loadedCount, pageSize, false);
      } catch (e) {
        console.error('Erreur page shifts suivante:', e);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  const processShifts = (allShifts: any[]) => {
    // Ajoute storeId par défaut et normalise les propriétés numériques
    const normalizedShifts = allShifts.map((s: any) => ({
      ...s,
      storeId: s.storeId || '',
      openingAmount: Number(s.openingAmount) || 0,
      closingAmount: s.closingAmount !== null ? Number(s.closingAmount) : null,
      expectedAmount: s.expectedAmount !== null ? Number(s.expectedAmount) : null,
      difference: s.difference !== null ? Number(s.difference) : null,
      cashAmount: s.cashAmount !== undefined ? Number(s.cashAmount) : undefined,
      mobileMoneyAmount: s.mobileMoneyAmount !== undefined ? Number(s.mobileMoneyAmount) : undefined,
      otherAmount: s.otherAmount !== undefined ? Number(s.otherAmount) : undefined,
      openedAt: Number(s.openedAt),
      closedAt: s.closedAt ? Number(s.closedAt) : null
    }));
    let visibleShifts: Shift[] = [];
    if (user?.role === 'admin' && user?.storeId) {
      // Admin voit tous les shifts de son magasin
      visibleShifts = normalizedShifts.filter(s => s.storeId === user.storeId);
    } else {
      // Sinon, voir seulement ses shifts
      visibleShifts = normalizedShifts.filter(s => s.userId === user?.id);
    }
    setShifts(visibleShifts.sort((a, b) => b.openedAt - a.openedAt));
    setFilteredShifts(visibleShifts.sort((a, b) => b.openedAt - a.openedAt));
    const active = visibleShifts.find(s => s.status === 'open' && s.userId === user?.id);
    setActiveShift(active || null);
  };

  const formatMoney = (v: number | null | undefined) => {
    if (v === null || v === undefined || isNaN(Number(v))) return '0';
    return new Intl.NumberFormat('fr-FR').format(Math.round(Number(v))).replace(/\u00A0|\u202F/g, ' ');
  };

  const printShiftReceipt = async (shift: any) => {
    try {
      const db = await getDB();
      const store = await db.get('stores', shift.storeId);
      const storeName = store?.name || 'Magasin';
      const user = await db.get('users', shift.userId);
      const cashier = user?.username || '-';

      // compute payments like in ShiftReceiptDetails
      const sales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
      const toNum = (v: any) => {
        if (typeof v === 'number' && !isNaN(v)) return v;
        const n = Number(v);
        return !isNaN(n) ? n : 0;
      };
      let cash = 0, mobile = 0;
      for (const s of sales) {
        if (s.payments && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            if (p.method === 'cash') cash += toNum(p.amount);
            if (p.method === 'mobile_money') mobile += toNum(p.amount);
          }
        } else {
          if (s.paymentMethod === 'cash') cash += toNum(s.total);
          if (s.paymentMethod === 'mobile_money') mobile += toNum(s.total);
        }
      }

      const totalPaid = (cash || 0) + (mobile || 0);

      const lines: string[] = [];
      const paper = localStorage.getItem('printer_paper') || '80';
      const width = paper === '58' ? 32 : 48;

      lines.push(NativePrinter.formatColumns(storeName, '', width));
      const opened = new Date(shift.openedAt).toLocaleString('fr-FR');
      const closed = shift.closedAt ? new Date(shift.closedAt).toLocaleString('fr-FR') : '-';
      lines.push(NativePrinter.formatColumns(('Ouverture'), (opened), width));
      lines.push(NativePrinter.formatColumns(('Fermeture'), (closed), width));
      lines.push(NativePrinter.formatColumns('Caissier:', cashier, width));
      lines.push('--------------------------------');
      lines.push(NativePrinter.formatColumns('Montant d\'ouverture :', `${formatMoney(shift.openingAmount)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Montant de fermeture :', `${shift.closingAmount !== null ? formatMoney(shift.closingAmount) : '-'} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Montant attendu :', `${shift.expectedAmount !== null ? formatMoney(shift.expectedAmount) : '-'} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Écart :', `${shift.difference !== null ? (shift.difference >= 0 ? '+' : '') + formatMoney(shift.difference) : '-'} FCFA`, width));
      // Duration
      const durationMs = (shift.closedAt || Date.now()) - shift.openedAt;
      const h = Math.floor(durationMs / (1000*60*60));
      const m = Math.floor((durationMs % (1000*60*60)) / (1000*60));
      lines.push(NativePrinter.formatColumns('Durée :', `${h}h ${m}min`, width));
      lines.push('');
      lines.push(NativePrinter.formatColumns('Montant encaissé :', '', width));
      lines.push(NativePrinter.formatColumns('Espèces :', `${formatMoney(cash)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Mobile Money :', `${formatMoney(mobile)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Total encaissé :', `${formatMoney(totalPaid)} FCFA`, width));
      lines.push('');

      // Try to print logo first if present
      const savedLogo = localStorage.getItem('storeLogo');
      if (savedLogo) {
        try {
          await NativePrinter.printImage(savedLogo, undefined, paper === '58' ? '58' : '80');
        } catch (e) {
          console.warn('Logo print failed', e);
        }
      }

      const ok = await NativePrinter.printText(lines);
      if (!ok) {
        // fallback: build simple HTML using the same lines
        const tmp = document.createElement('div');
        tmp.innerHTML = `
          <div class="receipt font-mono">
            <h3>${storeName}</h3>
            <pre>${lines.join('\n')}</pre>
          </div>
        `;
        const html = buildReceiptHtml(tmp, 'Rapport shift');
        const used = await tryNativePrint(html, `Rapport-${shift.id}`);
        if (!used) console.warn('Native print not available');
      }
    } catch (err) {
      console.warn('printShiftReceipt error', err);
    }
  };

  const updatePendingSyncCount = async (db: any) => {
    try {
      const syncQueue = await db.getAll('syncQueue');
      const shiftsPendingOps = syncQueue.filter(op => 
        op.table === 'shifts' && op.storeId === user?.storeId
      );
      setPendingSyncCount(shiftsPendingOps.length);
    } catch (error) {
      console.error('Erreur lors du comptage des synchronisations en attente:', error);
      setPendingSyncCount(0);
    }
  };

  // helper local: (anciennement ajout à la queue locale). Nous utilisons désormais performSyncOp pour gérer la mise en file

  const handleOpenShift = async () => {
    let amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Montant invalide');
      return;
    }
    amount = Math.round(amount);
    
    try {
      setLoading(true);
      const db = await getDB();
      const newShift: Shift = {
        id: generateId(),
        userId: user!.id,
        storeId: user!.storeId,
        openingAmount: amount,
        closingAmount: null,
        expectedAmount: null,
        difference: null,
        openedAt: Date.now(),
        closedAt: null,
        status: 'open',
      };
      
      // Sauvegarder localement d'abord
      await db.add('shifts', newShift);
      
      // Si en ligne, synchroniser immédiatement avec le backend
      if (isOnline) {
        try {
          const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(newShift)
          });

          if (!response.ok) {
            throw new Error(`Erreur backend: ${response.status}`);
          }

          toast.success('Shift ouvert et synchronisé avec succès');
        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Mettre en file via performSyncOp (gère online/offline)
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
            method: 'POST',
            data: newShift
          });
          toast.success('Shift ouvert localement. La synchronisation se fera automatiquement.');
        }
      } else {
        // Hors ligne : mettre en file via performSyncOp
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
          method: 'POST',
          data: newShift
        });
        toast.success('Shift ouvert localement. La synchronisation se fera automatiquement.');
      }
      
  setShowOpenDialog(false);
  setOpeningAmount('');
  // refresh local list and redirect to POS for cashier workflow
  try { loadShifts(); } catch (e) { /* ignore */ }
  try { navigate('/pos'); } catch (e) { /* ignore navigation errors in test env */ }
    } catch (error) {
      toast.error('Erreur lors de l\'ouverture du shift');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;

    // S'assurer que les montants sont des nombres valides
    const cash = cashAmount === '' ? 0 : (parseFloat(cashAmount) || 0);
    const mobile = mobileMoneyAmount === '' ? 0 : (parseFloat(mobileMoneyAmount) || 0);
    const other = otherAmount === '' ? 0 : (parseFloat(otherAmount) || 0);
    if (cash < 0 || mobile < 0 || other < 0) {
      toast.error('Montant invalide');
      return;
    }
    
    try {
      setLoading(true);
      const amount = Math.round(cash + mobile + other);
      const db = await getDB();
      
      // Calculate expected amount
      const sales = await db.getAllFromIndex('sales', 'by-shift', activeShift.id);
      const expenses = await db.getAllFromIndex('expenses', 'by-shift', activeShift.id);
      const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
      const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const expectedAmount = activeShift.openingAmount + salesTotal - expensesTotal;
      const difference = amount - expectedAmount;
      
      const updatedShift: Shift = {
        ...activeShift,
        closingAmount: amount,
        expectedAmount,
        difference,
        closedAt: Date.now(),
        status: 'closed',
        cashAmount: cash,
        mobileMoneyAmount: mobile,
        otherAmount: other,
      };
      
      // Log pour déboguer
      console.log('Données du shift à envoyer:', updatedShift);
      console.log('cashAmount:', cash, 'mobileMoneyAmount:', mobile, 'otherAmount:', other);
      
      // Sauvegarder localement d'abord
      await db.put('shifts', updatedShift);
      // Auto-print the closed shift receipt (best-effort)
      try {
        printShiftReceipt(updatedShift);
      } catch (e) {
        console.warn('Auto-print failed', e);
      }
      
      // Si en ligne, synchroniser immédiatement avec le backend
      if (isOnline) {
        try {
          const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedShift)
          });

          if (!response.ok) {
            throw new Error(`Erreur backend: ${response.status}`);
          }

          toast.success('Shift fermé et synchronisé avec succès');
        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Mettre en file via performSyncOp (gère mise en file si offline)
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
            method: 'PUT',
            data: updatedShift
          });
          toast.success('Shift fermé localement. La synchronisation se fera automatiquement.');
        }
      } else {
        // Hors ligne : mettre en file via performSyncOp
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
          method: 'PUT',
          data: updatedShift
        });
        toast.success('Shift fermé localement. La synchronisation se fera automatiquement.');
      }
      
      setShowCloseDialog(false);
      setCashAmount('');
      setMobileMoneyAmount('');
      setOtherAmount('');
      loadShifts();
    } catch (error) {
      toast.error('Erreur lors de la fermeture du shift');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: number, end: number | null) => {
    const duration = (end || Date.now()) - start;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}min`;
  };

  return (
  <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Shifts</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Suivez vos sessions de caisse</p>
          {/* Network status is shown in the header; duplicated controls removed here. */}
        </div>
        {!activeShift && (
          <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Clock className="w-4 h-4 mr-2" />
                Ouvrir un shift
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ouvrir un shift</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Montant d'ouverture (FCFA)</Label>
                  <Input
                    type="number"
                    step="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    placeholder="0.00"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    autoFocus
                  />
                  <p className="text-sm text-muted-foreground">
                    Entrez le montant présent dans la caisse au début du shift
                  </p>
                </div>
                <Button className="w-full" onClick={handleOpenShift} disabled={loading}>
                  {loading ? 'Ouverture...' : 'Ouvrir le shift'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {activeShift && (
        <Card className="border-success bg-success/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-success">Shift en cours</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Ouvert le {formatDate(activeShift.openedAt)}
                </p>
              </div>
              <Badge variant="default" className="bg-success">Actif</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Montant d'ouverture</p>
                <p className="text-xl sm:text-2xl font-bold">{Math.round(activeShift.openingAmount)} FCFA</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Durée</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {formatDuration(activeShift.openedAt, null)}
                </p>
              </div>
            </div>
            <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  Fermer le shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fermer le shift</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Ouvert le:</span>
                      <span className="text-sm font-medium">
                        {formatDate(activeShift.openedAt)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Montant d'ouverture:</span>
                      <span className="text-sm font-medium">
                        {Number(activeShift.openingAmount).toFixed(2)} FCFA
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Montant en espèces (FCFA)</Label>
                    <Input
                      type="number"
                      step="1"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      placeholder="0.00"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Montant Mobile Money (FCFA)</Label>
                    <Input
                      type="number"
                      step="1"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      placeholder="0.00"
                      value={mobileMoneyAmount}
                      onChange={e => setMobileMoneyAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Montant total en caisse</Label>
                    <Input
                      type="number"
                      value={parseFloat(cashAmount || '0') + parseFloat(mobileMoneyAmount || '0') + parseFloat(otherAmount || '0')}
                      readOnly
                    />
                    <p className="text-sm text-muted-foreground">Somme des montants par mode de paiement</p>
                  </div>
                  <Button className="w-full" onClick={handleCloseShift} disabled={loading}>
                    {loading ? 'Fermeture...' : 'Fermer le shift'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Historique des shifts</CardTitle>
            {loading && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Chargement...
              </div>
            )}
          </div>
          {isMobile ? (
            <div className="mt-4 space-y-2">
              <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Rechercher par caissier ou date..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1"
                  />
                  <DrawerTrigger asChild>
                    <Button variant="outline">Filtres</Button>
                  </DrawerTrigger>
                </div>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>Filtres</DrawerTitle>
                  </DrawerHeader>
                  <div className="p-4 grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                        {user?.role !== 'cashier' && (
                          <>
                            <Label>Caissier</Label>
                            <Select value={selectedCashier} onValueChange={setSelectedCashier}>
                              <SelectTrigger>
                                <SelectValue placeholder="Filtrer par caissier" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Tous les caissiers</SelectItem>
                                {cashiers.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        )}
                    </div>
                    <div className="space-y-1">
                      <Label>Statut</Label>
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Statut" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les états</SelectItem>
                          <SelectItem value="open">Ouvert</SelectItem>
                          <SelectItem value="closed">Fermé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Date filter removed, always sorted by most recent */}
                  </div>
                  <DrawerFooter>
                    <DrawerClose asChild>
                      <Button className="w-full">Appliquer</Button>
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <Input
                placeholder="Rechercher par caissier ou date..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full sm:max-w-xs"
              />
              {user?.role !== 'cashier' && (
                <Select value={selectedCashier} onValueChange={setSelectedCashier}>
                  <SelectTrigger className="w-full sm:max-w-xs">
                    <SelectValue placeholder="Filtrer par caissier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les caissiers</SelectItem>
                    {cashiers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les états</SelectItem>
                  <SelectItem value="open">Ouvert</SelectItem>
                  <SelectItem value="closed">Fermé</SelectItem>
                </SelectContent>
              </Select>
              {/* Date filter removed, always sorted by most recent */}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div ref={listScrollRef} onScroll={handleListScroll}>
            {isMobile ? (
              // Mobile: render compact cards instead of wide table
              <div className="space-y-3 p-2">
                {filteredShifts.length === 0 ? (
                  loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin opacity-60" />
                      <p>Chargement des shifts...</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Aucun shift enregistré</p>
                    </div>
                  )
                ) : (
                  filteredShifts.map(shift => {
                    const cashier = cashiers.find(u => u.id === shift.userId);
                    const cashierName = cashier ? cashier.username : (user?.username || '-');
                    const realAmount = (shift.status === 'closed' && shift.closingAmount !== null) ? shift.closingAmount : shift.openingAmount;
                    const computed = computedDiffs[shift.id];
                    return (
                      <div key={shift.id} className="p-3 border rounded-lg bg-white">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{formatDate(shift.openedAt)}</div>
                            <div className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-2">
                              <span className="truncate">{cashierName}</span>
                              <Badge className={shift.status === 'open' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}>
                                {shift.status === 'open' ? 'Ouvert' : 'Fermé'}
                              </Badge>
                            </div>
                            <div className="text-sm mt-2">{Math.round(realAmount)} FCFA</div>
                            {/* Ajout de l'écart sur mobile */}
                            {shift.status === 'closed' && shift.closingAmount !== null && computed && typeof computed.difference === 'number' && !isNaN(computed.difference) ? (
                              <div className={computed.difference >= 0 ? 'text-success text-xs mt-1' : 'text-destructive text-xs mt-1'}>
                                Écart : {computed.difference >= 0 ? '+' : ''}{Math.round(computed.difference)} FCFA
                              </div>
                            ) : null}
                          </div>
                          <div className="ml-3 flex flex-col items-end gap-2">
                            {shift.status === 'open' && user?.role !== 'admin' ? (
                              <div className="text-xs text-muted-foreground">Accès restreint</div>
                            ) : (
                              <Button size="icon" variant="outline" onClick={() => { setSelectedShift(shift); setShowDetails(true); }} title="Voir les détails">
                                <Eye className="w-5 h-5" />
                              </Button>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">{shift.closedAt ? formatDate(shift.closedAt) : '-'}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {loadingMore && (
                  <div className="text-center py-4">Chargement...</div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date d'ouverture</TableHead>
                    <TableHead className="hidden md:table-cell">Date de fermeture</TableHead>
                    <TableHead className="hidden lg:table-cell">Durée</TableHead>
                    <TableHead className="hidden lg:table-cell">Écart</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden md:table-cell">Caissier</TableHead>
                    <TableHead>Montant encaissé</TableHead>
                    <TableHead>Détails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShifts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Aucun shift enregistré</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredShifts.map((shift) => {
                      const cashier = cashiers.find(u => u.id === shift.userId);
                      let realAmount = shift.openingAmount;
                      if (shift.status === 'closed' && shift.closingAmount !== null) {
                        realAmount = shift.closingAmount;
                      }
                      const cashierName = cashier ? cashier.username : (user?.username || '-');
                      const computed = computedDiffs[shift.id];
                      return (
                        <TableRow key={shift.id}>
                          <TableCell>
                            <div className="font-medium">{formatDate(shift.openedAt)}</div>
                            {isMobile && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                <div>{shift.closedAt ? formatDate(shift.closedAt) : '-'}</div>
                                <div className="truncate">{cashierName}</div>
                                <div className="text-xs">
                                  {Math.round(realAmount)} FCFA • {shift.status === 'open' ? 'Ouvert' : 'Fermé'}
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{shift.closedAt ? formatDate(shift.closedAt) : '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell">{formatDuration(shift.openedAt, shift.closedAt)}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {shift.status === 'closed' && shift.closingAmount !== null && computed && typeof computed.difference === 'number' && !isNaN(computed.difference) ? (
                              <span className={computed.difference >= 0 ? 'text-success' : 'text-destructive'}>
                                {computed.difference >= 0 ? '+' : ''}{Math.round(computed.difference)} FCFA
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={shift.status === 'open' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}>
                              {shift.status === 'open' ? 'Ouvert' : 'Fermé'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{cashierName}</TableCell>
                          <TableCell>{Math.round(realAmount)} FCFA</TableCell>
                          <TableCell>
                            {shift.status === 'open' && user?.role !== 'admin' ? (
                              <div className="text-xs text-muted-foreground">Accès restreint</div>
                            ) : (
                              <Button
                                variant="outline"
                                size="icon"
                                title="Voir les détails"
                                onClick={() => {
                                  setSelectedShift(shift);
                                  setShowDetails(true);
                                }}
                              >
                                <Eye className="w-5 h-5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  {loadingMore && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Chargement...</TableCell>
                    </TableRow>
                  )}
                </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>

        {/* Details dialog (single instance) */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Détails du shift</DialogTitle>
            </DialogHeader>
            {selectedShift && (
              <div className="space-y-2">
                <ShiftReceiptDetails selectedShift={selectedShift} cashiers={cashiers} />
              </div>
            )}
          </DialogContent>
        </Dialog>

      </Card>
    </div>
  );
}
