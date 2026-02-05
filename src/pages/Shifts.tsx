import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
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

  // Constantes pour optimiser les performances (mémorisé)
  const SHIFTS_PER_PAGE = useMemo(() => 25, []);
  
  // Cache pour optimiser le rechargement des données (mémorisé)
  const shiftsCache = useRef<Map<string, any>>(new Map());
  const lastLoadTime = useRef<number>(0);
  
  // Optimisation de la pagination avec useMemo
  const paginatedShifts = useMemo(() => {
    return filteredShifts;
  }, [filteredShifts]);

  // State to store computed expected/difference for closed shifts (maintenant calculé via useMemo)
  const [computedDiffsState, setComputedDiffsState] = useState<Record<string, {expected: number|null, difference: number|null}>>({});
  const [encaissesState, setEncaissesState] = useState<Record<string, number>>({});
  // State pour suivre la synchronisation
  const [syncing, setSyncing] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);
  // Cache des ventes en mémoire pour éviter les appels DB répétés
  const salesCache = useRef<any[]>([]);
  const salesCacheTimestamp = useRef<number>(0);
  const SALES_CACHE_TTL = 30000; // 30 secondes de validité du cache
  
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

  // Calculs asynchrones optimisés avec useEffect et cache intelligent
  // Optimisation : réutiliser shiftsCache.current au lieu de créer new Map()
  useEffect(() => {
    let mounted = true;

    const calculateShiftsData = async () => {
      if (filteredShifts.length === 0) {
        setComputedDiffsState({});
        setEncaissesState({});
        return;
      }

      const results: Record<string, {expected: number|null, difference: number|null}> = {};
      const encaissesResults: Record<string, number> = {};

      // Utiliser le cache de ventes en mémoire au lieu de getAll à chaque fois
      let allSales = salesCache.current;
      const now = Date.now();
      if (allSales.length === 0 || (now - salesCacheTimestamp.current) > SALES_CACHE_TTL) {
        const db = await getDB();
        allSales = await db.getAll('sales');
        salesCache.current = allSales;
        salesCacheTimestamp.current = now;
      }

      for (const shift of filteredShifts) {
        // Utiliser shiftsCache.current pour persister entre les rendus
        if (shiftsCache.current.has(shift.id)) {
          const cached = shiftsCache.current.get(shift.id)!;
          encaissesResults[shift.id] = cached.encaissé;
          if (shift.status === 'closed') {
            results[shift.id] = { expected: cached.expected, difference: cached.difference };
          }
          continue;
        }

        // Filtrer les ventes pour ce shift
        const sales = allSales.filter((s: any) => {
          if (s.shiftId && s.shiftId === shift.id) return true;
          // fallback: by time interval
          const saleTime = s.createdAt || s.timestamp || 0;
          const shiftStart = shift.openedAt;
          const shiftEnd = shift.closedAt || Date.now();
          return saleTime >= shiftStart && saleTime <= shiftEnd;
        });

        let cash = 0, mobile = 0;
        if (shift.status === 'closed' && (shift.cashAmount !== undefined || shift.mobileMoneyAmount !== undefined)) {
          const rawCash = toNum(shift.cashAmount || 0);
          const openingAmount = toNum(shift.openingAmount || 0);
          cash = rawCash > openingAmount ? rawCash - openingAmount : 0;
          mobile = toNum(shift.mobileMoneyAmount || 0);
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
            if (isRefunded) {
              cash -= saleCash;
              mobile -= saleMobile;
            } else {
              cash += saleCash;
              mobile += saleMobile;
            }
          }
        }
        encaissesResults[shift.id] = cash + mobile;

        if (shift.status === 'closed' && shift.closingAmount !== null) {
          const opening = shift.openingAmount ? Number(shift.openingAmount) : 0;
          let encaisseNet = 0;
          for (const sale of sales) {
            const isRefunded = Boolean(sale.refunded);
            if (isRefunded) {
              encaisseNet -= toNum(sale.total ?? 0);
            } else {
              encaisseNet += toNum(sale.total ?? 0);
            }
          }
          const expected = opening + encaisseNet;
          const difference = Number(shift.closingAmount) - expected;
          results[shift.id] = { expected, difference };
          shiftsCache.current.set(shift.id, { encaissé: cash + mobile, expected, difference });
        } else {
          shiftsCache.current.set(shift.id, { encaissé: cash + mobile, expected: null, difference: null });
        }
      }

      if (mounted) {
        // Batch les deux setState en un seul pour éviter double rendu
        setComputedDiffsState(results);
        setEncaissesState(encaissesResults);
      }
    };
    // Réduire le délai de 100ms à 50ms pour réactivité
    const timer = setTimeout(calculateShiftsData, 50);
    return () => {
      clearTimeout(timer);
      mounted = false;
    };
  }, [filteredShifts, toNum]);

  // Fonctions de formatage (doivent être définies avant leur utilisation)
  const formatMoney = useCallback((v: number | null | undefined) => {
    if (v === null || v === undefined || isNaN(Number(v))) return '0';
    return new Intl.NumberFormat('fr-FR').format(Math.round(Number(v))).replace(/\u00A0|\u202F/g, ' ');
  }, []);

  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const formatDuration = useCallback((start: number, end: number | null) => {
    const duration = (end || Date.now()) - start;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}min`;
  }, []);

  // Optimisation du rendu des éléments de liste avec React.memo
  const ShiftCard = React.memo(({ shift, encaissé, computed, cashierName }: {
    shift: Shift,
    encaissé: number,
    computed: {expected: number|null, difference: number|null} | undefined,
    cashierName: string
  }) => {
    const isClosed = shift.status === 'closed';
    const isOpen = shift.status === 'open';
    const statusColor = isOpen ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700';
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
        `relative p-4 rounded-xl shadow flex flex-col gap-2 ` +
        (isOpen
          ? 'border-2 border-blue-400 bg-blue-50/80'
          : 'border border-gray-100 bg-gradient-to-br from-white to-gray-50')
      }>
        <div className="flex items-center gap-3 mb-1">
          <div className="shrink-0">{statusIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base text-gray-800 truncate">
              {isOpen ? 'Shift en cours' : 'Shift terminé'}
            </div>
            <div className="text-xs text-gray-500">Ouvert le {formatDate(shift.openedAt)}</div>
          </div>
          <span className={"ml-2 px-2 py-0.5 rounded-full text-xs font-bold " + statusColor}>
            {isOpen ? 'Ouvert' : 'Fermé'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm mt-1">
          <span className="flex items-center gap-1 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            {isClosed && shift.closedAt ? formatDate(shift.closedAt) : (isOpen ? 'En cours' : '-')}
          </span>
          <span className="flex items-center gap-1 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            {formatDuration(shift.openedAt, shift.closedAt)}
          </span>
          {diffBadge}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm mt-1">
          <span className="flex items-center gap-1 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><path d="M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="2"/></svg>
            {cashierName}
          </span>
          <span className="flex items-center gap-1 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="8" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8" stroke="currentColor" strokeWidth="2"/></svg>
            {(isOpen && user?.role !== 'admin') ? '***' : Math.round(encaissé)} FCFA encaissé
          </span>
        </div>
        <div className="flex gap-2 mt-2">
          {(isOpen && user?.role !== 'admin') ? (
            <div className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-500 font-medium text-center text-sm">
              Accès restreint
            </div>
          ) : (
            <Button
              className="flex-1 py-1.5 rounded-lg bg-primary text-white font-medium shadow hover:bg-primary/90 transition text-sm"
              onClick={() => showShiftDetails(shift)}
              title="Voir les détails"
            >
              <Eye className="w-4 h-4 inline-block mr-1 -mt-0.5 align-middle" />
              Détails
            </Button>
          )}
        </div>
      </div>
    );
  });

  const loadCashiers = useCallback(async () => {
    const db = await getDB();
    const users = await db.getAll('users');
    
    let filtered = users;
    // Pour un admin, charger tous les utilisateurs pour pouvoir afficher tous les noms
    // Pour un caissier, filtrer par magasin
    if (user?.role !== 'admin' && user?.storeId) {
      filtered = filtered.filter(u => u.storeId === user.storeId);
    }
    
    console.log('🔍 [CASHIERS] Utilisateur connecté:', user?.role, user?.storeId);
    console.log('🔍 [CASHIERS] Utilisateurs totaux:', users.length, 'Filtrés:', filtered.length);
    console.log('🔍 [CASHIERS] Liste des caissiers chargés:', filtered.map(c => ({ id: c.id, username: c.username, storeId: c.storeId })));
    
    setCashiers(filtered);
    
    try {
      await correctClosedShifts(db);
    } catch (e) {
      console.warn('Erreur correction shifts au chargement:', e);
    }
  }, [user?.storeId, user?.role]);

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
          console.log(`⚠️ Utilisateur ${userId} a ${userStoreShifts.length} shifts ouverts dans le magasin ${storeId}. Fermeture automatique des plus anciens...`);
          
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
            console.log(`Shift automatiquement fermé: ${oldShift.id} pour l'utilisateur ${userId} dans le magasin ${storeId}`);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des shifts multiples:', error);
    }
  };

  // Fonction de correction automatique des shifts fermés après synchronisation
  const correctClosedShifts = async (db: any) => {
    try {
      console.log('🔄 Correction automatique des shifts fermés après synchronisation...');
      
      // Récupérer tous les shifts fermés en une seule fois
      const allShifts = await db.getAll('shifts');
      const closedShifts = allShifts.filter((s: any) => s.status === 'closed');
      
      if (closedShifts.length === 0) {
        console.log('✅ Aucun shift fermé à corriger');
        return;
      }

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
        // Filtrer les ventes de ce shift ET dans l'intervalle de temps du shift
        const shiftSales = allSales.filter((s: any) => {
          if (s.shiftId !== shift.id) return false;
          // Vérifier que la vente est dans l'intervalle de temps du shift
          const saleTime = s.createdAt || s.timestamp || 0;
          const shiftStart = shift.openedAt;
          const shiftEnd = shift.closedAt || Date.now();
          return saleTime >= shiftStart && saleTime <= shiftEnd;
        });
        
        const opening = toNum(shift.openingAmount || 0);
        // Pour la correction, utiliser la logique cohérente avec l'encaissé net
        let encaisseNet = 0;
        for (const sale of shiftSales) {
          const isRefunded = Boolean(sale.refunded);
          if (isRefunded) {
            encaisseNet -= toNum(sale.total ?? 0); // Déduire les remboursements
          } else {
            encaisseNet += toNum(sale.total ?? 0); // Ajouter les ventes
          }
        }
        
        const expectedAmount = opening + encaisseNet;
        const difference = toNum(shift.closingAmount || 0) - expectedAmount;
        
        // Vérifier si une correction est nécessaire
        const needsCorrection = 
          Math.abs(toNum(shift.expectedAmount) - expectedAmount) > 0.01 ||
          Math.abs(toNum(shift.difference) - difference) > 0.01;
        
        if (needsCorrection) {
          console.log(`📝 Correction shift ${shift.id}: Expected ${shift.expectedAmount} → ${expectedAmount}, Diff ${shift.difference} → ${difference}`);
          
          shiftsToUpdate.push({
            ...shift,
            expectedAmount,
            difference
          });
          correctedCount++;
        }
      }

      // Mettre à jour tous les shifts corrigés en batch
      if (shiftsToUpdate.length > 0) {
        const tx = db.transaction('shifts', 'readwrite');
        await Promise.all([
          ...shiftsToUpdate.map(s => tx.store.put(s)),
          tx.done
        ]);
        console.log(`✅ ${correctedCount} shift(s) corrigé(s) automatiquement`);
      } else {
        console.log('✅ Tous les shifts sont cohérents, aucune correction nécessaire');
      }

    } catch (error) {
      console.error('❌ Erreur lors de la correction automatique des shifts:', error);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        await cleanupMultipleOpenShifts();
        
        // Charger les caissiers EN PREMIER pour qu'ils soient disponibles pour l'affichage
        await loadCashiers();
        
        // Puis chargement initial des shifts depuis local
        const db = await getDB();
        await loadFromLocal(db);
        
        // Marquer les données comme chargées
        setDataLoaded(true);
        
        // Synchronisation en arrière-plan si en ligne
        if (isOnline) {
          // Ne pas bloquer l'UI pour la sync
          setTimeout(() => {
            loadShifts();
          }, 100);
        }
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setDataLoaded(true); // Débloquer même en cas d'erreur
      }
    };
    
    initializeData();
  }, [loadCashiers]);

  // Filtrage optimisé avec useMemo
  const filteredShiftsOptimized = useMemo(() => {
    let result = shifts;
    if (debouncedSearch) {
      result = result.filter(s => {
        const cashier = cashiers.find(u => u.id === s.userId);
        return (
          (cashier?.username?.toLowerCase().includes(debouncedSearch.toLowerCase()) || '') ||
          formatDate(s.openedAt).toLowerCase().includes(debouncedSearch.toLowerCase())
        );
      });
    }
    if (selectedCashier !== 'all') {
      result = result.filter(s => s.userId === selectedCashier);
    }
    if (selectedStatus !== 'all') {
      result = result.filter(s => s.status === selectedStatus);
    }
    return result.sort((a, b) => b.openedAt - a.openedAt);
  }, [shifts, debouncedSearch, selectedCashier, selectedStatus, cashiers, formatDate]);
  
  useEffect(() => {
    setFilteredShifts(filteredShiftsOptimized);
  }, [filteredShiftsOptimized]);

  const loadShifts = async () => {
    setLoading(true);
    // Invalider le cache de ventes pour forcer le rechargement
    salesCache.current = [];
    salesCacheTimestamp.current = 0;
    try {
      const db = await getDB();
      
      // Si en ligne, charger depuis le backend et synchroniser
      if (isOnline) {
        setSyncing(true);
        try {
          // Récupérer l'admin pour les emails
          const usersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
          if (usersResponse.ok) {
            const users = await usersResponse.json();
            const admin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
            if (admin) {
              console.log('🔍 [DEBUG] Admin trouvé (Shifts):', admin.email);
              setAdminUser(admin);
            } else {
              console.log('⚠️ [DEBUG] Aucun admin avec email trouvé (Shifts)');
            }
          }

          // Charger les shifts depuis le backend
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php';
          if (user?.storeId) url += `?storeId=${user.storeId}`;
          const response = await fetch(url);
          
          if (response.ok) {
            // Vérifier que la réponse contient du JSON valide
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              console.warn('Réponse backend non-JSON:', contentType);
              throw new Error('Réponse non-JSON du backend');
            }
            
            const text = await response.text();
            if (!text || text.trim().length === 0) {
              console.warn('Réponse backend vide');
              throw new Error('Réponse vide du backend');
            }
            
            let backendShifts;
            try {
              backendShifts = JSON.parse(text);
            } catch (parseError) {
              console.error('Erreur de parsing JSON:', parseError);
              console.error('Contenu reçu:', text.substring(0, 200)); // Afficher les premiers 200 caractères
              throw new Error('JSON invalide du backend');
            }
            
            // Vérifier que c'est un tableau
            if (!Array.isArray(backendShifts)) {
              console.warn('Le backend n\'a pas retourné un tableau:', backendShifts);
              backendShifts = [];
            }
            
            // Mettre à jour la base locale des shifts
            if (backendShifts.length > 0) {
              const tx = db.transaction('shifts', 'readwrite');
              await Promise.all([
                ...backendShifts.map(s => tx.store.put(s)),
                tx.done
              ]);
            }

            // Synchroniser aussi les ventes pour avoir les bons montants encaissés
            try {
              let salesUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php?all=1';
              if (user?.storeId) salesUrl += `&storeId=${user.storeId}`;
              const salesResponse = await fetch(salesUrl);
              if (salesResponse.ok) {
                const salesText = await salesResponse.text();
                if (salesText && salesText.trim().length > 0) {
                  try {
                    const salesData = JSON.parse(salesText);
                    // L'API retourne maintenant { data: [...], total: ... } ou juste [...]
                    const backendSales = Array.isArray(salesData) ? salesData : (salesData.data || []);
                    if (backendSales.length > 0) {
                      const salesTx = db.transaction('sales', 'readwrite');
                      await Promise.all([
                        ...backendSales.map(s => salesTx.store.put(s)),
                        salesTx.done
                      ]);
                      console.log(`✅ ${backendSales.length} ventes synchronisées depuis le backend`);
                      // Mettre à jour le cache de ventes immédiatement
                      salesCache.current = backendSales;
                      salesCacheTimestamp.current = Date.now();
                    }
                  } catch (salesParseError) {
                    console.warn('Erreur parsing JSON ventes:', salesParseError);
                  }
                }
              }
            } catch (salesError) {
              console.warn('Erreur sync ventes:', salesError);
            }

            // Note: Les dépenses ne sont plus synchronisées car non nécessaires pour les calculs de shifts
            
            // Synchroniser les utilisateurs pour avoir les noms des caissiers
            try {
              const usersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
              console.log('📞 Appel API users, statut:', usersResponse.status);
              if (usersResponse.ok) {
                const usersText = await usersResponse.text();
                console.log('📄 Réponse users (premiers 200 chars):', usersText.substring(0, 200));
                if (usersText && usersText.trim().length > 0) {
                  try {
                    const backendUsers = JSON.parse(usersText);
                    console.log('👥 Utilisateurs reçus du backend:', backendUsers);
                    if (Array.isArray(backendUsers) && backendUsers.length > 0) {
                      // Nettoyer d'abord la table users pour éviter les conflits d'index
                      const clearTx = db.transaction('users', 'readwrite');
                      await clearTx.store.clear();
                      await clearTx.done;
                      
                      // Puis insérer les nouveaux utilisateurs
                      const usersTx = db.transaction('users', 'readwrite');
                      for (const user of backendUsers) {
                        try {
                          await usersTx.store.put(user);
                        } catch (e) {
                          console.warn('Erreur insertion utilisateur:', user.username, e);
                        }
                      }
                      await usersTx.done;
                      console.log(`✅ ${backendUsers.length} utilisateurs synchronisés depuis le backend`);
                      
                      // Recharger les caissiers après la synchronisation
                      await loadCashiers();
                    } else {
                      console.warn('⚠️ Pas d\'utilisateurs reçus du backend');
                    }
                  } catch (usersParseError) {
                    console.error('❌ Erreur parsing JSON utilisateurs:', usersParseError);
                  }
                } else {
                  console.warn('⚠️ Réponse users vide');
                }
              } else {
                console.warn('⚠️ Erreur API users:', usersResponse.status);
              }
            } catch (usersError) {
              console.error('❌ Erreur sync utilisateurs:', usersError);
            }
            
            // Correction automatique des shifts fermés après synchronisation
            await correctClosedShifts(db);
            
            setLoadedCount(0);
            setHasMore(true);
            await loadShiftsPage(db, 0, pageSize, true);
          } else {
            console.warn(`Réponse backend non-ok: ${response.status} ${response.statusText}`);
            throw new Error(`Erreur HTTP ${response.status}`);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale (paged)
          await loadShiftsPage(db, 0, pageSize, true);
        } finally {
          setSyncing(false);
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
      // Sinon, voir seulement ses shifts
      visibleShifts = normalizedShifts.filter(s => s.userId === user?.id);
    }
    setShifts(visibleShifts.sort((a, b) => b.openedAt - a.openedAt));
    setFilteredShifts(visibleShifts.sort((a, b) => b.openedAt - a.openedAt));
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

      // Recalculer le montant attendu et l'écart avec TOUTES les ventes disponibles dans l'intervalle de temps
      const allShiftSales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
      // Filtrer les ventes dans l'intervalle de temps du shift
      const sales = allShiftSales.filter((s: any) => {
        const saleTime = s.createdAt || s.timestamp || 0;
        const shiftStart = shift.openedAt;
        const shiftEnd = shift.closedAt || Date.now();
        return saleTime >= shiftStart && saleTime <= shiftEnd;
      });
      console.log(`🧾 [PRINT] Shift ${shift.id}: ${allShiftSales.length} ventes trouvées, ${sales.length} dans l'intervalle de temps`);
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
      
      let cash = 0, mobile = 0;
      
      // Priorité ABSOLUE aux montants saisis lors de la fermeture du shift
      if (shift.status === 'closed' && (shift.cashAmount !== undefined || shift.mobileMoneyAmount !== undefined)) {
        // Pour un shift fermé, utiliser UNIQUEMENT les montants saisis par le caissier
        // Pour les espèces, soustraire le montant d'ouverture car il est inclus dans cashAmount
        const rawCash = toNum(shift.cashAmount || 0);
        const openingAmount = toNum(shift.openingAmount || 0);
        cash = rawCash > openingAmount ? rawCash - openingAmount : 0;
        mobile = toNum(shift.mobileMoneyAmount || 0);
        console.log('🧾 [PRINT] Utilisation montants saisis fermeture - Cash (après soustraction ouverture):', cash, 'Mobile:', mobile);
      } else {
        // Fallback uniquement pour les shifts anciens ou non fermés correctement
        console.log('🧾 [PRINT] Fallback: calcul depuis les ventes (shift ancien ou incomplet)');
        for (const s of sales) {
          const isRefunded = Boolean(s.refunded);
          if (isRefunded) continue; // Ignorer les ventes remboursées
          
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

      // Recalculer le montant attendu en utilisant la logique cohérente avec l'encaissé net
      let encaisseNet = 0;
      for (const sale of sales) {
        const isRefunded = Boolean(sale.refunded);
        if (isRefunded) {
          encaisseNet -= toNum(sale.total ?? 0); // Déduire les remboursements
        } else {
          encaisseNet += toNum(sale.total ?? 0); // Ajouter les ventes
        }
      }
      const opening = toNum(shift.openingAmount || 0);
      const recalculatedExpectedAmount = opening + encaisseNet;
      const recalculatedDifference = toNum(shift.closingAmount || 0) - recalculatedExpectedAmount;
      
      console.log('🧾 [PRINT] Recalcul: Expected:', recalculatedExpectedAmount, 'Diff:', recalculatedDifference, 'basé sur', sales.length, 'ventes');

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
      lines.push(NativePrinter.formatColumns('Montant attendu :', `${formatMoney(recalculatedExpectedAmount)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Ecart :', `${recalculatedDifference >= 0 ? '+' : ''}${formatMoney(recalculatedDifference)} FCFA`, width));
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
              toast.error('Un shift est déjà ouvert sur un autre appareil. Veuillez d\'abord le fermer.');
              setLoading(false);
              
              // Synchroniser ce shift dans la DB locale
              await db.put('shifts', backendOpenShift);
              setActiveShift(backendOpenShift);
              
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
            
            // Supprimer le shift créé localement
            await db.delete('shifts', newShift.id);
            
            // Afficher un message clair à l'utilisateur
            toast.error('Un shift est déjà ouvert sur un autre appareil. Veuillez d\'abord le fermer.');
            setShowOpenDialog(false);
            setOpeningAmount('');
            setLoading(false);
            
            // Recharger les shifts pour afficher le shift actif
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
      
      // Sauvegarder localement d'abord
      await db.put('shifts', updatedShift);
      // Envoi automatique d'un email à l'admin avec résumé complet du shift
      try {
        const dbInstance = await getDB();
        
        // Vérifier les paramètres d'email pour les shifts
        const emailSettings = await dbInstance.get('emailSettings', updatedShift.storeId);
        const shouldSendEmail = emailSettings?.shifts !== false; // Par défaut true si pas de config
        
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
                {loading ? (
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
                    const cashier = cashiers.find(u => String(u.id) === String(shift.userId));
                    const cashierName = cashier ? cashier.username : 'Inconnu';
                    const encaissé = encaissesState[shift.id] ?? 0;
                    const computed = computedDiffsState[shift.id];
                    return (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        encaissé={encaissé}
                        computed={computed}
                        cashierName={cashierName}
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
                  {loading ? (
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
                      // Utiliser la même logique flexible que ShiftReceiptDetails pour trouver le caissier
                      const cashier = cashiers.find(u => String(u.id) === String(shift.userId));
                      console.log('🔍 Recherche caissier pour shift:', shift.id, 'userId:', shift.userId, 'trouvé:', cashier?.username);
                      console.log('📋 Liste caissiers disponibles:', cashiers.map(c => ({ id: c.id, username: c.username })));
                      // Montant encaissé = total encaissé (cash + mobile money) sur les ventes du shift
                      const encaissé = encaissesState[shift.id] ?? 0;
                      const cashierName = cashier ? cashier.username : 'Inconnu';
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
