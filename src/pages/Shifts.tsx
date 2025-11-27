import React, { useEffect, useState, useRef } from 'react';
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
  // State to store total encaissé (cash+mobile) for each shift
  const [encaisses, setEncaisses] = useState<Record<string, number>>({});
  // State pour suivre la synchronisation
  const [syncing, setSyncing] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);

  // Recalculate expected/difference and encaissé for all shifts when filteredShifts changes
  useEffect(() => {
    let mounted = true;
    async function calcAll() {
      // helper robust numeric parser to tolerate strings like "5 000"
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
      const results: Record<string, {expected: number|null, difference: number|null}> = {};
      const encaissesResults: Record<string, number> = {};
      for (const shift of filteredShifts) {
        try {
          const db = await getDB();
          const sales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
          // Calcul encaissé (cash + mobile money) - ignorer les ventes remboursées
          let cash = 0, mobile = 0;
          for (const sale of sales) {
            // Ignorer complètement les ventes remboursées
            const isRefunded = Boolean(sale.refunded);
            if (isRefunded) continue;
            
            let saleCash = 0, saleMobile = 0;
            
            // Priorité aux champs directs cashAmount et mobileMoneyAmount
            if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
              saleCash = toNum(sale.cashAmount || 0);
              saleMobile = toNum(sale.mobileMoneyAmount || 0);
            } else if (sale.payments && Array.isArray(sale.payments)) {
              // Fallback: utiliser le tableau payments
              for (const p of sale.payments) {
                if (p.method === 'cash') saleCash += toNum(p.amount);
                if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
              }
            } else {
              // Dernière fallback: utiliser paymentMethod et total (ancienne logique)
              if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
              if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
            }
            
            // Ajouter au total encaissé (ventes non remboursées seulement)
            cash += saleCash;
            mobile += saleMobile;
          }
          encaissesResults[shift.id] = cash + mobile;
          // Calcul expected/difference (pour l'écart) - sans les dépenses
          if (shift.status === 'closed' && shift.closingAmount !== null) {
            let salesTotal = 0;
            for (const sale of sales) {
              // Ignorer complètement les ventes remboursées
              const isRefunded = Boolean(sale.refunded);
              if (isRefunded) continue;
              salesTotal += toNum(sale.total);
            }
            const opening = shift.openingAmount ? Number(shift.openingAmount) : 0;
            const expected = opening + salesTotal; // Pas de déduction des dépenses
            const difference = Number(shift.closingAmount) - expected;
            results[shift.id] = {expected, difference};
          }
        } catch {
          encaissesResults[shift.id] = 0;
          if (shift.status === 'closed' && shift.closingAmount !== null) {
            results[shift.id] = {expected: null, difference: null};
          }
        }
      }
      if (mounted) {
        setComputedDiffs(results);
        setEncaisses(encaissesResults);
      }
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

  useEffect(() => {
    const initializeData = async () => {
      await cleanupMultipleOpenShifts(); // Nettoyer d'abord les shifts multiples
      await loadShifts();
      await loadCashiers();
    };
    initializeData();
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
              let salesUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php';
              if (user?.storeId) salesUrl += `?storeId=${user.storeId}`;
              const salesResponse = await fetch(salesUrl);
              if (salesResponse.ok) {
                const salesText = await salesResponse.text();
                if (salesText && salesText.trim().length > 0) {
                  try {
                    const backendSales = JSON.parse(salesText);
                    if (Array.isArray(backendSales) && backendSales.length > 0) {
                      const salesTx = db.transaction('sales', 'readwrite');
                      await Promise.all([
                        ...backendSales.map(s => salesTx.store.put(s)),
                        salesTx.done
                      ]);
                      console.log(`✅ ${backendSales.length} ventes synchronisées depuis le backend`);
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

      // Utiliser les montants saisis lors de la fermeture du shift
      const sales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
      const toNum = (v: any) => {
        if (typeof v === 'number' && !isNaN(v)) return v;
        const n = Number(v);
        return !isNaN(n) ? n : 0;
      };
      
      let cash = 0, mobile = 0;
      
      // Priorité ABSOLUE aux montants saisis lors de la fermeture du shift
      if (shift.status === 'closed' && (shift.cashAmount !== undefined || shift.mobileMoneyAmount !== undefined)) {
        // Pour un shift fermé, utiliser UNIQUEMENT les montants saisis par le caissier
        cash = toNum(shift.cashAmount || 0);
        mobile = toNum(shift.mobileMoneyAmount || 0);
        console.log('🧾 [PRINT] Utilisation montants saisis fermeture - Cash:', cash, 'Mobile:', mobile);
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
      lines.push(NativePrinter.formatColumns('Montant attendu :', `${shift.expectedAmount !== null ? formatMoney(shift.expectedAmount) : '-'} FCFA`, width));
      lines.push(NativePrinter.formatColumns('Ecart :', `${shift.difference !== null ? (shift.difference >= 0 ? '+' : '') + formatMoney(shift.difference) : '-'} FCFA`, width));
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
      
      // Vérifier qu'il n'y a pas déjà un shift ouvert pour cet utilisateur dans ce magasin
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
      
      // Calculate expected amount - sans les dépenses
      const sales = await db.getAllFromIndex('sales', 'by-shift', activeShift.id);
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
      let salesTotal = 0;
      for (const sale of sales) {
        // Ignorer complètement les ventes remboursées
        const isRefunded = Boolean(sale.refunded);
        if (isRefunded) continue;
        salesTotal += toNum(sale.total ?? 0);
      }
      const expectedAmount = (activeShift.openingAmount ? Number(activeShift.openingAmount) : 0) + salesTotal; // Pas de déduction des dépenses
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
          
          const resume = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">👤 Informations du Caissier</h3>
    <div class="info-row">
      <span class="info-label">Caissier :&nbsp;</span>
      <span class="info-value">${cashier?.username || 'Inconnu'}</span>
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
      <span class="info-value">${(updatedShift.cashAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">📱 Mobile Money :&nbsp;</span>
      <span class="info-value">${(updatedShift.mobileMoneyAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">🔄 Autres moyens :&nbsp;</span>
      <span class="info-value">${(updatedShift.otherAmount ?? 0).toLocaleString('fr-FR')} F CFA</span>
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
            <div className="flex gap-2 mt-4 items-center flex-nowrap">
              <Input
                placeholder="Rechercher par caissier ou date..."
                value={search}
                onChange={e => setSearch(e.target.value)}
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
          <div ref={listScrollRef} onScroll={handleListScroll}>
            {isMobile ? (
              // Mobile: render compact cards instead of wide table
              <div className="space-y-3 p-2">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
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
                  ))
                ) : filteredShifts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun service enregistré</p>
                  </div>
                ) : (
                  filteredShifts.map(shift => {
                    const cashier = cashiers.find(u => u.id === shift.userId);
                    const cashierName = cashier ? cashier.username : (user?.username || '-');
                    const encaissé = encaisses[shift.id] ?? 0;
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
                            <div className="text-sm mt-2">{(shift.status === 'open' && user?.role !== 'admin') ? '***' : Math.round(encaissé)} FCFA</div>
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
                      const cashier = cashiers.find(u => u.id === shift.userId);
                      // Montant encaissé = total encaissé (cash + mobile money) sur les ventes du shift
                      const encaissé = encaisses[shift.id] ?? 0;
                      const cashierName = cashier ? cashier.username : (user?.username || '-');
                      const computed = computedDiffs[shift.id];
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
