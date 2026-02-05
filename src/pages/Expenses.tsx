import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { useNetwork } from '@/hooks/useNetwork';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Receipt, Package, Settings, Trash2, Eye, Edit, Wifi, WifiOff } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './expenses.css';
import { toast } from 'sonner';
import { emailService } from '@/lib/emailService';
import { pendingEmailService } from '@/lib/pendingEmailService';

interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice?: number;
  unit: string;
  stock: { [storeId: string]: number };
  createdAt?: number;
  updatedAt?: number;
}

interface ExpenseCategory {
  id: string;
  name: string;
  type: 'indirect' | 'operational';
  description?: string;
  storeId: string;
  active: boolean;
  createdAt: number;
  productIds?: string[]; // Produits liés pour les catégories indirectes
}

interface ExpenseAdvanced {
  id: string;
  type: 'direct' | 'indirect' | 'operational';
  name: string;
  amount: number;
  description?: string;
  date: number;
  userId: string;
  storeId: string;
  status: 'pending' | 'approved' | 'rejected';
  
  // Pour dépenses directes
  directProduct?: {
    productId: string;
    quantity: number;
    startDate: number;
    endDate?: number;
  };
  
  // Pour dépenses indirectes et opérationnelles
  categoryId?: string;
  
  createdAt: number;
  updatedAt: number;
}

