import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  DollarSign, 
  Clock,
  CheckCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { toast } from 'sonner';
import { pendingEmailService } from '@/lib/pendingEmailService';

interface Product {
  id: string;
  name: string;
  unit: string;
  targetMargin?: number;
  stock?: Record<string, number>; // Ajout de la propriété stock optionnelle
  // Prix de vente et de revient optionnels (utilisés pour inférer une marge si présents)
  salePrice?: number;
  costPrice?: number;
  // Indicateur facultatif de suivi des quantités
  trackQuantity?: boolean;
}

interface ExpenseCategory {
  id: string;
  name: string;
  type: 'indirect' | 'operational';
  description?: string;
  storeId: string;
  active: boolean;
  productIds?: string[]; // Produits liés à cette catégorie
  createdAt: number;
}

interface ExpenseAdvanced {
  id: string;
  type: 'direct' | 'indirect' | 'operational';
  name: string;
  amount: number;
  date: number;
  storeId?: string;
  categoryId?: string; // Pour les dépenses indirectes et opérationnelles
  directProduct?: {
    productId: string;
    quantity: number;
    startDate: number;
    endDate?: number;
  };
  indirectProducts?: Array<{
    productId: string;
    expectedRevenue: number;
    percentage: number;
  }>;
  totalExpectedRevenue?: number;
  createdAt: number;
  status?: string;
}

interface StockSignal {
  id: string;
  expenseId: string;
  productId: string;
  userId: string;
  storeId: string;
  startDate: number;
  endDate: number;
  purchaseAmount: number;
  quantityBought: number;
  quantitySold: number;
  revenue: number;
  margin: number; // Marge par rapport à l'objectif (surplus/manque)
  realMargin?: number; // Marge brute réelle (CA - Coût)
  marginPercentage: number;
  createdAt: number;
}

interface Sale {
  id: string;
  items: Array<{
    productId: string;
    quantity: number;
    total: number;
    price?: number;
  }>;
  total: number;
  createdAt: number;
  draft?: boolean;
  refunded?: boolean;
}

