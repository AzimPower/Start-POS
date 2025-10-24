import { useEffect, useState } from 'react';
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
}

export default function StockSignals() {
  const { user } = useAuth();
  const { isOnline, manualSync } = useNetwork();
  const [activeStocks, setActiveStocks] = useState<ExpenseAdvanced[]>([]);
  const [completedSignals, setCompletedSignals] = useState<StockSignal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showSignalDialog, setShowSignalDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseAdvanced | null>(null);
  const [marginCalculation, setMarginCalculation] = useState<any>(null);
  
  // Filtres pour l'historique
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'day' | 'week' | 'month'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'surplus' | 'manque'>('all');
  // Filter by expense type for active stocks (direct / indirect)
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
  // Recherche simple pour Stocks Actifs (full-text sur produit/catégorie/prix/date)
  const [activeSearch, setActiveSearch] = useState('');
  // (expense creation is handled on the dedicated Expenses page)

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

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      
      // Pour cette page critique, toujours essayer de charger depuis le backend
      // même si hors ligne, on essaie d'abord le backend puis on fallback sur local
      try {
        // Charger toutes les données nécessaires depuis le backend
        await Promise.all([
          loadProductsFromBackend(db),
          loadExpenseCategoriesFromBackend(db),
          loadExpensesAdvancedFromBackend(db),
          loadStockSignalsFromBackend(db),
          loadSalesFromBackend(db)
        ]);
        
        await processData(db);
        
        if (!isOnline) {
          toast.success('Données chargées depuis le cache (mode hors ligne)');
        }
      } catch (error) {
        console.error('Erreur de synchronisation avec le backend:', error);
        // En cas d'erreur, charger depuis la base locale
        await loadFromLocal(db);
        
        if (isOnline) {
          toast.warning('Erreur de synchronisation, données chargées depuis le cache');
        } else {
          toast.info('Mode hors ligne - données depuis le cache');
        }
      }

      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount();
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

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
        const backendSignals = await response.json();
        const tx = db.transaction('stockSignals', 'readwrite');
        await Promise.all([
          ...backendSignals.map(s => tx.store.put(s)),
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

  const processData = async (db: any) => {
    // Load products
    const productsData = await db.getAll('products');
    setProducts(productsData);
    
    // Load expense categories
    const categoriesData = await db.getAll('expenseCategories');
    setExpenseCategories(categoriesData);
    
    // Load active expenses (stocks non signalés) - inclure directes et indirectes
    const expensesData = await db.getAll('expensesAdvanced');
    const activeExpenses = expensesData.filter(expense => 
      (expense.type === 'direct' || expense.type === 'indirect') &&
      expense.storeId === user?.storeId &&
      ((expense.type === 'direct' && expense.directProduct && !expense.directProduct.endDate) ||
       (expense.type === 'indirect' && !expense.directProduct?.endDate)) // Pour les indirectes, on utilise aussi directProduct.endDate comme marqueur
    );
    setActiveStocks(activeExpenses);
    
    // Load completed signals
    const signalsData = await db.getAll('stockSignals');
    const userSignals = signalsData.filter(signal => 
      signal.storeId === user?.storeId
    ).sort((a, b) => b.createdAt - a.createdAt);
    setCompletedSignals(userSignals);
  };

  const calculateSalesBetween = async (startDate: number, endDate: number, productId: string, excludeAlreadySignaled: boolean = true) => {
    const db = await getDB();
    const sales = await db.getAll('sales');
    
    // Si on veut exclure les ventes déjà signalées, on récupère les signalements précédents
    let adjustedStartDate = startDate;
    if (excludeAlreadySignaled) {
      const stockSignals = await db.getAll('stockSignals');
      const previousSignals = stockSignals
        .filter(signal => 
          signal.productId === productId && 
          signal.storeId === user?.storeId
        )
        .sort((a, b) => b.endDate - a.endDate); // Trier par date de fin décroissante
      
      console.log('All signals for product:', previousSignals);
      
      // Si il y a un signalement précédent, on commence après sa date de fin
      if (previousSignals.length > 0) {
        const lastSignal = previousSignals[0]; // Le plus récent
        // Ajouter 1 minute pour s'assurer qu'on exclut complètement toutes les ventes de la même minute que le signalement
        adjustedStartDate = Math.max(startDate, lastSignal.endDate + 60000); // +1 minute = 60000ms
        console.log('Previous signal found:', {
          lastSignalEndDate: new Date(lastSignal.endDate),
          originalStartDate: new Date(startDate),
          adjustedStartDate: new Date(adjustedStartDate),
          excludingWholeMinute: true
        });
      } else {
        console.log('No previous signals found for this product');
      }
    }
    
    const filteredSales = sales.filter((sale: Sale) => 
      sale.createdAt >= adjustedStartDate && // Maintenant on peut utiliser >= car adjustedStartDate = endDate + 1ms
      sale.createdAt <= endDate &&
      sale.draft !== true // Exclure les brouillons (en gérant le cas où draft n'existe pas)
    );
    
    let totalQuantity = 0;
    let totalRevenue = 0;
    
    console.log('Calculating sales for product:', productId);
    console.log('Adjusted period:', new Date(adjustedStartDate), 'to', new Date(endDate));
    console.log('All sales count:', sales.length);
    console.log('Filtered sales:', filteredSales.length);
    
    // Debug: afficher toutes les ventes pour ce produit dans la période élargie
    const debugSales = sales.filter(sale => 
      sale.createdAt >= startDate && sale.createdAt <= endDate
    );
    console.log('Debug - All sales in original period:', debugSales.map(sale => ({
      id: sale.id,
      createdAt: new Date(sale.createdAt),
      total: sale.total,
      included: sale.createdAt >= adjustedStartDate
    })));
    
    filteredSales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          if (item.productId === productId) {
            // S'assurer que les valeurs sont des nombres valides
            const quantity = Number(item.quantity) || 0;
            // Essayer d'abord item.total, sinon calculer price * quantity
            let itemTotal = Number(item.total) || 0;
            if (itemTotal === 0 && item.price) {
              itemTotal = (Number(item.price) || 0) * quantity;
            }
            
            console.log('Sale included in calculation:', { 
              saleId: sale.id,
              saleCreatedAt: new Date(sale.createdAt),
              adjustedStartDate: new Date(adjustedStartDate),
              isAfterCutoff: sale.createdAt >= adjustedStartDate,
              quantity, 
              itemTotal, 
              originalTotal: item.total,
              price: item.price,
              productId: item.productId 
            });
            
            totalQuantity += quantity;
            totalRevenue += itemTotal;
          }
        });
      }
    });
    
    console.log('Final totals:', { totalQuantity, totalRevenue });
    
    return { totalQuantity, totalRevenue, adjustedStartDate };
  };

  const calculateSalesForMultipleProducts = async (startDate: number, endDate: number, productIds: string[], excludeAlreadySignaled: boolean = true) => {
    let totalQuantity = 0;
    let totalRevenue = 0;
    let effectiveStartDate = startDate;
    
    // Pour chaque produit, calculer les ventes et prendre la date de début la plus récente
    for (const productId of productIds) {
      const productSales = await calculateSalesBetween(startDate, endDate, productId, excludeAlreadySignaled);
      totalQuantity += productSales.totalQuantity;
      totalRevenue += productSales.totalRevenue;
      // Prendre la date de début effective la plus récente
      if (productSales.adjustedStartDate > effectiveStartDate) {
        effectiveStartDate = productSales.adjustedStartDate;
      }
    }
    
    return { totalQuantity, totalRevenue, adjustedStartDate: effectiveStartDate };
  };

  const handleStockEnd = async (expense: ExpenseAdvanced) => {
    // Chercher la marge visée depuis la fiche du produit
    // Supporte targetMargin stocké comme number ou string (ex: "100" ou 100)
    let targetMargin: number | null = null;
    let product: Product | undefined;
    if (expense.type === 'direct' && expense.directProduct) {
      product = products.find(p => p.id === expense.directProduct.productId);
      // Prefer explicit targetMargin on product (accept string or number)
      if (product && (product as any).targetMargin != null) {
        const parsed = Number((product as any).targetMargin);
        if (!isNaN(parsed)) targetMargin = parsed;
      }
      // If none, try to infer from product salePrice/costPrice (if present)
      if (targetMargin === null && product && typeof product.salePrice === 'number' && typeof product.costPrice === 'number' && product.costPrice > 0) {
        const inferred = ((product.salePrice - product.costPrice) / product.costPrice) * 100;
        if (!isNaN(inferred)) targetMargin = inferred;
      }
    }
    // Si pas trouvé dans le produit, essayer depuis la dépense (ancien système), en tolérant string/number
    if (targetMargin === null && (expense as any).targetMargin != null) {
      const parsed = Number((expense as any).targetMargin);
      if (!isNaN(parsed)) targetMargin = parsed;
    }
    setSelectedExpense(expense);
    // Calculer les ventes pendant la période
    const endTime = Date.now();
    const startTime = expense.date;
    let periodSalesData;
    let totalSalesData;
    let marginHistory = [];
    let averageMargin = null;

    if (expense.type === 'direct' && expense.directProduct) {
      periodSalesData = await calculateSalesBetween(
        startTime,
        endTime,
        expense.directProduct.productId,
        true
      );
      // Historique des marges pour ce produit
      marginHistory = completedSignals.filter(s => s.productId === expense.directProduct.productId).map(s => s.marginPercentage);
    } else if (expense.type === 'indirect' && expense.categoryId) {
      const category = expenseCategories.find(cat => cat.id === expense.categoryId);
      
      if (!category) {
        toast.error('Catégorie de dépense introuvable');
        return;
      }
      
      if (!category.productIds || !Array.isArray(category.productIds) || category.productIds.length === 0) {
        toast.error(`Aucun produit lié à cette catégorie de dépense indirecte: "${category.name}". Veuillez configurer les produits liés dans la page Catégories de Dépenses.`);
        return;
      }
      
      periodSalesData = await calculateSalesForMultipleProducts(
        startTime,
        endTime,
        category.productIds,
        true
      );
      // Historique des marges pour cette catégorie
      marginHistory = completedSignals.filter(s => s.productId === expense.categoryId).map(s => s.marginPercentage);
    } else {
      toast.error('Type de dépense non supporté pour le signalement');
      return;
    }

    const effectiveStartDate = periodSalesData.adjustedStartDate || startTime;
    if (expense.type === 'direct' && expense.directProduct) {
      totalSalesData = await calculateSalesBetween(
        effectiveStartDate,
        endTime,
        expense.directProduct.productId,
        false
      );
    } else if (expense.type === 'indirect' && expense.categoryId) {
      const category = expenseCategories.find(cat => cat.id === expense.categoryId);
      if (category && category.productIds && category.productIds.length > 0) {
        totalSalesData = await calculateSalesForMultipleProducts(
          effectiveStartDate,
          endTime,
          category.productIds,
          false
        );
      } else {
        // Utiliser des valeurs par défaut pour éviter l'erreur
        totalSalesData = { totalQuantity: 0, totalRevenue: 0, adjustedStartDate: effectiveStartDate };
      }
    }

    const totalRevenue = Number(totalSalesData?.totalRevenue) || 0;
    const periodRevenue = Number(periodSalesData.totalRevenue) || 0;
    const totalQuantity = Number(periodSalesData.totalQuantity) || 0;
    const purchaseAmount = Number(expense.amount) || 0;
    const quantityBought = expense.type === 'direct' && expense.directProduct
      ? Number(expense.directProduct.quantity) || 0
      : 1;
    
    // Calcul de la marge en fonction de l'objectif visé
    const realMargin = periodRevenue - purchaseAmount; // Marge brute réelle (pour l'historique)
    let margin = realMargin; // Marge affichée (par défaut = marge réelle)
    let marginPercentage = 0;
    
    if (typeof targetMargin === 'number') {
      // Si on a une marge cible, calculer par rapport à l'objectif
      // Formule : CA réel - CA attendu (négatif si manque, positif si surplus)
      const expectedRevenue = purchaseAmount * (1 + targetMargin / 100);
      margin = periodRevenue - expectedRevenue; // Négatif si en dessous de l'objectif, positif si au-dessus
      marginPercentage = expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : 0;
    } else {
      // Sinon, calcul classique
      marginPercentage = periodRevenue > 0 ? (margin / periodRevenue) * 100 : 0;
    }

    // Calcul de la moyenne des marges
    if (marginHistory.length > 0) {
      averageMargin = marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length;
    }

    // Calcul du chiffre d'affaires attendu et du surplus/manque
    // Marge est en % du prix d'achat, donc prix de vente attendu = prix d'achat × (1 + marge/100)
    let expectedRevenue = null;
    let surplusMargin = null;
    let missingMargin = null;
    if (typeof targetMargin === 'number') {
      // Marge appliquée sur le prix d'achat (ex: 100% du prix d'achat = prix de vente = 2 × prix d'achat)
      expectedRevenue = purchaseAmount * (1 + targetMargin / 100);
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
      realMargin, // Marge brute réelle pour l'historique
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
    });
    setShowSignalDialog(true);
  };

  const confirmStockEnd = async () => {
    if (!selectedExpense || !marginCalculation || !user?.storeId) return;
    
    setLoading(true);
    try {
      const db = await getDB();
      
      // S'assurer que toutes les valeurs sont des nombres valides avant de sauvegarder
      const stockSignal: StockSignal = {
        id: generateId(),
        expenseId: selectedExpense.id,
        productId: selectedExpense.type === 'direct' && selectedExpense.directProduct
          ? selectedExpense.directProduct.productId
          : selectedExpense.categoryId || 'indirect', // Pour les indirectes, utiliser categoryId
        userId: user.id,
        storeId: user.storeId,
        startDate: Number(marginCalculation.effectiveStartDate) || selectedExpense.date,
        endDate: Date.now(),
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
              endDate: Date.now(),
            }
          : {
              productId: 'indirect', // Marqueur pour les dépenses indirectes
              quantity: 1,
              startDate: selectedExpense.date,
              endDate: Date.now(),
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

  const getProductStockCount = (productId: string) => {
    return activeStocks.filter(stock => stock.directProduct?.productId === productId).length;
  };

  const getOldestStockForProduct = (productId: string) => {
    const productStocks = activeStocks.filter(stock => stock.directProduct?.productId === productId);
    return productStocks.sort((a, b) => a.directProduct!.startDate - b.directProduct!.startDate)[0];
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Produit inconnu';
  };

  const getDaysSince = (timestamp: number) => {
    return Math.ceil((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  };

  const getMarginColor = (percentage: number) => {
    if (percentage < 20) return 'text-red-600';
    if (percentage < 35) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getMarginColorByAmount = (margin: number) => {
    // Si marge positive = surplus (vert), si négative = manque (rouge)
    if (margin >= 0) return 'text-green-600';
    return 'text-red-600';
  };

  const getMarginBadgeVariant = (percentage: number) => {
    if (percentage < 20) return 'destructive';
    if (percentage < 35) return 'secondary';
    return 'default';
  };

  const getMarginBadgeVariantByAmount = (margin: number) => {
    // Si marge positive = surplus (vert/default), si négative = manque (rouge/destructive)
    if (margin >= 0) return 'default'; // Vert
    return 'destructive'; // Rouge
  };

  // Fonction pour filtrer les signaux
  const getFilteredSignals = () => {
    let filtered = completedSignals;

    // Filtre par période
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    if (periodFilter === 'day') {
      filtered = filtered.filter(s => s.createdAt >= oneDayAgo);
    } else if (periodFilter === 'week') {
      filtered = filtered.filter(s => s.createdAt >= oneWeekAgo);
    } else if (periodFilter === 'month') {
      filtered = filtered.filter(s => s.createdAt >= oneMonthAgo);
    }

    // Filtre par type (surplus/manque)
    if (typeFilter === 'surplus') {
      filtered = filtered.filter(s => s.margin >= 0);
    } else if (typeFilter === 'manque') {
      filtered = filtered.filter(s => s.margin < 0);
    }

    // Filtre par recherche (nom de produit, date et heure)
    if (searchTerm.trim()) {
      filtered = filtered.filter(s => {
        const productName = s.productId === 'indirect' || expenseCategories.find(cat => cat.id === s.productId)
          ? expenseCategories.find(cat => cat.id === s.productId)?.name || 'Dépense Indirecte'
          : getProductName(s.productId);
        
        // Recherche dans le nom du produit
        const matchesProductName = productName.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Recherche dans les dates (format français DD/MM/YYYY et heure HH:MM:SS)
        const startDateStr = new Date(s.startDate || s.createdAt).toLocaleDateString('fr-FR');
        const endDateStr = new Date(s.endDate || s.createdAt).toLocaleDateString('fr-FR');
        const startTimeStr = new Date(s.startDate || s.createdAt).toLocaleTimeString('fr-FR');
        const endTimeStr = new Date(s.endDate || s.createdAt).toLocaleTimeString('fr-FR');
        
        const matchesDate = startDateStr.includes(searchTerm) || 
                           endDateStr.includes(searchTerm) ||
                           startTimeStr.includes(searchTerm) ||
                           endTimeStr.includes(searchTerm);
        
        return matchesProductName || matchesDate;
      });
    }

    return filtered;
  };

  // Simple full-text search for active stocks (produit/catégorie/prix/date)
  const getFilteredActiveStocks = () => {
    const q = activeSearch.trim().toLowerCase();
    if (!q) return activeStocks;

    return activeStocks.filter(exp => {
      // product name
      if (exp.type === 'direct' && exp.directProduct) {
        const prod = products.find(p => p.id === exp.directProduct!.productId);
        const prodName = prod ? String(prod.name).toLowerCase() : '';
        if (prodName.includes(q)) return true;
      }
      // category name
      if (exp.type === 'indirect' && exp.categoryId) {
        const cat = expenseCategories.find(c => c.id === exp.categoryId);
        const catName = cat ? String(cat.name).toLowerCase() : '';
        if (catName.includes(q)) return true;
      }
      // amount
      if (String(exp.amount).toLowerCase().includes(q)) return true;
      try {
        if (Number(exp.amount).toLocaleString().toLowerCase().includes(q)) return true;
      } catch (e) {}
      // start date/time
      const start = exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
      const dateStr = new Date(start).toLocaleDateString('fr-FR') + ' ' + new Date(start).toLocaleTimeString('fr-FR');
      if (dateStr.toLowerCase().includes(q)) return true;

      return false;
    });
  };

  // Expense creation removed from this page. Use the Expenses page to add new expenses.

  // compute filtered items once to simplify JSX rendering
  // Trie pour afficher les stocks anciens en haut
  // Trie par date de début croissante (plus ancien en haut)
  const activeItems = getFilteredActiveStocks()
    .filter(exp => expenseTypeFilter === 'all' ? true : expenseTypeFilter === 'direct' ? exp.type === 'direct' : exp.type === 'indirect')
    .slice().sort((a, b) => {
    const getStartDate = (exp: any) => exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
    return getStartDate(a) - getStartDate(b);
  });

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
            <div className="text-center py-8">Chargement...</div>
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

                    // Pour les dépenses directes, vérifier les stocks multiples
                    let productStockCount = 1;
                    let isOldestForProduct = true;
                    let hasMultipleStocks = false;

                    if (expense.type === 'direct' && expense.directProduct) {
                      productStockCount = getProductStockCount(expense.directProduct.productId);
                      isOldestForProduct = getOldestStockForProduct(expense.directProduct.productId)?.id === expense.id;
                      hasMultipleStocks = productStockCount > 1;
                    }

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
                                {hasMultipleStocks && (
                                  <Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                                    {productStockCount} stocks actifs
                                  </Badge>
                                )}
                                {hasMultipleStocks && !isOldestForProduct && (
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
                                      ? expenseCategories.find(cat => cat.id === expense.categoryId)?.name || 'Catégorie inconnue'
                                      : 'N/A'
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Coût</p>
                                  <p className="font-medium text-lg">
                                    {expense.amount.toLocaleString()} FCFA
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
                                      ? (expenseCategories.find(cat => cat.id === expense.categoryId)?.productIds?.length || 0) + ' produits'
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
                            </div>
                            <Button 
                              onClick={() => handleStockEnd(expense)}
                              variant={isOld ? "destructive" : "default"}
                              size="lg"
                              disabled={hasMultipleStocks && !isOldestForProduct}
                              className={hasMultipleStocks && !isOldestForProduct ? "opacity-50" : ""}
                            >
                              <Package className="w-4 h-4 mr-2" />
                              {hasMultipleStocks && !isOldestForProduct 
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
            {/* Filtres */}
            <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchTerm('');
                      setPeriodFilter('all');
                      setTypeFilter('all');
                    }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {getFilteredSignals().length === 0 ? (
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
              {getFilteredSignals().map(signal => (
                <Card key={signal.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            {signal.productId === 'indirect' || expenseCategories.find(cat => cat.id === signal.productId)
                              ? expenseCategories.find(cat => cat.id === signal.productId)?.name || 'Dépense Indirecte'
                              : getProductName(signal.productId)
                            }
                          </h3>
                          <Badge variant={getMarginBadgeVariantByAmount(signal.margin)}>
                            {signal.margin >= 0 ? 'Surplus' : 'Manque'}: {signal.margin >= 0 ? '+' : ''}{signal.margin.toLocaleString()} FCFA
                          </Badge>
                        </div>
                        
                        <div className={`grid gap-4 text-sm ${(() => {
                          // Vérifier si le produit a un suivi de stock
                          const prod = products.find(p => p.id === signal.productId);
                          const showQuantity = (prod && Object.keys(prod.stock || {}).length > 0) || signal.quantityBought > 1;
                          // 4 colonnes de base + 1 si quantité
                          return showQuantity ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4';
                        })()}`}>
                          <div>
                            <p className="text-muted-foreground">Coût d'achat</p>
                            <p className="font-medium">
                              {signal.purchaseAmount.toLocaleString()} FCFA
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Chiffre d'affaires</p>
                            <p className="font-medium">
                              {signal.revenue.toLocaleString()} FCFA
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{signal.margin >= 0 ? 'Surplus' : 'Manque'}</p>
                            <p className={`font-medium ${getMarginColorByAmount(signal.margin)}`}>
                              {signal.margin >= 0 ? '+' : ''}{signal.margin.toLocaleString()} FCFA
                            </p>
                          </div>
                          {(() => {
                            // Afficher la quantité seulement si le produit a un suivi de stock
                            const prod = products.find(p => p.id === signal.productId);
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
                        {signal.margin < 0 ? (
                          <TrendingDown className="w-8 h-8 text-red-500" />
                        ) : (
                          <TrendingUp className="w-8 h-8 text-green-500" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>

      {/* Dialog de confirmation */}
      <Dialog open={showSignalDialog} onOpenChange={setShowSignalDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmer la Fin du Stock</DialogTitle>
          </DialogHeader>
          {marginCalculation && selectedExpense && (
            <div className="space-y-4">
              {/* Objectif CA et marge */}
              {typeof marginCalculation.expectedRevenue === 'number' && typeof marginCalculation.targetMargin === 'number' && (
                <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Chiffre d'affaires attendu (objectif)</div>
                  <div className="text-xl font-bold text-yellow-700">{marginCalculation.expectedRevenue.toLocaleString()} FCFA</div>
                  <div className="text-xs text-muted-foreground mt-1">Marge visée : {marginCalculation.targetMargin}%</div>
                </div>
              )}
              {/* Titre et durée */}
              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold">
                  {selectedExpense.type === 'direct' && selectedExpense.directProduct
                    ? getProductName(selectedExpense.directProduct.productId)
                    : selectedExpense.type === 'indirect' && selectedExpense.categoryId
                    ? expenseCategories.find(cat => cat.id === selectedExpense.categoryId)?.name || 'Catégorie inconnue'
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
                  <span className="text-lg font-bold text-blue-600">{marginCalculation.purchaseAmount.toLocaleString()} FCFA</span>
                </div>
                <div className="bg-green-50 p-3 rounded-lg flex flex-col items-center">
                  <TrendingUp className="w-5 h-5 mb-1 text-green-600" />
                  <span className="text-xs text-muted-foreground">Chiffre d'affaires total</span>
                  <span className="text-lg font-bold text-green-600">{marginCalculation.totalRevenue.toLocaleString()} FCFA</span>
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
                    {marginCalculation.margin > 0 ? '+' : ''}{marginCalculation.margin.toLocaleString()} FCFA
                  </span>
                  <span className={`text-xs ${getMarginColorByAmount(marginCalculation.margin)}`}>({marginCalculation.marginPercentage.toFixed(1)}%)</span>
                </div>
              </div>
              {/* Revenus de la période */}
              {marginCalculation.periodRevenue !== marginCalculation.totalRevenue && (
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-center">
                  <span className="text-xs font-medium text-amber-800">Revenus de cette période</span>
                  <span className="text-base font-bold text-amber-600">{marginCalculation.periodRevenue.toLocaleString()} FCFA</span>
                  <span className="text-[10px] text-amber-600">Utilisé pour le calcul de marge (exclut les ventes déjà signalées)</span>
                </div>
              )}
              {/* Quantités */}
              {selectedExpense.type === 'direct' && (() => {
                let showQuantity = false;
                let prod = null;
                if (selectedExpense.directProduct) {
                  prod = products.find(p => p.id === selectedExpense.directProduct.productId);
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
              {/* Boutons d'action */}
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