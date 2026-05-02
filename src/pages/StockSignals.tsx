import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, TrendingDown, Package, DollarSign, Clock, CheckCircle, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { pendingEmailService } from '@/lib/pendingEmailService';
import { buildBypassUrl, buildProjectedLocalSales, mergeBackendSalesIntoLocalDb } from '@/lib/salesSync';
import { getPendingSyncOps, hasPendingStockOperations } from '@/lib/sync';
import { sendStoreAdminNotification } from '@/lib/storeAdminNotifications';
import { BACKEND_BASE } from '@/lib/backend';
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
const normalizeBackendCollection = (payload: any): any[] => {
    if (!payload)
        return [];
    if (Array.isArray(payload))
        return payload;
    if (Array.isArray(payload.data))
        return payload.data;
    if (Array.isArray(payload.items))
        return payload.items;
    if (Array.isArray(payload.results))
        return payload.results;
    if (typeof payload === 'object') {
        const values = Object.values(payload).filter((value) => value && typeof value === 'object');
        return values.length > 0 ? values : [payload];
    }
    return [];
};
const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const toOptionalTimestamp = (value: unknown): number | null => {
    const parsed = toSafeNumber(value);
    return parsed > 0 ? parsed : null;
};
const formatDateTimeLocal = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
        return '';
    }
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const parseDateTimeLocal = (value?: string): number | null => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};
const STOCK_SIGNALS_API_PATH = '/backend/api/stock_signals.php';
const EXPENSES_ADVANCED_API_PATH = '/backend/api/expenses_advanced.php';

function normalizeQueueMethod(entry: any) {
    const explicitMethod = String(entry?.method || '').toUpperCase();
    if (explicitMethod) {
        return explicitMethod;
    }

    const operation = String(entry?.operation || '').toLowerCase();
    if (operation === 'update') {
        return 'PUT';
    }
    if (operation === 'delete') {
        return 'DELETE';
    }

    return 'POST';
}

function matchesScopedPendingEntry(entry: any, apiPath: string, tableName: string, storeId?: string) {
    const url = String(entry?.url || '');
    const table = String(entry?.table || '');
    const entryStoreId = String(entry?.storeId || entry?.data?.storeId || '').trim();

    if (table !== tableName && !url.includes(apiPath)) {
        return false;
    }

    if (!storeId || !entryStoreId) {
        return true;
    }

    return entryStoreId === String(storeId).trim();
}

async function collectPendingEntityState(db: any, options: {
    apiPath: string;
    tableName: string;
    storeId?: string;
}) {
    const pendingUpsertIds = new Set<string>();
    const pendingDeleteIds = new Set<string>();
    const queueEntries: any[] = [];

    try {
        queueEntries.push(...await db.getAll('syncQueue'));
    }
    catch (error) {
    }

    try {
        queueEntries.push(...await getPendingSyncOps());
    }
    catch (error) {
    }

    for (const entry of queueEntries) {
        if (!matchesScopedPendingEntry(entry, options.apiPath, options.tableName, options.storeId)) {
            continue;
        }

        const targetId = String(entry?.data?.id || '').trim();
        if (!targetId) {
            continue;
        }

        const method = normalizeQueueMethod(entry);
        if (method === 'DELETE') {
            pendingDeleteIds.add(targetId);
            continue;
        }

        pendingUpsertIds.add(targetId);
    }

    return { pendingUpsertIds, pendingDeleteIds };
}

function buildStockSignalFallbackId(signal: any) {
    return [
        String(signal?.storeId || '').trim(),
        String(signal?.expenseId || '').trim(),
        String(signal?.productId || '').trim(),
        String(signal?.startDate || '').trim(),
        String(signal?.endDate || '').trim(),
        String(signal?.createdAt || '').trim(),
    ].join(':');
}