export default function StockSignals() {
  const { user } = useAuth();
  // treat super_admin as admin for UI purposes
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { isOnline, isBackendReachable, manualSync } = useNetwork();
  const [activeStocks, setActiveStocks] = useState<ExpenseAdvanced[]>([]);
  const [completedSignals, setCompletedSignals] = useState<StockSignal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showSignalDialog, setShowSignalDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseAdvanced | null>(null);
  const [marginCalculation, setMarginCalculation] = useState<any>(null);
  const [showEndDateDialog, setShowEndDateDialog] = useState(false);
  const [endDateInput, setEndDateInput] = useState<string>('');
  
  // Filtres pour l'historique
  const [searchTerm, setSearchTerm] = useState('');
  // Afficher par défaut l'historique d'aujourd'hui dans l'onglet "Historique"
  const [periodFilter, setPeriodFilter] = useState<'all' | 'day' | 'week' | 'month'>('day');
  const [typeFilter, setTypeFilter] = useState<'all' | 'surplus' | 'manque'>('all');
  // Filter by expense type for active stocks (direct / indirect)
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
  // Recherche simple pour Stocks Actifs (full-text sur produit/catégorie/prix/date)
  const [activeSearch, setActiveSearch] = useState('');
  // (expense creation is handled on the dedicated Expenses page)

  // ==== CACHES OPTIMISÉS ====
  // Cache des noms de produits pour éviter les recherches répétées
  const productNameMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => map.set(p.id, p.name));
    return map;
  }, [products]);

  // Cache des produits complets par ID
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  // Cache des catégories par ID
  const categoryMap = useMemo(() => {
    const map = new Map<string, ExpenseCategory>();
    expenseCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [expenseCategories]);

  // Cache des stocks par produit pour éviter les filtres répétés
  const stocksByProduct = useMemo(() => {
    const map = new Map<string, ExpenseAdvanced[]>();
    activeStocks.forEach(stock => {
      if (stock.directProduct?.productId) {
        const existing = map.get(stock.directProduct.productId) || [];
        existing.push(stock);
        map.set(stock.directProduct.productId, existing);
      }
    });
    // Trier chaque liste par date de début
    map.forEach((stocks) => {
      stocks.sort((a, b) => a.directProduct!.startDate - b.directProduct!.startDate);
    });
    return map;
  }, [activeStocks]);

  // Cache des stocks par catégorie
  const stocksByCategory = useMemo(() => {
    const map = new Map<string, ExpenseAdvanced[]>();
    activeStocks.forEach(stock => {
      if (stock.type === 'indirect' && stock.categoryId) {
        const existing = map.get(stock.categoryId) || [];
        existing.push(stock);
        map.set(stock.categoryId, existing);
      }
    });
    // Trier par date
    map.forEach((stocks) => {
      stocks.sort((a, b) => (a.date || 0) - (b.date || 0));
    });
    return map;
  }, [activeStocks]);

  // Fonctions de lookup optimisées
  const getProductStockCount = useCallback((productId: string) => {
    return stocksByProduct.get(productId)?.length || 0;
  }, [stocksByProduct]);

  const getOldestStockForProduct = useCallback((productId: string) => {
    const stocks = stocksByProduct.get(productId);
    return stocks?.[0];
  }, [stocksByProduct]);

  const getProductName = useCallback((productId: string) => {
    return productNameMap.get(productId) || 'Produit inconnu';
  }, [productNameMap]);

  // Timestamp actuel mis en cache pour éviter les appels répétés à Date.now()
  const nowTimestamp = useMemo(() => Date.now(), []);
  const DAY_MS = 86400000; // 24 * 60 * 60 * 1000

  const getDaysSince = useCallback((timestamp: number) => {
    return Math.ceil((nowTimestamp - timestamp) / DAY_MS);
  }, [nowTimestamp]);

  const getMarginColor = useCallback((percentage: number) => {
    if (percentage < 20) return 'text-red-600';
    if (percentage < 35) return 'text-yellow-600';
    return 'text-green-600';
  }, []);

  const getMarginColorByAmount = useCallback((margin: number) => {
    return margin >= 0 ? 'text-green-600' : 'text-red-600';
  }, []);

  // Format amount as '2 900 FCFA' (blue)
  const formatAmountBlue = useCallback((amount: number) => (
    <span className="text-blue-600 font-bold">{Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
  ), []);

  const getMarginBadgeVariant = useCallback((percentage: number) => {
    if (percentage < 20) return 'destructive';
    if (percentage < 35) return 'secondary';
    return 'default';
  }, []);

  const getMarginBadgeVariantByAmount = useCallback((margin: number) => {
    return margin >= 0 ? 'default' : 'destructive';
  }, []);
  // ==== FIN CACHES ====

  useEffect(() => {
    loadData();
  }, []);

  // Use centralized pending count from sync module
  const updatePendingSyncCount = async () => {
    try {
      const { getPendingSyncCount } = await import('@/lib/sync');
      const count = await getPendingSyncCount();
      setPendingSyncCount(count || 0);
    } catch (error) {
      console.error('Erreur lors du comptage des synchronisations en attente:', error);
      setPendingSyncCount(0);
    }
  };

  const computeMarginForEnd = async (endIso?: string) => {
    if (!selectedExpense) return;
    const endTime = endIso ? new Date(endIso).getTime() : Date.now();
    const startTime = selectedExpense.type === 'direct' && selectedExpense.directProduct
      ? selectedExpense.directProduct.startDate
      : selectedExpense.date;

    // Validate endTime is not before startTime
    if (endTime < startTime) {
      toast.error('La date de fin doit être postérieure ou égale à la date de début / date d\'achat. Choisissez une autre date.');
      // keep the end-date dialog open for correction
      setShowEndDateDialog(true);
      return;
    }
    // Chercher la marge visée depuis la fiche du produit - utilise le cache
    let targetMargin: number | null = null;
    let product: Product | undefined;
    if (selectedExpense.type === 'direct' && selectedExpense.directProduct) {
      product = productMap.get(selectedExpense.directProduct.productId);
      if (product && (product as any).targetMargin != null) {
        const parsed = Number((product as any).targetMargin);
        if (!isNaN(parsed)) targetMargin = parsed;
      }
      if (targetMargin === null && product && typeof product.salePrice === 'number' && typeof product.costPrice === 'number' && product.costPrice > 0) {
        const inferred = ((product.salePrice - product.costPrice) / product.costPrice) * 100;
        if (!isNaN(inferred)) targetMargin = inferred;
      }
    }
    if (targetMargin === null && (selectedExpense as any).targetMargin != null) {
      const parsed = Number((selectedExpense as any).targetMargin);
      if (!isNaN(parsed)) targetMargin = parsed;
    }

    // (startTime already defined and validated)

    let periodSalesData: any;
    let totalSalesData: any;

    if (selectedExpense.type === 'direct' && selectedExpense.directProduct) {
      periodSalesData = await calculateSalesBetween(startTime, endTime, selectedExpense.directProduct.productId, true);
      totalSalesData = await calculateSalesBetween(periodSalesData.adjustedStartDate || startTime, endTime, selectedExpense.directProduct.productId, false);
    } else if (selectedExpense.type === 'indirect' && selectedExpense.categoryId) {
      const category = categoryMap.get(selectedExpense.categoryId);
      if (!category || !category.productIds || category.productIds.length === 0) {
        toast.error(`Aucun produit lié à cette catégorie de dépense indirecte.`);
        return;
      }
      periodSalesData = await calculateSalesForMultipleProducts(startTime, endTime, category.productIds, true);
      totalSalesData = await calculateSalesForMultipleProducts(periodSalesData.adjustedStartDate || startTime, endTime, category.productIds, false);
    } else {
      toast.error('Type de dépense non supporté pour le calcul');
      return;
    }

    const effectiveStartDate = periodSalesData.adjustedStartDate || startTime;
    const totalRevenue = Number(totalSalesData?.totalRevenue) || 0;
    const periodRevenue = Number(periodSalesData.totalRevenue) || 0;
    const totalQuantity = Number(periodSalesData.totalQuantity) || 0;
    const purchaseAmount = Number(selectedExpense.amount) || 0;
    const quantityBought = selectedExpense.type === 'direct' && selectedExpense.directProduct
      ? Number(selectedExpense.directProduct.quantity) || 0
      : 1;

    let realMargin = periodRevenue - purchaseAmount;
    let margin = realMargin;
    let marginPercentage = 0;
    let expectedRevenue: number | null = null;
    if (typeof targetMargin === 'number') {
      if (targetMargin >= 100) {
        expectedRevenue = null;
        margin = null as any;
        marginPercentage = 0;
      } else {
        expectedRevenue = purchaseAmount / (1 - targetMargin / 100);
        margin = periodRevenue - expectedRevenue;
        realMargin = periodRevenue - purchaseAmount;
        marginPercentage = expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : 0;
      }
    } else {
      marginPercentage = periodRevenue > 0 ? (margin / periodRevenue) * 100 : 0;
    }

    // Historique des marges
    const marginHistory = completedSignals.filter(s => s.productId === (selectedExpense.type === 'direct' && selectedExpense.directProduct ? selectedExpense.directProduct.productId : selectedExpense.categoryId)).map(s => s.marginPercentage);
    let averageMargin = null;
    if (marginHistory.length > 0) averageMargin = marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length;

    // Calcul surplus/manque
    let surplusMargin = null;
    let missingMargin = null;
    if (typeof targetMargin === 'number' && targetMargin < 100) {
      expectedRevenue = purchaseAmount / (1 - targetMargin / 100);
      if (periodRevenue > expectedRevenue) {
        surplusMargin = periodRevenue - expectedRevenue;
        missingMargin = 0;
      } else if (periodRevenue < expectedRevenue) {
        surplusMargin = 0;
        missingMargin = expectedRevenue - periodRevenue;
      } else {
        surplusMargin = 0;
        missingMargin = 0;
      }
    }

    setMarginCalculation({
      totalRevenue,
      periodRevenue,
      totalQuantity,
      margin,
      realMargin,
      marginPercentage,
      purchaseAmount,
      quantityBought,
      effectiveStartDate,
      duration: Math.ceil((endTime - effectiveStartDate) / (1000 * 60 * 60 * 24)),
      averageMargin,
      marginHistory,
      targetMargin,
      expectedRevenue,
      surplusMargin,
      missingMargin,
      endTime
    });

    setShowEndDateDialog(false);
    setShowSignalDialog(true);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDB();
      
      // Stratégie optimisée: charger immédiatement depuis le cache local,
      // puis rafraîchir en arrière-plan si en ligne
      await processData(db);
      setLoading(false); // Afficher les données locales immédiatement

      // Si en ligne, synchroniser en arrière-plan sans bloquer l'UI
      if (isOnline) {
        try {
          // Charger en parallèle depuis le backend (non-bloquant)
          await Promise.all([
            loadProductsFromBackend(db),
            loadExpenseCategoriesFromBackend(db),
            loadExpensesAdvancedFromBackend(db),
            loadStockSignalsFromBackend(db),
            loadSalesFromBackend(db)
          ]);
          
          // Re-traiter les données après sync
          await processData(db);
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // Les données locales sont déjà affichées, pas besoin de toast d'erreur
        }
      }

      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount();
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
      console.error('Erreur:', error);
      setLoading(false);
    }
  }, [isOnline, user?.storeId]);

  const loadProductsFromBackend = async (db: any) => {
    try {
      const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php');
      if (response.ok) {
        const backendProducts = await response.json();
        const tx = db.transaction('products', 'readwrite');
        await Promise.all([
          ...backendProducts.map(p => tx.store.put(p)),
          tx.done
        ]);
      }
    } catch (error) {
      console.error('Erreur synchronisation products:', error);
    }
  };

  const loadExpenseCategoriesFromBackend = async (db: any) => {
    try {
      const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php');
      if (response.ok) {
        const backendCategories = await response.json();
        const tx = db.transaction('expenseCategories', 'readwrite');
        await Promise.all([
          ...backendCategories.map(c => tx.store.put(c)),
          tx.done
        ]);
      }
    } catch (error) {
      console.error('Erreur synchronisation expense categories:', error);
    }
  };

  const loadExpensesAdvancedFromBackend = async (db: any) => {
    try {
      const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php');
      if (response.ok) {
        const backendExpenses = await response.json();
        const tx = db.transaction('expensesAdvanced', 'readwrite');
        await Promise.all([
          ...backendExpenses.map(e => tx.store.put(e)),
          tx.done
        ]);
      }
    } catch (error) {
      console.error('Erreur synchronisation expenses advanced:', error);
    }
  };

  const loadStockSignalsFromBackend = async (db: any) => {
    try {
      const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php');
      if (response.ok) {
        let backendSignals: any = await response.json();

        // Defensive normalization: some backends return an object wrapper
        // (e.g. { data: [...] }) or an object of records instead of a plain array.
        if (!backendSignals) return;
        if (!Array.isArray(backendSignals)) {
          if (backendSignals.data && Array.isArray(backendSignals.data)) {
            backendSignals = backendSignals.data;
          } else if (typeof backendSignals === 'object') {
            // If the object looks like a map of id -> record, convert to values
            const values = Object.values(backendSignals).filter(v => v && typeof v === 'object');
            if (values.length > 0) {
              backendSignals = values;
            } else {
              // Fallback: wrap single object into an array
              backendSignals = [backendSignals];
            }
          } else {
            // Primitive response — wrap it so code below can treat it as array
            backendSignals = [backendSignals];
          }
        }

        if (!Array.isArray(backendSignals)) return;

        const tx = db.transaction('stockSignals', 'readwrite');
        // Ensure every record has an id (IndexedDB keyPath = 'id')
        const prepared = backendSignals.map((s: any) => {
          if (!s) return s;
          // if server used numeric id or different key, try to normalize
          if (!s.id && (s.uid || s._id || s.id === 0)) {
            s.id = s.uid || s._id || s.id;
          }
          if (!s.id) {
            s.id = generateId();
          }
          return s;
        });

        await Promise.all([
          ...prepared.map((s: any) => tx.store.put(s)),
          tx.done
        ]);
      }
    } catch (error) {
      console.error('Erreur synchronisation stock signals:', error);
    }
  };

  const loadSalesFromBackend = async (db: any) => {
    try {
  let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php';
  if (user?.storeId) url += `?storeId=${user.storeId}`;
  const response = await fetch(url);
      if (response.ok) {
        const backendSales = await response.json();
        const tx = db.transaction('sales', 'readwrite');
        await Promise.all([
          ...backendSales.map(s => tx.store.put(s)),
          tx.done
        ]);
      }
    } catch (error) {
      console.error('Erreur synchronisation sales:', error);
    }
  };

  const loadFromLocal = async (db: any) => {
    await processData(db);
  };

  const processData = useCallback(async (db: any) => {
    // Charger toutes les données en une seule transaction pour optimiser les performances
    const tx = db.transaction(['products', 'expenseCategories', 'stockSignals', 'expensesAdvanced'], 'readonly');
    
    const [productsData, categoriesData, signalsData, expensesData] = await Promise.all([
      tx.objectStore('products').getAll(),
      tx.objectStore('expenseCategories').getAll(),
      tx.objectStore('stockSignals').getAll(),
      tx.objectStore('expensesAdvanced').getAll()
    ]);

    // Traiter les signaux - utiliser un Set pour des lookups O(1)
    const userSignals = signalsData
      .filter((signal: StockSignal) => signal.storeId === user?.storeId)
      .sort((a: StockSignal, b: StockSignal) => b.createdAt - a.createdAt);
    
    // Créer un Set pour des lookups rapides de signaux existants
    const signalLookup = new Set(
      userSignals.map((s: StockSignal) => `${s.expenseId}_${s.productId}`)
    );

    // Filtrer les dépenses actives avec lookups optimisés
    const storeId = user?.storeId;
    const activeExpenses = expensesData.filter((expense: ExpenseAdvanced) => {
      if (expense.storeId !== storeId) return false;
      if (expense.type !== 'direct' && expense.type !== 'indirect') return false;

      if (expense.type === 'direct' && expense.directProduct) {
        if (expense.directProduct.endDate) return false;
        const key = `${expense.id}_${expense.directProduct.productId}`;
        return !signalLookup.has(key);
      }
      
      if (expense.type === 'indirect') {
        if (expense.directProduct?.endDate) return false;
        const key = `${expense.id}_${expense.categoryId || 'indirect'}`;
        return !signalLookup.has(key);
      }
      
      return false;
    });

    // Mettre à jour tous les états en batch
    setProducts(productsData);
    setExpenseCategories(categoriesData);
    setCompletedSignals(userSignals);
    setActiveStocks(activeExpenses);
  }, [user?.storeId]);

  // Cache pour éviter de recharger les ventes et signaux à chaque calcul
  const salesCache = useMemo(() => ({ data: null as Sale[] | null, timestamp: 0 }), []);
  const signalsCache = useMemo(() => ({ data: null as StockSignal[] | null, timestamp: 0 }), []);
  const CACHE_TTL = 30000; // 30 secondes

  const calculateSalesBetween = useCallback(async (startDate: number, endDate: number, productId: string, excludeAlreadySignaled: boolean = true) => {
    const db = await getDB();
    const now = Date.now();
    
    // Utiliser le cache si disponible et récent
    let sales: Sale[];
    if (salesCache.data && (now - salesCache.timestamp) < CACHE_TTL) {
      sales = salesCache.data;
    } else {
      sales = await db.getAll('sales');
      salesCache.data = sales;
      salesCache.timestamp = now;
    }
    
    let adjustedStartDate = startDate;
    if (excludeAlreadySignaled) {
      let stockSignals: StockSignal[];
      if (signalsCache.data && (now - signalsCache.timestamp) < CACHE_TTL) {
        stockSignals = signalsCache.data;
      } else {
        stockSignals = await db.getAll('stockSignals');
        signalsCache.data = stockSignals;
        signalsCache.timestamp = now;
      }
      
      // Trouver le signalement le plus récent pour ce produit
      let latestEndDate = 0;
      const storeId = user?.storeId;
      for (const signal of stockSignals) {
        if (signal.productId === productId && signal.storeId === storeId && signal.endDate > latestEndDate) {
          latestEndDate = signal.endDate;
        }
      }
      
      if (latestEndDate > 0) {
        adjustedStartDate = Math.max(startDate, latestEndDate + 60000);
      }
    }
    
    // Filtrer et calculer en une seule passe
    let totalQuantity = 0;
    let totalRevenue = 0;
    
    for (const sale of sales) {
      if (sale.createdAt < adjustedStartDate || sale.createdAt > endDate || sale.draft === true) continue;
      if (sale.refunded) continue; // Ignorer les ventes remboursées

      const items = sale.items;
      if (!items) continue;

      for (const item of items) {
        if (item.productId === productId) {
          const quantity = Number(item.quantity) || 0;
          let itemTotal = Number(item.total) || 0;
          if (itemTotal === 0 && item.price) {
            itemTotal = (Number(item.price) || 0) * quantity;
          }
          totalQuantity += quantity;
          totalRevenue += itemTotal;
        }
      }
    }
    
    return { totalQuantity, totalRevenue, adjustedStartDate };
  }, [user?.storeId]);

  const calculateSalesForMultipleProducts = async (startDate: number, endDate: number, productIds: string[], excludeAlreadySignaled: boolean = true) => {
    // Optimisation : charger toutes les ventes et signaux en une seule fois
    const db = await getDB();
    const now = Date.now();
    let sales: Sale[];
    if (salesCache.data && (now - salesCache.timestamp) < CACHE_TTL) {
      sales = salesCache.data;
    } else {
      sales = await db.getAll('sales');
      salesCache.data = sales;
      salesCache.timestamp = now;
    }

    let stockSignals: StockSignal[] = [];
    if (excludeAlreadySignaled) {
      if (signalsCache.data && (now - signalsCache.timestamp) < CACHE_TTL) {
        stockSignals = signalsCache.data;
      } else {
        stockSignals = await db.getAll('stockSignals');
        signalsCache.data = stockSignals;
        signalsCache.timestamp = now;
      }
    }

    // Pour chaque produit, trouver la date de fin de signalement la plus récente
    const storeId = user?.storeId;
    const latestEndDates: Record<string, number> = {};
    if (excludeAlreadySignaled) {
      for (const productId of productIds) {
        let latestEndDate = 0;
        for (const signal of stockSignals) {
          if (signal.productId === productId && signal.storeId === storeId && signal.endDate > latestEndDate) {
            latestEndDate = signal.endDate;
          }
        }
        latestEndDates[productId] = latestEndDate;
      }
    }

    let totalQuantity = 0;
    let totalRevenue = 0;
    let effectiveStartDate = startDate;

    for (const sale of sales) {
      if (sale.createdAt > endDate || sale.draft === true || sale.refunded) continue;
      const items = sale.items;
      if (!items) continue;
      for (const item of items) {
        if (!productIds.includes(item.productId)) continue;
        // Calculer la date de début effective pour ce produit
        let productStart = startDate;
        if (excludeAlreadySignaled && latestEndDates[item.productId] > 0) {
          productStart = Math.max(startDate, latestEndDates[item.productId] + 60000);
        }
        if (sale.createdAt < productStart) continue;
        // Prendre la date de début effective la plus récente
        if (productStart > effectiveStartDate) effectiveStartDate = productStart;
        const quantity = Number(item.quantity) || 0;
        let itemTotal = Number(item.total) || 0;
        if (itemTotal === 0 && item.price) {
          itemTotal = (Number(item.price) || 0) * quantity;
        }
        totalQuantity += quantity;
        totalRevenue += itemTotal;
      }
    }

    return { totalQuantity, totalRevenue, adjustedStartDate: effectiveStartDate };
  };

  const handleStockEnd = async (expense: ExpenseAdvanced) => {
    if (!isBackendReachable) {
      toast.error("Impossible de signaler un stock fini : le serveur n'est pas joignable (hors ligne ou backend down). Veuillez vérifier votre connexion et réessayer.");
      return;
    }
    // Show end-date picker dialog before computing margins
    setSelectedExpense(expense);
    // Compute a sensible default for the end date: prefer now, but never before the stock start
    const startTime = expense.type === 'direct' && expense.directProduct ? expense.directProduct.startDate : expense.date;
    const startIso = new Date(startTime).toISOString().slice(0,16);
    const nowIso = new Date().toISOString().slice(0,16);
    // If now is before the start (clock skew or long future-dated start), default to start
    const defaultIso = nowIso < startIso ? startIso : nowIso;
    setEndDateInput(defaultIso);
    setShowEndDateDialog(true);
  };

  const confirmStockEnd = async () => {
    if (!selectedExpense || !marginCalculation || !user?.storeId) return;
    // Ensure chosen end date is valid (not before start)
    const chosenEndDate = marginCalculation?.endTime || (endDateInput ? new Date(endDateInput).getTime() : Date.now());
    const startTime = selectedExpense.type === 'direct' && selectedExpense.directProduct ? selectedExpense.directProduct.startDate : selectedExpense.date;
    if (chosenEndDate < startTime) {
      toast.error('La date de fin sélectionnée est antérieure à la date d\'achat / début du stock. Veuillez choisir une date valide.');
      return;
    }
    
    setLoading(true);
    try {
      const db = await getDB();
      
      // S'assurer que toutes les valeurs sont des nombres valides avant de sauvegarder
      const chosenEndDate = marginCalculation.endTime || (endDateInput ? new Date(endDateInput).getTime() : Date.now());
      const stockSignal: StockSignal = {
        id: generateId(),
        expenseId: selectedExpense.id,
        productId: selectedExpense.type === 'direct' && selectedExpense.directProduct
          ? selectedExpense.directProduct.productId
          : selectedExpense.categoryId || 'indirect', // Pour les indirectes, utiliser categoryId
        userId: user.id,
        storeId: user.storeId,
        startDate: Number(marginCalculation.effectiveStartDate) || selectedExpense.date,
        endDate: chosenEndDate,
        purchaseAmount: Number(marginCalculation.purchaseAmount) || 0,
        quantityBought: Number(marginCalculation.quantityBought) || 0,
        quantitySold: Number(marginCalculation.totalQuantity) || 0,
        revenue: Number(marginCalculation.periodRevenue) || 0, // Utiliser le revenu de période pour la cohérence avec le calcul de marge
        margin: Number(marginCalculation.margin) || 0, // Marge par rapport à l'objectif (surplus/manque)
        realMargin: Number(marginCalculation.realMargin) || 0, // Marge brute réelle (CA - Coût)
        marginPercentage: Number(marginCalculation.marginPercentage) || 0,
        createdAt: Date.now(),
      };
      
      // Sauvegarder localement d'abord
      await db.add('stockSignals', stockSignal);
      
      // Mettre à jour l'expense avec la date de fin
      const updatedExpense = {
        ...selectedExpense,
        directProduct: selectedExpense.type === 'direct' && selectedExpense.directProduct
          ? {
              ...selectedExpense.directProduct,
              endDate: chosenEndDate,
            }
          : {
              productId: 'indirect', // Marqueur pour les dépenses indirectes
              quantity: 1,
              startDate: selectedExpense.date,
              endDate: chosenEndDate,
            },
        updatedAt: Date.now(),
        userId: user.id,
        storeId: selectedExpense.storeId ?? user.storeId,
        status: (selectedExpense.status as "approved" | "pending" | "rejected") ?? "approved", // ensure correct type
      };
      
      await db.put('expensesAdvanced', updatedExpense);
      
      // Si en ligne, synchroniser immédiatement avec le backend
      if (isOnline) {
        try {
          // Synchroniser le stockSignal
          const stockSignalResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(stockSignal)
          });

          // Synchroniser l'expense mise à jour
          const expenseResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedExpense)
          });

          if (stockSignalResponse.ok && expenseResponse.ok) {
            toast.success('Signalement créé et synchronisé avec succès');
          } else {
            throw new Error('Erreur de synchronisation backend');
          }
        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Queue via performSyncOp (will create queue entry if offline)
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php',
            method: 'POST',
            data: stockSignal,
          });

          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
            method: 'PUT',
            data: updatedExpense,
          });

          toast.success('Signalement créé (sera synchronisé plus tard)');
        }
      } else {
        // Hors ligne : ajouter directement à la queue de synchronisation
        // Offline: queue via performSyncOp
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php',
          method: 'POST',
          data: stockSignal,
        });

        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
          method: 'PUT',
          data: updatedExpense,
        });

        toast.success('Signalement créé (mode hors ligne)');
      }
      
      // Envoi automatique d'un email à l'admin avec résumé du signalement de stock
      try {
        const dbInstance = await getDB();
        
        // Vérifier les paramètres d'email pour les signalements de stock
        const emailSettings = await dbInstance.get('emailSettings', user?.storeId);
        const shouldSendEmail = emailSettings?.stockSignals !== false; // Par défaut true si pas de config
        
        // N'envoyer le mail que s'il y a un manque (margin < 0)
        const hasShortage = marginCalculation.margin < 0;
        
        if (!shouldSendEmail) {
          console.log('📧 Email désactivé pour les signalements de stock');
        } else if (!hasShortage) {
          console.log('📧 Pas d\'envoi d\'email car pas de manque (margin >= 0)');
        } else {
          // Récupérer l'utilisateur current
          const currentUser = user;
          console.log('📧 [STOCK] Préparation envoi à tous les admins du store:', user?.storeId);
          
          // Récupérer le nom du magasin depuis la base locale
          const store = await dbInstance.get('stores', user?.storeId);
          const storeName = store?.name || user?.storeId || '';
          
          // Récupérer le nom du produit/catégorie - utilise les caches
          const productName = selectedExpense.type === 'direct' && selectedExpense.directProduct
            ? getProductName(selectedExpense.directProduct.productId)
            : (categoryMap.get(selectedExpense.categoryId || '')?.name || 'Dépense indirecte');
            
          // Vérifier si on doit afficher les quantités - utilise le cache
          const shouldShowQuantities = selectedExpense.type === 'direct' && selectedExpense.directProduct
            ? (() => {
                const prod = productMap.get(selectedExpense.directProduct.productId);
                return (prod && (prod as any).trackQuantity === true) || marginCalculation.quantityBought > 1;
              })()
            : false;
            
          // Construire le résumé du signalement de stock
          const statusBadge = marginCalculation.marginPercentage >= 35 ? '✅ Excellente' : 
                             marginCalculation.marginPercentage >= 20 ? '⚠️ Moyenne' : '❌ Faible';
          
          const resume = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">👤 Informations Utilisateur</h3>
    <div class="info-row">
      <span class="info-label">Signalé par :&nbsp;</span>
      <span class="info-value">${currentUser?.username || 'Inconnu'}</span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📦 Détails du Stock</h3>
    <div class="info-row">
      <span class="info-label">Produit/Catégorie :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${productName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Type de dépense :&nbsp;</span>
      <span class="info-value">${selectedExpense.type === 'direct' ? '🎯 Directe' : selectedExpense.type === 'indirect' ? '🔄 Indirecte' : '⚙️ Opérationnelle'}</span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📅 Période de Suivi</h3>
    <div class="info-row">
      <span class="info-label">Date début :&nbsp;</span>
      <span class="info-value">${new Date(marginCalculation.effectiveStartDate).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date fin :&nbsp;</span>
      <span class="info-value">${new Date(chosenEndDate).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
    </div>
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">💰 Résultats Financiers</h3>
    <div class="info-row">
      <span class="info-label">Coût d'achat :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${marginCalculation.purchaseAmount.toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">Chiffre d'affaires :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${marginCalculation.periodRevenue.toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">${marginCalculation.margin >= 0 ? 'Surplus' : 'Manque'} :&nbsp;</span>
      <span class="info-value" style="font-weight: 600; color: ${marginCalculation.margin >= 0 ? '#10b981' : '#ef4444'}">${marginCalculation.margin >= 0 ? '+' : ''}${marginCalculation.margin.toLocaleString('fr-FR')} F CFA</span>
    </div>
  </div>

  <div class="${marginCalculation.marginPercentage >= 35 ? 'highlight positive' : marginCalculation.marginPercentage >= 20 ? 'highlight' : 'highlight negative'}">
    <div class="info-row">
      <span class="info-label" style="font-size: 16px;">📊 Performance :&nbsp;</span>
      <span class="info-value" style="font-size: 18px; font-weight: 700;">
        ${statusBadge} - ${marginCalculation.marginPercentage.toFixed(1)}%
      </span>
    </div>
  </div>

  ${shouldShowQuantities ? `
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📈 Statistiques de Vente</h3>
    <div class="info-row">
      <span class="info-label">Quantité achetée :&nbsp;</span>
      <span class="info-value">${marginCalculation.quantityBought.toLocaleString('fr-FR')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Quantité vendue :&nbsp;</span>
      <span class="info-value">${marginCalculation.totalQuantity.toLocaleString('fr-FR')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Taux d'écoulement :&nbsp;</span>
      <span class="info-value">${marginCalculation.quantityBought > 0 ? ((marginCalculation.totalQuantity / marginCalculation.quantityBought) * 100).toFixed(1) : '0'}%</span>
    </div>
  </div>
  ` : ''}

  <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
    <strong>ID du Signalement :&nbsp;</strong>${stockSignal.id}
  </div>
</div>
`;
          
          // Utiliser le service d'emails en attente
          try {
            console.log('🔍 [DEBUG] Envoi email signalement stock (ou mise en attente)...');
            const result = await pendingEmailService.sendToAllAdmins({
              message: resume,
              storeName: storeName,
              type: 'stock',
              relatedId: stockSignal.id,
              storeId: user?.storeId || '',
              userId: user?.id || ''
            });
            
            console.log(`📊 [STOCK] Résultats: ${result.sent} envoyés, ${result.queued} en attente sur ${result.totalAdmins} admins`);
            if (result.sent > 0) {
              console.log('✅ Emails signalement stock envoyés directement');
            }
            if (result.queued > 0) {
              console.log('📦 Emails signalement stock mis en attente, seront envoyés lors de la sync');
            }
          } catch (e) {
            console.warn('❌ Erreur service email signalement:', e);
          }

        }
      } catch (e) {
        console.warn('❌ Erreur lors de l\'envoi automatique du mail admin pour signalement:', e);
      }

      // Afficher le résultat
      if (marginCalculation.marginPercentage < 20) {
        toast.error(`⚠️ Marge faible: ${marginCalculation.marginPercentage.toFixed(1)}%`);
      } else if (marginCalculation.marginPercentage < 35) {
        toast.warning(`⚠️ Marge moyenne: ${marginCalculation.marginPercentage.toFixed(1)}%`);
      } else {
        toast.success(`✅ Bonne marge: ${marginCalculation.marginPercentage.toFixed(1)}%`);
      }
      
      setShowSignalDialog(false);
      setSelectedExpense(null);
      setMarginCalculation(null);
      loadData();
      
    } catch (error) {
      toast.error('Erreur lors du signalement');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // Annuler un signalement et remettre le stock dans les stocks actifs
  const cancelSignal = useCallback(async (signal: StockSignal) => {
    if (!signal) return;
    const cat = categoryMap.get(signal.productId);
    const name = cat ? cat.name : (signal.productId === 'indirect' ? 'Dépense indirecte' : getProductName(signal.productId));

    const ok = window.confirm(`Confirmer l'annulation du signalement pour "${name}" ? Le stock redeviendra actif et devra être signalé à nouveau.`);
    if (!ok) return;

    setLoading(true);
    try {
      const db = await getDB();

      // Supprimer le signalement localement
      try {
        await db.delete('stockSignals', signal.id);
      } catch (err) {
        console.error('Erreur suppression locale du signal:', err);
        // On continue pour tenter la suite
      }

      // Récupérer l'expense associée et supprimer sa date de fin pour la remettre active
      try {
        const expense = await db.get('expensesAdvanced', signal.expenseId);
        if (expense) {
          const updatedExpense = {
            ...expense,
            directProduct: expense.directProduct ? {
              ...expense.directProduct,
              endDate: undefined // Supprimer la date de fin pour remettre le stock actif
            } : expense.directProduct,
            updatedAt: Date.now()
          };
          
          await db.put('expensesAdvanced', updatedExpense);

          // Si en ligne, synchroniser l'expense mise à jour avec le backend
          if (isOnline) {
            try {
              const expenseResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedExpense)
              });

              if (!expenseResponse.ok) {
                throw new Error('Erreur mise à jour expense backend');
              }
            } catch (err) {
              console.error('Impossible de mettre à jour l\'expense côté backend, ajout à la file:', err);
              await performSyncOp({
                url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
                method: 'PUT',
                data: updatedExpense,
              });
            }
          } else {
            // Hors ligne -> queue pour l'expense
            await performSyncOp({
              url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
              method: 'PUT',
              data: updatedExpense,
            });
          }
        }
      } catch (err) {
        console.error('Erreur lors de la remise en stock actif:', err);
      }

      // Supprimer le signalement côté backend si en ligne, sinon mettre en queue
      const url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php';
      if (isOnline) {
        try {
          const resp = await fetch(`${url}?id=${encodeURIComponent(signal.id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!resp.ok) {
            throw new Error('Erreur suppression signalement backend');
          }
        } catch (err) {
          console.error('Impossible de supprimer le signalement côté backend, ajout à la file:', err);
          await performSyncOp({ url, method: 'DELETE', data: { id: signal.id } });
        }
      } else {
        // Hors ligne -> queue pour le signalement
        await performSyncOp({ url, method: 'DELETE', data: { id: signal.id } });
      }

      // Mettre à jour l'état local pour rafraîchir l'UI
      setCompletedSignals(prev => prev.filter(s => s.id !== signal.id));
      await updatePendingSyncCount();
      toast.success('Signalement annulé - Le stock est de nouveau actif');
      
      // Recharger les données pour mettre à jour la liste des stocks actifs
      await loadData();
    } catch (error) {
      console.error('Erreur lors de l\'annulation du signalement:', error);
      toast.error('Erreur lors de l\'annulation du signalement');
    } finally {
      setLoading(false);
    }
  }, [categoryMap, getProductName, isOnline, loadData]);

  // Fonction pour filtrer les signaux - optimisée avec useMemo
  const filteredSignals = useMemo(() => {
    const now = nowTimestamp;
    const oneDayAgo = now - DAY_MS;
    const oneWeekAgo = now - 7 * DAY_MS;
    const oneMonthAgo = now - 30 * DAY_MS;
    const searchLower = searchTerm.trim().toLowerCase();

    return completedSignals.filter(s => {
      // Filtre par période
      if (periodFilter === 'day' && s.createdAt < oneDayAgo) return false;
      if (periodFilter === 'week' && s.createdAt < oneWeekAgo) return false;
      if (periodFilter === 'month' && s.createdAt < oneMonthAgo) return false;

      // Filtre par type (surplus/manque)
      if (typeFilter === 'surplus' && s.margin < 0) return false;
      if (typeFilter === 'manque' && s.margin >= 0) return false;

      // Filtre par recherche (nom de produit, date et heure)
      if (searchLower) {
        const cat = categoryMap.get(s.productId);
        const productName = cat ? cat.name : (productNameMap.get(s.productId) || 'Dépense Indirecte');
        
        if (productName.toLowerCase().includes(searchLower)) return true;
        
        // Recherche dans les dates
        const startDate = new Date(s.startDate || s.createdAt);
        const endDate = new Date(s.endDate || s.createdAt);
        const dateStrings = [
          startDate.toLocaleDateString('fr-FR'),
          endDate.toLocaleDateString('fr-FR'),
          startDate.toLocaleTimeString('fr-FR'),
          endDate.toLocaleTimeString('fr-FR')
        ].join(' ');
        
        return dateStrings.includes(searchTerm);
      }

      return true;
    });
  }, [completedSignals, periodFilter, typeFilter, searchTerm, nowTimestamp, categoryMap, productNameMap]);

  // Simple full-text search for active stocks - optimisé avec useMemo
  const filteredActiveStocks = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    if (!q) return activeStocks;

    return activeStocks.filter(exp => {
      // product name - utilise le cache
      if (exp.type === 'direct' && exp.directProduct) {
        const prodName = productNameMap.get(exp.directProduct.productId)?.toLowerCase() || '';
        if (prodName.includes(q)) return true;
      }
      // category name - utilise le cache
      if (exp.type === 'indirect' && exp.categoryId) {
        const catName = categoryMap.get(exp.categoryId)?.name?.toLowerCase() || '';
        if (catName.includes(q)) return true;
      }
      // amount - pré-calculer les deux formats
      const amountStr = String(exp.amount);
      const amountFormatted = Number(exp.amount).toLocaleString();
      if (amountStr.includes(q) || amountFormatted.toLowerCase().includes(q)) return true;
      
      // start date/time
      const start = exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
      const startDate = new Date(start);
      const dateStr = startDate.toLocaleDateString('fr-FR') + ' ' + startDate.toLocaleTimeString('fr-FR');
      if (dateStr.toLowerCase().includes(q)) return true;

      return false;
    });
  }, [activeStocks, activeSearch, productNameMap, categoryMap]);

  // Expense creation removed from this page. Use the Expenses page to add new expenses.

  // compute filtered items once to simplify JSX rendering - optimisé avec useMemo
  const activeItems = useMemo(() => {
    const getStartDate = (exp: ExpenseAdvanced) => 
      exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
    
    return filteredActiveStocks
      .filter(exp => expenseTypeFilter === 'all' || exp.type === expenseTypeFilter)
      .sort((a, b) => getStartDate(a) - getStartDate(b));
  }, [filteredActiveStocks, expenseTypeFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Signalement des Stocks</h1>
          <p className="text-muted-foreground">
            Signalez la fin des stocks pour calculer automatiquement les marges
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Network status + manual sync moved to app header (Layout).
              Keep logic for pending count and manualSync in hooks/libraries,
              but remove duplicate UI here to avoid inconsistent UX. */}
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        {user?.role === 'admin' ? (
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Stocks Actifs ({activeStocks.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Historique ({completedSignals.length})
            </TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="active">
              Stocks Actifs ({activeStocks.length})
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="active" className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={`skeleton-active-${i}`} className="border-l-4 border-l-primary animate-pulse">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-28 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-20" />
                      </div>
                      <div className="flex items-center justify-end">
                        <div className="h-10 w-32 bg-gray-200 rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                    <div>
                      <Label>Rechercher dans les stocks actifs</Label>
                      <Input placeholder="Produit, catégorie, prix ou date" value={activeSearch} onChange={e => setActiveSearch(e.target.value)} />
                    </div>
                    <div className="flex justify-end items-center gap-2">
                      <Select value={expenseTypeFilter} onValueChange={(v: any) => setExpenseTypeFilter(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les types</SelectItem>
                          <SelectItem value="direct">Directe (1 produit)</SelectItem>
                          <SelectItem value="indirect">Indirecte (plusieurs produits)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={() => setActiveSearch('')}>Réinitialiser</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Le bouton ‘Ajouter une Dépense’ a été retiré — utilisez la page Dépenses dédiée */}

              {activeItems.length === 0 ? (
                activeSearch ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Aucun résultat</h3>
                      <p className="text-muted-foreground">Aucun résultat pour la recherche « {activeSearch} ».</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Aucun stock actif</h3>
                      <p className="text-muted-foreground">
                        Tous les stocks ont été signalés ou aucune dépense directe n'a été enregistrée.
                      </p>
                    </CardContent>
                  </Card>
                )
              ) : (
                <div className="grid gap-4">
                  {activeItems.map(expense => {
                    const startDate = expense.type === 'direct' && expense.directProduct
                      ? expense.directProduct.startDate
                      : expense.date;
                    const daysSince = getDaysSince(startDate);
                    const isOld = daysSince > 7;

                    // Pour les dépenses directes et indirectes, vérifier les stocks multiples
                    let productStockCount = 1;
                    let isOldestForProduct = true;
                    let hasMultipleStocks = false;
                    let categoryStockCount = 1;
                    let isOldestForCategory = true;
                    let hasMultipleCategoryStocks = false;

                    if (expense.type === 'direct' && expense.directProduct) {
                      productStockCount = getProductStockCount(expense.directProduct.productId);
                      isOldestForProduct = getOldestStockForProduct(expense.directProduct.productId)?.id === expense.id;
                      hasMultipleStocks = productStockCount > 1;
                    }

                    if (expense.type === 'indirect' && expense.categoryId) {
                      const categoryStocks = stocksByCategory.get(expense.categoryId) || [];
                      categoryStockCount = categoryStocks.length;
                      isOldestForCategory = categoryStocks[0]?.id === expense.id;
                      hasMultipleCategoryStocks = categoryStockCount > 1;
                    }

                    // Désactiver le bouton si ce n'est pas le plus ancien stock pour le produit (direct) ou la catégorie (indirect)
                    const disableSignal = (expense.type === 'direct' && hasMultipleStocks && !isOldestForProduct)
                      || (expense.type === 'indirect' && hasMultipleCategoryStocks && !isOldestForCategory);

                    return (
                      <Card key={expense.id} className={`border-l-4 ${isOld ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="space-y-3 w-full">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-semibold">{expense.name}</h3>
                                {isOld && (
                                  <Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Stock ancien
                                  </Badge>
                                )}
                                {expense.type === 'direct' && hasMultipleStocks && (
                                  <Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                                    {productStockCount} stocks actifs
                                  </Badge>
                                )}
                                {expense.type === 'direct' && hasMultipleStocks && !isOldestForProduct && (
                                  <Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Signaler l'ancien d'abord
                                  </Badge>
                                )}
                                {expense.type === 'indirect' && hasMultipleCategoryStocks && (
                                  <Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                                    {categoryStockCount} stocks actifs
                                  </Badge>
                                )}
                                {expense.type === 'indirect' && hasMultipleCategoryStocks && !isOldestForCategory && (
                                  <Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Signaler l'ancien d'abord
                                  </Badge>
                                )}
                              </div>
                              {/* Responsive info grid for mobile */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm mt-2">
                                <div>
                                  <p className="text-muted-foreground">
                                    {expense.type === 'direct' ? 'Produit' : 'Catégorie'}
                                  </p>
                                  <p className="font-medium">
                                    {expense.type === 'direct' && expense.directProduct
                                      ? getProductName(expense.directProduct.productId)
                                      : expense.type === 'indirect' && expense.categoryId
                                      ? categoryMap.get(expense.categoryId)?.name || 'Catégorie inconnue'
                                      : 'N/A'
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Coût</p>
                                  <p className="font-medium text-lg">
                                    {Number(expense.amount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">
                                    {expense.type === 'direct' ? 'Quantité' : 'Produits concernés'}
                                  </p>
                                  <p className="font-medium">
                                    {expense.type === 'direct' && expense.directProduct
                                      ? expense.directProduct.quantity
                                      : expense.type === 'indirect' && expense.categoryId
                                      ? (categoryMap.get(expense.categoryId)?.productIds?.length || 0) + ' produits'
                                      : 'N/A'
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Depuis</p>
                                  <p className="font-medium flex items-center">
                                    <Clock className="w-4 h-4 mr-1" />
                                    {daysSince} jour{daysSince > 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground mt-2">
                                Commencé le {new Date(startDate).toLocaleDateString('fr-FR')} à {new Date(startDate).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </div>
                              {hasMultipleStocks && !isOldestForProduct && (
                                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                                  Ce stock ne peut pas être signalé car il y a un stock plus ancien du même produit. 
                                  Veuillez signaler les stocks dans l'ordre chronologique.
                                </div>
                              )}
                              {expense.type === 'indirect' && hasMultipleCategoryStocks && !isOldestForCategory && (
                                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                                  Ce stock ne peut pas être signalé car il y a un stock plus ancien du même produit. 
                                  Veuillez signaler les stocks dans l'ordre chronologique.
                                </div>
                              )}
                            </div>
                            <Button 
                              onClick={() => handleStockEnd(expense)}
                              variant={isOld ? "destructive" : "default"}
                              size="lg"
                              disabled={disableSignal}
                              className={disableSignal ? "opacity-50" : ""}
                            >
                              <Package className="w-4 h-4 mr-2" />
                              {disableSignal
                                ? "Signaler l'ancien d'abord"
                                : expense.type === 'direct'
                                ? "Stock Fini"
                                : "Signaler Dépense"
                              }
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="completed" className="space-y-4">
            {/* Graphique + Filtres sur la même ligne en desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Graphique circulaire pertes/surplus */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Répartition Surplus / Manque</CardTitle>
                  </CardHeader>
                  <CardContent style={{ height: 320 }}>
                    {(() => {
                      // Filtrer uniquement les dépenses de type 'direct' pour le graphique
                      const directSignals = filteredSignals.filter(s => {
                        // On considère direct si la dépense d'origine était de type direct
                        // On peut vérifier si le productId n'est pas une catégorie ou 'indirect'
                        // Mais le plus sûr est de vérifier dans completedSignals ou d'ajouter un champ type dans StockSignal
                        // Ici, on suppose que les indirects ont productId === 'indirect' ou une catégorie
                        // Si vous avez un champ type dans StockSignal, préférez l'utiliser
                        return s.productId !== 'indirect' && categoryMap.get(s.productId) === undefined;
                      });
                      const totalSurplus = Math.round(directSignals.reduce((sum, s) => sum + (s.margin >= 0 ? Math.round(s.margin) : 0), 0));
                      const totalManque = Math.round(directSignals.reduce((sum, s) => sum + (s.margin < 0 ? Math.round(Math.abs(s.margin)) : 0), 0));
                      if (totalSurplus === 0 && totalManque === 0) {
                        return <div className="flex items-center justify-center h-full text-muted-foreground">Aucune donnée à afficher pour cette période/type.</div>;
                      }
                      // Responsive settings
                      const isMobile = window.innerWidth < 768;
                      const chartHeight = isMobile ? 250 : 280;
                      const outerRadius = isMobile ? 70 : 100;
                      return (
                        <>
                          <ResponsiveContainer width="100%" height={chartHeight}>
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Surplus', value: totalSurplus },
                                  { name: 'Manque', value: totalManque }
                                ]}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={outerRadius}
                                label={isMobile ? 
                                  ({ percent }) => `${(percent * 100).toFixed(0)}%` :
                                  ({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`
                                }
                                labelLine={false}
                              >
                                <Cell key="surplus" fill="#22c55e" />
                                <Cell key="manque" fill="#ef4444" />
                              </Pie>
                              <Tooltip 
                                formatter={v => `${Number(v).toLocaleString('fr-FR')} FCFA`}
                                contentStyle={{ 
                                  fontSize: isMobile ? '12px' : '14px',
                                  padding: isMobile ? '8px' : '12px'
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex justify-center gap-4 mt-2 text-xs">
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full" style={{background:'#22c55e'}}></span>
                              Surplus : {totalSurplus.toLocaleString('fr-FR')} FCFA
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full" style={{background:'#ef4444'}}></span>
                              Manque : {totalManque.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
              {/* Filtres */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Filtres</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Rechercher</Label>
                      <Input
                        placeholder="Produit, date, heure..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Période</Label>
                      <Select value={periodFilter} onValueChange={(value: any) => setPeriodFilter(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tout l'historique</SelectItem>
                          <SelectItem value="day">Aujourd'hui</SelectItem>
                          <SelectItem value="week">Cette semaine</SelectItem>
                          <SelectItem value="month">Ce mois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous</SelectItem>
                          <SelectItem value="surplus">Surplus uniquement</SelectItem>
                          <SelectItem value="manque">Manque uniquement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => {
                        // Réinitialiser la recherche et remettre la période par défaut sur "Aujourd'hui"
                        setSearchTerm('');
                        setPeriodFilter('day');
                        setTypeFilter('all');
                      }}
                      >
                        Réinitialiser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={`skeleton-completed-${i}`} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 w-3/4">
                        <div className="h-5 bg-gray-200 rounded w-48" />
                        <div className="h-4 bg-gray-200 rounded w-32" />
                      </div>
                      <div className="h-8 w-8 bg-gray-200 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredSignals.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Aucun signalement</h3>
                <p className="text-muted-foreground">
                  Aucun stock n'a encore été signalé comme terminé.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredSignals.map(signal => {
                const cat = categoryMap.get(signal.productId);
                const displayName = cat ? cat.name : (signal.productId === 'indirect' ? 'Dépense Indirecte' : getProductName(signal.productId));
                return (
                <Card key={signal.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            {displayName}
                          </h3>
                          <Badge variant={getMarginBadgeVariantByAmount(signal.margin)}>
                            {signal.margin >= 0 ? 'Surplus' : 'Manque'}: {signal.margin >= 0 ? '+' : ''}{Number(signal.margin).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                          </Badge>
                        </div>
                        
                        <div className={`grid gap-4 text-sm ${(() => {
                          // Vérifier si le produit a un suivi de stock - utilise le cache
                          const prod = productMap.get(signal.productId);
                          const showQuantity = (prod && Object.keys(prod.stock || {}).length > 0) || signal.quantityBought > 1;
                          // 4 colonnes de base + 1 si quantité
                          return showQuantity ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4';
                        })()}`}>
                          <div>
                            <p className="text-muted-foreground">Coût d'achat</p>
                            <p className="font-medium">
                              {Number(signal.purchaseAmount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Chiffre d'affaires</p>
                            <p className="font-medium">
                              {Number(signal.revenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{signal.margin >= 0 ? 'Surplus' : 'Manque'}</p>
                            <p className={`font-medium ${getMarginColorByAmount(signal.margin)}`}>
                              {signal.margin >= 0 ? '+' : ''}{Number(signal.margin).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                            </p>
                          </div>
                          {(() => {
                            // Afficher la quantité seulement si le produit a un suivi de stock - utilise le cache
                            const prod = productMap.get(signal.productId);
                            const showQuantity = (prod && Object.keys(prod.stock || {}).length > 0) || signal.quantityBought > 1;
                            return showQuantity ? (
                              <div>
                                <p className="text-muted-foreground">Quantité vendue</p>
                                <p className="font-medium">
                                  {signal.quantitySold} / {signal.quantityBought}
                                </p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          Du {new Date(signal.startDate).toLocaleDateString('fr-FR')} à {new Date(signal.startDate).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })} au {new Date(signal.endDate).toLocaleDateString('fr-FR')} à {new Date(signal.endDate).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => cancelSignal(signal)} disabled={loading}>
                            Annuler signalement
                          </Button>
                          {signal.margin < 0 ? (
                            <TrendingDown className="w-8 h-8 text-red-500" />
                          ) : (
                            <TrendingUp className="w-8 h-8 text-green-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>

      {/* Dialog pour choisir la date/heure de fin avant calcul */}
      <Dialog open={showEndDateDialog} onOpenChange={setShowEndDateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choisir la date de fin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Veuillez choisir la date et l'heure de fin pour calculer les ventes et la marge.</p>
              <div>
                <Label>Date et heure de fin</Label>
                {/* compute startIso for min attribute so user cannot pick earlier times */}
                {selectedExpense && (
                  (() => {
                    const start = selectedExpense.type === 'direct' && selectedExpense.directProduct ? selectedExpense.directProduct.startDate : selectedExpense.date;
                    const startIso = new Date(start).toISOString().slice(0,16);
                    return (
                      <Input type="datetime-local" value={endDateInput} min={startIso} onChange={(e: any) => setEndDateInput(e.target.value)} />
                    );
                  })()
                )}
              </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowEndDateDialog(false)}>Annuler</Button>
              <Button onClick={async () => {
                // compute and open confirmation
                await computeMarginForEnd(endDateInput);
              }}>
                Calculer et continuer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation */}
      <Dialog open={showSignalDialog} onOpenChange={setShowSignalDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmer la Fin du Stock</DialogTitle>
          </DialogHeader>
          {marginCalculation && selectedExpense && (
            <div className="space-y-4">
              {/*
                Security/UX change: most margin/revenue details are sensitive and
                must be visible only to administrators. Cashiers should only see
                the purchase cost to allow them to confirm the stock end without
                exposing business-sensitive KPIs.
              */}
              {isAdmin ? (
                <>
                  {/* Objectif CA et marge */}
                  {typeof marginCalculation.expectedRevenue === 'number' && typeof marginCalculation.targetMargin === 'number' && (
                    <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Chiffre d'affaires attendu (objectif)</div>
                      <div className="text-xl font-bold text-yellow-700">{Number(marginCalculation.expectedRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</div>
                      <div className="text-xs text-muted-foreground mt-1">Marge visée : {marginCalculation.targetMargin}%</div>
                    </div>
                  )}

                  {/* Titre et durée */}
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-semibold">
                      {selectedExpense.type === 'direct' && selectedExpense.directProduct
                        ? getProductName(selectedExpense.directProduct.productId)
                        : selectedExpense.type === 'indirect' && selectedExpense.categoryId
                        ? categoryMap.get(selectedExpense.categoryId)?.name || 'Catégorie inconnue'
                        : 'Dépense'
                      }
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Stock actif depuis {marginCalculation.duration} jour{marginCalculation.duration > 1 ? 's' : ''}
                    </p>
                    {marginCalculation.effectiveStartDate && 
                     marginCalculation.effectiveStartDate !== (selectedExpense.directProduct?.startDate || selectedExpense.date) && (
                      <p className="text-xs text-blue-600">
                        Calcul depuis le dernier signalement ({new Date(marginCalculation.effectiveStartDate).toLocaleDateString('fr-FR')} à {new Date(marginCalculation.effectiveStartDate).toLocaleTimeString('fr-FR', {
                          hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })})
                      </p>
                    )}
                  </div>

                  {/* Indicateurs principaux */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg flex flex-col items-center">
                      <DollarSign className="w-5 h-5 mb-1 text-blue-600" />
                      <span className="text-xs text-muted-foreground">Coût d'achat</span>
                      <span className="text-lg font-bold text-blue-600">{Number(marginCalculation.purchaseAmount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg flex flex-col items-center">
                      <TrendingUp className="w-5 h-5 mb-1 text-green-600" />
                      <span className="text-xs text-muted-foreground">Chiffre d'affaires total</span>
                      <span className="text-lg font-bold text-green-600">{Number(marginCalculation.totalRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {marginCalculation.effectiveStartDate && 
                         marginCalculation.effectiveStartDate !== (selectedExpense.directProduct?.startDate || selectedExpense.date) ? (
                          <>Depuis le dernier signalement ({new Date(marginCalculation.effectiveStartDate).toLocaleDateString('fr-FR')} à {new Date(marginCalculation.effectiveStartDate).toLocaleTimeString('fr-FR', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })})</>
                        ) : (
                          <>Depuis le {new Date(selectedExpense.directProduct?.startDate || selectedExpense.date).toLocaleDateString('fr-FR')} à {new Date(selectedExpense.directProduct?.startDate || selectedExpense.date).toLocaleTimeString('fr-FR', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })}</>
                        )}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg flex flex-col items-center">
                      <span className="text-xs text-muted-foreground">Marge réalisée</span>
                      <span className={`text-lg font-bold ${getMarginColorByAmount(marginCalculation.margin)}`}>
                        {marginCalculation.margin > 0 ? '+' : ''}{Number(marginCalculation.margin).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                      </span>
                      <span className={`text-xs ${getMarginColorByAmount(marginCalculation.margin)}`}>({marginCalculation.marginPercentage.toFixed(1)}%)</span>
                    </div>
                  </div>

                  {/* Revenus de la période */}
                  {marginCalculation.periodRevenue !== marginCalculation.totalRevenue && (
                    <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-center">
                      <span className="text-xs font-medium text-amber-800">Revenus de cette période</span>
                      <span className="text-base font-bold text-amber-600">{Number(marginCalculation.periodRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                      <span className="text-[10px] text-amber-600">Utilisé pour le calcul de marge (exclut les ventes déjà signalées)</span>
                    </div>
                  )}

                  {/* Quantités (admin-only) */}
                  {selectedExpense.type === 'direct' && (() => {
                    let showQuantity = false;
                    let prod: Product | undefined;
                    if (selectedExpense.directProduct) {
                      prod = productMap.get(selectedExpense.directProduct.productId);
                      showQuantity = (prod && (prod as any).trackQuantity === true) || marginCalculation.quantityBought > 1;
                    }
                    return showQuantity ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2 border">
                          <span className="text-muted-foreground">Quantité achetée</span>
                          <span className="font-medium block">{marginCalculation.quantityBought}</span>
                        </div>
                        <div className="bg-white rounded-lg p-2 border">
                          <span className="text-muted-foreground">Quantité vendue</span>
                          <span className="font-medium block">{marginCalculation.totalQuantity}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Alerte marge historique */}
                  {marginCalculation.averageMargin !== null && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span>
                        {marginCalculation.marginPercentage < marginCalculation.averageMargin
                          ? `Attention : Marge plus basse que la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`
                          : marginCalculation.marginPercentage > marginCalculation.averageMargin
                          ? `Attention : Marge plus haute que la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`
                          : `Marge égale à la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`
                        }
                      </span>
                    </div>
                  )}
                </>
              ) : (
                // Minimal view for non-admin (cashiers): only show purchase cost
                <div className="space-y-4 text-center">
                  <h3 className="text-base font-semibold">
                    {selectedExpense.type === 'direct' && selectedExpense.directProduct
                      ? getProductName(selectedExpense.directProduct.productId)
                      : selectedExpense.type === 'indirect' && selectedExpense.categoryId
                      ? categoryMap.get(selectedExpense.categoryId)?.name || 'Catégorie'
                      : 'Dépense'
                    }
                  </h3>
                  <div className="bg-blue-50 p-3 rounded-lg flex flex-col items-center">
                    <DollarSign className="w-5 h-5 mb-1 text-blue-600" />
                    <span className="text-xs text-muted-foreground">Coût d'achat</span>
                    <span className="text-lg font-bold text-blue-600">{Number(marginCalculation.purchaseAmount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Détails supplémentaires réservés à l'administrateur</div>
                </div>
              )}

              {/* Boutons d'action (visible to both roles) */}
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={() => setShowSignalDialog(false)}>
                  Annuler
                </Button>
                <Button onClick={confirmStockEnd} disabled={loading} className="font-bold">
                  {loading ? 'Signalement...' : 'Confirmer le signalement'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}