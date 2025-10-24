import { useEffect, useState, useRef } from 'react';
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
import { Plus, Receipt, Package, Settings, Trash2, Eye, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

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
  const { isOnline, manualSync } = useNetwork();
  const [activeTab, setActiveTab] = useState('list');
  const [expenseType, setExpenseType] = useState<'direct' | 'indirect' | 'operational'>('direct');
  const [products, setProducts] = useState<Product[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseAdvanced[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  // Form states
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 16), // Format YYYY-MM-DDTHH:mm
    directProductId: '',
    directProductQuantity: '',
    categoryId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      // Toujours charger depuis le backend si en ligne
      if (isOnline) {
        try {
          // Produits
          let productsUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php';
          if (user?.storeId) productsUrl += `?storeId=${user.storeId}`;
          const productsResponse = await fetch(productsUrl);
          if (productsResponse.ok) {
            const backendProducts = await productsResponse.json();
            // Filtrer les produits pour ne garder que ceux du magasin de l'utilisateur
            const filteredBackendProducts = user?.storeId
              ? backendProducts.filter((p: any) => (
                  (p.storeId && p.storeId === user.storeId) ||
                  (p.stock && Object.keys(p.stock || {}).includes(user.storeId))
                ))
              : backendProducts;
            setProducts(filteredBackendProducts);
            // Stocker en local
            const tx = db.transaction('products', 'readwrite');
            await tx.store.clear();
            for (const p of backendProducts) await tx.store.put(p);
            await tx.done;
          }
          // Catégories de dépenses
          let categoriesUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php';
          if (user?.storeId) categoriesUrl += `?storeId=${user.storeId}`;
          const categoriesResponse = await fetch(categoriesUrl);
          if (categoriesResponse.ok) {
            const backendCategories = await categoriesResponse.json();
            const filteredBackendCategories = user?.storeId
              ? backendCategories.filter((c: any) => c.storeId === user.storeId && c.active)
              : backendCategories.filter((c: any) => c.active);
            setExpenseCategories(filteredBackendCategories);
            const tx = db.transaction('expenseCategories', 'readwrite');
            await tx.store.clear();
            for (const c of backendCategories) await tx.store.put(c);
            await tx.done;
          }
          // Dépenses
          let expensesAdvancedUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php';
          if (user?.storeId) expensesAdvancedUrl += `?storeId=${user.storeId}`;
          const expensesResponse = await fetch(expensesAdvancedUrl);
          if (expensesResponse.ok) {
            const backendExpenses = await expensesResponse.json();
            const tx = db.transaction('expensesAdvanced', 'readwrite');
            await tx.store.clear();
            for (const e of backendExpenses) await tx.store.put(e);
            await tx.done;
            // reset pagination and load first page
            setLoadedCount(0);
            setHasMore(true);
            await loadExpensesPage(db, 0, pageSize, true);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          toast.error('Erreur de connexion au serveur, chargement des données locales');
          await loadFromLocal(db);
        }
      } else {
        // Hors ligne : charger depuis la base locale (paged)
        toast.error('Mode hors ligne : chargement des données locales');
        await loadExpensesPage(db, 0, pageSize, true);
      }
      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount(db);
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
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
    
    // Load expenses paged
    await loadExpensesPage(db, 0, pageSize, true);
  };

  const loadExpensesPage = async (db: any, offset: number, limit: number, reset = false) => {
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
      console.error('Erreur chargement paginé dépenses:', e);
      const all = await db.getAll('expensesAdvanced');
      const filtered = user?.storeId ? all.filter((e: any) => e.storeId === user.storeId) : all;
      filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);
      const page = filtered.slice(offset, offset + limit);
      if (reset) setExpenses(page); else setExpenses(prev => [...prev, ...page]);
      setHasMore(page.length === limit);
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
        await loadExpensesPage(db, loadedCount, pageSize, false);
      } catch (e) {
        console.error('Erreur page dépenses suivante:', e);
      } finally {
        setLoadingMore(false);
      }
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
        const selectedProduct = products.find(p => p.id === formData.directProductId);
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
        
        // Mise à jour du stock si produit géré en stock
        if (isStockProduct && user?.storeId) {
          const newStock = (selectedProduct.stock[user.storeId] || 0) + qty;
          const updatedProduct = {
            ...selectedProduct,
            stock: {
              ...selectedProduct.stock,
              [user.storeId]: newStock,
            },
            createdAt: selectedProduct.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          };
          await db.put('products', updatedProduct);
          
          // Mettre à jour le stock dans le backend si en ligne
          if (isOnline) {
            try {
              // Préparer les données pour l'API backend (format attendu par products.php)
              const productDataForBackend = {
                ...updatedProduct,
                stock: newStock, // Envoyer le stock comme un nombre simple
                trackStock: true // S'assurer que trackStock est activé
              };
              
              const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(productDataForBackend)
              });
              
              if (!response.ok) {
                throw new Error(`Erreur backend: ${response.status}`);
              }
            } catch (error) {
              console.error('Erreur lors de la mise à jour du stock dans le backend:', error);
              // Ajouter la mise à jour du stock à la queue de synchronisation
              const productDataForBackend = {
                ...updatedProduct,
                stock: newStock,
                trackStock: true
              };
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
            // Hors ligne : ajouter la mise à jour du stock à la queue de synchronisation
            const productDataForBackend = {
              ...updatedProduct,
              stock: newStock,
              trackStock: true
            };
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
      } else {
        expense = {
          ...baseExpense,
          categoryId: formData.categoryId,
        };
      }
      
      // Sauvegarder localement d'abord
      await db.add('expensesAdvanced', expense);
      // Synchroniser ou mettre en file avec performSyncOp
      await performSyncOp({
        url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php',
        method: 'POST',
        data: expense
      });
      toast.success('Dépense enregistrée localement. La synchronisation se fera automatiquement.');
      
      // Reset form
      setFormData({
        amount: '',
        description: '',
        date: new Date().toISOString().slice(0, 16),
        directProductId: '',
        directProductQuantity: '',
        categoryId: '',
      });
      setShowAddDialog(false);
      loadData();
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

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Produit inconnu';
  };

  const getCategoryName = (categoryId: string) => {
    const category = expenseCategories.find(c => c.id === categoryId);
    return category ? category.name : 'Catégorie inconnue';
  };

  const getFilteredCategories = () => {
    return expenseCategories.filter(c => c.type === expenseType);
  };

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

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || !formData.amount || 
                    (expenseType === 'direct' && !formData.directProductId) ||
                    ((expenseType === 'indirect' || expenseType === 'operational') && !formData.categoryId)
                  }
                >
                  {loading ? 'Ajout...' : 'Ajouter la dépense'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
          {/* Liste des dépenses */}
          <Card>
            <CardHeader>
              <CardTitle>Historique des Dépenses</CardTitle>
            </CardHeader>
            <CardContent>
          {loading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune dépense enregistrée
            </div>
          ) : (
            <div className="space-y-3" ref={listScrollRef} onScroll={handleListScroll}>
              {expenses.map(expense => (
                <Card key={expense.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{expense.name}</h3>
                          <Badge variant="outline">
                            {getExpenseTypeLabel(expense.type)}
                          </Badge>
                          {/* Removed operationalType badge as it does not exist on ExpenseAdvanced */}
                        </div>
                        
                        <p className="text-2xl font-bold text-primary">
                          {expense.amount.toLocaleString()} FCFA
                        </p>
                        
                        <p className="text-sm text-muted-foreground">
                          {new Date(expense.date).toLocaleString('fr-FR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {expense.description && ` • ${expense.description}`}
                        </p>
                        
                        {/* Détails selon le type */}
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
                      
                      <div className="text-right text-sm text-muted-foreground">
                        Ajouté le {new Date(expense.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {loadingMore && (
                <div className="text-center py-4 text-sm text-muted-foreground">Chargement...</div>
              )}
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
  const { isOnline } = useNetwork();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
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

  const indirectCategories = expenseCategories.filter(c => c.type === 'indirect');
  const operationalCategories = expenseCategories.filter(c => c.type === 'operational');

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
              
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingCategory ? 'Modifier' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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