function normalizeStockSignalRecord(signal: any) {
    if (!signal) {
        return signal;
    }

    const normalizedId = signal.id || signal.uid || signal._id || buildStockSignalFallbackId(signal);
    return {
        ...signal,
        id: String(normalizedId),
    };
}
const isBogusStockSignal = (signal: Partial<StockSignal> | null | undefined): boolean => {
    if (!signal)
        return true;
    const startDate = toSafeNumber(signal.startDate);
    const endDate = toSafeNumber(signal.endDate);
    const purchaseAmount = toSafeNumber(signal.purchaseAmount);
    const revenue = toSafeNumber(signal.revenue);
    const margin = toSafeNumber(signal.margin);
    const realMargin = toSafeNumber(signal.realMargin);
    const quantityBought = toSafeNumber(signal.quantityBought);
    const quantitySold = toSafeNumber(signal.quantitySold);
    const hasInvalidDateRange = startDate <= 0 || endDate <= 0 || endDate < startDate;
    const hasFutureEndDate = endDate > Date.now() + (5 * 60 * 1000);
    const hasEmptyMetrics = purchaseAmount === 0 && revenue === 0 && margin === 0 && realMargin === 0;
    const hasBrokenQuantities = quantityBought === 0 && quantitySold > 0;
    if (hasInvalidDateRange || hasFutureEndDate) {
        return true;
    }
    return hasEmptyMetrics || hasBrokenQuantities;
};
export default function StockSignals() {
    const { user } = useAuth();
    // treat super_admin as admin for UI purposes
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const { isOnline, isBackendReachable, manualSync } = useNetwork();
    const [activeStocks, setActiveStocks] = useState<ExpenseAdvanced[]>([]);
    const [completedSignals, setCompletedSignals] = useState<StockSignal[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
    const [allExpenses, setAllExpenses] = useState<ExpenseAdvanced[]>([]);
    const [loading, setLoading] = useState(false);
    const [isPreparingSignal, setIsPreparingSignal] = useState(false);
    const [preparingExpenseId, setPreparingExpenseId] = useState<string | null>(null);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [showSignalDialog, setShowSignalDialog] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<ExpenseAdvanced | null>(null);
    const [marginCalculation, setMarginCalculation] = useState<any>(null);
    const [showEndDateDialog, setShowEndDateDialog] = useState(false);
    const [endDateInput, setEndDateInput] = useState<string>('');
    const [isRefreshingSignalData, setIsRefreshingSignalData] = useState(false);
    const [isComputingMargin, setIsComputingMargin] = useState(false);
    // Filtres pour l'historique
    const [searchTerm, setSearchTerm] = useState('');
    // Afficher par défaut l'historique d'aujourd'hui dans l'onglet "Historique"
    const [periodFilter, setPeriodFilter] = useState<'all' | 'day' | 'yesterday' | 'week' | 'month'>('day');
    const [typeFilter, setTypeFilter] = useState<'all' | 'surplus' | 'manque'>('all');
    // Filter by expense type for active stocks (direct / indirect)
    const [expenseTypeFilter, setExpenseTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
    // Filter by expense type for history signals (direct / indirect)
    const [historyExpenseTypeFilter, setHistoryExpenseTypeFilter] = useState<'all' | 'direct' | 'indirect'>('direct');
    // Paramètre boutique: suivi des dépenses indirectes (décidé par l'admin)
    const [trackIndirectExpenses, setTrackIndirectExpenses] = useState<boolean>(true);
    const [trackIndirectExpensesEnabledAt, setTrackIndirectExpensesEnabledAt] = useState<number | null>(null);
    // Recherche simple pour Stocks Actifs (full-text sur produit/catégorie/prix/date)
    const [activeSearch, setActiveSearch] = useState('');
    // (expense creation is handled on the dedicated Expenses page)
    // 🔄 Ref pour éviter les rechargements multiples
    const loadedOnceRef = useRef(false);
    const cleanedInvalidSignalIdsRef = useRef<Set<string>>(new Set());
    const lastSignalDataRefreshAtRef = useRef(0);
    const signalRefreshPromiseRef = useRef<Promise<void> | null>(null);
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
    // Cache du type de dépense par expenseId
    const expenseTypeMap = useMemo(() => {
        const map = new Map<string, 'direct' | 'indirect' | 'operational'>();
        allExpenses.forEach(exp => map.set(exp.id, exp.type));
        return map;
    }, [allExpenses]);
    const isIndirectExpenseEligible = useCallback((expense: ExpenseAdvanced) => {
        if (expense.type !== 'indirect') {
            return true;
        }
        if (!trackIndirectExpenses) {
            return false;
        }
        if (!trackIndirectExpensesEnabledAt) {
            return true;
        }
        const expenseStart = toSafeNumber(expense.date || expense.createdAt);
        return expenseStart >= trackIndirectExpensesEnabledAt;
    }, [trackIndirectExpenses, trackIndirectExpensesEnabledAt]);
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
            if (stock.type === 'indirect' && stock.categoryId && isIndirectExpenseEligible(stock)) {
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
    }, [activeStocks, isIndirectExpenseEligible]);
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
        if (percentage < 20)
            return 'text-red-600';
        if (percentage < 35)
            return 'text-yellow-600';
        return 'text-green-600';
    }, []);
    const getMarginColorByAmount = useCallback((margin: number) => {
        return margin >= 0 ? 'text-green-600' : 'text-red-600';
    }, []);
    // Format amount as '2 900 FCFA' (blue)
    const formatAmountBlue = useCallback((amount: number) => (<span className="text-blue-600 font-bold">{Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>), []);
    const getMarginBadgeVariant = useCallback((percentage: number) => {
        if (percentage < 20)
            return 'destructive';
        if (percentage < 35)
            return 'secondary';
        return 'default';
    }, []);
    const getMarginBadgeVariantByAmount = useCallback((margin: number) => {
        return margin >= 0 ? 'default' : 'destructive';
    }, []);
    // ==== FIN CACHES ====
    // 🔄 Chargement initial des données (une seule fois au premier montage)
    useEffect(() => {
        if (!user)
            return;
        const shouldReload = !loadedOnceRef.current;
        if (!shouldReload) {
            // ✅ AMÉLIORATION : Même si déjà chargé, recharger depuis IndexedDB (rapide)
            // pour détecter les modifications faites dans d'autres pages
            const quickReload = async () => {
                try {
                    const db = await getDB();
                    await processData(db); // Rechargement rapide depuis IndexedDB seulement
                }
                catch (error) {
                }
            };
            quickReload();
            return;
        }
        const loadAllData = async () => {
            try {
                await loadData();
            }
            catch (error) {
                toast.error('Erreur de chargement des données');
            }
        };
        loadAllData();
        loadedOnceRef.current = true;
    }, [user]);
    // 🔄 Synchronisation quand le backend devient accessible
    useEffect(() => {
        if (!user || !isBackendReachable || !loadedOnceRef.current)
            return;
        const syncData = async () => {
            try {
                await loadData();
            }
            catch (error) {
            }
        };
        syncData();
    }, [isBackendReachable, user]);
    // 👁️ Recharger quand la page devient visible (retour depuis une autre page)
    useEffect(() => {
        if (!user)
            return;
        const handleVisibilityChange = async () => {
            // ✅ CORRECTION : Toujours recharger depuis IndexedDB (rapide) même hors ligne
            // pour que les modifications faites dans Expenses.tsx soient visibles immédiatement
            if (document.visibilityState === 'visible') {
                try {
                    await loadData(); // Charge depuis IndexedDB + backend si disponible
                }
                catch (error) {
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]); // ✅ Retiré isBackendReachable de deps
    // Use centralized pending count from sync module
    const updatePendingSyncCount = async () => {
        try {
            const { getPendingSyncCount } = await import('@/lib/sync');
            const count = await getPendingSyncCount();
            setPendingSyncCount(count || 0);
        }
        catch (error) {
            setPendingSyncCount(0);
        }
    };
    const getStoreScopedRecords = useCallback(async <T,>(db: any, storeName: string, indexName: string): Promise<T[]> => {
        if (!user?.storeId) {
            return db.getAll(storeName);
        }
        return db.getAllFromIndex(storeName, indexName, user.storeId);
    }, [user?.storeId]);
    const computeMarginForEnd = async (endIso?: string) => {
        if (!selectedExpense)
            return;
        setIsComputingMargin(true);
        try {
            const db = await getDB();
            await refreshSignalComputationData(db, selectedExpense);
            const refreshedExpense = await db.get('expensesAdvanced', selectedExpense.id);
            const expenseForCalculation = refreshedExpense || selectedExpense;
            if (refreshedExpense) {
                setSelectedExpense(refreshedExpense);
            }
            const endTime = parseDateTimeLocal(endIso) ?? Date.now();
            const now = Date.now();
            const startTime = expenseForCalculation.type === 'direct' && expenseForCalculation.directProduct
                ? expenseForCalculation.directProduct.startDate
                : expenseForCalculation.date;
            if (!Number.isFinite(startTime) || startTime <= 0) {
                toast.error('La date de début du stock est invalide. Corrigez la dépense avant de signaler la fin du stock.');
                setShowEndDateDialog(true);
                return;
            }
            if (startTime > now) {
                toast.error('La date de début du stock est dans le futur. Corrigez la date de la dépense avant de signaler la fin du stock.');
                setShowEndDateDialog(false);
                return;
            }
            if (endTime > now) {
                toast.error('La date de fin ne peut pas être dans le futur.');
                setShowEndDateDialog(true);
                return;
            }
            if (endTime < startTime) {
                toast.error('La date de fin doit être postérieure ou égale à la date de début / date d\'achat. Choisissez une autre date.');
                setShowEndDateDialog(true);
                return;
            }
            let targetMargin: number | null = null;
            let product: Product | undefined;
            let category: ExpenseCategory | undefined;
            if (expenseForCalculation.type === 'direct' && expenseForCalculation.directProduct) {
                product = await db.get('products', expenseForCalculation.directProduct.productId);
                if (product && (product as any).targetMargin != null) {
                    const parsed = Number((product as any).targetMargin);
                    if (!isNaN(parsed))
                        targetMargin = parsed;
                }
                if (targetMargin === null && product && typeof product.salePrice === 'number' && typeof product.costPrice === 'number' && product.costPrice > 0) {
                    const inferred = ((product.salePrice - product.costPrice) / product.costPrice) * 100;
                    if (!isNaN(inferred))
                        targetMargin = inferred;
                }
            }
            else if (expenseForCalculation.type === 'indirect' && expenseForCalculation.categoryId) {
                category = await db.get('expenseCategories', expenseForCalculation.categoryId);
            }
            if (targetMargin === null && (expenseForCalculation as any).targetMargin != null) {
                const parsed = Number((expenseForCalculation as any).targetMargin);
                if (!isNaN(parsed))
                    targetMargin = parsed;
            }
            let periodSalesData: any;
            let totalSalesData: any;
            if (expenseForCalculation.type === 'direct' && expenseForCalculation.directProduct) {
                periodSalesData = await calculateSalesBetween(startTime, endTime, expenseForCalculation.directProduct.productId, true);
                totalSalesData = await calculateSalesBetween(periodSalesData.adjustedStartDate || startTime, endTime, expenseForCalculation.directProduct.productId, false);
            }
            else if (expenseForCalculation.type === 'indirect' && expenseForCalculation.categoryId) {
                if (!category || !category.productIds || category.productIds.length === 0) {
                    toast.error(`Aucun produit lié à cette catégorie de dépense indirecte.`);
                    return;
                }
                periodSalesData = await calculateSalesForMultipleProducts(startTime, endTime, category.productIds, true);
                totalSalesData = await calculateSalesForMultipleProducts(periodSalesData.adjustedStartDate || startTime, endTime, category.productIds, false);
            }
            else {
                toast.error('Type de dépense non supporté pour le calcul');
                return;
            }
            const effectiveStartDate = periodSalesData.adjustedStartDate || startTime;
            if (effectiveStartDate > endTime) {
                toast.error('La date choisie doit être après l\'heure du dernier signalement valide du produit.');
                setShowEndDateDialog(true);
                return;
            }
            const totalRevenue = Number(totalSalesData?.totalRevenue) || 0;
            const periodRevenue = Number(periodSalesData.totalRevenue) || 0;
            const totalQuantity = Number(periodSalesData.totalQuantity) || 0;
            const purchaseAmount = Number(expenseForCalculation.amount) || 0;
            const quantityBought = expenseForCalculation.type === 'direct' && expenseForCalculation.directProduct
                ? Number(expenseForCalculation.directProduct.quantity) || 0
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
                }
                else {
                    expectedRevenue = purchaseAmount / (1 - targetMargin / 100);
                    margin = periodRevenue - expectedRevenue;
                    realMargin = periodRevenue - purchaseAmount;
                    marginPercentage = expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : 0;
                }
            }
            else {
                marginPercentage = periodRevenue > 0 ? (margin / periodRevenue) * 100 : 0;
            }
            realMargin = Number.isFinite(realMargin) ? realMargin : 0;
            margin = Number.isFinite(margin) ? margin : 0;
            marginPercentage = Number.isFinite(marginPercentage) ? marginPercentage : 0;
            if (expectedRevenue !== null && !Number.isFinite(expectedRevenue)) {
                expectedRevenue = null;
            }
            const referenceProductId = expenseForCalculation.type === 'direct' && expenseForCalculation.directProduct
                ? expenseForCalculation.directProduct.productId
                : expenseForCalculation.categoryId;
            const marginHistory = completedSignals
                .filter(s => s.productId === referenceProductId)
                .map(s => Number(s.marginPercentage))
                .filter((value) => Number.isFinite(value));
            let averageMargin = null;
            if (marginHistory.length > 0)
                averageMargin = marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length;
            if (averageMargin !== null && !Number.isFinite(averageMargin)) {
                averageMargin = null;
            }
            let surplusMargin = null;
            let missingMargin = null;
            if (typeof targetMargin === 'number' && targetMargin < 100) {
                expectedRevenue = purchaseAmount / (1 - targetMargin / 100);
                if (periodRevenue > expectedRevenue) {
                    surplusMargin = periodRevenue - expectedRevenue;
                    missingMargin = 0;
                }
                else if (periodRevenue < expectedRevenue) {
                    surplusMargin = 0;
                    missingMargin = expectedRevenue - periodRevenue;
                }
                else {
                    surplusMargin = 0;
                    missingMargin = 0;
                }
            }
            if (surplusMargin !== null && !Number.isFinite(surplusMargin)) {
                surplusMargin = 0;
            }
            if (missingMargin !== null && !Number.isFinite(missingMargin)) {
                missingMargin = 0;
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
        }
        finally {
            setIsComputingMargin(false);
        }
    };
    const loadData = useCallback(async (showPageLoading: boolean = true) => {
        if (showPageLoading) {
            setLoading(true);
        }
        try {
            const db = await getDB();
            // Stratégie optimisée: charger immédiatement depuis le cache local,
            // puis rafraîchir en arrière-plan si en ligne
            await processData(db);
            if (showPageLoading) {
                setLoading(false); // Afficher les données locales immédiatement
            }
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
                }
                catch (error) {
                    // Les données locales sont déjà affichées, pas besoin de toast d'erreur
                }
            }
            // Compter les éléments en attente de synchronisation
            await updatePendingSyncCount();
        }
        catch (error) {
            toast.error('Erreur lors du chargement des données');
            if (showPageLoading) {
                setLoading(false);
            }
        }
    }, [isOnline, user?.storeId]);
    const loadProductsFromBackend = async (db: any) => {
        try {
            let url = `${BACKEND_BASE}/api/products.php`;
            if (user?.storeId)
                url += `?storeId=${user.storeId}`;
            const response = await fetch(url);
            if (response.ok) {
                const backendProducts = await response.json();
                // Filtrer côté client aussi pour sécurité
                const storeProducts = backendProducts.filter((p: any) => !user?.storeId || p.storeId === user.storeId);
                const pendingStockOperations = await hasPendingStockOperations(user?.storeId);
                if (!pendingStockOperations) {
                    const tx = db.transaction('products', 'readwrite');
                    await Promise.all([
                        ...storeProducts.map(p => tx.store.put(p)),
                        tx.done
                    ]);
                }
            }
        }
        catch (error) {
        }
    };
    const loadExpenseCategoriesFromBackend = async (db: any) => {
        try {
            let url = `${BACKEND_BASE}/api/expense_categories.php`;
            if (user?.storeId)
                url += `?storeId=${user.storeId}`;
            const response = await fetch(url);
            if (response.ok) {
                const backendCategories = normalizeBackendCollection(await response.json());
                // Filtrer côté client aussi pour sécurité
                const storeCategories = backendCategories.filter((c: any) => !user?.storeId || c.storeId === user.storeId);
                const tx = db.transaction('expenseCategories', 'readwrite');
                await Promise.all([
                    ...storeCategories.map(c => tx.store.put(c)),
                    tx.done
                ]);
            }
        }
        catch (error) {
        }
    };
    const loadExpensesAdvancedFromBackend = async (db: any, options?: { id?: string; }) => {
        try {
            let url = `${BACKEND_BASE}/api/expenses_advanced.php`;
            const params = new URLSearchParams();
            if (user?.storeId)
                params.set('storeId', user.storeId);
            if (options?.id) {
                params.set('id', options.id);
            }
            else {
                params.set('limit', '10000');
            }
            url += `?${params.toString()}`;
            const response = await fetch(url);
            if (response.ok) {
                const backendExpenses = normalizeBackendCollection(await response.json());
                // Filtrer côté client aussi pour sécurité
                const storeExpenses = backendExpenses.filter((expense: any) => !user?.storeId || expense.storeId === user.storeId);
                const pendingState = await collectPendingEntityState(db, {
                    apiPath: EXPENSES_ADVANCED_API_PATH,
                    tableName: 'expensesAdvanced',
                    storeId: user?.storeId
                });
                const currentScopedExpenses: ExpenseAdvanced[] = options?.id
                    ? await (async () => {
                        const existing = await db.get('expensesAdvanced', options.id);
                        return existing ? [existing] : [];
                    })()
                    : await getStoreScopedRecords<ExpenseAdvanced>(db, 'expensesAdvanced', 'by-store');
                const localPendingExpenses = currentScopedExpenses.filter((expense) => pendingState.pendingUpsertIds.has(String(expense.id || '')));
                const mergedScopedExpenses = [
                    ...storeExpenses.filter((expense: any) => {
                        const expenseId = String(expense?.id || '').trim();
                        if (!expenseId) {
                            return false;
                        }
                        if (pendingState.pendingDeleteIds.has(expenseId)) {
                            return false;
                        }
                        return !pendingState.pendingUpsertIds.has(expenseId);
                    }),
                    ...localPendingExpenses
                ];
                const tx = db.transaction('expensesAdvanced', 'readwrite');
                await Promise.all([
                    ...currentScopedExpenses.map((expense) => tx.store.delete(expense.id)),
                    ...mergedScopedExpenses.map((expense) => tx.store.put(expense)),
                    tx.done
                ]);
            }
        }
        catch (error) {
        }
    };
    const loadStockSignalsFromBackend = async (db: any, options?: { productId?: string; }) => {
        try {
            const params = new URLSearchParams();
            if (user?.storeId)
                params.set('storeId', user.storeId);
            if (options?.productId)
                params.set('productId', options.productId);
            const query = params.toString();
            const url = `${BACKEND_BASE}/api/stock_signals.php${query ? `?${query}` : ''}`;
            const response = await fetch(url);
            if (response.ok) {
                const backendSignals = normalizeBackendCollection(await response.json());
                // Filtrer côté client aussi pour sécurité
                const storeSignals = backendSignals
                    .filter((signal: any) => !user?.storeId || signal.storeId === user.storeId)
                    .map((signal: any) => normalizeStockSignalRecord(signal));
                const pendingState = await collectPendingEntityState(db, {
                    apiPath: STOCK_SIGNALS_API_PATH,
                    tableName: 'stockSignals',
                    storeId: user?.storeId
                });
                const currentScopedSignals: StockSignal[] = options?.productId && user?.storeId
                    ? await db.getAllFromIndex('stockSignals', 'by-store-product', [user.storeId, options.productId])
                    : await getStoreScopedRecords<StockSignal>(db, 'stockSignals', 'by-store');
                const localPendingSignals = currentScopedSignals.filter((signal) => pendingState.pendingUpsertIds.has(String(signal.id || '')));
                const mergedScopedSignals = [
                    ...storeSignals.filter((signal: any) => {
                        const signalId = String(signal?.id || '').trim();
                        if (!signalId) {
                            return false;
                        }
                        if (pendingState.pendingDeleteIds.has(signalId)) {
                            return false;
                        }
                        return !pendingState.pendingUpsertIds.has(signalId);
                    }),
                    ...localPendingSignals
                ];
                const tx = db.transaction('stockSignals', 'readwrite');
                await Promise.all([
                    ...currentScopedSignals.map((signal) => tx.store.delete(signal.id)),
                    ...mergedScopedSignals.map((signal) => tx.store.put(signal)),
                    tx.done
                ]);
            }
        }
        catch (error) {
        }
    };
    const loadSalesFromBackend = async (db: any, options?: { startDate?: number; endDate?: number; }) => {
        try {
            const params = new URLSearchParams();
            if (user?.storeId)
                params.set('storeId', user.storeId);
            params.set('all', '1');
            if (options?.startDate) {
                params.set('startDate', String(options.startDate));
            }
            if (options?.endDate) {
                params.set('endDate', String(options.endDate));
            }
            const response = await fetch(buildBypassUrl(`${BACKEND_BASE}/api/sales.php`, params), { cache: 'no-store' });
            if (response.ok) {
                const backendSales = normalizeBackendCollection(await response.json());
                await mergeBackendSalesIntoLocalDb(db, backendSales, { restrictToBackendIds: Boolean(options?.startDate || options?.endDate) });
            }
        }
        catch (error) {
        }
    };
    const loadFromLocal = async (db: any) => {
        await processData(db);
    };
    const cleanupInvalidStockSignals = useCallback(async (signalsToCleanup: StockSignal[]) => {
        const uniqueSignals = signalsToCleanup.filter((signal) => signal?.id && !cleanedInvalidSignalIdsRef.current.has(signal.id));
        if (uniqueSignals.length === 0)
            return;
        const db = await getDB();
        const url = `${BACKEND_BASE}/api/stock_signals.php`;
        for (const signal of uniqueSignals) {
            cleanedInvalidSignalIdsRef.current.add(signal.id);
            try {
                await db.delete('stockSignals', signal.id);
            }
            catch (error) {
            }
            if (isOnline) {
                try {
                    const response = await fetch(`${url}?id=${encodeURIComponent(signal.id)}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                }
                catch (error) {
                    await performSyncOp({ url, method: 'DELETE', data: { id: signal.id }, table: 'stockSignals', storeId: signal.storeId || user?.storeId });
                }
            }
            else {
                await performSyncOp({ url, method: 'DELETE', data: { id: signal.id }, table: 'stockSignals', storeId: signal.storeId || user?.storeId });
            }
        }
        await updatePendingSyncCount();
    }, [isOnline, user?.storeId]);
    const processData = useCallback(async (db: any) => {
        const [productsData, categoriesData, signalsData, expensesData] = await Promise.all([
            db.getAll('products'),
            getStoreScopedRecords<ExpenseCategory>(db, 'expenseCategories', 'by-store'),
            getStoreScopedRecords<StockSignal>(db, 'stockSignals', 'by-store'),
            getStoreScopedRecords<ExpenseAdvanced>(db, 'expensesAdvanced', 'by-store')
        ]);
        // Traiter les signaux - utiliser un Set pour des lookups O(1)
        const userSignals = signalsData
            .sort((a: StockSignal, b: StockSignal) => b.createdAt - a.createdAt);
        const validSignals = userSignals.filter((signal: StockSignal) => !isBogusStockSignal(signal));
        // Créer un Set pour des lookups rapides de signaux existants
        const signalLookup = new Set(userSignals
            .filter((s: StockSignal) => s.expenseId && s.productId)
            .map((s: StockSignal) => `${s.expenseId}_${s.productId}`));
        // Filtrer les dépenses actives avec lookups optimisés
        const storeId = user?.storeId;
        const activeExpenses = expensesData.filter((expense: ExpenseAdvanced) => {
            if (expense.storeId !== storeId)
                return false;
            if (expense.type !== 'direct' && expense.type !== 'indirect')
                return false;
            if (expense.type === 'direct' && expense.directProduct) {
                if (expense.directProduct.endDate)
                    return false;
                const key = `${expense.id}_${expense.directProduct.productId}`;
                return !signalLookup.has(key);
            }
            if (expense.type === 'indirect') {
                if (expense.directProduct?.endDate)
                    return false;
                const key = `${expense.id}_${expense.categoryId || 'indirect'}`;
                return !signalLookup.has(key);
            }
            return false;
        });
        // Mettre à jour tous les états en batch
        setProducts(productsData);
        setExpenseCategories(categoriesData);
        setCompletedSignals(validSignals);
        setActiveStocks(activeExpenses);
        setAllExpenses(expensesData);
    }, [cleanupInvalidStockSignals, getStoreScopedRecords, user?.storeId]);
    const CACHE_TTL = 30000; // 30 secondes
    const salesCacheRef = useRef(new Map<string, { data: Sale[]; timestamp: number; }>());
    const signalsCacheRef = useRef(new Map<string, { data: StockSignal[]; timestamp: number; }>());
    // Fonction pour invalider les caches et forcer un rechargement
    const invalidateCaches = useCallback(() => {
        salesCacheRef.current.clear();
        signalsCacheRef.current.clear();
    }, []);
    const getSalesInRange = useCallback(async (db: any, startDate: number, endDate: number): Promise<Sale[]> => {
        const now = Date.now();
        const cacheKey = `${user?.storeId || 'all'}:${startDate}:${endDate}`;
        const cached = salesCacheRef.current.get(cacheKey);
        if (cached && (now - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }
        const projectedSales = await buildProjectedLocalSales(db, { storeId: user?.storeId });
        const sales = projectedSales.filter((sale: Sale) => sale.createdAt >= startDate && sale.createdAt <= endDate);
        salesCacheRef.current.set(cacheKey, { data: sales, timestamp: now });
        return sales;
    }, [CACHE_TTL, user?.storeId]);
    const getSignalsForProducts = useCallback(async (db: any, productIds: string[]): Promise<StockSignal[]> => {
        const normalizedProductIds = Array.from(new Set(productIds)).sort();
        if (normalizedProductIds.length === 0) {
            return [];
        }
        const now = Date.now();
        const cacheKey = `${user?.storeId || 'all'}:${normalizedProductIds.join('|')}`;
        const cached = signalsCacheRef.current.get(cacheKey);
        if (cached && (now - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }
        let signals: StockSignal[];
        if (user?.storeId) {
            try {
                const results = await Promise.all(normalizedProductIds.map((productId) => db.getAllFromIndex('stockSignals', 'by-store-product', [user.storeId, productId])));
                signals = results.flat();
            }
            catch (error) {
                const storeSignals = await getStoreScopedRecords<StockSignal>(db, 'stockSignals', 'by-store');
                const productIdSet = new Set(normalizedProductIds);
                signals = storeSignals.filter((signal) => productIdSet.has(signal.productId));
            }
        }
        else {
            const allSignals = await db.getAll('stockSignals');
            const productIdSet = new Set(normalizedProductIds);
            signals = allSignals.filter((signal: StockSignal) => productIdSet.has(signal.productId));
        }
        signalsCacheRef.current.set(cacheKey, { data: signals, timestamp: now });
        return signals;
    }, [CACHE_TTL, getStoreScopedRecords, user?.storeId]);
    const refreshSignalComputationData = useCallback(async (db: any, expense: ExpenseAdvanced) => {
        if (!isOnline || !isBackendReachable) {
            return;
        }
        const now = Date.now();
        if ((now - lastSignalDataRefreshAtRef.current) < CACHE_TTL) {
            return;
        }
        if (signalRefreshPromiseRef.current) {
            return signalRefreshPromiseRef.current;
        }
        const startDate = expense.type === 'direct' && expense.directProduct
            ? expense.directProduct.startDate
            : expense.date;
        const signalProductId = expense.type === 'direct' && expense.directProduct
            ? expense.directProduct.productId
            : expense.categoryId;
        const refreshPromise = (async () => {
            setIsRefreshingSignalData(true);
            try {
                await Promise.all([
                    loadProductsFromBackend(db),
                    loadExpenseCategoriesFromBackend(db),
                    loadExpensesAdvancedFromBackend(db, { id: expense.id }),
                    loadStockSignalsFromBackend(db, signalProductId ? { productId: signalProductId } : undefined),
                    loadSalesFromBackend(db, { startDate })
                ]);
                lastSignalDataRefreshAtRef.current = Date.now();
                invalidateCaches();
                await processData(db);
            }
            finally {
                signalRefreshPromiseRef.current = null;
                setIsRefreshingSignalData(false);
            }
        })();
        signalRefreshPromiseRef.current = refreshPromise;
        return refreshPromise;
    }, [CACHE_TTL, invalidateCaches, isBackendReachable, isOnline, processData]);
    const calculateSalesBetween = useCallback(async (startDate: number, endDate: number, productId: string, excludeAlreadySignaled: boolean = true, expenseId?: string) => {
        const db = await getDB();
        let adjustedStartDate = startDate;
        if (excludeAlreadySignaled) {
            const stockSignals = await getSignalsForProducts(db, [productId]);
            // Trouver le signalement le plus récent pour ce produit
            let latestEndDate = 0;
            const storeId = user?.storeId;
            for (const signal of stockSignals) {
                if (isBogusStockSignal(signal))
                    continue;
                if (signal.productId === productId && signal.storeId === storeId && signal.endDate > latestEndDate) {
                    latestEndDate = signal.endDate;
                }
            }
            if (latestEndDate > 0) {
                adjustedStartDate = Math.max(startDate, latestEndDate + 1);
            }
        }
        const sales = await getSalesInRange(db, adjustedStartDate, endDate);
        // Filtrer et calculer en une seule passe
        let totalQuantity = 0;
        let totalRevenue = 0;
        for (const sale of sales) {
            if (sale.draft === true)
                continue;
            if (sale.refunded)
                continue; // Ignorer les ventes remboursées
            const items = sale.items;
            if (!items)
                continue;
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
    }, [getSalesInRange, getSignalsForProducts, user?.storeId]);
    const calculateSalesForMultipleProducts = async (startDate: number, endDate: number, productIds: string[], excludeAlreadySignaled: boolean = true, expenseId?: string) => {
        const db = await getDB();
        const sales = await getSalesInRange(db, startDate, endDate);
        let stockSignals: StockSignal[] = [];
        if (excludeAlreadySignaled) {
            stockSignals = await getSignalsForProducts(db, productIds);
        }
        const productIdSet = new Set(productIds);
        // Pour chaque produit, trouver la date de fin de signalement la plus récente
        const storeId = user?.storeId;
        const latestEndDates: Record<string, number> = {};
        if (excludeAlreadySignaled) {
            for (const productId of productIds) {
                let latestEndDate = 0;
                for (const signal of stockSignals) {
                    if (isBogusStockSignal(signal))
                        continue;
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
            if (sale.createdAt > endDate || sale.draft === true || sale.refunded)
                continue;
            const items = sale.items;
            if (!items)
                continue;
            for (const item of items) {
                if (!productIdSet.has(item.productId))
                    continue;
                // Calculer la date de début effective pour ce produit
                let productStart = startDate;
                if (excludeAlreadySignaled && latestEndDates[item.productId] > 0) {
                    productStart = Math.max(startDate, latestEndDates[item.productId] + 1);
                }
                if (sale.createdAt < productStart)
                    continue;
                // Prendre la date de début effective la plus récente
                if (productStart > effectiveStartDate)
                    effectiveStartDate = productStart;
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
        const sendStockSignalEmail = useCallback(async ({ stockSignal, expense, calculation, chosenEndDate }: {
                stockSignal: StockSignal;
                expense: ExpenseAdvanced;
                calculation: any;
                chosenEndDate: number;
        }) => {
                try {
                        const dbInstance = await getDB();
                        const emailSettings = await dbInstance.get('emailSettings', user?.storeId);
                        const shouldSendEmail = emailSettings?.stockSignals !== false;
                        const hasShortage = calculation.margin < 0;
                    if (!hasShortage) {
                                return;
                        }
                        const store = await dbInstance.get('stores', user?.storeId);
                        const storeName = store?.name || user?.storeId || '';
                        const productName = expense.type === 'direct' && expense.directProduct
                                ? getProductName(expense.directProduct.productId)
                                : (categoryMap.get(expense.categoryId || '')?.name || 'Dépense indirecte');
                    await sendStoreAdminNotification({
                        event: 'stockSignal',
                        senderUserId: user?.id || '',
                        storeId: user?.storeId || '',
                        relatedId: stockSignal.id,
                        type: 'warning',
                        title: `Signalement de stock: ${productName}`,
                        message: `${user?.username || 'Un utilisateur'} a signalé un manque de stock sur ${productName} dans ${storeName}. Manque constaté: ${calculation.margin.toLocaleString('fr-FR')} FCFA entre le ${new Date(calculation.effectiveStartDate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} et le ${new Date(chosenEndDate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`,
                    });
                    if (!shouldSendEmail) {
                        return;
                    }
                        const shouldShowQuantities = expense.type === 'direct' && expense.directProduct
                                ? (() => {
                                        const prod = productMap.get(expense.directProduct!.productId);
                                        return (prod && (prod as any).trackQuantity === true) || calculation.quantityBought > 1;
                                })()
                                : false;
                        const statusBadge = calculation.marginPercentage >= 35 ? '✅ Excellente' :
                                calculation.marginPercentage >= 20 ? '⚠️ Moyenne' : '❌ Faible';
                        const resume = `
<div style="margin: 20px 0;">
    <div class="info-block">
        <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">👤 Informations Utilisateur</h3>
        <div class="info-row">
            <span class="info-label">Signalé par :&nbsp;</span>
            <span class="info-value">${user?.username || 'Inconnu'}</span>
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
            <span class="info-value">${expense.type === 'direct' ? '🎯 Directe' : expense.type === 'indirect' ? '🔄 Indirecte' : '⚙️ Opérationnelle'}</span>
        </div>
    </div>

    <div class="info-block">
        <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📅 Période de Suivi</h3>
        <div class="info-row">
            <span class="info-label">Date début :&nbsp;</span>
            <span class="info-value">${new Date(calculation.effectiveStartDate).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
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
            <span class="info-value" style="font-weight: 600;">${calculation.purchaseAmount.toLocaleString('fr-FR')} F CFA</span>
        </div>
        <div class="info-row">
            <span class="info-label">Chiffre d'affaires :&nbsp;</span>
            <span class="info-value" style="font-weight: 600;">${calculation.periodRevenue.toLocaleString('fr-FR')} F CFA</span>
        </div>
        <div class="info-row">
            <span class="info-label">${calculation.margin >= 0 ? 'Surplus' : 'Manque'} :&nbsp;</span>
            <span class="info-value" style="font-weight: 600; color: ${calculation.margin >= 0 ? '#10b981' : '#ef4444'}">${calculation.margin >= 0 ? '+' : ''}${calculation.margin.toLocaleString('fr-FR')} F CFA</span>
        </div>
    </div>

    <div class="${calculation.marginPercentage >= 35 ? 'highlight positive' : calculation.marginPercentage >= 20 ? 'highlight' : 'highlight negative'}">
        <div class="info-row">
            <span class="info-label" style="font-size: 16px;">📊 Performance :&nbsp;</span>
            <span class="info-value" style="font-size: 18px; font-weight: 700;">
                ${statusBadge} - ${calculation.marginPercentage.toFixed(1)}%
            </span>
        </div>
    </div>

    ${shouldShowQuantities ? `
    <div class="info-block">
        <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📈 Statistiques de Vente</h3>
        <div class="info-row">
            <span class="info-label">Quantité achetée :&nbsp;</span>
            <span class="info-value">${calculation.quantityBought.toLocaleString('fr-FR')}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Quantité vendue :&nbsp;</span>
            <span class="info-value">${calculation.totalQuantity.toLocaleString('fr-FR')}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Taux d'écoulement :&nbsp;</span>
            <span class="info-value">${calculation.quantityBought > 0 ? ((calculation.totalQuantity / calculation.quantityBought) * 100).toFixed(1) : '0'}%</span>
        </div>
    </div>
    ` : ''}

    <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
        <strong>ID du Signalement :&nbsp;</strong>${stockSignal.id}
    </div>
</div>
`;
                        await pendingEmailService.sendToAllAdmins({
                                message: resume,
                                storeName,
                                type: 'stock',
                                relatedId: stockSignal.id,
                                storeId: user?.storeId || '',
                                userId: user?.id || ''
                        });
                }
                catch (e) {
                }
        }, [categoryMap, getProductName, productMap, user]);
    const handleStockEnd = async (expense: ExpenseAdvanced) => {
        if (!isBackendReachable) {
            toast.error("Impossible de signaler un stock fini : le serveur n'est pas joignable (hors ligne ou backend down). Veuillez vérifier votre connexion et réessayer.");
            return;
        }
        setIsPreparingSignal(true);
        setPreparingExpenseId(expense.id);
        try {
            const db = await getDB();
            const updatedExpense = await db.get('expensesAdvanced', expense.id);
            if (!updatedExpense) {
                toast.error('Impossible de trouver la dépense mise à jour. Veuillez réessayer.');
                return;
            }
            invalidateCaches();
            await refreshSignalComputationData(db, updatedExpense);
            const refreshedExpense = await db.get('expensesAdvanced', expense.id) || updatedExpense;
            setSelectedExpense(refreshedExpense);
            const startTime = refreshedExpense.type === 'direct' && refreshedExpense.directProduct ? refreshedExpense.directProduct.startDate : refreshedExpense.date;
            const now = Date.now();
            if (!Number.isFinite(startTime) || startTime <= 0) {
                toast.error('La date de début du stock est invalide. Corrigez la dépense avant de signaler la fin du stock.');
                return;
            }
            if (startTime > now) {
                toast.error('La date de début du stock est dans le futur. Corrigez la date de la dépense avant de signaler la fin du stock.');
                return;
            }
            setEndDateInput(formatDateTimeLocal(now));
            setShowEndDateDialog(true);
        }
        catch (error) {
            toast.error('Erreur lors du chargement des données. Veuillez réessayer.');
        }
        finally {
            setIsPreparingSignal(false);
            setPreparingExpenseId(null);
        }
    };
    const confirmStockEnd = async () => {
        if (!selectedExpense || !marginCalculation || !user?.storeId)
            return;
        // Ensure chosen end date is valid (not before start)
        const chosenEndDate = Number(marginCalculation?.endTime) || parseDateTimeLocal(endDateInput) || Date.now();
        const startTime = selectedExpense.type === 'direct' && selectedExpense.directProduct ? selectedExpense.directProduct.startDate : selectedExpense.date;
        if (chosenEndDate < startTime) {
            toast.error('La date de fin sélectionnée est antérieure à la date d\'achat / début du stock. Veuillez choisir une date valide.');
            return;
        }
        const signalStartDate = Number(marginCalculation.effectiveStartDate) || startTime;
        if (!Number.isFinite(signalStartDate) || signalStartDate <= 0) {
            toast.error('La date de début du calcul est invalide. Recalculez le signalement avant de confirmer.');
            return;
        }
        if (chosenEndDate > Date.now()) {
            toast.error('La date de fin ne peut pas être dans le futur.');
            return;
        }
        if (chosenEndDate < signalStartDate) {
            toast.error('La date de fin sélectionnée est antérieure au début réel du calcul. Veuillez choisir une date valide.');
            return;
        }
        setLoading(true);
        try {
            const db = await getDB();
            // S'assurer que toutes les valeurs sont des nombres valides avant de sauvegarder
            const chosenEndDate = Number(marginCalculation.endTime) || parseDateTimeLocal(endDateInput) || Date.now();
            const stockSignal: StockSignal = {
                id: generateId(),
                expenseId: selectedExpense.id,
                productId: selectedExpense.type === 'direct' && selectedExpense.directProduct
                    ? selectedExpense.directProduct.productId
                    : selectedExpense.categoryId || 'indirect', // Pour les indirectes, utiliser categoryId
                userId: user.id,
                storeId: user.storeId,
                startDate: signalStartDate,
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
            invalidateCaches();
            const [stockSignalSyncResp, expenseSyncResp] = await Promise.all([
                performSyncOp({
                    url: `${BACKEND_BASE}/api/stock_signals.php`,
                    method: 'POST',
                    data: stockSignal,
                    table: 'stockSignals',
                    storeId: user.storeId,
                }),
                performSyncOp({
                    url: `${BACKEND_BASE}/api/expenses_advanced.php`,
                    method: 'PUT',
                    data: updatedExpense,
                    table: 'expensesAdvanced',
                    storeId: user.storeId,
                })
            ]);
            if (stockSignalSyncResp.success && expenseSyncResp.success) {
                toast.success('Signalement cree et synchronise avec succes');
            }
            else {
                toast.success(isOnline
                    ? 'Signalement cree (synchronisation differee si necessaire)'
                    : 'Signalement cree (mode hors ligne)');
            }
            // Si en ligne, synchroniser immédiatement avec le backend
            if (false && isOnline) {
                try {
                    const [stockSignalResponse, expenseResponse] = await Promise.all([
                        fetch(`${BACKEND_BASE}/api/stock_signals.php`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(stockSignal)
                        }),
                        fetch(`${BACKEND_BASE}/api/expenses_advanced.php`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(updatedExpense)
                        })
                    ]);
                    if (stockSignalResponse.ok && expenseResponse.ok) {
                        toast.success('Signalement créé et synchronisé avec succès');
                    }
                    else {
                        throw new Error('Erreur de synchronisation backend');
                    }
                }
                catch (error) {
                    // Queue via performSyncOp (will create queue entry if offline)
                    await performSyncOp({
                        url: `${BACKEND_BASE}/api/stock_signals.php`,
                        method: 'POST',
                        data: stockSignal,
                    });
                    await performSyncOp({
                        url: `${BACKEND_BASE}/api/expenses_advanced.php`,
                        method: 'PUT',
                        data: updatedExpense,
                    });
                    toast.success('Signalement créé (sera synchronisé plus tard)');
                }
            }
            else {
                // Hors ligne : ajouter directement à la queue de synchronisation
                // Offline: queue via performSyncOp
                void 0;
                void 0;
                void 0;
            }
                        lastSignalDataRefreshAtRef.current = Date.now();
                        await processData(db);
                        await updatePendingSyncCount();
                        void sendStockSignalEmail({
                                stockSignal,
                                expense: selectedExpense,
                                calculation: marginCalculation,
                                chosenEndDate,
                        });
            // Afficher le résultat
            if (marginCalculation.marginPercentage < 20) {
                toast.error(`⚠️ Marge faible: ${marginCalculation.marginPercentage.toFixed(1)}%`);
            }
            else if (marginCalculation.marginPercentage < 35) {
                toast.warning(`⚠️ Marge moyenne: ${marginCalculation.marginPercentage.toFixed(1)}%`);
            }
            else {
                toast.success(`✅ Bonne marge: ${marginCalculation.marginPercentage.toFixed(1)}%`);
            }
            setShowSignalDialog(false);
            setSelectedExpense(null);
            setMarginCalculation(null);
        }
        catch (error) {
            toast.error('Erreur lors du signalement');
        }
        finally {
            setLoading(false);
        }
    };
    // Annuler un signalement et remettre le stock dans les stocks actifs
    const cancelSignal = useCallback(async (signal: StockSignal) => {
        if (!signal)
            return;
        const cat = categoryMap.get(signal.productId);
        const name = cat ? cat.name : (signal.productId === 'indirect' ? 'Dépense indirecte' : getProductName(signal.productId));
        const ok = window.confirm(`Confirmer l'annulation du signalement pour "${name}" ? Le stock redeviendra actif et devra être signalé à nouveau.`);
        if (!ok)
            return;
        setLoading(true);
        try {
            const db = await getDB();
            // Supprimer le signalement localement
            try {
                await db.delete('stockSignals', signal.id);
            }
            catch (err) {
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
                            const expenseResponse = await fetch(`${BACKEND_BASE}/api/expenses_advanced.php`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(updatedExpense)
                            });
                            if (!expenseResponse.ok) {
                                throw new Error('Erreur mise à jour expense backend');
                            }
                        }
                        catch (err) {
                            await performSyncOp({
                                url: `${BACKEND_BASE}/api/expenses_advanced.php`,
                                method: 'PUT',
                                data: updatedExpense,
                                table: 'expensesAdvanced',
                                storeId: updatedExpense.storeId,
                            });
                        }
                    }
                    else {
                        // Hors ligne -> queue pour l'expense
                        await performSyncOp({
                            url: `${BACKEND_BASE}/api/expenses_advanced.php`,
                            method: 'PUT',
                            data: updatedExpense,
                            table: 'expensesAdvanced',
                            storeId: updatedExpense.storeId,
                        });
                    }
                }
            }
            catch (err) {
            }
            // Supprimer le signalement côté backend si en ligne, sinon mettre en queue
            const url = `${BACKEND_BASE}/api/stock_signals.php`;
            if (isOnline) {
                try {
                    const resp = await fetch(`${url}?id=${encodeURIComponent(signal.id)}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (!resp.ok) {
                        throw new Error('Erreur suppression signalement backend');
                    }
                }
                catch (err) {
                    await performSyncOp({ url, method: 'DELETE', data: { id: signal.id }, table: 'stockSignals', storeId: signal.storeId || user?.storeId });
                }
            }
            else {
                // Hors ligne -> queue pour le signalement
                await performSyncOp({ url, method: 'DELETE', data: { id: signal.id }, table: 'stockSignals', storeId: signal.storeId || user?.storeId });
            }
            // Mettre à jour l'état local pour rafraîchir l'UI
            setCompletedSignals(prev => prev.filter(s => s.id !== signal.id));
            invalidateCaches();
            lastSignalDataRefreshAtRef.current = 0;
            await processData(db);
            await updatePendingSyncCount();
            toast.success('Signalement annulé - Le stock est de nouveau actif');
        }
        catch (error) {
            toast.error('Erreur lors de l\'annulation du signalement');
        }
        finally {
            setLoading(false);
        }
    }, [categoryMap, getProductName, invalidateCaches, isOnline, processData]);
    useEffect(() => {
        if (!user?.storeId)
            return;
        let cancelled = false;
        const loadStorePreference = async () => {
            try {
                // 1) Local (IndexedDB)
                const db = await getDB();
                const localStore = await db.get('stores', user.storeId);
                const localValue = (localStore as any)?.trackIndirectExpenses;
                if (!cancelled && localValue !== undefined && localValue !== null) {
                    setTrackIndirectExpenses(localValue === true || localValue === 1 || localValue === '1');
                }
                if (!cancelled) {
                    setTrackIndirectExpensesEnabledAt(toOptionalTimestamp((localStore as any)?.trackIndirectExpensesEnabledAt));
                }
                // 2) Backend (source de vérité) si accessible
                if (!isBackendReachable)
                    return;
                const res = await fetch(`${BACKEND_BASE}/api/stores.php?include_inactive=1&_t=${Date.now()}`);
                if (!res.ok)
                    return;
                const stores = await res.json();
                if (!Array.isArray(stores))
                    return;
                const remoteStore = stores.find((s: any) => String(s?.id) === String(user.storeId));
                const remoteValue = remoteStore?.trackIndirectExpenses;
                if (remoteValue !== undefined && remoteValue !== null && !cancelled) {
                    const normalizedRemoteValue = remoteValue === true || remoteValue === 1 || remoteValue === '1';
                    const normalizedRemoteEnabledAt = toOptionalTimestamp(remoteStore?.trackIndirectExpensesEnabledAt);
                    setTrackIndirectExpenses(normalizedRemoteValue);
                    setTrackIndirectExpensesEnabledAt(normalizedRemoteEnabledAt);
                    try {
                        const mergedStore = localStore ? { ...localStore } as any : { id: user.storeId } as any;
                        mergedStore.trackIndirectExpenses = normalizedRemoteValue;
                        mergedStore.trackIndirectExpensesEnabledAt = normalizedRemoteEnabledAt;
                        await db.put('stores', mergedStore);
                    }
                    catch (err) {
                    }
                }
            }
            catch (err) {
            }
        };
        loadStorePreference();
        return () => {
            cancelled = true;
        };
    }, [user?.storeId, isBackendReachable]);
    const saveTrackIndirectExpenses = useCallback(async (next: boolean) => {
        if (!user?.storeId || !isAdmin)
            return;
        const now = Date.now();
        const nextEnabledAt = next
            ? (trackIndirectExpenses ? trackIndirectExpensesEnabledAt : now)
            : null;
        setTrackIndirectExpenses(next);
        setTrackIndirectExpensesEnabledAt(nextEnabledAt);
        try {
            const db = await getDB();
            const existingStore = await db.get('stores', user.storeId);
            const updatedStore = existingStore ? { ...existingStore } as any : { id: user.storeId } as any;
            updatedStore.trackIndirectExpenses = next;
            updatedStore.trackIndirectExpensesEnabledAt = nextEnabledAt;
            await db.put('stores', updatedStore);
        }
        catch (err) {
        }
        const syncResp = await performSyncOp({
            url: `${BACKEND_BASE}/api/stores.php`,
            method: 'POST',
            data: {
                action: 'set_stock_signals_preferences',
                storeId: user.storeId,
                trackIndirectExpenses: next,
                trackIndirectExpensesEnabledAt: nextEnabledAt,
            }
        });
        if ((syncResp as any)?.queued) {
            toast.info('Préférence enregistrée localement. Synchronisation en attente.');
        }
    }, [user?.storeId, isAdmin, trackIndirectExpenses, trackIndirectExpensesEnabledAt]);
    useEffect(() => {
        if (trackIndirectExpenses)
            return;
        if (expenseTypeFilter === 'indirect')
            setExpenseTypeFilter('direct');
        if (historyExpenseTypeFilter === 'indirect')
            setHistoryExpenseTypeFilter('direct');
    }, [trackIndirectExpenses, expenseTypeFilter, historyExpenseTypeFilter]);
    const resolveSignalExpenseType = useCallback((signal: StockSignal): 'direct' | 'indirect' => {
        const mappedExpenseType = expenseTypeMap.get(signal.expenseId);
        if (mappedExpenseType === 'direct' || mappedExpenseType === 'indirect') {
            return mappedExpenseType;
        }
        return categoryMap.has(signal.productId) ? 'indirect' : 'direct';
    }, [expenseTypeMap, categoryMap]);
    const visibleCompletedSignals = useMemo(() => {
        if (trackIndirectExpenses)
            return completedSignals;
        return completedSignals.filter((signal) => resolveSignalExpenseType(signal) === 'direct');
    }, [completedSignals, trackIndirectExpenses, resolveSignalExpenseType]);
    const visibleActiveStocks = useMemo(() => {
        if (trackIndirectExpenses) {
            return activeStocks.filter((expense) => expense.type !== 'indirect' || isIndirectExpenseEligible(expense));
        }
        return activeStocks.filter((exp) => exp.type === 'direct');
    }, [activeStocks, trackIndirectExpenses, isIndirectExpenseEligible]);
    // Fonction pour filtrer les signaux - optimisée avec useMemo
    const filteredSignals = useMemo(() => {
        const now = nowTimestamp;
        const startOfToday = new Date(now).setHours(0, 0, 0, 0);
        const endOfToday = new Date(now).setHours(23, 59, 59, 999);
        const oneDayAgo = now - DAY_MS;
        const oneWeekAgo = now - 7 * DAY_MS;
        const oneMonthAgo = now - 30 * DAY_MS;
        const searchLower = searchTerm.trim().toLowerCase();
        return visibleCompletedSignals.filter(s => {
            // Filtre par période (utilise endDate pour déterminer si le signalement concerne la période)
            if (periodFilter === 'day') {
                // Pour "Aujourd'hui", on affiche les signalements dont la date de fin est aujourd'hui
                const endDate = s.endDate || s.createdAt;
                if (endDate < startOfToday || endDate > endOfToday)
                    return false;
            }
            if (periodFilter === 'yesterday') {
                const startOfYesterday = startOfToday - DAY_MS;
                const endOfYesterday = startOfToday - 1;
                const endDate = s.endDate || s.createdAt;
                if (endDate < startOfYesterday || endDate > endOfYesterday)
                    return false;
            }
            if (periodFilter === 'week' && s.endDate < oneWeekAgo)
                return false;
            if (periodFilter === 'month' && s.endDate < oneMonthAgo)
                return false;
            // Filtre par type (surplus/manque)
            if (typeFilter === 'surplus' && s.margin < 0)
                return false;
            if (typeFilter === 'manque' && s.margin >= 0)
                return false;
            // Filtre par type de dépense (direct/indirect)
            if (historyExpenseTypeFilter !== 'all') {
                const expenseType = resolveSignalExpenseType(s);
                if (expenseType !== historyExpenseTypeFilter)
                    return false;
            }
            // Filtre par recherche (nom de produit, date et heure)
            if (searchLower) {
                const cat = categoryMap.get(s.productId);
                const productName = cat ? cat.name : (productNameMap.get(s.productId) || 'Dépense Indirecte');
                if (productName.toLowerCase().includes(searchLower))
                    return true;
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
    }, [visibleCompletedSignals, periodFilter, typeFilter, historyExpenseTypeFilter, searchTerm, nowTimestamp, categoryMap, productNameMap, resolveSignalExpenseType]);
    // Simple full-text search for active stocks - optimisé avec useMemo
    const filteredActiveStocks = useMemo(() => {
        const q = activeSearch.trim().toLowerCase();
        if (!q)
            return visibleActiveStocks;
        return visibleActiveStocks.filter(exp => {
            // product name - utilise le cache
            if (exp.type === 'direct' && exp.directProduct) {
                const prodName = productNameMap.get(exp.directProduct.productId)?.toLowerCase() || '';
                if (prodName.includes(q))
                    return true;
            }
            // category name - utilise le cache
            if (exp.type === 'indirect' && exp.categoryId) {
                const catName = categoryMap.get(exp.categoryId)?.name?.toLowerCase() || '';
                if (catName.includes(q))
                    return true;
            }
            // amount - pré-calculer les deux formats
            const amountStr = String(exp.amount);
            const amountFormatted = Number(exp.amount).toLocaleString();
            if (amountStr.includes(q) || amountFormatted.toLowerCase().includes(q))
                return true;
            // start date/time
            const start = exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
            const startDate = new Date(start);
            const dateStr = startDate.toLocaleDateString('fr-FR') + ' ' + startDate.toLocaleTimeString('fr-FR');
            if (dateStr.toLowerCase().includes(q))
                return true;
            return false;
        });
    }, [visibleActiveStocks, activeSearch, productNameMap, categoryMap]);
    // Expense creation removed from this page. Use the Expenses page to add new expenses.
    // compute filtered items once to simplify JSX rendering - optimisé avec useMemo
    const activeItems = useMemo(() => {
        const getStartDate = (exp: ExpenseAdvanced) => exp.type === 'direct' && exp.directProduct ? exp.directProduct.startDate : exp.date;
        return filteredActiveStocks
            .filter(exp => expenseTypeFilter === 'all' || exp.type === expenseTypeFilter)
            .sort((a, b) => getStartDate(a) - getStartDate(b));
    }, [filteredActiveStocks, expenseTypeFilter]);
        return (<div className="relative p-6 space-y-6">
            {isPreparingSignal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md shadow-xl border-primary/20">
                        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                            <Loader2 className="w-10 h-10 animate-spin text-primary"/>
                            <div className="space-y-1">
                                <p className="text-lg font-semibold">Chargement des données les plus récentes...</p>
                                <p className="text-sm text-muted-foreground">
                                    Vérification des ventes, du stock et de la dépense avant d'ouvrir le signalement.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>)}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Signalement des Stocks</h1>
          <p className="text-muted-foreground">
            Signalez la fin des stocks pour calculer automatiquement les marges
          </p>
        </div>
        {isAdmin && <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="track-indirect-expenses-toggle" className="text-sm whitespace-nowrap">
            Indirectes ?
          </Label>
          <Switch id="track-indirect-expenses-toggle" checked={trackIndirectExpenses} onCheckedChange={(checked) => saveTrackIndirectExpenses(Boolean(checked))} aria-label="Activer le suivi des dépenses indirectes"/>
        </div>}
      </div>

      <Tabs defaultValue="active" className="w-full">
        {user?.role === 'admin' ? (<TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Stocks Actifs ({visibleActiveStocks.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Historique ({visibleCompletedSignals.length})
            </TabsTrigger>
          </TabsList>) : (<TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="active">
              Stocks Actifs ({visibleActiveStocks.length})
            </TabsTrigger>
          </TabsList>)}

        <TabsContent value="active" className="space-y-4">
          {loading ? (<div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-active-${i}`} className="border-l-4 border-l-primary animate-pulse">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="h-5 bg-gray-200 rounded w-48 mb-2"/>
                        <div className="h-4 bg-gray-200 rounded w-28 mb-2"/>
                        <div className="h-4 bg-gray-200 rounded w-20"/>
                      </div>
                      <div className="flex items-center justify-end">
                        <div className="h-10 w-32 bg-gray-200 rounded"/>
                      </div>
                    </div>
                  </CardContent>
                </Card>))}
            </div>) : (<>
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-center gap-2 justify-between w-full">
                    <div className="w-full sm:mr-4">
                      <Input placeholder="Rechercher..." value={activeSearch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActiveSearch(e.target.value)} className="w-full"/>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={expenseTypeFilter} onValueChange={(v: any) => setExpenseTypeFilter(v)}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les types</SelectItem>
                          <SelectItem value="direct">Directe (1 produit)</SelectItem>
                          {trackIndirectExpenses && (<SelectItem value="indirect">Indirecte (plusieurs produits)</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={() => { setActiveSearch(''); setExpenseTypeFilter('all'); }}>Réinitialiser</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Le bouton ‘Ajouter une Dépense’ a été retiré — utilisez la page Dépenses dédiée */}

                            {activeItems.length === 0 ? (activeSearch ? (<Card>
                    <CardContent className="text-center py-12">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4"/>
                      <h3 className="text-lg font-semibold mb-2">Aucun résultat</h3>
                      <p className="text-muted-foreground">Aucun résultat pour la recherche « {activeSearch} ».</p>
                    </CardContent>
                  </Card>) : (<Card>
                    <CardContent className="text-center py-12">
                                            {(!isOnline || !isBackendReachable) ? (<>
                                                    <WifiOff className="w-12 h-12 mx-auto text-muted-foreground mb-4"/>
                                                    <h3 className="text-lg font-semibold mb-2">Connexion requise</h3>
                                                    <p className="text-muted-foreground">
                                                        Vous devez être connecté pour travailler dans les signalements de stock.
                                                    </p>
                                                </>) : (<>
                                                    <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4"/>
                                                    <h3 className="text-lg font-semibold mb-2">Aucun stock actif</h3>
                                                    <p className="text-muted-foreground">
                                                        Tous les stocks ont été signalés ou aucune dépense directe n'a été enregistrée.
                                                    </p>
                                                </>)}
                    </CardContent>
                  </Card>)) : (<div className="grid gap-4">
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
                    return (<Card key={expense.id} className={`border-l-4 ${isOld ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="space-y-3 w-full">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-semibold">{expense.name}</h3>
                                {isOld && (<Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1"/>
                                    Stock ancien
                                  </Badge>)}
                                {expense.type === 'direct' && hasMultipleStocks && (<Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                                    {productStockCount} stocks actifs
                                  </Badge>)}
                                {expense.type === 'direct' && hasMultipleStocks && !isOldestForProduct && (<Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1"/>
                                    Signaler l'ancien d'abord
                                  </Badge>)}
                                {expense.type === 'indirect' && hasMultipleCategoryStocks && (<Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                                    {categoryStockCount} stocks actifs
                                  </Badge>)}
                                {expense.type === 'indirect' && hasMultipleCategoryStocks && !isOldestForCategory && (<Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1"/>
                                    Signaler l'ancien d'abord
                                  </Badge>)}
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
                                : 'N/A'}
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
                                : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Depuis</p>
                                  <p className="font-medium flex items-center">
                                    <Clock className="w-4 h-4 mr-1"/>
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
                              {hasMultipleStocks && !isOldestForProduct && (<div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                  <AlertTriangle className="w-4 h-4 inline mr-1"/>
                                  Ce stock ne peut pas être signalé car il y a un stock plus ancien du même produit. 
                                  Veuillez signaler les stocks dans l'ordre chronologique.
                                </div>)}
                              {expense.type === 'indirect' && hasMultipleCategoryStocks && !isOldestForCategory && (<div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                  <AlertTriangle className="w-4 h-4 inline mr-1"/>
                                                                    Cette dépense indirecte ne peut pas être signalée car il y a une dépense plus ancienne dans la même catégorie. 
                                  Veuillez signaler les stocks dans l'ordre chronologique.
                                </div>)}
                            </div>
                                                        <Button onClick={() => handleStockEnd(expense)} variant={isOld ? "destructive" : "default"} size="lg" disabled={disableSignal || loading || isPreparingSignal} className={disableSignal ? "opacity-50" : ""}>
                                                            {preparingExpenseId === expense.id ? (<Loader2 className="w-4 h-4 mr-2 animate-spin"/>) : (<Package className="w-4 h-4 mr-2"/>)}
                                                            {preparingExpenseId === expense.id
                                ? "Chargement..."
                                : disableSignal
                                ? "Signaler l'ancien d'abord"
                                : expense.type === 'direct'
                                    ? "Stock Fini"
                                    : "Signaler Dépense"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>);
                })}
                </div>)}
            </>)}
        </TabsContent>

        {user?.role === 'admin' && (<TabsContent value="completed" className="space-y-4">
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
                return (<>
                          <ResponsiveContainer width="100%" height={chartHeight}>
                            <PieChart>
                              <Pie data={[
                        { name: 'Surplus', value: totalSurplus },
                        { name: 'Manque', value: totalManque }
                    ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={outerRadius} label={isMobile ?
                        ({ percent }) => `${(percent * 100).toFixed(0)}%` :
                        ({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                                <Cell key="surplus" fill="#22c55e"/>
                                <Cell key="manque" fill="#ef4444"/>
                              </Pie>
                              <Tooltip formatter={v => `${Number(v).toLocaleString('fr-FR')} FCFA`} contentStyle={{
                        fontSize: isMobile ? '12px' : '14px',
                        padding: isMobile ? '8px' : '12px'
                    }}/>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex justify-center gap-4 mt-2 text-xs">
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#22c55e' }}></span>
                              Surplus : {totalSurplus.toLocaleString('fr-FR')} FCFA
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#ef4444' }}></span>
                              Manque : {totalManque.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        </>);
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
                      <Input placeholder="Produit, date, heure..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
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
                          <SelectItem value="yesterday">Hier</SelectItem>
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
                      <Label>Type de dépense</Label>
                      <Select value={historyExpenseTypeFilter} onValueChange={(value: any) => setHistoryExpenseTypeFilter(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous</SelectItem>
                          <SelectItem value="direct">Dépense Directe</SelectItem>
                          {trackIndirectExpenses && (<SelectItem value="indirect">Dépense Indirecte</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Button variant="outline" className="w-full" onClick={() => {
                // Réinitialiser la recherche et remettre les filtres par défaut
                setSearchTerm('');
                setPeriodFilter('day');
                setTypeFilter('all');
                setHistoryExpenseTypeFilter('direct');
            }}>
                        Réinitialiser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

          {loading ? (<div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-completed-${i}`} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 w-3/4">
                        <div className="h-5 bg-gray-200 rounded w-48"/>
                        <div className="h-4 bg-gray-200 rounded w-32"/>
                      </div>
                      <div className="h-8 w-8 bg-gray-200 rounded-full"/>
                    </div>
                  </CardContent>
                </Card>))}
            </div>) : filteredSignals.length === 0 ? (<Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4"/>
                <h3 className="text-lg font-semibold mb-2">Aucun signalement</h3>
                <p className="text-muted-foreground">
                  Aucun stock n'a encore été signalé comme terminé.
                </p>
              </CardContent>
            </Card>) : (<div className="space-y-3">
              {filteredSignals.map(signal => {
                    const cat = categoryMap.get(signal.productId);
                    const displayName = cat ? cat.name : (signal.productId === 'indirect' ? 'Dépense Indirecte' : getProductName(signal.productId));
                    return (<Card key={signal.id}>
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
                            return showQuantity ? (<div>
                                <p className="text-muted-foreground">Quantité vendue</p>
                                <p className="font-medium">
                                  {signal.quantitySold} / {signal.quantityBought}
                                </p>
                              </div>) : null;
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
                            Annuler
                          </Button>
                          {signal.margin < 0 ? (<TrendingDown className="w-8 h-8 text-red-500"/>) : (<TrendingUp className="w-8 h-8 text-green-500"/>)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>);
                })}
            </div>)}
        </TabsContent>)}
      </Tabs>

      {/* Dialog pour choisir la date/heure de fin avant calcul */}
      <Dialog open={showEndDateDialog} onOpenChange={setShowEndDateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choisir la date de fin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Veuillez choisir la date et l'heure de fin pour calculer les ventes et la marge.</p>
                            {isRefreshingSignalData && (<p className="text-xs text-blue-600 flex items-center gap-2">
                                    <Loader2 className="w-3 h-3 animate-spin"/>
                                    Synchronisation ciblée des ventes, du stock et de la dépense en cours.
                                </p>)}
              <div>
                <Label>Date et heure de fin</Label>
                {/* compute bounds for the date picker */}
                {selectedExpense && ((() => {
            const start = selectedExpense.type === 'direct' && selectedExpense.directProduct ? selectedExpense.directProduct.startDate : selectedExpense.date;
            const now = Date.now();
            const startIso = formatDateTimeLocal(start);
            const nowIso = formatDateTimeLocal(now);
            return (<Input type="datetime-local" value={endDateInput} min={startIso} max={nowIso} onChange={(e: any) => {
                    const nextValue = e.target.value;
                    const nextTime = parseDateTimeLocal(nextValue);
                    if (nextTime !== null && nextTime < start) {
                        setEndDateInput(startIso);
                        return;
                    }
                    if (nextTime !== null && nextTime > now) {
                        setEndDateInput(nowIso);
                        return;
                    }
                    setEndDateInput(nextValue);
                }}/>);
        })())}
              </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowEndDateDialog(false)}>Annuler</Button>
                            <Button disabled={isComputingMargin} onClick={async () => {
            // compute and open confirmation
            await computeMarginForEnd(endDateInput);
        }}>
                                {isComputingMargin ? 'Actualisation et calcul...' : 'Calculer et continuer'}
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
          {marginCalculation && selectedExpense && (<div className="space-y-4">
              {/*
              Security/UX change: most margin/revenue details are sensitive and
              must be visible only to administrators. Cashiers should only see
              the purchase cost to allow them to confirm the stock end without
              exposing business-sensitive KPIs.
            */}
              {isAdmin ? (<>
                  {/* Objectif CA et marge */}
                  {typeof marginCalculation.expectedRevenue === 'number' && typeof marginCalculation.targetMargin === 'number' && (<div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Chiffre d'affaires attendu (objectif)</div>
                      <div className="text-xl font-bold text-yellow-700">{Number(marginCalculation.expectedRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</div>
                      <div className="text-xs text-muted-foreground mt-1">Marge visée : {marginCalculation.targetMargin}%</div>
                    </div>)}

                  {/* Titre et durée */}
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-semibold">
                      {selectedExpense.type === 'direct' && selectedExpense.directProduct
                    ? getProductName(selectedExpense.directProduct.productId)
                    : selectedExpense.type === 'indirect' && selectedExpense.categoryId
                        ? categoryMap.get(selectedExpense.categoryId)?.name || 'Catégorie inconnue'
                        : 'Dépense'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Stock actif depuis {marginCalculation.duration} jour{marginCalculation.duration > 1 ? 's' : ''}
                    </p>
                    {marginCalculation.effectiveStartDate &&
                    marginCalculation.effectiveStartDate !== (selectedExpense.directProduct?.startDate || selectedExpense.date) && (<p className="text-xs text-blue-600">
                        Calcul depuis le dernier signalement ({new Date(marginCalculation.effectiveStartDate).toLocaleDateString('fr-FR')} à {new Date(marginCalculation.effectiveStartDate).toLocaleTimeString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })})
                      </p>)}
                  </div>

                  {/* Indicateurs principaux */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg flex flex-col items-center">
                      <DollarSign className="w-5 h-5 mb-1 text-blue-600"/>
                      <span className="text-xs text-muted-foreground">Coût d'achat</span>
                      <span className="text-lg font-bold text-blue-600">{Number(marginCalculation.purchaseAmount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg flex flex-col items-center">
                      <TrendingUp className="w-5 h-5 mb-1 text-green-600"/>
                      <span className="text-xs text-muted-foreground">Chiffre d'affaires total</span>
                      <span className="text-lg font-bold text-green-600">{Number(marginCalculation.totalRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {marginCalculation.effectiveStartDate &&
                    marginCalculation.effectiveStartDate !== (selectedExpense.directProduct?.startDate || selectedExpense.date) ? (<>Depuis le dernier signalement ({new Date(marginCalculation.effectiveStartDate).toLocaleDateString('fr-FR')} à {new Date(marginCalculation.effectiveStartDate).toLocaleTimeString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })})</>) : (<>Depuis le {new Date(selectedExpense.directProduct?.startDate || selectedExpense.date).toLocaleDateString('fr-FR')} à {new Date(selectedExpense.directProduct?.startDate || selectedExpense.date).toLocaleTimeString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}</>)}
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
                  {marginCalculation.periodRevenue !== marginCalculation.totalRevenue && (<div className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-center">
                      <span className="text-xs font-medium text-amber-800">Revenus de cette période</span>
                      <span className="text-base font-bold text-amber-600">{Number(marginCalculation.periodRevenue).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                      <span className="text-[10px] text-amber-600">Utilisé pour le calcul de marge (exclut les ventes déjà signalées)</span>
                    </div>)}

                  {/* Quantités (admin-only) */}
                  {selectedExpense.type === 'direct' && (() => {
                    let showQuantity = false;
                    let prod: Product | undefined;
                    if (selectedExpense.directProduct) {
                        prod = productMap.get(selectedExpense.directProduct.productId);
                        showQuantity = (prod && (prod as any).trackQuantity === true) || marginCalculation.quantityBought > 1;
                    }
                    return showQuantity ? (<div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2 border">
                          <span className="text-muted-foreground">Quantité achetée</span>
                          <span className="font-medium block">{marginCalculation.quantityBought}</span>
                        </div>
                        <div className="bg-white rounded-lg p-2 border">
                          <span className="text-muted-foreground">Quantité vendue</span>
                          <span className="font-medium block">{marginCalculation.totalQuantity}</span>
                        </div>
                      </div>) : null;
                })()}

                  {/* Alerte marge historique */}
                  {marginCalculation.averageMargin !== null && (<div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs">
                      <AlertTriangle className="h-4 w-4 text-orange-500"/>
                      <span>
                        {marginCalculation.marginPercentage < marginCalculation.averageMargin
                        ? `Attention : Marge plus basse que la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`
                        : marginCalculation.marginPercentage > marginCalculation.averageMargin
                            ? `Attention : Marge plus haute que la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`
                            : `Marge égale à la moyenne historique (${marginCalculation.averageMargin.toFixed(1)}%)`}
                      </span>
                    </div>)}
                </>) : (
            // Minimal view for non-admin (cashiers): only show purchase cost
            <div className="space-y-4 text-center">
                  <h3 className="text-base font-semibold">
                    {selectedExpense.type === 'direct' && selectedExpense.directProduct
                    ? getProductName(selectedExpense.directProduct.productId)
                    : selectedExpense.type === 'indirect' && selectedExpense.categoryId
                        ? categoryMap.get(selectedExpense.categoryId)?.name || 'Catégorie'
                        : 'Dépense'}
                  </h3>
                  <div className="bg-blue-50 p-3 rounded-lg flex flex-col items-center">
                    <DollarSign className="w-5 h-5 mb-1 text-blue-600"/>
                    <span className="text-xs text-muted-foreground">Coût d'achat</span>
                    <span className="text-lg font-bold text-blue-600">{Number(marginCalculation.purchaseAmount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Détails supplémentaires réservés à l'administrateur</div>
                </div>)}

              {/* Boutons d'action (visible to both roles) */}
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={() => setShowSignalDialog(false)}>
                  Annuler
                </Button>
                <Button onClick={confirmStockEnd} disabled={loading} className="font-bold">
                  {loading ? 'Signalement...' : 'Confirmer le signalement'}
                </Button>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>
    </div>);
}