export default function Expenses() {
  const { user } = useAuth();
  const { isBackendReachable, isOnline, manualSync, lastCheck } = useNetwork();
  const [activeTab, setActiveTab] = useState('list');
  const [expenseType, setExpenseType] = useState<'direct' | 'indirect' | 'operational'>('direct');
  const [products, setProducts] = useState<Product[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseAdvanced[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseAdvanced[]>([]);
  // Toujours filtrer par défaut sur "aujourd'hui"
  const [filterOption, setFilterOption] = useState<'today'|'yesterday'|'thisWeek'|'thisMonth'|'thisYear'|'custom'>('today');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [rangeTotal, setRangeTotal] = useState<number>(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(10);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [editingExpense, setEditingExpense] = useState<ExpenseAdvanced | null>(null);
  const [adminUser, setAdminUser] = useState<any>(null);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'direct' | 'indirect' | 'operational'>('all');
  const [chartMode, setChartMode] = useState<'type' | 'category'>('type');
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  
  // Debounce pour la recherche (optimisation)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Gestionnaires d'événements optimisés avec useCallback
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);
  
  const handleTypeFilterChange = useCallback((value: 'all' | 'direct' | 'indirect' | 'operational') => {
    setTypeFilter(value);
  }, []);
  
  const handleChartModeChange = useCallback((value: 'type' | 'category') => {
    setChartMode(value);
  }, []);
  
  const handleChartTypeChange = useCallback((value: 'pie' | 'bar') => {
    setChartType(value);
  }, []);
  
  // Form states
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 16), // Format YYYY-MM-DDTHH:mm
    directProductId: '',
    directProductQuantity: '',
    categoryId: '',
  });


  // Calcul du total sélectionné dès le chargement de la page
  useEffect(() => {
    // Toujours filtrer sur aujourd'hui au chargement
    setFilterOption('today');
    (async () => {
      await loadData();
      const db = await getDB();
      await loadExpensesForRange(db, 'today');
    })();
  }, []);

  // Attacher l'event listener pour le scroll
  useEffect(() => {
    const scrollElement = listScrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleListScroll);
      return () => {
        scrollElement.removeEventListener('scroll', handleListScroll);
      };
    }
  }, [loadingMore, hasMore, loadedCount, filteredExpenses.length]);

  // Nouvelle logique : à chaque reconnexion internet, on recharge les produits et catégories du backend pour garantir la dispo offline
  useEffect(() => {
    if (isBackendReachable) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBackendReachable]);

  // Fonction optimisée pour changer de période (mémorisée)
  const handleFilterOptionChange = useCallback(async (option: 'today'|'yesterday'|'thisWeek'|'thisMonth'|'thisYear'|'custom') => {
    setFilterOption(option);
    try {
      const db = await getDB();
      await loadExpensesForRange(db, option);
    } catch (e) {
      console.error('Erreur changement période:', e);
    }
  }, []);

  // Auto-apply custom date range when admin edits start/end (debounced)
  useEffect(() => {
    if (filterOption !== 'custom' || user?.role !== 'admin') return;

    const timer = setTimeout(async () => {
      try {
        const db = await getDB();
        await loadExpensesForRange(db, 'custom', customStart, customEnd);
      } catch (e) {
        console.error('Auto-apply custom range error', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [customStart, customEnd, filterOption, user?.role]);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      if (isBackendReachable) {
        try {
          // ...existing code...
          // Dépenses - charger TOUTES les dépenses, pas seulement la première page
          let expensesAdvancedUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php';
          const params = [];
          if (user?.storeId) params.push(`storeId=${user.storeId}`);
          // Demander une limite très élevée pour avoir toutes les dépenses
          params.push('limit=9999');
          params.push('offset=0');
          if (params.length) expensesAdvancedUrl += '?' + params.join('&');
          const expensesResponse = await fetch(expensesAdvancedUrl);
          if (expensesResponse.ok) {
            const backendResult = await expensesResponse.json();
            const backendExpenses = backendResult.data || backendResult || []; // Gérer différents formats de réponse
            console.log('Loaded from backend:', backendExpenses.length, 'expenses');
            
            // Stocker TOUTES les dépenses en local
            const tx = db.transaction('expensesAdvanced', 'readwrite');
            await tx.store.clear();
            for (const e of backendExpenses) await tx.store.put(e);
            await tx.done;
            
            console.log('Stored', backendExpenses.length, 'expenses in IndexedDB');
            // Ne pas mettre à jour les states ici, c'est géré par loadExpensesForRange
          }
        } catch (error) {
          toast.error('Erreur de connexion au serveur, chargement des données locales');
          await loadFromLocal(db);
        }
      } else {
        if (typeof lastCheck === 'number' && lastCheck > 0 && !isOnline) {
          toast.error('Mode hors ligne : chargement des données locales');
        }
        await loadFromLocal(db);
      }
      await updatePendingSyncCount(db);
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Load expenses for a specific date range with proper pagination
  const loadExpensesForRange = async (db: any, option: 'today'|'yesterday'|'thisWeek'|'thisMonth'|'thisYear'|'custom', startStr?: string, endStr?: string) => {
    try {
      const all = await db.getAll('expensesAdvanced');
      const filteredByStore = user?.storeId ? all.filter((e: any) => e.storeId === user.storeId) : all;

      let start = 0;
      let end = Number.MAX_SAFE_INTEGER;
      const now = new Date();

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 24*60*60*1000 - 1;

      switch(option) {
        case 'today':
          start = todayStart; end = todayEnd; break;
        case 'yesterday':
          start = todayStart - 24*60*60*1000; end = todayStart - 1; break;
        case 'thisWeek': {
          const day = now.getDay(); // 0 Sun .. 6 Sat
          const diff = (day + 6) % 7; // make Monday=0
          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).setHours(0,0,0,0);
          start = weekStart; end = todayEnd; break;
        }
        case 'thisMonth':
          start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); end = todayEnd; break;
        case 'thisYear':
          start = new Date(now.getFullYear(), 0, 1).getTime(); end = todayEnd; break;
        case 'custom':
          if (startStr) start = new Date(startStr).getTime();
          if (endStr) {
            const eDate = new Date(endStr);
            // include entire day
            end = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate(),23,59,59,999).getTime();
          }
          break;
      }

      // Tous les résultats de la période (pour la pagination)
      const allResults = filteredByStore.filter((e: any) => {
        return e.date >= start && e.date <= end;
      }).sort((a: any, b: any) => b.createdAt - a.createdAt);

      // Mise à jour: filteredExpenses contient TOUS les résultats, expenses contient seulement la première page
      setFilteredExpenses(allResults);
      setExpenses(allResults.slice(0, pageSize)); // Première page seulement
      setLoadedCount(Math.min(pageSize, allResults.length));
      setHasMore(allResults.length > pageSize);

      const total = allResults.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      setRangeTotal(total);
      
      console.log('loadExpensesForRange:', { 
        total: allResults.length, 
        firstPage: Math.min(pageSize, allResults.length), 
        hasMore: allResults.length > pageSize 
      });
    } catch (e) {
      console.error('loadExpensesForRange error', e);
    }
  };

  const loadFromLocal = async (db: any) => {
    // Load products
    const productsData = await db.getAll('products');
    let filteredProducts = productsData;
    if (user?.storeId) {
      filteredProducts = productsData.filter((p: any) => (
        (p.storeId && p.storeId === user.storeId) ||
        (p.stock && Object.keys(p.stock || {}).includes(user.storeId))
      ));
    }
    setProducts(filteredProducts);
    
    // Load expense categories
    const categoriesData = await db.getAll('expenseCategories');
    let filteredCategories = categoriesData;
    if (user?.storeId) {
      filteredCategories = categoriesData.filter((c: any) => c.storeId === user.storeId && c.active);
    }
    setExpenseCategories(filteredCategories);
    
    // Ne pas charger les dépenses ici, c'est géré par loadExpensesForRange
    await loadExpensesPage(db, 0, pageSize, true);
  };

  // Load next page of expenses (infinite scroll)
  const loadExpensesPage = async (db: any, offset: number, limit: number, reset = false) => {
    if (isBackendReachable) {
      try {
        let expensesAdvancedUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php';
        const params = [];
        if (user?.storeId) params.push(`storeId=${user.storeId}`);
        params.push(`offset=${offset}`);
        params.push(`limit=${limit}`);
        if (params.length) expensesAdvancedUrl += '?' + params.join('&');
        const expensesResponse = await fetch(expensesAdvancedUrl);
        if (expensesResponse.ok) {
          const backendResult = await expensesResponse.json();
          const backendExpenses = backendResult.data || [];
          const total = backendResult.total || 0;
          // Optionally update local IndexedDB
          const tx = db.transaction('expensesAdvanced', 'readwrite');
          for (const e of backendExpenses) await tx.store.put(e);
          await tx.done;
          if (reset) {
            setExpenses(backendExpenses);
            setLoadedCount(backendExpenses.length);
          } else {
            setExpenses(prev => [...prev, ...backendExpenses]);
            setLoadedCount(prev => prev + backendExpenses.length);
          }
          setHasMore(offset + backendExpenses.length < total);
          return backendExpenses;
        }
      } catch (e) {
        console.error('Erreur chargement paginé dépenses backend:', e);
      }
    }
    // Fallback: local IndexedDB
    try {
      const all = await db.getAll('expensesAdvanced');
      const filtered = user?.storeId ? all.filter((e: any) => e.storeId === user.storeId) : all;
      filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);
      const page = filtered.slice(offset, offset + limit);
      if (reset) {
        setExpenses(page);
        setLoadedCount(page.length);
      } else {
        setExpenses(prev => [...prev, ...page]);
        setLoadedCount(prev => prev + page.length);
      }
      setHasMore(page.length === limit);
      return page;
    } catch (e) {
      console.error('Erreur chargement paginé dépenses local:', e);
      return [];
    }
  };

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const handleListScroll = async () => {
    const el = listScrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = el;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    
    console.log('Scroll detected:', { scrollTop, scrollHeight, clientHeight, isNearBottom, hasMore, loadedCount, totalFiltered: filteredExpenses.length });
    
    if (isNearBottom) {
      console.log('Loading more...');
      setLoadingMore(true);
      
      // Charger la page suivante depuis filteredExpenses
      const nextPage = filteredExpenses.slice(loadedCount, loadedCount + pageSize);
      console.log('Next page:', nextPage.length, 'items');
      
      if (nextPage.length > 0) {
        setExpenses(prev => {
          const updated = [...prev, ...nextPage];
          console.log('Updated expenses:', updated.length);
          return updated;
        });
        const newLoadedCount = loadedCount + nextPage.length;
        setLoadedCount(newLoadedCount);
        setHasMore(newLoadedCount < filteredExpenses.length);
        console.log('New state:', { newLoadedCount, hasMore: newLoadedCount < filteredExpenses.length });
      } else {
        setHasMore(false);
        console.log('No more items');
      }
      
      setTimeout(() => setLoadingMore(false), 100);
    }
  };

  const updatePendingSyncCount = async (db: any) => {
    try {
      const syncQueue = await db.getAll('syncQueue');
      const expensePendingOps = syncQueue.filter(op => 
        op.table === 'expensesAdvanced' && op.storeId === user?.storeId
      );
      setPendingSyncCount(expensePendingOps.length);
    } catch (error) {
      console.error('Erreur lors du comptage des synchronisations en attente:', error);
    }
  };

  const addToSyncQueue = async (db: any, syncOp: any) => {
    try {
      await db.add('syncQueue', syncOp);
      await updatePendingSyncCount(db);
    } catch (error) {
      console.error('Erreur lors de l\'ajout à la queue de synchronisation:', error);
    }
  };

  const handleEditExpense = useCallback((exp: ExpenseAdvanced) => {
    setEditingExpense(exp);
    setExpenseType(exp.type);
    setFormData({
      amount: String(exp.amount || ''),
      description: exp.description || '',
      date: new Date(exp.date).toISOString().slice(0, 16),
      directProductId: exp.directProduct?.productId || '',
      directProductQuantity: exp.directProduct?.quantity ? String(exp.directProduct.quantity) : '',
      categoryId: exp.categoryId || '',
    });
    setShowAddDialog(true);
  }, []);

  const handleDeleteExpense = useCallback(async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;
    try {
      setLoading(true);
      const db = await getDB();
      await db.delete('expensesAdvanced', id);
      await performSyncOp({
        url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php?id=${id}`,
        method: 'DELETE',
        data: { id }
      });
      toast.success('Dépense supprimée localement. La synchronisation se fera automatiquement.');
      
      // Actualiser les données et recharger la période actuelle automatiquement
      await loadData();
      await loadExpensesForRange(db, filterOption, customStart, customEnd);
    } catch (error) {
      console.error('Erreur suppression dépense:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  }, [filterOption, customStart, customEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.storeId) {
      toast.error('Erreur: utilisateur non authentifié');
      return;
    }

    // Validation du montant
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Veuillez saisir un montant valide');
      return;
    }

    // Validation pour les dépenses directes
    if (expenseType === 'direct') {
      if (!formData.directProductId) {
        toast.error('Veuillez sélectionner un produit pour la dépense directe');
        return;
      }
      const selectedProduct = products.find(p => p.id === formData.directProductId);
      const isStockProduct = selectedProduct && selectedProduct.stock && user?.storeId && Object.keys(selectedProduct.stock).includes(user.storeId);
      if (isStockProduct) {
        const qty = parseFloat(formData.directProductQuantity);
        if (isNaN(qty) || qty <= 0) {
          toast.error('Veuillez saisir une quantité valide pour le produit en stock');
          return;
        }
      }
    }

    // Validation pour les dépenses indirectes et opérationnelles
    if ((expenseType === 'indirect' || expenseType === 'operational') && !formData.categoryId) {
      toast.error('Veuillez sélectionner une catégorie');
      return;
    }

    try {
      setLoading(true);
      const db = await getDB();
      let expenseName = '';
      if (expenseType === 'direct') {
        const product = products.find(p => p.id === formData.directProductId);
        expenseName = product ? `Achat ${product.name}` : 'Achat produit';
      } else {
        const category = expenseCategories.find(c => c.id === formData.categoryId);
        expenseName = category ? category.name : 'Dépense';
      }
      const baseExpense = {
        id: generateId(),
        type: expenseType,
        name: expenseName,
        amount: amount,
        description: formData.description,
        date: new Date(formData.date).getTime(),
        userId: user.id,
        storeId: user.storeId,
        status: 'approved' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      let expense: ExpenseAdvanced;
      if (expenseType === 'direct') {
        let selectedProduct = products.find(p => p.id === formData.directProductId);
        // Toujours recharger le produit depuis le backend si possible pour avoir le stock à jour
        if (isBackendReachable && selectedProduct) {
          try {
            const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${selectedProduct.id}`);
            if (response.ok) {
              const freshProduct = await response.json();
              if (freshProduct && freshProduct.id) {
                selectedProduct = freshProduct;
                await db.put('products', freshProduct);
              }
            }
          } catch (error) {
            console.warn('Impossible de recharger le produit depuis le backend:', error);
          }
        }
        const isStockProduct = selectedProduct && selectedProduct.stock && user?.storeId && Object.keys(selectedProduct.stock).includes(user.storeId);
        const qty = isStockProduct ? parseFloat(formData.directProductQuantity) : 1;
        expense = {
          ...baseExpense,
          directProduct: {
            productId: formData.directProductId,
            quantity: qty,
            startDate: new Date(formData.date).getTime(),
          },
        };
        if (isStockProduct && user?.storeId) {
          // Ne jamais modifier le stock local directement : passer par performSyncOp
          const productDataForBackend = {
            ...selectedProduct,
            stock: (selectedProduct.stock[user.storeId] || 0) + qty,
            trackStock: true
          };
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
            method: 'PUT',
            data: productDataForBackend,
          });
          // Recharger le produit depuis le backend après modification
          try {
            const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${selectedProduct.id}`);
            if (response.ok) {
              const freshProduct = await response.json();
              if (freshProduct && freshProduct.id) {
                await db.put('products', freshProduct);
              }
            }
          } catch (error) {
            console.warn('Impossible de recharger le produit après modification:', error);
          }
        }
      } else {
        expense = {
          ...baseExpense,
          categoryId: formData.categoryId,
        };
      }
      // If editing an existing expense, update; otherwise add
      let finalExpense = expense;
      let isEdit = false;
      if (editingExpense) {
        isEdit = true;
        const updatedExpense: ExpenseAdvanced = {
          ...expense,
          id: editingExpense.id,
          createdAt: editingExpense.createdAt,
          updatedAt: Date.now(),
        };
        if (expenseType === 'direct') {
          let selectedProduct = products.find(p => p.id === updatedExpense.directProduct?.productId);
          
          // Si le backend est disponible, recharger le produit pour avoir le stock le plus récent
          if (isBackendReachable && selectedProduct) {
            try {
              const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${selectedProduct.id}`);
              if (response.ok) {
                const freshProduct = await response.json();
                if (freshProduct && freshProduct.id) {
                  selectedProduct = freshProduct;
                  // Mettre à jour aussi en local
                  await db.put('products', freshProduct);
                }
              }
            } catch (error) {
              console.warn('Impossible de recharger le produit depuis le backend:', error);
            }
          }
          
          const isStockProduct = selectedProduct && selectedProduct.stock && user?.storeId && Object.keys(selectedProduct.stock).includes(user.storeId);
          if (isStockProduct && updatedExpense.directProduct && editingExpense.directProduct) {
            const oldQty = Number(editingExpense.directProduct.quantity || 0);
            const newQty = Number(updatedExpense.directProduct.quantity || 0);
            if (user?.storeId) {
              let tempStock = (selectedProduct.stock[user.storeId] || 0) - oldQty;
              tempStock += newQty;
              const updatedProduct = {
                ...selectedProduct,
                stock: {
                  ...selectedProduct.stock,
                  [user.storeId]: tempStock,
                },
                createdAt: selectedProduct.createdAt ?? Date.now(),
                updatedAt: Date.now(),
              };
              await db.put('products', updatedProduct);
              const productDataForBackend = {
                ...updatedProduct,
                stock: tempStock,
                trackStock: true
              };
              if (isBackendReachable) {
                try {
                  const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(productDataForBackend)
                  });
                  if (!response.ok) throw new Error(`Erreur backend: ${response.status}`);
                } catch (error) {
                  console.error('Erreur mise à jour stock backend (edit):', error);
                  await addToSyncQueue(db, {
                    id: generateId(),
                    table: 'products',
                    operation: 'PUT',
                    data: productDataForBackend,
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
                    storeId: user.storeId,
                    createdAt: Date.now()
                  });
                }
              } else {
                await addToSyncQueue(db, {
                  id: generateId(),
                  table: 'products',
                  operation: 'PUT',
                  data: productDataForBackend,
                  url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
                  storeId: user.storeId,
                  createdAt: Date.now()
                });
              }
            }
          }
        }
        await db.put('expensesAdvanced', updatedExpense);
        finalExpense = updatedExpense;
      } else {
        await db.add('expensesAdvanced', expense);
        finalExpense = expense;
      }

      // Message de succès immédiat
      toast.success(isEdit ? 'Dépense modifiée avec succès!' : 'Dépense enregistrée avec succès!');

      // Actualisation immédiate et visible des données
      try {
        await loadData();
        await loadExpensesForRange(db, filterOption, customStart, customEnd);
      } catch (e) {
        console.error('Erreur actualisation données:', e);
      }

      // Mise à jour optimiste de l'UI : afficher la dépense immédiatement
      try {
        const amt = Number(finalExpense.amount) || 0;
        // Si édition, remplacer l'élément existant
        if (isEdit) {
          setFilteredExpenses(prev => prev.map(e => e.id === finalExpense.id ? finalExpense : e));
          setExpenses(prev => prev.map(e => e.id === finalExpense.id ? finalExpense : e));
          // ajuster le total de la plage
          const oldAmt = Number(editingExpense?.amount || 0);
          setRangeTotal(prev => prev - oldAmt + amt);
        } else {
          // Ajout : préfixer aux listes paginées et globales
          setFilteredExpenses(prev => [finalExpense, ...prev]);
          setExpenses(prev => {
            const updated = [finalExpense, ...prev];
            // Conserver la taille de la première page
            if (updated.length > pageSize) return updated.slice(0, pageSize);
            return updated;
          });
          setLoadedCount(prev => prev + 1);
          setRangeTotal(prev => prev + amt);
        }
        // recalculer hasMore
        setHasMore(prev => {
          const total = (isEdit ? filteredExpenses.length : filteredExpenses.length + 1);
          return total > pageSize;
        });
      } catch (err) {
        console.warn('Optimistic UI update failed', err);
      }

      // Reset du formulaire et fermeture du dialog après actualisation
      setFormData({
        amount: '',
        description: '',
        date: new Date().toISOString().slice(0, 16),
        directProductId: '',
        directProductQuantity: '',
        categoryId: '',
      });
      setShowAddDialog(false);
      setEditingExpense(null);

      // Opérations en arrière-plan (async sans await)
      Promise.all([
        // Synchronisation backend
        performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
          method: isEdit ? 'PUT' : 'POST',
          data: finalExpense
        }).catch(e => console.error('Erreur sync backend:', e)),

        // Envoi email en arrière-plan
        (async () => {
          try {
            console.log('🔍 [DEBUG] Début envoi email dépense', { isEdit, expenseId: finalExpense.id });
            const dbInstance = await getDB();
            
            // Vérifier les paramètres d'email pour les dépenses
            const emailSettings = await dbInstance.get('emailSettings', user?.storeId);
            console.log('🔍 [DEBUG] Email settings:', emailSettings);
            const shouldSendEmail = emailSettings?.expenses !== false; // Par défaut true si pas de config
            
            if (!shouldSendEmail) {
              console.log('📧 Email désactivé pour les dépenses');
            } else {
              console.log('📧 [EXPENSE] Envoi email à tous les admins du store:', user?.storeId);
              
              // Récupérer le nom du magasin depuis la base locale
              const store = await dbInstance.get('stores', user?.storeId);
              const storeName = store?.name || user?.storeId || '';
              // Construction du résumé HTML
              const resume = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">💸 Dépense ${isEdit ? 'modifiée' : 'ajoutée'}</h3>
    <div class="info-row">
      <span class="info-label">Utilisateur :&nbsp;</span>
      <span class="info-value">${user?.username || 'Inconnu'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Type :&nbsp;</span>
      <span class="info-value">${getExpenseTypeLabel(finalExpense.type)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Montant :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${Number(finalExpense.amount).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date :&nbsp;</span>
      <span class="info-value">${new Date(finalExpense.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Description :&nbsp;</span>
      <span class="info-value">${finalExpense.description || '-'}</span>
    </div>
    ${finalExpense.type === 'direct' && finalExpense.directProduct ? `
    <div class="info-row">
      <span class="info-label">Produit :&nbsp;</span>
      <span class="info-value">${getProductName(finalExpense.directProduct.productId)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Quantité :&nbsp;</span>
      <span class="info-value">${finalExpense.directProduct.quantity}</span>
    </div>
    ` : ''}
    ${(finalExpense.type === 'indirect' || finalExpense.type === 'operational') && finalExpense.categoryId ? `
    <div class="info-row">
      <span class="info-label">Catégorie :&nbsp;</span>
      <span class="info-value">${getCategoryName(finalExpense.categoryId)}</span>
    </div>
    ` : ''}
  </div>
  <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
    <strong>ID de la dépense :&nbsp;</strong>${finalExpense.id}
  </div>
</div>
`;

              
              // Envoyer à TOUS les admins du store
              try {
                console.log('📧 [DEBUG] Envoi email dépense à tous les admins du store...');
                const result = await pendingEmailService.sendToAllAdmins({
                  message: resume,
                  storeName: storeName,
                  type: 'expense',
                  relatedId: finalExpense.id,
                  storeId: user?.storeId || '',
                  userId: user?.id || ''
                });
                
                console.log(`📊 [EXPENSE] Résultats: ${result.sent} envoyés, ${result.queued} en attente sur ${result.totalAdmins} admins`);
                if (result.sent > 0) {
                  console.log('✅ Emails dépense envoyés directement');
                }
                if (result.queued > 0) {
                  console.log('📦 Emails dépense mis en attente, seront envoyés lors de la sync');
                }
              } catch (e) {
                console.warn('❌ Erreur service email dépense:', e);
              }
            }
          } catch (e) {
            console.warn('❌ Erreur lors de l\'envoi automatique du mail admin pour dépense:', e);
            console.warn('🔍 [DEBUG] Détails erreur:', { isEdit, userId: user?.id, storeId: user?.storeId });
          }
        })()
      ]).catch(e => console.error('Erreur opérations arrière-plan:', e));
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la dépense:', error);
      toast.error('Erreur lors de l\'ajout de la dépense');
    } finally {
      setLoading(false);
    }
  };

  const getExpenseTypeLabel = (type: string) => {
    switch (type) {
      case 'direct': return 'Directe';
      case 'indirect': return 'Indirecte';
      case 'operational': return 'Opérationnelle';
      default: return type;
    }
  };



  const getProductName = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Produit inconnu';
  }, [products]);

  const getCategoryName = useCallback((categoryId: string) => {
    const category = expenseCategories.find(c => c.id === categoryId);
    return category ? category.name : 'Catégorie inconnue';
  }, [expenseCategories]);

  const getFilteredCategories = useCallback(() => {
    return expenseCategories.filter(c => c.type === expenseType);
  }, [expenseCategories, expenseType]);

  // Fonction pour filtrer les dépenses selon les critères (mémorisée)
  const getFilteredExpenses = useMemo(() => {
    // Utiliser expenses (liste paginée) pour l'affichage au lieu de filteredExpenses (tous les résultats)
    let filtered = expenses;

    // Filtrage par recherche textuelle
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(expense => {
        const matchName = expense.name.toLowerCase().includes(query);
        const matchDescription = expense.description?.toLowerCase().includes(query) || false;
        const matchAmount = expense.amount.toString().includes(query);
        const matchProductName = expense.type === 'direct' && expense.directProduct ? 
          getProductName(expense.directProduct.productId).toLowerCase().includes(query) : false;
        const matchCategoryName = (expense.type === 'indirect' || expense.type === 'operational') && expense.categoryId ? 
          getCategoryName(expense.categoryId).toLowerCase().includes(query) : false;
        
        return matchName || matchDescription || matchAmount || matchProductName || matchCategoryName;
      });
    }

    // Filtrage par type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(expense => expense.type === typeFilter);
    }

    return filtered;
  }, [expenses, debouncedSearchQuery, typeFilter, products, expenseCategories]);

  // Fonction pour calculer les données du graphique (mémorisée)
  const getChartData = useMemo(() => {
    const filtered = getFilteredExpenses;
    
    if (chartMode === 'type') {
      const totals = {
        direct: { count: 0, total: 0 },
        indirect: { count: 0, total: 0 },
        operational: { count: 0, total: 0 }
      };

      filtered.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        totals[expense.type].count += 1;
        totals[expense.type].total += amount;
      });

      return {
        type: 'type' as const,
        data: {
          direct: { ...totals.direct, name: 'Directes' },
          indirect: { ...totals.indirect, name: 'Indirectes' },
          operational: { ...totals.operational, name: 'Opérationnelles' }
        }
      };
    } else {
      // Mode par catégories
      const data: { [key: string]: { count: number, total: number, name: string } } = {};
      
      filtered.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        let key = '';
        let name = '';
        
        if (expense.type === 'direct' && expense.directProduct) {
          key = expense.directProduct.productId;
          name = getProductName(expense.directProduct.productId);
        } else if ((expense.type === 'indirect' || expense.type === 'operational') && expense.categoryId) {
          key = expense.categoryId;
          name = getCategoryName(expense.categoryId);
        } else {
          key = 'other';
          name = 'Autres';
        }
        
        if (!data[key]) {
          data[key] = { count: 0, total: 0, name };
        }
        
        data[key].count += 1;
        data[key].total += amount;
      });

      return {
        type: 'category' as const,
        data
      };
    }
  }, [getFilteredExpenses, chartMode, products, expenseCategories]);

  // Fonction helper pour calculer les totaux après filtrage
  const calculateTotalsForChart = () => {
    // Utiliser filteredExpenses pour les statistiques (tous les résultats de la période)
    let filtered = filteredExpenses;

    // Appliquer les mêmes filtres de recherche et type que pour l'affichage
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(expense => {
        const matchName = expense.name.toLowerCase().includes(query);
        const matchDescription = expense.description?.toLowerCase().includes(query) || false;
        const matchAmount = expense.amount.toString().includes(query);
        const matchProductName = expense.type === 'direct' && expense.directProduct ? 
          getProductName(expense.directProduct.productId).toLowerCase().includes(query) : false;
        const matchCategoryName = (expense.type === 'indirect' || expense.type === 'operational') && expense.categoryId ? 
          getCategoryName(expense.categoryId).toLowerCase().includes(query) : false;
        
        return matchName || matchDescription || matchAmount || matchProductName || matchCategoryName;
      });
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(expense => expense.type === typeFilter);
    }

    const totals = {
      direct: { count: 0, total: 0 },
      indirect: { count: 0, total: 0 },
      operational: { count: 0, total: 0 }
    };

    filtered.forEach(expense => {
      const amount = Number(expense.amount) || 0;
      totals[expense.type].count += 1;
      totals[expense.type].total += amount;
    });

    return totals;
  };

  // Optimisation mémoire pour le composant graphique
  const memoizedChartComponent = useMemo(() => {
    if (chartType === 'bar') {
      const chartResult = getChartData;
      const dataArray = Object.entries(chartResult.data).map(([key, value]) => ({
        name: (value as any).name,
        montant: (value as any).total,
        quantité: (value as any).count
      }));

      return dataArray.length > 0 ? (
        <BarChart data={dataArray}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            interval={0}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis />
          <Tooltip formatter={(value, name) => [
            name === 'montant' ? `${Number(value).toLocaleString('fr-FR')} FCFA` : value,
            name === 'montant' ? 'Montant' : 'Quantité'
          ]} />
          <Bar dataKey="montant" fill="#3b82f6" />
        </BarChart>
      ) : (
        <div className="text-center text-muted-foreground py-8">Aucune donnée disponible</div>
      );
    }

    // chartType === 'pie'
    const chartResult = getChartData;
    let totalAmount = 0;
    let dataArray: Array<{ type: string, name: string, amount: number, count: number, percentage: number, color: string }> = [];

    if (chartMode === 'type') {
      const totals = calculateTotalsForChart();
      totalAmount = totals.direct.total + totals.indirect.total + totals.operational.total;
      
      dataArray = [
        { 
          type: 'direct', 
          name: 'Dépenses Directes', 
          amount: totals.direct.total,
          count: totals.direct.count,
          percentage: totalAmount > 0 ? Math.round((totals.direct.total / totalAmount) * 100) : 0,
          color: '#3b82f6'
        },
        { 
          type: 'indirect', 
          name: 'Dépenses Indirectes', 
          amount: totals.indirect.total,
          count: totals.indirect.count,
          percentage: totalAmount > 0 ? Math.round((totals.indirect.total / totalAmount) * 100) : 0,
          color: '#10b981'
        },
        { 
          type: 'operational', 
          name: 'Dépenses Opérationnelles', 
          amount: totals.operational.total,
          count: totals.operational.count,
          percentage: totalAmount > 0 ? Math.round((totals.operational.total / totalAmount) * 100) : 0,
          color: '#f59e0b'
        }
      ].filter(item => item.amount > 0);
    } else {
      // Mode par catégories
      const categoryEntries = Object.entries(chartResult.data);
      totalAmount = categoryEntries.reduce((sum, [, data]) => sum + (data as any).total, 0);
      
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];
      
      dataArray = categoryEntries
        .filter(([, data]) => (data as any).total > 0)
        .sort(([, a], [, b]) => (b as any).total - (a as any).total)
        .map(([key, data], index) => ({
          type: key,
          name: (data as any).name,
          amount: (data as any).total,
          count: (data as any).count,
          percentage: totalAmount > 0 ? Math.round(((data as any).total / totalAmount) * 100) : 0,
          color: colors[index % colors.length]
        }));
    }

    if (dataArray.length === 0 || totalAmount === 0) {
      return <div className="text-center text-muted-foreground py-8">Aucune donnée disponible</div>;
    }

    let cumulativePercentage = 0;
    const radius = 80;
    const strokeWidth = 16;

    return (
      <div className="relative w-48 h-48">
        <svg width="192" height="192" className="transform -rotate-90">
          <circle
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {dataArray.map((item, index) => {
            const circumference = 2 * Math.PI * radius;
            const strokeDasharray = circumference;
            const strokeDashoffset = circumference - (circumference * item.percentage) / 100;
            const rotation = (cumulativePercentage * 360) / 100;
            
            cumulativePercentage += item.percentage;

            return (
              <circle
                key={item.type}
                cx="96"
                cy="96"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transformOrigin: '96px 96px',
                  transform: `rotate(${rotation}deg)`
                }}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        
        {/* Centre du graphique avec total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold text-center">
            {totalAmount.toLocaleString('fr-FR', { 
              minimumFractionDigits: 0, 
              maximumFractionDigits: 0, 
              useGrouping: true 
            })}
          </div>
          <div className="text-xs text-muted-foreground">FCFA</div>
        </div>
      </div>
    );
  }, [chartType, chartMode, getFilteredExpenses, expenseCategories, products, getChartData]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Dépenses</h1>
          <p className="text-muted-foreground">
            Suivi des dépenses avec calcul automatique des marges
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle Dépense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Ajouter une Dépense</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Sélection du type */}
              <div className="grid grid-cols-3 gap-4">
                <Button 
                  type="button"
                  variant={expenseType === 'direct' ? 'default' : 'outline'}
                  onClick={() => setExpenseType('direct')}
                  className="flex flex-col h-20"
                >
                  <Package className="w-6 h-6 mb-1" />
                  <span className="text-xs">Directe</span>
                  <span className="text-xs text-muted-foreground">1 produit</span>
                </Button>
                <Button 
                  type="button"
                  variant={expenseType === 'indirect' ? 'default' : 'outline'}
                  onClick={() => setExpenseType('indirect')}
                  className="flex flex-col h-20"
                >
                  <Receipt className="w-6 h-6 mb-1" />
                  <span className="text-xs">Indirecte</span>
                  <span className="text-xs text-muted-foreground">Plusieurs produits</span>
                </Button>
                <Button 
                  type="button"
                  variant={expenseType === 'operational' ? 'default' : 'outline'}
                  onClick={() => setExpenseType('operational')}
                  className="flex flex-col h-20"
                >
                  <Settings className="w-6 h-6 mb-1" />
                  <span className="text-xs">Opérationnelle</span>
                  <span className="text-xs text-muted-foreground">Charges fixes</span>
                </Button>
              </div>

              {/* Informations générales */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date et heure</Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Montant (FCFA)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description (optionnelle)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Détails supplémentaires..."
                />
              </div>

              {/* Formulaire conditionnel selon le type */}
              {expenseType === 'direct' && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Dépense Directe - Achat de Produit</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="directProduct">Produit concerné</Label>
                      <Select 
                        value={formData.directProductId} 
                        onValueChange={(value) => 
                          setFormData(prev => ({ ...prev, directProductId: value }))
                        }
                      >
                        <SelectTrigger className={!formData.directProductId ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Sélectionner un produit" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} ({product.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {expenseType === 'direct' && !formData.directProductId && (
                        <p className="text-sm text-red-500 mt-1">
                          Veuillez sélectionner un produit
                        </p>
                      )}
                    </div>
                    {/* Champ quantité si produit géré en stock */}
                    {formData.directProductId && (() => {
                      const selectedProduct = products.find(p => p.id === formData.directProductId);
                      const isStockProduct = selectedProduct && selectedProduct.stock && user?.storeId && Object.keys(selectedProduct.stock).includes(user.storeId);
                      if (isStockProduct) {
                        return (
                          <div>
                            <Label htmlFor="directProductQuantity">Quantité</Label>
                            <Input
                              id="directProductQuantity"
                              type="number"
                              min="1"
                              step="1"
                              value={formData.directProductQuantity}
                              onChange={e => setFormData(prev => ({ ...prev, directProductQuantity: e.target.value }))}
                              required
                            />
                            {!formData.directProductQuantity && (
                              <p className="text-sm text-red-500 mt-1">Veuillez saisir la quantité</p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {(expenseType === 'indirect' || expenseType === 'operational') && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">
                    {expenseType === 'indirect' ? 'Dépense Indirecte' : 'Dépense Opérationnelle'}
                  </h3>
                  <div>
                    <Label htmlFor="category">Catégorie</Label>
                    <Select 
                      value={formData.categoryId} 
                      onValueChange={(value) => 
                        setFormData(prev => ({ ...prev, categoryId: value }))
                      }
                    >
                      <SelectTrigger className={!formData.categoryId ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFilteredCategories().map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                            {category.description && (
                              <span className="text-muted-foreground ml-2">
                                - {category.description}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(expenseType === 'indirect' || expenseType === 'operational') && !formData.categoryId && (
                      <p className="text-sm text-red-500 mt-1">
                        Veuillez sélectionner une catégorie
                      </p>
                    )}
                    {getFilteredCategories().length === 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Aucune catégorie disponible pour ce type de dépense.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="w-1/2" disabled={loading}>
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  className="w-1/2"
                  disabled={loading || !formData.amount || 
                    (expenseType === 'direct' && !formData.directProductId) ||
                    ((expenseType === 'indirect' || expenseType === 'operational') && !formData.categoryId)
                  }
                >
                  {loading ? 'Traitement...' : 'Ajouter la dépense'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Range selector & total (admin only). Cashiers see today's total only. */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="w-full sm:w-auto">
              {user?.role === 'admin' ? (
                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                  <div className="flex items-center space-x-2">
                    <Button className="min-w-[90px]" size="sm" variant={filterOption === 'today' ? 'default' : 'outline'} onClick={() => handleFilterOptionChange('today')}>Aujourd'hui</Button>
                    <Button className="min-w-[90px]" size="sm" variant={filterOption === 'yesterday' ? 'default' : 'outline'} onClick={() => handleFilterOptionChange('yesterday')}>Hier</Button>
                    <Button className="min-w-[110px]" size="sm" variant={filterOption === 'thisWeek' ? 'default' : 'outline'} onClick={() => handleFilterOptionChange('thisWeek')}>Cette semaine</Button>
                    <Button className="min-w-[90px]" size="sm" variant={filterOption === 'thisMonth' ? 'default' : 'outline'} onClick={() => handleFilterOptionChange('thisMonth')}>Ce mois</Button>
                    <Button className="min-w-[110px]" size="sm" variant={filterOption === 'thisYear' ? 'default' : 'outline'} onClick={() => handleFilterOptionChange('thisYear')}>Cette année</Button>
                    <Button className="min-w-[110px]" size="sm" variant={filterOption === 'custom' ? 'default' : 'outline'} onClick={() => setFilterOption('custom')}>Personnalisé</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Dépenses du jour</div>
              )}
              {filterOption === 'custom' && user?.role === 'admin' && (
                <div className="flex gap-2 mt-3 flex-wrap items-end">
                  <div>
                    <Label htmlFor="customStart">Date début</Label>
                    <Input id="customStart" className="max-w-[160px]" type="date" placeholder="Date début" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  </div>

                  <div>
                    <Label htmlFor="customEnd">Date Fin</Label>
                    <Input id="customEnd" className="max-w-[160px]" type="date" placeholder="Date Fin" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                  </div>

                  {/* Auto-apply on date change — button removed */}
                </div>
              )}
            </div>

            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3">
              <div className="text-center sm:text-right">
                <div className="text-sm text-muted-foreground">Total sélection</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-orange-600">{Number(rangeTotal).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contenu principal avec onglets */}
      <Tabs defaultValue="expenses" className="w-full">
        {user?.role === 'admin' ? (
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="expenses">Dépenses</TabsTrigger>
            <TabsTrigger value="categories">Catégories</TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="expenses" className="space-y-6">
          {/* Barre de recherche et filtres */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <Input
                    placeholder="Rechercher par nom, description, montant, produit ou catégorie..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      <SelectItem value="direct">Directe</SelectItem>
                      <SelectItem value="indirect">Indirecte</SelectItem>
                      <SelectItem value="operational">Opérationnelle</SelectItem>
                    </SelectContent>
                  </Select>
                  {(searchQuery || typeFilter !== 'all') && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setSearchQuery('');
                        setTypeFilter('all');
                      }}
                    >
                      Réinitialiser
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Graphique des dépenses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Répartition des Dépenses</CardTitle>
                <div className="flex gap-2">
                  <Select value={chartMode} onValueChange={handleChartModeChange}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="type">Par type</SelectItem>
                      <SelectItem value="category">Par catégorie</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={chartType} onValueChange={handleChartTypeChange}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pie">Circulaire</SelectItem>
                      <SelectItem value="bar">Barres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Graphique */}
                <div className="flex items-center justify-center">
                  {memoizedChartComponent}
                </div>

                {/* Légende et détails */}
                {chartType === 'pie' && (
                <div className="space-y-4">
                  {(() => {
                    const chartResult = getChartData;
                    let totalAmount = 0;
                    let legendData: Array<{ type: string, label: string, amount: number, count: number, percentage: number, color: string }> = [];

                    if (chartMode === 'type') {
                      const totals = calculateTotalsForChart();
                      totalAmount = totals.direct.total + totals.indirect.total + totals.operational.total;
                      
                      legendData = [
                        { 
                          type: 'direct', 
                          label: 'Dépenses Directes', 
                          amount: totals.direct.total,
                          count: totals.direct.count,
                          percentage: totalAmount > 0 ? Math.round((totals.direct.total / totalAmount) * 100) : 0,
                          color: '#3b82f6'
                        },
                        { 
                          type: 'indirect', 
                          label: 'Dépenses Indirectes', 
                          amount: totals.indirect.total,
                          count: totals.indirect.count,
                          percentage: totalAmount > 0 ? Math.round((totals.indirect.total / totalAmount) * 100) : 0,
                          color: '#10b981'
                        },
                        { 
                          type: 'operational', 
                          label: 'Dépenses Opérationnelles', 
                          amount: totals.operational.total,
                          count: totals.operational.count,
                          percentage: totalAmount > 0 ? Math.round((totals.operational.total / totalAmount) * 100) : 0,
                          color: '#f59e0b'
                        }
                      ];
                    } else {
                      // Mode par catégories
                      const categoryEntries = Object.entries(chartResult.data);
                      totalAmount = categoryEntries.reduce((sum, [, data]) => sum + (data as any).total, 0);
                      
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];
                      
                      legendData = categoryEntries
                        .filter(([, data]) => (data as any).total > 0)
                        .sort(([, a], [, b]) => (b as any).total - (a as any).total) // Trier par montant décroissant
                        .map(([key, data], index) => ({
                          type: key,
                          label: (data as any).name,
                          amount: (data as any).total,
                          count: (data as any).count,
                          percentage: totalAmount > 0 ? Math.round(((data as any).total / totalAmount) * 100) : 0,
                          color: colors[index % colors.length]
                        }));
                    }

                    return legendData.map((item) => (
                      <div key={item.type} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <div>
                            <div className="font-medium text-sm">{item.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.count} dépense{item.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm">
                            {item.amount.toLocaleString('fr-FR', { 
                              minimumFractionDigits: 0, 
                              maximumFractionDigits: 0, 
                              useGrouping: true 
                            })} FCFA
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.percentage}%
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Liste des dépenses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Historique des Dépenses</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {getFilteredExpenses.length} résultat{getFilteredExpenses.length > 1 ? 's' : ''}
                </div>
              </div>
            </CardHeader>
            <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={`skeleton-${i}`} className="border-l-4 border-l-primary animate-pulse">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : getFilteredExpenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {filteredExpenses.length === 0 ? 'Aucune dépense enregistrée' : 'Aucune dépense ne correspond aux critères de recherche'}
            </div>
          ) : (
            <div>
              <div className="mb-4 text-sm text-muted-foreground">
                Affichage: {getFilteredExpenses.length} / {filteredExpenses.length} • Encore ? {hasMore ? 'Oui' : 'Non'}
              </div>
              <div 
                ref={listScrollRef}
                className="space-y-3 max-h-[600px] overflow-y-auto"
              >
              {getFilteredExpenses.map(expense => (
                <Card key={expense.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{expense.name}</h3>
                          <Badge variant="outline">{getExpenseTypeLabel(expense.type)}</Badge>
                        </div>

                        <p className="text-xl sm:text-2xl font-bold text-blue-600">
                          {Number(expense.amount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })} FCFA
                        </p>

                        <p className="text-sm text-muted-foreground truncate">
                          {new Date(expense.date).toLocaleString('fr-FR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {expense.description && ` • ${expense.description}`}
                        </p>

                        {expense.type === 'direct' && expense.directProduct && (
                          <div className="text-sm">
                            <span className="font-medium">Produit:</span> {getProductName(expense.directProduct.productId)}
                          </div>
                        )}

                        {(expense.type === 'indirect' || expense.type === 'operational') && expense.categoryId && (
                          <div className="text-sm">
                            <span className="font-medium">Catégorie:</span> {getCategoryName(expense.categoryId)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-start sm:items-end sm:justify-end">
                        <div className="text-sm text-muted-foreground text-left sm:text-right mr-4">
                          <div>Ajouté le {new Date(expense.createdAt).toLocaleDateString('fr-FR')}</div>
                        </div>
                        {user?.role === 'admin' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditExpense(expense)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteExpense(expense.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {loadingMore && (
                <div className="text-center py-4">
                  <div className="text-sm text-muted-foreground">Chargement...</div>
                </div>
              )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>

    {user?.role === 'admin' && (
      <TabsContent value="categories" className="space-y-6">
        <CategoryManagement 
          expenseCategories={expenseCategories}
          onCategoriesChange={loadData}
          storeId={user?.storeId || ''}
          products={products}
        />
      </TabsContent>
    )}
  </Tabs>
    </div>
  );
}

// Composant pour gérer les catégories de dépenses
interface CategoryManagementProps {
  expenseCategories: ExpenseCategory[];
  onCategoriesChange: () => void;
  storeId: string;
  products: Product[];
}

function CategoryManagement({ expenseCategories, onCategoriesChange, storeId, products }: CategoryManagementProps) {
  const { isBackendReachable } = useNetwork();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [formData, setFormData] = useState<{
    name: string;
    type: 'indirect' | 'operational';
    description: string;
    productIds: string[];
  }>({
    name: '',
    type: 'indirect',
    description: '',
    productIds: [],
  });


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (catSubmitting) return; // prevent double submit
    setCatSubmitting(true);
    try {
      const db = await getDB();
      if (editingCategory) {
        // Modification locale
        const updatedCategory = {
          ...editingCategory,
          name: formData.name,
          type: formData.type,
          description: formData.description,
          productIds: formData.type === 'indirect' ? formData.productIds : [],
        };
        await db.put('expenseCategories', updatedCategory);
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php',
          method: 'PUT',
          data: updatedCategory
        });
        toast.success('Catégorie modifiée localement. La synchronisation se fera automatiquement.');
      } else {
        // Création locale
        const newCategory = {
          id: generateId(),
          name: formData.name,
          type: formData.type,
          description: formData.description,
          productIds: formData.type === 'indirect' ? formData.productIds : [],
          storeId,
          active: true,
          createdAt: Date.now(),
        };
        await db.add('expenseCategories', newCategory);
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php',
          method: 'POST',
          data: newCategory
        });
        toast.success('Catégorie ajoutée localement. La synchronisation se fera automatiquement.');
      }
      // Reset form
      setFormData({ name: '', type: 'indirect', description: '', productIds: [] });
      setShowAddDialog(false);
      setEditingCategory(null);
      onCategoriesChange();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setCatSubmitting(false);
    }
  };

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      description: category.description || '',
      productIds: category.productIds || [],
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie ?')) return;
    try {
      const db = await getDB();
      await db.delete('expenseCategories', categoryId);
      await performSyncOp({
        url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php?id=${categoryId}`,
        method: 'DELETE',
        data: { id: categoryId }
      });
      toast.success('Catégorie supprimée localement. La synchronisation se fera automatiquement.');
      onCategoriesChange();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
      console.error('Erreur:', error);
    }
  };

  const getFilteredCategories = (type: 'indirect' | 'operational') => {
    let filtered = expenseCategories.filter(c => c.type === type);
    
    if (categorySearch.trim()) {
      const query = categorySearch.toLowerCase();
      filtered = filtered.filter(category => 
        category.name.toLowerCase().includes(query) ||
        (category.description && category.description.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  };

  const indirectCategories = getFilteredCategories('indirect');
  const operationalCategories = getFilteredCategories('operational');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestion des Catégories</h2>
          <p className="text-muted-foreground">Gérez les catégories prédéfinies pour les dépenses indirectes et opérationnelles</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setEditingCategory(null);
            setFormData({ name: '', type: 'indirect', description: '', productIds: [] });
          }
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle Catégorie
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="categoryName">Nom de la catégorie</Label>
                <Input
                  id="categoryName"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Huile de cuisson, Électricité..."
                  required
                />
              </div>
              <div>
                <Label htmlFor="categoryType">Type</Label>
                <Select value={formData.type} onValueChange={(value: 'indirect' | 'operational') => 
                  setFormData(prev => ({ ...prev, type: value, productIds: value === 'indirect' ? prev.productIds : [] }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indirect">Indirecte (liée à plusieurs produits)</SelectItem>
                    <SelectItem value="operational">Opérationnelle (charges fixes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === 'indirect' && products && products.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Produits concernés</Label>
                  <ScrollArea className="h-32 w-full rounded border p-3">
                    <div className="space-y-2">
                      {products.map(product => (
                        <div key={product.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`product-${product.id}`}
                            checked={formData.productIds.includes(product.id)}
                            onChange={e => {
                              setFormData(prev => ({
                                ...prev,
                                productIds: e.target.checked
                                  ? [...prev.productIds, product.id]
                                  : prev.productIds.filter(id => id !== product.id)
                              }));
                            }}
                            className="rounded border-gray-300"
                          />
                          <label
                            htmlFor={`product-${product.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {product.name} ({product.unit})
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez les produits affectés par cette dépense indirecte
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="categoryDescription">Description (optionnelle)</Label>
                <Textarea
                  id="categoryDescription"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description de la catégorie..."
                />
              </div>
              
                <div className="flex gap-2 justify-center sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} disabled={catSubmitting} className="w-1/2">
                  Annuler
                </Button>
                <Button type="submit" disabled={catSubmitting} className="w-1/2">
                  {catSubmitting ? 'Traitement...' : (editingCategory ? 'Modifier' : 'Ajouter')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barre de recherche pour les catégories */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Rechercher une catégorie par nom ou description..."
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="flex-1"
            />
            {categorySearch && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCategorySearch('')}
              >
                Effacer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {/* Catégories Indirectes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Dépenses Indirectes ({indirectCategories.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {indirectCategories.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune catégorie indirecte définie
              </p>
            ) : (
              <div className="grid gap-3">
                {indirectCategories.map(category => (
                  <div key={category.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{category.name}</h3>
                      {category.description && (
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                        Modifier
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(category.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Catégories Opérationnelles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Dépenses Opérationnelles ({operationalCategories.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {operationalCategories.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune catégorie opérationnelle définie
              </p>
            ) : (
              <div className="grid gap-3">
                {operationalCategories.map(category => (
                  <div key={category.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{category.name}</h3>
                      {category.description && (
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                        Modifier
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(category.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}