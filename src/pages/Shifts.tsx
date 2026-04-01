import React, { useEffect, useState, useRef, useMemo, useCallback, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import { getEmailSettings } from '@/lib/emailSettingsCache';
import { emailService } from '@/lib/emailService';
import { pendingEmailService } from '@/lib/pendingEmailService';
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
import { fetchAndMerge, reconcileSalesToLastClosedShift } from '@/lib/sync';

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

// Fonctions de formatage définies hors du composant (stables)
const formatDateFn = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDurationFn = (start: number, end: number | null) => {
  const duration = (end || Date.now()) - start;
  const hours = Math.floor(duration / (1000 * 60 * 60));
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}min`;
};

const formatMoneyCompactFn = (value: number) => {
  return new Intl.NumberFormat('fr-FR')
    .format(Math.round(Number(value) || 0))
    .replace(/\u00A0|\u202F/g, ' ');
};

// Tri d'affichage: ouverts toujours en haut, fermés triés par closedAt décroissant (fallback openedAt)
const getShiftSortTs = (shift: Partial<Shift> | any) => {
  if (shift?.status === 'open') return Number.MAX_SAFE_INTEGER;
  // Les zombie shifts ont openedAt=2025 mais closedAt=2026 → on trie par closedAt pour les placer correctement
  return Number(shift?.closedAt) || Number(shift?.openedAt) || 0;
};

// ShiftCard défini HORS du composant pour éviter la recréation à chaque render
const ShiftCard = React.memo(({ shift, encaissé, computed, cashierName, isAdmin, onShowDetails }: {
  shift: Shift,
  encaissé: number,
  computed: {expected: number|null, difference: number|null} | undefined,
  cashierName: string,
  isAdmin: boolean,
  onShowDetails: (shift: Shift) => void
}) => {
  const isClosed = shift.status === 'closed';
  const isOpen = shift.status === 'open';
  const statusColor = isOpen ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200';
  const statusIcon = isOpen ? (
    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ) : (
    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M7 13l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  );
  let diffBadge = null;
  if (isClosed && computed && typeof computed.difference === 'number' && !isNaN(computed.difference)) {
    diffBadge = (
      <span className={
        'inline-block px-2 py-0.5 rounded text-xs font-semibold ' +
        (computed.difference >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
      }>
        {computed.difference >= 0 ? '+' : ''}{Math.round(computed.difference)} FCFA
      </span>
    );
  }
  return (
    <div className={
      `relative p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col gap-3 border ` +
      (isOpen
        ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-white'
        : 'border-gray-200 bg-gradient-to-br from-white to-slate-50')
    }>
      <div className="flex items-start gap-3">
        <div className="shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] sm:text-base text-gray-800 truncate">
            {isOpen ? 'Shift en cours' : 'Shift terminé'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Ouvert le {formatDateFn(shift.openedAt)}</div>
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          <span className={"px-2.5 py-1 rounded-full text-[11px] font-bold border " + statusColor}>
            {isOpen ? 'Ouvert' : 'Fermé'}
          </span>
          {!(isOpen && !isAdmin) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => onShowDetails(shift)}
              title="Voir les détails"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm">
        <div className="flex items-center gap-2 rounded-lg bg-white/80 border border-gray-100 px-2.5 py-2 text-gray-700">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          <span className="truncate">{isClosed && shift.closedAt ? formatDateFn(shift.closedAt) : (isOpen ? 'En cours' : '-')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          {formatDurationFn(shift.openedAt, shift.closedAt)}
          </span>
          {diffBadge}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-gray-600">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><path d="M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="2"/></svg>
          {cashierName}
        </span>
        <div className="rounded-lg bg-gray-900/[0.03] px-2.5 py-2 border border-gray-200/70">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">Montant encaissé</span>
          <div className="mt-0.5 text-base font-semibold text-gray-800">
            {(isOpen && !isAdmin) ? '***' : formatMoneyCompactFn(encaissé)} FCFA
          </div>
        </div>
        <span className="hidden items-center gap-1 text-gray-600">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="8" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8" stroke="currentColor" strokeWidth="2"/></svg>
          {(isOpen && !isAdmin) ? '***' : formatMoneyCompactFn(encaissé)} FCFA encaissé
        </span>
      </div>
      {(isOpen && !isAdmin) && (
        <div className="text-xs text-gray-500 font-medium">Accès restreint</div>
      )}
    </div>
  );
});

export default function Shifts() {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const { user } = useAuth();
  const { isOnline, isBackendReachable, manualSync } = useNetwork();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const refreshInFlight = useRef(false);
  const didRouteRefresh = useRef(false);

  // Cache pour optimiser le rechargement des données
  const shiftsCache = useRef<Map<string, any>>(new Map());

  // State to store computed expected/difference for closed shifts (maintenant calculé via useMemo)
  const [computedDiffsState, setComputedDiffsState] = useState<Record<string, {expected: number|null, difference: number|null}>>({});
  const [encaissesState, setEncaissesState] = useState<Record<string, number>>({});
  // State pour suivre la synchronisation
  const [syncing, setSyncing] = useState(false);
  // Cache des ventes en mémoire pour éviter les appels DB répétés
  const salesCache = useRef<any[]>([]);
  const salesCacheTimestamp = useRef<number>(0);
  const [salesVersion, setSalesVersion] = useState(0);
  const salesRefreshInFlight = useRef(false);
  
  // Debounce pour la recherche (optimisation)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Helper robuste pour conversion numérique (mémorisé)
  const toNum = useCallback((v: any) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    let s = String(v);
    s = s.replace(/\u00A0|\u202F/g, '');
    s = s.replace(/\s+/g, '');
    s = s.replace(/,/g, '.');
    s = s.replace(/[^0-9.\-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }, []);

  const refreshSalesFromBackend = useCallback(async () => {
    if (!isOnline || !isBackendReachable || salesRefreshInFlight.current) return;
    const now = Date.now();
    if (salesCacheTimestamp.current && (now - salesCacheTimestamp.current) < 2 * 60 * 1000) return;
    salesRefreshInFlight.current = true;
    try {
      const params = user?.storeId ? { storeId: String(user.storeId) } : undefined;
      await fetchAndMerge(
        'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php',
        'sales',
        'sales',
        undefined,
        params
      );
      await reconcileSalesToLastClosedShift(user?.storeId);
      const db = await getDB();
      const mergedSales = await db.getAll('sales');
      salesCache.current = mergedSales;
      salesCacheTimestamp.current = Date.now();
      shiftsCache.current.clear();
      setSalesVersion(v => v + 1);
    } catch (e) {
      console.warn('Erreur rafraîchissement ventes backend (shifts):', e);
    } finally {
      salesRefreshInFlight.current = false;
    }
  }, [isOnline, isBackendReachable, user?.storeId]);

  const refreshLocalSalesCache = useCallback(async (db?: any) => {
    try {
      const localDb = db || await getDB();
      const allSales = await localDb.getAll('sales');
      salesCache.current = allSales;
      salesCacheTimestamp.current = Date.now();
      shiftsCache.current.clear();
      setSalesVersion(v => v + 1);
    } catch (e) {
      console.warn('Erreur rafraÃ®chissement cache ventes local (shifts):', e);
    }
  }, []);

  // Gestionnaires d'événements optimisés avec useCallback
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleOpeningAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOpeningAmount(e.target.value);
  }, []);

  const handleCashAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCashAmount(e.target.value);
  }, []);

  const handleMobileMoneyAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMobileMoneyAmount(e.target.value);
  }, []);

  const showShiftDetails = useCallback((shift: Shift) => {
    setSelectedShift(shift);
    setShowDetails(true);
  }, []);

  // Fonctions de formatage (référence aux fonctions globales)
  const formatMoney = useCallback((v: number | null | undefined) => {
    if (v === null || v === undefined || isNaN(Number(v))) return '0';
    return new Intl.NumberFormat('fr-FR').format(Math.round(Number(v))).replace(/\u00A0|\u202F/g, ' ');
  }, []);

  // Alias vers fonctions globales
  const formatDate = formatDateFn;
  const formatDuration = formatDurationFn;

  const loadCashiers = useCallback(async () => {
    const db = await getDB();
    const users = await db.getAll('users');
    
    // Filtrer par magasin actuel, quel que soit le rôle
    let filtered = users;
    if (user?.storeId) {
      filtered = filtered.filter(u => u.storeId === user.storeId);
    }
    
    setCashiers(filtered);
  }, [user?.storeId]);

  // Fonction pour nettoyer les shifts multiples ouverts d'un même utilisateur dans le même magasin
  const cleanupMultipleOpenShifts = async () => {
    try {
      const db = await getDB();
      const allShifts = await db.getAll('shifts');
      
      // Grouper les shifts ouverts par utilisateur ET par magasin
      const openShiftsByUserStore: Record<string, any[]> = {};
      
      allShifts.forEach(shift => {
        if (shift.status === 'open') {
          // Créer une clé unique combinant userId et storeId
          const key = `${shift.userId}_${shift.storeId}`;
          if (!openShiftsByUserStore[key]) {
            openShiftsByUserStore[key] = [];
          }
          openShiftsByUserStore[key].push(shift);
        }
      });
      
      // Pour chaque combinaison utilisateur-magasin ayant plusieurs shifts ouverts, fermer les plus anciens
      for (const userStoreKey in openShiftsByUserStore) {
        const userStoreShifts = openShiftsByUserStore[userStoreKey];
        if (userStoreShifts.length > 1) {
          const [userId, storeId] = userStoreKey.split('_');
          // Fermeture automatique des shifts en doublon
          
          // Trier par date d'ouverture (le plus récent en premier)
          userStoreShifts.sort((a, b) => b.openedAt - a.openedAt);
          
          // Garder seulement le plus récent, fermer les autres
          for (let i = 1; i < userStoreShifts.length; i++) {
            const oldShift = userStoreShifts[i];
            const closedShift = {
              ...oldShift,
              status: 'closed',
              closedAt: Date.now(),
              closingAmount: oldShift.openingAmount || 0, // Fermer avec le montant d'ouverture par défaut
              expectedAmount: oldShift.openingAmount || 0,
              difference: 0
            };
            
            await db.put('shifts', closedShift);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des shifts multiples:', error);
    }
  };

  // Supprimé: le nettoyage automatique au démarrage était trop agressif
  // (supprimait les shifts dont les ventes n'avaient pas de shiftId renseigné)
  // La suppression ne se fait qu'à la fermeture active d'un shift sans vente.

  // Fonction de correction automatique des shifts fermés après synchronisation
  const correctClosedShifts = async (db: any) => {
    // Désactivé: on respecte uniquement les montants saisis à la fermeture
    return;
    try {
      
      // Récupérer tous les shifts fermés en une seule fois
      const allShifts = await db.getAll('shifts');
      const closedShifts = allShifts.filter((s: any) => s.status === 'closed');
      
      if (closedShifts.length === 0) return;

      // Récupérer toutes les ventes en une seule fois pour optimiser
      const allSales = await db.getAll('sales');
      
      // Helper pour conversion robuste
      const toNum = (v: any) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number' && !isNaN(v)) return v;
        let s = String(v);
        s = s.replace(/\u00A0|\u202F/g, '');
        s = s.replace(/\s+/g, '');
        s = s.replace(/,/g, '.');
        s = s.replace(/[^0-9.\-]/g, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      // Traiter chaque shift fermé
      let correctedCount = 0;
      const shiftsToUpdate: any[] = [];

      for (const shift of closedShifts) {
        // Ne JAMAIS écraser shift.difference s'il existe déjà (valeur de référence définie à la fermeture)
        if (shift.difference !== null && shift.difference !== undefined && !isNaN(Number(shift.difference))) {
          continue;
        }

        // Seulement pour les shifts sans difference (anciens ou corrompus)
        const shiftSales = allSales.filter((s: any) => s.shiftId === shift.id);
        
        const opening = toNum(shift.openingAmount || 0);
        let encaisseNet = 0;
        for (const sale of shiftSales) {
          const isRefunded = Boolean(sale.refunded);
          if (isRefunded) {
            encaisseNet -= toNum(sale.total ?? 0);
          } else {
            encaisseNet += toNum(sale.total ?? 0);
          }
        }
        
        const expectedAmount = opening + encaisseNet;
        const difference = toNum(shift.closingAmount || 0) - expectedAmount;
        
        shiftsToUpdate.push({
          ...shift,
          expectedAmount,
          difference
        });
        correctedCount++;
      }

      // Mettre à jour tous les shifts corrigés en batch
      if (shiftsToUpdate.length > 0) {
        const tx = db.transaction('shifts', 'readwrite');
        await Promise.all([
          ...shiftsToUpdate.map(s => tx.store.put(s)),
          tx.done
        ]);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la correction automatique des shifts:', error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const initializeData = async () => {
      try {
        // 1. Charger UNIQUEMENT caissiers + shifts locaux (ultra rapide)
        const db = await getDB();
        await Promise.all([
          loadCashiers(),
          loadFromLocal(db)
        ]);
        if (cancelled) return;
        setDataLoaded(true);

        // 2. Charger les ventes en arrière-plan (pour les calculs d'encaissé)
        db.getAll('sales').then((allSales: any[]) => {
          if (cancelled || !allSales) return;
          salesCache.current = allSales;
          salesCacheTimestamp.current = Date.now();
        }).catch(() => {});

        // 3. Sync backend immédiatement si en ligne (non bloquant)
        if (isOnline) {
          loadShifts().catch(() => {});
          refreshSalesFromBackend().catch(() => {});
        }

        // 4. Nettoyage en arrière-plan différé (correction désactivée : shift.difference est immuable)
        requestIdleCallback(() => {
          if (cancelled) return;
          cleanupMultipleOpenShifts().catch(() => {});
        }, { timeout: 5000 });
      } catch (error) {
        if (!cancelled) setDataLoaded(true);
      }
    };
    initializeData();
    return () => { cancelled = true; };
  }, [loadCashiers, isOnline, refreshSalesFromBackend]);

  // Map de lookup caissiers par ID (O(1) au lieu de O(N))
  const cashierById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of cashiers) m.set(String(c.id), c);
    return m;
  }, [cashiers]);

  // Filtrage optimisé avec useMemo - PAS de state intermédiaire
  const filteredShifts = useMemo(() => {
    let result = shifts;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(s => {
        const cashier = cashierById.get(String(s.userId));
        return (
          (cashier?.username?.toLowerCase().includes(q) || false) ||
          formatDate(s.openedAt).toLowerCase().includes(q)
        );
      });
    }
    if (selectedCashier !== 'all') {
      result = result.filter(s => s.userId === selectedCashier);
    }
    if (selectedStatus !== 'all') {
      result = result.filter(s => s.status === selectedStatus);
    }
    // Éviter les doublons visibles (refresh/pagination) et stabiliser l'ordre
    const uniqueById = new Map<string, Shift>();
    for (const s of result) uniqueById.set(String(s.id), s);
    return Array.from(uniqueById.values()).sort((a, b) => getShiftSortTs(b) - getShiftSortTs(a));
  }, [shifts, debouncedSearch, selectedCashier, selectedStatus, cashierById]);

  // Calculs asynchrones optimisés avec cache intelligent et index Sales par shiftId
  useEffect(() => {
    let mounted = true;

    const calculateShiftsData = async () => {
      if (filteredShifts.length === 0) {
        setComputedDiffsState({});
        setEncaissesState({});
        return;
      }

      // Vérifier si tous les shifts sont déjà en cache
      const allCached = filteredShifts.every(s => shiftsCache.current.has(s.id));
      if (allCached) {
        const results: Record<string, {expected: number|null, difference: number|null}> = {};
        const encaissesResults: Record<string, number> = {};
        for (const shift of filteredShifts) {
          const cached = shiftsCache.current.get(shift.id)!;
          encaissesResults[shift.id] = cached.encaissé;
          if (shift.status === 'closed') {
            results[shift.id] = { expected: cached.expected, difference: cached.difference };
          }
        }
        if (mounted) { setComputedDiffsState(results); setEncaissesState(encaissesResults); }
        return;
      }

      const results: Record<string, {expected: number|null, difference: number|null}> = {};
      const encaissesResults: Record<string, number> = {};

      // Utiliser le cache des ventes (déjà chargé lors de l'init)
      let allSales = salesCache.current;
      if (allSales.length === 0) {
        const db = await getDB();
        allSales = await db.getAll('sales');
        salesCache.current = allSales;
        salesCacheTimestamp.current = Date.now();
      }

      // Construire un index des ventes par shiftId en une seule passe O(N)
      const salesByShiftId = new Map<string, any[]>();
      const salesNoShiftId: any[] = [];
      for (const sale of allSales) {
        if (sale?.shiftId) {
          const arr = salesByShiftId.get(sale.shiftId);
          if (arr) arr.push(sale); else salesByShiftId.set(sale.shiftId, [sale]);
        } else {
          salesNoShiftId.push(sale);
        }
      }

      for (const shift of filteredShifts) {
        if (shiftsCache.current.has(shift.id)) {
          const cached = shiftsCache.current.get(shift.id)!;
          encaissesResults[shift.id] = cached.encaissé;
          if (shift.status === 'closed') {
            results[shift.id] = { expected: cached.expected, difference: cached.difference };
          }
          continue;
        }

        // O(1) lookup au lieu de O(N) filter
        let sales = salesByShiftId.get(shift.id) || [];
        // Fallback: ventes sans shiftId dans l'intervalle de temps
        if (salesNoShiftId.length > 0) {
          const shiftEnd = shift.closedAt || Date.now();
          const extra = salesNoShiftId.filter((s: any) => {
            const t = s.createdAt || s.timestamp || 0;
            return t >= shift.openedAt && t <= shiftEnd;
          });
          if (extra.length > 0) sales = sales.length > 0 ? [...sales, ...extra] : extra;
        }

        const isClosed = shift.status === 'closed';
        let cash = 0, mobile = 0;
        if (isClosed) {
          // Pour un shift fermÃ©, on prend UNIQUEMENT les montants saisis Ã  la fermeture
          if (shift.cashAmount !== undefined || shift.mobileMoneyAmount !== undefined) {
            const rawCash = toNum(shift.cashAmount || 0);
            const op = toNum(shift.openingAmount || 0);
            cash = rawCash > op ? rawCash - op : 0;
            mobile = toNum(shift.mobileMoneyAmount || 0);
          } else {
            cash = 0;
            mobile = 0;
          }
        } else {
          for (const sale of sales) {
            const isRefunded = Boolean(sale.refunded);
            let saleCash = 0, saleMobile = 0;
            if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
              saleCash = toNum(sale.cashAmount || 0);
              saleMobile = toNum(sale.mobileMoneyAmount || 0);
            } else if (sale.payments && Array.isArray(sale.payments)) {
              for (const p of sale.payments) {
                if (p.method === 'cash') saleCash += toNum(p.amount);
                if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
              }
            } else {
              if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
              if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
            }
            if (isRefunded) { cash -= saleCash; mobile -= saleMobile; }
            else { cash += saleCash; mobile += saleMobile; }
          }
        }
        encaissesResults[shift.id] = cash + mobile;

        if (isClosed) {
          const expected = (shift.expectedAmount !== null && shift.expectedAmount !== undefined) ? toNum(shift.expectedAmount) : null;
          const difference = (shift.difference !== null && shift.difference !== undefined) ? toNum(shift.difference) : null;
          results[shift.id] = { expected, difference };
          shiftsCache.current.set(shift.id, { encaissé: cash + mobile, expected, difference });
        } else {
          shiftsCache.current.set(shift.id, { encaissé: cash + mobile, expected: null, difference: null });
        }

      }

      if (mounted) {
        startTransition(() => {
          setComputedDiffsState(results);
          setEncaissesState(encaissesResults);
        });
      }
    };

    // Exécuter immédiatement - pas de délai
    calculateShiftsData();
    return () => { mounted = false; };
  }, [filteredShifts, toNum, salesVersion]);

  const loadShifts = async () => {
    // Ne pas bloquer si déjà en cours de chargement
    if (loading) return;
    setLoading(true);
    try {
      const db = await getDB();
      
      // Si en ligne, charger UNIQUEMENT les shifts depuis le backend (léger et rapide)
      if (isOnline) {
        setSyncing(true);
        try {
          // Appeler SEULEMENT shifts.php - les ventes et users sont déjà en local
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php';
          if (user?.storeId) url += `?storeId=${user.storeId}`;

          const response = await fetch(url);
          
          if (response.ok) {
            const backendShifts = await response.json();
            
            if (Array.isArray(backendShifts) && backendShifts.length > 0) {
              // Mettre à jour la base locale (merge: put tous les shifts backend)
              const tx = db.transaction('shifts', 'readwrite');
              await Promise.all([
                ...backendShifts.map(s => tx.store.put(s)),
                tx.done
              ]);
              // Invalider le cache des calculs
              shiftsCache.current.clear();

              // Supprimer les shifts ouverts locaux fantômes (ouverts en local mais absents du backend)
              // SÉCURITÉ: ne pas supprimer un shift récent (<5 min) ou qui a une op en attente de sync
              const backendIds = new Set(backendShifts.map((s: any) => String(s.id)));
              const allLocal = await db.getAll('shifts');
              const pendingOps = await db.getAll('syncQueue');
              const pendingShiftIds = new Set(
                pendingOps.filter((op: any) => op.table === 'shifts' || op.url?.includes('shifts')).map((op: any) => String(op.data?.id))
              );
              const FIVE_MINUTES = 5 * 60 * 1000;
              const ghostOpen = allLocal.filter((s: any) =>
                s.status === 'open' && !backendIds.has(String(s.id)) &&
                (!user?.storeId || s.storeId === user.storeId) &&
                !pendingShiftIds.has(String(s.id)) &&
                (Date.now() - (s.openedAt || 0)) > FIVE_MINUTES
              );
              if (ghostOpen.length > 0) {
                const tx2 = db.transaction('shifts', 'readwrite');
                await Promise.all([...ghostOpen.map((s: any) => tx2.store.delete(s.id)), tx2.done]);
              }

              // Relire depuis le local en respectant la pagination
              await loadShiftsPage(db, 0, pageSize, true);
            }

            // correctClosedShifts désactivé : shift.difference est toujours lu depuis la fermeture
          } else {
            throw new Error(`Erreur HTTP ${response.status}`);
          }
        } catch (error) {
          // En cas d'erreur, les données locales sont déjà affichées
        } finally {
          setSyncing(false);
        }
      }

      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount(db);
    } catch (error) {
      // Silencieux - les données locales sont déjà affichées
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
      all.sort((a: any, b: any) => getShiftSortTs(b) - getShiftSortTs(a));
      const normalized = all.map((s: any) => ({ ...s, storeId: s.storeId || '' }));
      // Filter depending on role
      let visible = normalized;
      if (user?.role === 'admin' && user?.storeId) {
        visible = normalized.filter((s: any) => s.storeId === user.storeId);
      } else {
        visible = normalized.filter((s: any) => s.userId === user?.id);
      }
      const page = reset ? visible.slice(0, limit) : visible.slice(offset, offset + limit);
      const totalVisible = visible.length;

      if (reset) {
        setShifts(page);
        setLoadedCount(page.length);
      } else {
        setShifts(prev => {
          const merged = [...prev, ...page];
          const unique = new Map<string, Shift>();
          for (const s of merged) unique.set(String(s.id), s as Shift);
          const out = Array.from(unique.values()).sort((a, b) => getShiftSortTs(b) - getShiftSortTs(a));
          setLoadedCount(out.length);
          return out;
        });
      }
      setHasMore(reset ? totalVisible > page.length : (offset + page.length) < totalVisible);
      const active = (reset ? page : [...shifts, ...page]).find(s => s.status === 'open' && s.userId === user?.id);
      setActiveShift(active || null);
      return page;
    } catch (e) {
      console.error('Erreur chargement paginé shifts:', e);
      const all = await db.getAll('shifts');
      all.sort((a: any, b: any) => getShiftSortTs(b) - getShiftSortTs(a));
      const filtered = user?.role === 'admin' ? all : all.filter((s: any) => s.userId === user?.id);
      const page = reset ? filtered.slice(0, limit) : filtered.slice(offset, offset + limit);
      const totalFiltered = filtered.length;
      if (reset) {
        setShifts(page);
        setLoadedCount(page.length);
      } else {
        setShifts(prev => {
          const merged = [...prev, ...page];
          const unique = new Map<string, Shift>();
          for (const s of merged) unique.set(String(s.id), s as Shift);
          const out = Array.from(unique.values()).sort((a, b) => getShiftSortTs(b) - getShiftSortTs(a));
          setLoadedCount(out.length);
          return out;
        });
      }
      setHasMore(reset ? totalFiltered > page.length : (offset + page.length) < totalFiltered);
      return page;
    }
  };

  const refreshShiftsView = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const db = await getDB();
      await loadShiftsPage(db, 0, pageSize, true);
      await refreshLocalSalesCache(db);
      if (isOnline && isBackendReachable) {
        loadShifts().catch(() => {});
        refreshSalesFromBackend().catch(() => {});
      }
    } catch (e) {
      console.warn('Erreur rafraÃ®chissement vue shifts:', e);
    } finally {
      refreshInFlight.current = false;
    }
  }, [pageSize, isOnline, isBackendReachable, loadShifts, refreshSalesFromBackend, refreshLocalSalesCache]);

  useEffect(() => {
    if (location.pathname !== '/shifts') return;
    if (!didRouteRefresh.current) {
      didRouteRefresh.current = true;
      return;
    }
    refreshShiftsView();
    // Important: ne dépendre que du pathname pour éviter les refresh en boucle
    // quand refreshShiftsView change d'identité entre les renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshShiftsView();
      }
    };
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshShiftsView();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshShiftsView]);

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const handleListScroll = useCallback(async () => {
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
  }, [loadingMore, hasMore, loadedCount, pageSize]);

  const processShifts = useCallback((allShifts: any[]) => {
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
      visibleShifts = normalizedShifts.filter(s => s.userId === user?.id);
    }
    setShifts(visibleShifts.sort((a, b) => getShiftSortTs(b) - getShiftSortTs(a)));
    const active = visibleShifts.find(s => s.status === 'open' && s.userId === user?.id);
    setActiveShift(active || null);
  }, [user?.role, user?.storeId, user?.id]);



  const printShiftReceipt = async (shift: any) => {
    try {
      const db = await getDB();
      const store = await db.get('stores', shift.storeId);
      const storeName = store?.name || 'Magasin';
      const user = await db.get('users', shift.userId);
      const cashier = user?.username || '-';
      const allShiftSales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
      // Filtrer les ventes dans l'intervalle de temps du shift
      const sales = allShiftSales.filter((s: any) => {
        const saleTime = s.createdAt || s.timestamp || 0;
        const shiftStart = shift.openedAt;
        const shiftEnd = shift.closedAt || Date.now();
        return saleTime >= shiftStart && saleTime <= shiftEnd;
      });
      console.log(`[PRINT] Shift ${shift.id}: ${allShiftSales.length} ventes trouv?es, ${sales.length} dans l'intervalle de temps`);
      const toNum = (v: any) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number' && !isNaN(v)) return v;
        let s = String(v);
        s = s.replace(/ | /g, '');
        s = s.replace(/\s+/g, '');
        s = s.replace(/,/g, '.');
        s = s.replace(/[^0-9.\-]/g, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      
      let cash = 0, mobile = 0;
      
      if (shift.status === 'closed') {
        // Pour un shift ferm?, utiliser UNIQUEMENT les montants saisis par le caissier
        if (shift.cashAmount !== undefined || shift.mobileMoneyAmount !== undefined) {
          // Pour les esp?ces, soustraire le montant d'ouverture car il est inclus dans cashAmount
          const rawCash = toNum(shift.cashAmount || 0);
          const openingAmount = toNum(shift.openingAmount || 0);
          cash = rawCash > openingAmount ? rawCash - openingAmount : 0;
          mobile = toNum(shift.mobileMoneyAmount || 0);
          console.log('[PRINT] Utilisation montants saisis fermeture - Cash (apr?s soustraction ouverture):', cash, 'Mobile:', mobile);
        } else {
          cash = 0;
          mobile = 0;
        }
      } else {
        // Shift ouvert: calcul depuis les ventes
        console.log('[PRINT] Shift ouvert: calcul depuis les ventes');
        for (const s of sales) {
          const isRefunded = Boolean(s.refunded);
          if (isRefunded) continue; // Ignorer les ventes rembours?es
          
          let saleCash = 0, saleMobile = 0;
          
          if (s.cashAmount !== undefined || s.mobileMoneyAmount !== undefined) {
            saleCash = toNum(s.cashAmount || 0);
            saleMobile = toNum(s.mobileMoneyAmount || 0);
          } else if (s.payments && Array.isArray(s.payments)) {
            for (const p of s.payments) {
              if (p.method === 'cash') saleCash += toNum(p.amount);
              if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
            }
          } else {
            if (s.paymentMethod === 'cash') saleCash = toNum(s.total);
            if (s.paymentMethod === 'mobile_money') saleMobile = toNum(s.total);
          }
          
          cash += saleCash;
          mobile += saleMobile;
        }
      }

      let expectedAmount: number | null = null;
      let difference: number | null = null;
      if (shift.status === 'closed') {
        expectedAmount = (shift.expectedAmount !== null && shift.expectedAmount !== undefined) ? toNum(shift.expectedAmount) : null;
        difference = (shift.difference !== null && shift.difference !== undefined) ? toNum(shift.difference) : null;
      } else {
        // Shift ouvert: calcul attendu bas? sur les ventes
        let encaisseNet = 0;
        for (const sale of sales) {
          const isRefunded = Boolean(sale.refunded);
          if (isRefunded) {
            encaisseNet -= toNum(sale.total ?? 0); // D?duire les remboursements
          } else {
            encaisseNet += toNum(sale.total ?? 0); // Ajouter les ventes
          }
        }
        const opening = toNum(shift.openingAmount || 0);
        expectedAmount = opening + encaisseNet;
        difference = encaisseNet - expectedAmount;
      }

// Calculer les remboursements séparément pour affichage
      let refundsCash = 0, refundsMobile = 0;
      
      for (const s of sales) {
        const isRefunded = Boolean(s.refunded);
        
        if (isRefunded) {
          let saleCash = 0, saleMobile = 0;
          
          if (s.cashAmount !== undefined || s.mobileMoneyAmount !== undefined) {
            saleCash = toNum(s.cashAmount || 0);
            saleMobile = toNum(s.mobileMoneyAmount || 0);
          } else if (s.payments && Array.isArray(s.payments)) {
            for (const p of s.payments) {
              if (p.method === 'cash') saleCash += toNum(p.amount);
              if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
            }
          } else {
            if (s.paymentMethod === 'cash') saleCash = toNum(s.total);
            if (s.paymentMethod === 'mobile_money') saleMobile = toNum(s.total);
          }
          
          refundsCash += saleCash;
          refundsMobile += saleMobile;
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
      
      // Afficher les remboursements s'il y en a
      const totalRefunds = refundsCash + refundsMobile;
      if (totalRefunds > 0) {
        lines.push('');
        lines.push(NativePrinter.formatColumns('Remboursements :', '', width));
        if (refundsCash > 0) {
          lines.push(NativePrinter.formatColumns('  Especes :', `${formatMoney(refundsCash)} FCFA`, width));
        }
        if (refundsMobile > 0) {
          lines.push(NativePrinter.formatColumns('  Mobile Money :', `${formatMoney(refundsMobile)} FCFA`, width));
        }
        lines.push(NativePrinter.formatColumns('  Total rembourse :', `${formatMoney(totalRefunds)} FCFA`, width));
      }
      
      lines.push('--------------------------------');
      // Utiliser les valeurs recalculées au lieu des valeurs stockées
      const expectedText = expectedAmount === null ? '-' : (formatMoney(expectedAmount) + ' FCFA');
      const diffText = difference === null ? '-' : ((difference >= 0 ? '+' : '') + formatMoney(difference) + ' FCFA');
      lines.push(NativePrinter.formatColumns('Montant attendu :', expectedText, width));
      lines.push(NativePrinter.formatColumns('Ecart :', diffText, width));
      // Duration
      const durationMs = (shift.closedAt || Date.now()) - shift.openedAt;
      const h = Math.floor(durationMs / (1000*60*60));
      const m = Math.floor((durationMs % (1000*60*60)) / (1000*60));
      lines.push(NativePrinter.formatColumns('Duree :', `${h}h ${m}min`, width));
      lines.push('--------------------------------');
      lines.push(NativePrinter.formatColumns('Montant encaissé :', '', width));
      lines.push(NativePrinter.formatColumns('Especes :', `${formatMoney(cash)} FCFA`, width));
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
        const html = buildReceiptHtml(tmp, 'Rapport service');
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

  const handleOpenShift = useCallback(async () => {
    let amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Montant invalide');
      return;
    }
    amount = Math.round(amount);
    
    try {
      setLoading(true);
      const db = await getDB();
      
      // 🔒 DOUBLE VÉRIFICATION: Locale ET Backend si en ligne
      // 1. Vérification locale
      const existingShifts = await db.getAll('shifts');
      const userOpenShift = existingShifts.find(s => 
        s.userId === user!.id && 
        s.status === 'open' && 
        s.storeId === user!.storeId
      );
      
      if (userOpenShift) {
        toast.error('Vous avez déjà un shift ouvert dans ce magasin. Fermez-le avant d\'en ouvrir un nouveau.');
        setLoading(false);
        return;
      }
      
      // 2. Vérification backend si en ligne (pour détecter shift ouvert sur autre appareil)
      if (isOnline) {
        try {
          const checkUrl = `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php?storeId=${user!.storeId}`;
          const checkResponse = await fetch(checkUrl);
          if (checkResponse.ok) {
            const backendShifts = await checkResponse.json();
            const backendOpenShift = backendShifts.find((s: any) => 
              s.userId === user!.id && 
              s.status === 'open' && 
              s.storeId === user!.storeId
            );
            
            if (backendOpenShift) {
              // Un shift est déjà ouvert pour cet utilisateur (même appareil ou autre appareil)
              // → on l'adopte directement sans bloquer
              await db.put('shifts', backendOpenShift);
              setActiveShift(backendOpenShift);
              setLoading(false);
              toast.success('Shift actif récupéré.');
              setShowOpenDialog(false);
              setOpeningAmount('');
              try { navigate('/pos'); } catch (e) {}
              return;
            }
          }
        } catch (checkError) {
          console.warn('Impossible de vérifier le backend, tentative d\'ouverture locale:', checkError);
        }
      }
      
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

          if (response.status === 409) {
            // Un shift est déjà ouvert pour cet utilisateur
            const errorData = await response.json();
            console.error('🚫 Shift déjà ouvert:', errorData);
            
            // Supprimer le nouveau shift créé localement (doublon)
            await db.delete('shifts', newShift.id);
            
            // Récupérer le shift existant depuis le backend et l'utiliser directement
            try {
              const existingUrl = `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php?storeId=${user!.storeId}`;
              const existingResp = await fetch(existingUrl);
              if (existingResp.ok) {
                const allShifts = await existingResp.json();
                const existingOpenShift = allShifts.find((s: any) =>
                  s.userId === user!.id && s.status === 'open' && s.storeId === user!.storeId
                );
                if (existingOpenShift) {
                  await db.put('shifts', existingOpenShift);
                  setActiveShift(existingOpenShift);
                  setShowOpenDialog(false);
                  setOpeningAmount('');
                  setLoading(false);
                  toast.success('Shift actif récupéré.');
                  try { navigate('/pos'); } catch (e) {}
                  return;
                }
              }
            } catch (fetchErr) {
              console.warn('Impossible de récupérer le shift existant:', fetchErr);
            }
            
            // Fallback: afficher message et recharger
            toast.error('Un shift est déjà ouvert. Rechargement...');
            setShowOpenDialog(false);
            setOpeningAmount('');
            setLoading(false);
            await loadShifts();
            return;
          }

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
  }, [openingAmount, user, isOnline, loadShifts, navigate]);

  const handleCloseShift = useCallback(async () => {
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
      
      // Calculate expected amount - sans les dépenses
      const allShiftSales = await db.getAllFromIndex('sales', 'by-shift', activeShift.id);
      // Filtrer les ventes dans l'intervalle de temps du shift
      const sales = allShiftSales.filter((s: any) => {
        const saleTime = s.createdAt || s.timestamp || 0;
        const shiftStart = activeShift.openedAt;
        const shiftEnd = Date.now(); // Shift en cours de fermeture
        return saleTime >= shiftStart && saleTime <= shiftEnd;
      });
      console.log(`🔐 [CLOSE] Shift ${activeShift.id}: ${allShiftSales.length} ventes trouvées, ${sales.length} dans l'intervalle de temps`);
      // robust numeric parser to tolerate strings like "5 000", null, undefined, etc.
      const toNum = (v: any) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number' && !isNaN(v)) return v;
        let s = String(v);
        s = s.replace(/\u00A0|\u202F/g, '');
        s = s.replace(/\s+/g, '');
        s = s.replace(/,/g, '.');
        s = s.replace(/[^0-9.\-]/g, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      // Calculer l'encaissé net pour le montant attendu
      let encaisseNet = 0;
      for (const sale of sales) {
        const isRefunded = Boolean(sale.refunded);
        if (isRefunded) {
          encaisseNet -= toNum(sale.total ?? 0); // Déduire les remboursements
        } else {
          encaisseNet += toNum(sale.total ?? 0); // Ajouter les ventes
        }
      }
      const expectedAmount = (activeShift.openingAmount ? Number(activeShift.openingAmount) : 0) + encaisseNet;
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
      
      // Fallback: ventes sans shiftId dans l'intervalle du shift
      if (sales.length === 0) {
        const allSalesDb = await db.getAll('sales');
        const shiftEnd = Date.now();
        const extraSales = allSalesDb.filter((s: any) => {
          if (s.shiftId) return false; // déjà couvert par l'index
          const t = s.createdAt || s.timestamp || 0;
          return t >= activeShift.openedAt && t <= shiftEnd;
        });
        if (extraSales.length > 0) {
          // Il y a des ventes sans shiftId → ne pas supprimer
          // On continue la fermeture normale
        }
      }

      // Si aucune vente dans ce shift (ni par shiftId ni par plage horaire), supprimer
      const allSalesForCheck = sales.length === 0 ? await (async () => {
        const allSalesDb = await db.getAll('sales');
        return allSalesDb.filter((s: any) => {
          if (s.shiftId) return false;
          const t = s.createdAt || s.timestamp || 0;
          return t >= activeShift.openedAt && t <= Date.now();
        });
      })() : [];
      if (sales.length === 0 && allSalesForCheck.length === 0) {
        await db.delete('shifts', activeShift.id);
        if (isOnline) {
          fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php?id=${encodeURIComponent(activeShift.id)}`, {
            method: 'DELETE'
          }).catch(() => {});
        }
        setActiveShift(null);
        setShowCloseDialog(false);
        setCashAmount('');
        setMobileMoneyAmount('');
        setOtherAmount('');
        shiftsCache.current.clear();
        await loadShifts();
        toast.success('Shift sans vente supprimé automatiquement');
        return;
      }

      // Sauvegarder localement d'abord
      await db.put('shifts', updatedShift);

      // ✅ Mettre à jour l'état UI immédiatement — ne pas attendre email/sync
      setActiveShift(null);
      setShowCloseDialog(false);
      setCashAmount('');
      setMobileMoneyAmount('');
      setOtherAmount('');
      loadShifts();
      toast.success('Shift fermé avec succès');

      // Notifier les autres onglets (POS, etc.) que le shift est fermé
      try {
        localStorage.setItem('shift_closed_event', JSON.stringify({ shiftId: updatedShift.id, closedAt: updatedShift.closedAt }));
      } catch {}

      // Envoi automatique d'un email à l'admin avec résumé complet du shift
      try {
        const dbInstance = await getDB();
        
        // Vérifier les paramètres d'email pour les shifts (lit depuis le backend = source de vérité)
        const emailSettings = await getEmailSettings(updatedShift.storeId);
        const shouldSendEmail = emailSettings.shifts;
        
        if (!shouldSendEmail) {
          console.log('📧 Email désactivé pour les fermetures de shifts');
        } else {
          // Récupérer l'utilisateur caissier
          const cashier = user;
          console.log('📧 [SHIFT] Préparation envoi à tous les admins du store:', updatedShift.storeId);
          
          // Récupérer le nom du magasin depuis la base locale
          const store = await dbInstance.get('stores', updatedShift.storeId);
          const storeName = store?.name || updatedShift.storeId || 'Magasin';
          
          // Construire le résumé complet du shift
          const durationMs = (updatedShift.closedAt ?? Date.now()) - updatedShift.openedAt;
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          
          // Calculer le montant réel des espèces (sans montant d'ouverture)
          const rawCashAmount = updatedShift.cashAmount ?? 0;
          const openingAmount = updatedShift.openingAmount ?? 0;
          const realCashAmount = rawCashAmount > openingAmount ? rawCashAmount - openingAmount : 0;
          
          const resume = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">👤 Informations de l'utilisateur</h3>
    <div class="info-row">
      <span class="info-label">Utilisateur :&nbsp;</span>
      <span class="info-value">${cashier?.username || 'Inconnu'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Rôle :&nbsp;</span>
      <span class="info-value">${cashier?.role === 'admin' ? 'Admin' : cashier?.role === 'manager' ? 'Gestionnaire' : cashier?.role === 'super_admin' ? 'Super Admin' : 'Caissier'}</span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📅 Période du Service</h3>
    <div class="info-row">
      <span class="info-label">Ouverture :&nbsp;</span>
      <span class="info-value">${new Date(updatedShift.openedAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Fermeture :&nbsp;</span>
      <span class="info-value">${new Date(updatedShift.closedAt ?? Date.now()).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Durée totale :&nbsp;</span>
      <span class="info-value">${hours}h ${minutes}min</span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">💰 Montants</h3>
    <div class="info-row">
      <span class="info-label">Montant d'ouverture :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${(updatedShift.openingAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">Montant de fermeture :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${(updatedShift.closingAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">Montant attendu :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${(updatedShift.expectedAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
  </div>

  <div class="${(updatedShift.difference ?? 0) >= 0 ? 'highlight positive' : 'highlight negative'}">
    <div class="info-row">
      <span class="info-label" style="font-size: 16px;">📊 Différence (Écart):&nbsp;</span>
      <span class="info-value" style="font-size: 18px; font-weight: 700;">
        ${(updatedShift.difference ?? 0) >= 0 ? '+' : ''}${(updatedShift.difference ?? 0).toLocaleString('fr-FR')} F CFA
        ${(updatedShift.difference ?? 0) >= 0 ? '✅' : '⚠️'}
      </span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">💳 Répartition des Paiements</h3>
    <div class="info-row">
      <span class="info-label">💵 Espèces :&nbsp;</span>
      <span class="info-value">${realCashAmount.toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">📱 Mobile Money :&nbsp;</span>
      <span class="info-value">${(updatedShift.mobileMoneyAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">🔄 Autres moyens :&nbsp;</span>
      <span class="info-value">${(updatedShift.otherAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6; font-weight: 600;">
      <span class="info-label">💰 Total encaissé :&nbsp;</span>
      <span class="info-value" style="font-weight: 700; color: #28a745;">${(realCashAmount + (updatedShift.mobileMoneyAmount ?? 0) + (updatedShift.otherAmount ?? 0)).toLocaleString('fr-FR')} F CFA</span>
    </div>
  </div>

  <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
    <strong>ID du Shift :&nbsp;</strong>${updatedShift.id}
  </div>
</div>
`;
          
          console.log('📤 Préparation envoi email shift avec résumé complet');
          
          // Utiliser le service d'emails en attente
          try {
            console.log('📧 [DEBUG] Envoi email fermeture shift à tous les admins...');
            const result = await pendingEmailService.sendToAllAdmins({
              message: resume,
              storeName: storeName,
              type: 'shift',
              relatedId: updatedShift.id,
              storeId: updatedShift.storeId,
              userId: user?.id || ''
            });
            
            console.log(`📊 [SHIFT] Résultats: ${result.sent} envoyés, ${result.queued} en attente sur ${result.totalAdmins} admins`);
            if (result.sent > 0) {
              console.log('✅ Emails fermeture shift envoyés directement');
              toast.success(`Emails envoyés à ${result.totalAdmins} admin(s)`);
            }
            if (result.queued > 0) {
              console.log('📦 Emails fermeture shift mis en attente, seront envoyés lors de la sync');
              toast.success('Emails programmés pour envoi');
            }
          } catch (e) {
            console.warn('❌ Erreur service email fermeture:', e);
            toast.error('Erreur lors de la programmation email');
          }

        }
      } catch (e) {
        console.error('❌ Erreur lors de l\'envoi automatique du mail admin:', e);
        toast.error('Erreur: ' + (e as Error).message);
      }
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
          console.log('✅ [SHIFT] Synchronisé avec le backend');
        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Mettre en file via performSyncOp (gère mise en file si offline)
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
            method: 'PUT',
            data: updatedShift
          });
          console.log('📦 [SHIFT] Mis en file de sync');
        }
      } else {
        // Hors ligne : mettre en file via performSyncOp
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php',
          method: 'PUT',
          data: updatedShift
        });
        console.log('📦 [SHIFT] Hors ligne, mis en file de sync');
      }
    } catch (error) {
      toast.error('Erreur lors de la fermeture du shift');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, [activeShift, cashAmount, mobileMoneyAmount, otherAmount, user, isOnline, loadShifts]);

  return (
  <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Services</h1>
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
                    onChange={handleOpeningAmountChange}
                    autoFocus
                  />
                  <p className="text-sm text-muted-foreground">
                    Entrez le montant présent dans la caisse au début du shift
                  </p>
                </div>
                <Button className="w-full" onClick={handleOpenShift} disabled={loading || !dataLoaded}>
                  {loading ? 'Ouverture...' : !dataLoaded ? 'Chargement...' : 'Ouvrir le shift'}
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
                      onChange={handleCashAmountChange}
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
                      onChange={handleMobileMoneyAmountChange}
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
            <CardTitle>Historique des services</CardTitle>
            {dataLoaded && !loading && filteredShifts.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {filteredShifts.length}
              </span>
            )}
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
                    onChange={handleSearchChange}
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
            <div className="flex gap-2 mt-4 items-center flex-nowrap">
              <Input
                placeholder="Rechercher par caissier ou date..."
                value={search}
                onChange={handleSearchChange}
                className="flex-1 min-w-0"
              />
              {user?.role !== 'cashier' && (
                <Select value={selectedCashier} onValueChange={setSelectedCashier}>
                  <SelectTrigger className="w-48 flex-shrink-0">
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
                <SelectTrigger className="w-40 flex-shrink-0">
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
          <div className="overflow-auto max-h-[57vh] min-h-[200px]" ref={listScrollRef} onScroll={handleListScroll}>
            {isMobile ? (
              // Mobile: render compact cards with virtualization for performance
              <div className="p-2">
                {!dataLoaded ? (
                  <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="p-3 border rounded-lg bg-white animate-pulse">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                          <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
                          <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
                        </div>
                        <div className="ml-3 flex flex-col items-end gap-2">
                          <div className="h-8 w-8 bg-gray-200 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                ) : filteredShifts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 bg-gradient-to-b from-white to-gray-50 rounded-xl shadow-sm border border-gray-100 mx-2">
                    <div className="mb-4">
                      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mx-auto">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6" />
                        <path d="M32 18v14l10 6" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="32" cy="32" r="14" stroke="#6366f1" strokeWidth="2" fill="#fff" />
                      </svg>
                    </div>
                    <p className="text-lg font-semibold text-gray-700 mb-2">Aucun service trouvé</p>
                    <p className="text-sm text-gray-500 mb-4">Vous n'avez pas encore ouvert ou enregistré de service.<br/>Appuyez sur <span className='font-bold text-primary'> un sOuvrirhift</span> pour commencer une session de caisse.</p>
                    <button
                      className={`mt-2 px-4 py-2 rounded-lg font-medium shadow transition ${
                        dataLoaded 
                          ? 'bg-primary text-white hover:bg-primary/90' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      onClick={() => dataLoaded && setShowOpenDialog(true)}
                      disabled={!dataLoaded}
                    >
                      <Clock className="w-5 h-5 inline-block mr-2 align-middle" />
                      {dataLoaded ? 'Ouvrir un shift' : 'Chargement...'}
                    </button>
                  </div>
                ) : (
                  filteredShifts.map(shift => {
                    const cashierName = cashierById.get(String(shift.userId))?.username || 'Inconnu';
                    const encaissé = encaissesState[shift.id] ?? 0;
                    const computed = computedDiffsState[shift.id];
                    return (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        encaissé={encaissé}
                        computed={computed}
                        cashierName={cashierName}
                        isAdmin={user?.role === 'admin'}
                        onShowDetails={showShiftDetails}
                      />
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
                  {!dataLoaded ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`}>
                        <TableCell colSpan={8} className="py-8">
                          <div className="flex items-center gap-3 animate-pulse">
                            <div className="h-5 bg-gray-200 rounded w-32" />
                            <div className="h-4 bg-gray-200 rounded w-20" />
                            <div className="h-4 bg-gray-200 rounded w-16" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredShifts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Aucun shift enregistré</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredShifts.map((shift) => {
                      const cashierName = cashierById.get(String(shift.userId))?.username || 'Inconnu';
                      const encaissé = encaissesState[shift.id] ?? 0;
                      const computed = computedDiffsState[shift.id];
                      return (
                        <TableRow key={shift.id}>
                          {/* ...existing code for shift row... */}
                          <TableCell>
                            <div className="font-medium">{formatDate(shift.openedAt)}</div>
                            {isMobile && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                <div>{shift.closedAt ? formatDate(shift.closedAt) : '-'}</div>
                                <div className="truncate">{cashierName}</div>
                                <div className="text-xs">
                                  {(shift.status === 'open' && user?.role !== 'admin') ? '***' : Math.round(encaissé)} FCFA • {shift.status === 'open' ? 'Ouvert' : 'Fermé'}
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{shift.closedAt ? formatDate(shift.closedAt) : '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell">{formatDuration(shift.openedAt, shift.closedAt)}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {shift.status === 'closed' && shift.closingAmount !== null && computed && typeof computed.difference === 'number' && !isNaN(computed.difference) ? (
                              <span className={computed?.difference >= 0 ? 'text-success' : 'text-destructive'}>
                                {computed?.difference >= 0 ? '+' : ''}{Math.round(computed?.difference)} FCFA
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
                          <TableCell>{(shift.status === 'open' && user?.role !== 'admin') ? '***' : Math.round(encaissé)} FCFA</TableCell>
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
                      <TableCell colSpan={8} className="text-center py-4">
                        <div className="animate-pulse text-muted-foreground">
                          Chargement de plus de shifts...
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!hasMore && shifts.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                        Tous les shifts ont été chargés
                      </TableCell>
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
