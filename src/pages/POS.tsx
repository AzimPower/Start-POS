import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Trash2, Plus, Minus, DollarSign, ShoppingCart, X, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Receipt from '@/components/Receipt';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';

interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice?: number;
  variablePrices?: Array<{ label: string; price: number }>;
  taxRate?: number;
  stock?: { [storeId: string]: number };
  unit: string;
  imageUrl?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  balance: number;
  createdAt: number;
  storeId: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  priceLabel?: string; // Pour identifier le prix variable sélectionné
}

export default function POS() {
  const [showDraftCommentDialog, setShowDraftCommentDialog] = useState(false);
  const [draftComment, setDraftComment] = useState('');
  // Formatage pour affichage simple (sans décimales)
  function formatMoneyDisplay(value: number | string) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    return Math.round(num).toLocaleString('fr-FR').replace(/,/g, ' ');
  }
  // Formate un nombre avec espace entre les milliers
  function formatNumberWithSpaces(value: string) {
    // Ne garder que la partie entière
    const num = value.replace(/\D/g, "");
    if (!num) return "";
    return parseInt(num, 10).toLocaleString('fr-FR').replace(/,/g, ' ');
  }
  const [showCartOnMobile, setShowCartOnMobile] = useState(false);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [draftSales, setDraftSales] = useState<any[]>([]);
  const [editingDraft, setEditingDraft] = useState<any>(null);
  const [categories, setCategories] = useState<{ id: string, name: string, storeId: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showClientList, setShowClientList] = useState(false);
  // Option admin : gestion monnaie client
  const [trackCustomerChange, setTrackCustomerChange] = useState(() => {
    const saved = localStorage.getItem('trackCustomerChange');
    return saved === 'true';
  });
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('none');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false);
  const [stockWarning, setStockWarning] = useState<{ open: boolean, products: string[] }>({ open: false, products: [] });
  const [customPriceDialog, setCustomPriceDialog] = useState<{ open: boolean, product: Product | null }>({ open: false, product: null });
  const [variablePriceDialog, setVariablePriceDialog] = useState<{ open: boolean, product: Product | null }>({ open: false, product: null });
  const [customPrice, setCustomPrice] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isBackendReachable, manualSync } = useNetwork();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [activeShift, setActiveShift] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const clientInputRef = useRef<HTMLInputElement | null>(null);
  const [clientInputReadOnly, setClientInputReadOnly] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money' | 'mixed'>('cash');
  const [cashAmount, setCashAmount] = useState('');
  const [mobileAmount, setMobileAmount] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [productSalesCount, setProductSalesCount] = useState<{ [productId: string]: number }>({});
  const [loading, setLoading] = useState(false);
  const [shiftsChecked, setShiftsChecked] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const loadedOnceRef = useRef(false);
  // Helper to close any open modal/panels in the POS page
  const closeAllModals = () => {
    try {
      setShowPayment(false);
      setShowDraftPanel(false);
      setShowDraftCommentDialog(false);
      setShowClientList(false);
      setVariablePriceDialog({ open: false, product: null });
      setCustomPriceDialog({ open: false, product: null });
      setShowCartOnMobile(false);
      // keep receipt open state managed by caller; do not force-close showReceipt here
    } catch (e) {
      // ignore
    }
  };

  // Montant espèces par défaut = montant total
  useEffect(() => {
    if (showPayment && paymentMethod === 'cash') {
      setCashAmount(calculateTotal().toFixed(0));
    }
    if (showPayment && paymentMethod === 'mobile_money') {
      setMobileAmount(calculateTotal().toFixed(0));
    }
    if (showPayment && paymentMethod === 'mixed') {
      // Si aucun montant, initialiser espèces au total
      if (!cashAmount && !mobileAmount) {
        setCashAmount(calculateTotal().toFixed(0));
        setMobileAmount('');
      }
    }
  }, [showPayment, paymentMethod]);

  useEffect(() => {
    // Only load data when we have a logged-in user. Avoid reloading on every
    // navigation: use loadedOnceRef to load only once per session. If the app
    // goes offline -> backend reachable, reload to sync changes.
    if (!user) return;

    const shouldReload = !loadedOnceRef.current || isBackendReachable;
    if (!shouldReload) return;

    // If we're reloading due to going backend reachable, allow it. If first load, set flag.
    loadData();
    loadCategories();
    loadDraftSales();
    loadedOnceRef.current = true;
  }, [user, isBackendReachable]);

  // When payment dialog opens, keep client input readonly to avoid automatic
  // focusing/keyboard on mobile. It will be enabled when the user explicitly
  // touches/clicks the field.
  useEffect(() => {
    if (showPayment) {
      setClientInputReadOnly(true);
    }
  }, [showPayment]);

    const loadDraftSales = async () => {
      const db = await getDB();
      const allSales = await db.getAll('sales');
      const drafts = allSales.filter(s => s.draft && s.storeId === user?.storeId);
      setDraftSales(drafts);
    };

    const loadCategories = async () => {
      const db = await getDB();
      const cats = await db.getAll('categories');
      // Filtrer les catégories selon la boutique courante
      // Normalise les catégories pour inclure storeId
      const normalizedCats = cats.map(cat => ({
        ...cat,
        storeId: (cat as any).storeId || ''
      }));
      let filteredCats = normalizedCats;
      if (user?.storeId) {
        filteredCats = normalizedCats.filter(cat => cat.storeId === user.storeId);
      }
      setCategories(filteredCats);
    };

  const loadData = async () => {
    setShiftsChecked(false);
    setLoading(true);
  try {
      const db = await getDB();
      // If local DB seems empty (user deleted it), and we're online, fetch all
      // main tables from backend to repopulate the local DB before using it.
    if (isBackendReachable) {
        try {
          const productsCount = await db.count('products');
          const customersCount = await db.count('customers');
          const salesCount = await db.count('sales');
          const shiftsCount = await db.count('shifts');
          if (productsCount === 0 || customersCount === 0 || salesCount === 0 || shiftsCount === 0) {
              const { refreshAllFromBackend } = await import('@/lib/sync');
              const maybeRefresher = await refreshAllFromBackend();
              if (typeof maybeRefresher === 'function') {
                await maybeRefresher(user?.storeId);
              }
          }
        } catch (e) {
          console.warn('Erreur lors du remplissage initial depuis le backend:', e);
        }
      }
      // 1. Charger et afficher les données locales immédiatement
      await loadFromLocal(db);
      await loadLocalData(db);
      await updatePendingSyncCount();

  // 2. Synchroniser en arrière-plan si backend reachable
  if (isBackendReachable) {
        // Afficher un indicateur de synchronisation si besoin
        setLoading(true);
        try {
          // Produits
          let productsUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php';
          if (user?.storeId) productsUrl += `?storeId=${user.storeId}`;
          const productsResponse = await fetch(productsUrl);
          if (productsResponse.ok) {
            const backendProducts = await productsResponse.json();
            const normalizedBackendProducts = backendProducts.map((p: any) => ({ ...p, stock: p.stock || {} }));
            const tx = db.transaction('products', 'readwrite');
            await Promise.all([
              ...normalizedBackendProducts.map((p: any) => tx.store.put(p)),
              tx.done
            ]);
            // Ne pas afficher tous les produits backend : filtrer pour la boutique
            const uid = user?.storeId;
            const filteredBackendProducts = normalizedBackendProducts.filter((p: any) => {
              if (uid && p.storeId && p.storeId === uid) return true;
              if (uid && p.stock && Object.prototype.hasOwnProperty.call(p.stock, uid)) return true;
              return false;
            });
            setProducts(filteredBackendProducts);
          }
          // Clients
          let customersUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php';
          if (user?.storeId) customersUrl += `?storeId=${user.storeId}`;
          const customersResponse = await fetch(customersUrl);
          if (customersResponse.ok) {
            const backendCustomers = await customersResponse.json();
            const tx = db.transaction('customers', 'readwrite');
            await Promise.all([
              ...backendCustomers.map(c => tx.store.put(c)),
              tx.done
            ]);
            const filteredBackendCustomers = backendCustomers.filter((c: any) => !user?.storeId || c.storeId === user.storeId);
            setCustomers(filteredBackendCustomers);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
        }
        setLoading(false);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
      console.error('Erreur:', error);
    } finally {
      // Ensure loading is cleared regardless of online/offline and errors.
      setLoading(false);
    }
  };

  const loadFromLocal = async (db: any) => {
    // Load products
  const productsData = await db.getAll('products');
  // Ensure stock is always an object to avoid calling Object.keys on null
  const productsWithStock = productsData.map((p: any) => ({ ...p, stock: p.stock || {} }));
  let filteredProducts = productsWithStock;
  if (user?.storeId) {
    // Garder les produits qui appartiennent explicitement à la boutique
    // ou qui ont un suivi de stock pour cette boutique
    filteredProducts = productsWithStock.filter((p: any) => {
      if (p.storeId && p.storeId === user.storeId) return true;
      if (p.stock && Object.prototype.hasOwnProperty.call(p.stock, user.storeId)) return true;
      return false;
    });
  }
  setProducts(filteredProducts);

    // Load customers
    const customersData = await db.getAll('customers') as Customer[];
    let filteredCustomers = customersData;
    if (user?.storeId) {
      filteredCustomers = customersData.filter(c => c.storeId === user.storeId);
    }
    setCustomers(filteredCustomers);
  };

  const loadLocalData = async (db: any) => {
    // Récupérer les ventes pour chaque produit
    const allSales = await db.getAll('sales');
    const salesCount: { [productId: string]: number } = {};
    for (const sale of allSales) {
      if (sale.storeId !== user?.storeId) continue;
      for (const item of sale.items) {
        salesCount[item.productId] = (salesCount[item.productId] || 0) + item.quantity;
      }
    }
    setProductSalesCount(salesCount);

    // Check for active shift - filter by both userId and storeId
    const shifts = await db.getAllFromIndex('shifts', 'by-status', 'open');
    const userShift = shifts.find(s => s.userId === user?.id && s.storeId === user?.storeId);
    setActiveShift(userShift);
  // Indicate that we've finished checking for shifts (used to avoid flashing the
  // "no active shift" message before the DB/backend check completes)
  setShiftsChecked(true);

    // Load current store
    if (user?.storeId) {
      const store = await db.get('stores', user.storeId);
      setCurrentStore(store);
    }
  };

  // Use centralized pending count from sync module to avoid duplicating queue logic
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

  const filteredProducts = products
    .filter(p => {
      if (selectedCategory === 'all') return true;
      return (p as any).categoryId === selectedCategory;
    })
    .filter(p => {
      // Recherche produit uniquement avec 'search', pas 'clientSearch'
      return (
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => (productSalesCount[b.id] || 0) - (productSalesCount[a.id] || 0));

  const addToCart = (product: Product) => {
    // Si le produit a des prix variables, ouvrir le dialog de sélection
    if (product.variablePrices && product.variablePrices.length > 0) {
      setVariablePriceDialog({ open: true, product });
      return;
    }
    
    // Si pas de prix fixe et pas de prix variables, ouvrir le dialog de prix custom
    if (product.salePrice === undefined || product.salePrice === null || isNaN(Number(product.salePrice)) || Number(product.salePrice) <= 0) {
      setCustomPriceDialog({ open: true, product });
      setCustomPrice('');
      return;
    }
    
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: string, priceLabel: string | undefined, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId && item.priceLabel === priceLabel) {
        const newQuantity = item.quantity + delta;
        return { ...item, quantity: Math.max(0, newQuantity) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string, priceLabel: string | undefined) => {
    setCart(cart.filter(item => !(item.product.id === productId && item.priceLabel === priceLabel)));
  };

  const clearCart = () => {
    setCart([]);
    toast.success('Panier vidé');
    try { closeAllModals(); } catch (e) {}
    try { navigate('/pos'); } catch (e) {}
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => {
      const price = (item.product.salePrice !== undefined && item.product.salePrice !== null && !isNaN(Number(item.product.salePrice))) ? Number(item.product.salePrice) : 0;
      const taxRate = (typeof item.product.taxRate === 'number' && !isNaN(item.product.taxRate)) ? item.product.taxRate : 0;
      const itemTotal = price * item.quantity;
      const tax = itemTotal * (taxRate / 100);
      return sum + itemTotal + tax;
    }, 0);
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => {
      const price = (item.product.salePrice !== undefined && item.product.salePrice !== null && !isNaN(Number(item.product.salePrice))) ? Number(item.product.salePrice) : 0;
      return sum + (price * item.quantity);
    }, 0);
  };

  const calculateTax = () => {
    return cart.reduce((sum, item) => {
      const price = (item.product.salePrice !== undefined && item.product.salePrice !== null && !isNaN(Number(item.product.salePrice))) ? Number(item.product.salePrice) : 0;
      const taxRate = (typeof item.product.taxRate === 'number' && !isNaN(item.product.taxRate)) ? item.product.taxRate : 0;
      const itemTotal = price * item.quantity;
      return sum + (itemTotal * (taxRate / 100));
    }, 0);
  };

  const handleCheckout = () => {
    if (!user) {
      toast.error('Session verrouillée — veuillez entrer le PIN');
      return;
    }
    if (!activeShift) {
      toast.error('Veuillez ouvrir un shift avant de faire une vente');
      return;
    }
    if (cart.length === 0) {
      toast.error('Le panier est vide');
      return;
    }
    // Vérification du stock négatif - seulement pour les produits avec suivi configuré
    const stockIssues = cart.filter(item => {
      // Vérifier si le produit a un suivi de stock configuré pour ce magasin
      const sid = user?.storeId;
      if (item.product.stock && sid && Object.prototype.hasOwnProperty.call(item.product.stock, sid)) {
        const stock = item.product.stock[sid] || 0;
        return stock - item.quantity < 0;
      }
      // Si pas de suivi configuré, pas de problème de stock
      return false;
    });
    if (stockIssues.length > 0) {
      const names = stockIssues.map(item => item.product.name);
      setStockWarning({ open: true, products: names });
      return;
    }
    setShowPayment(true);
  };

  const processSale = async (opts?: { draft?: boolean, draftId?: string, comment?: string }) => {
    if (!user) {
      toast.error('Session verrouillée — veuillez entrer le PIN');
      return;
    }
    if (!activeShift) return;

    const total = calculateTotal();
    const paidAmount = paymentMethod === 'mixed'
      ? (parseFloat(cashAmount) || 0) + (parseFloat(mobileAmount) || 0)
      : paymentMethod === 'cash'
      ? parseFloat(cashAmount) || 0
      : parseFloat(mobileAmount) || 0;

    if (paidAmount < total) {
      toast.error('Montant insuffisant');
      return;
    }

    const db = await getDB();

    try {
      setLoading(true);
      // Create sale
      const sale = {
        id: opts?.draftId || generateId(),
        shiftId: activeShift.id,
        userId: user!.id,
        storeId: user!.storeId,
        customerId: selectedCustomerId === 'none' ? null : selectedCustomerId,
        items: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.product.salePrice) || 0,
          tax: (Number(item.product.salePrice) || 0) * item.quantity * ((item.product.taxRate || 0) / 100),
          total: (Number(item.product.salePrice) || 0) * item.quantity * (1 + ((item.product.taxRate || 0) / 100)),
        })),
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: total,
        paymentMethod,
        // Montants détaillés par mode de paiement
        cashAmount: paymentMethod === 'cash' ? paidAmount : 
                   paymentMethod === 'mixed' ? (parseFloat(cashAmount) || 0) : 0,
        mobileMoneyAmount: paymentMethod === 'mobile_money' ? paidAmount : 
                          paymentMethod === 'mixed' ? (parseFloat(mobileAmount) || 0) : 0,
        otherAmount: 0, // Pour les futurs modes de paiement (carte, chèque, etc.)
        payments: paymentMethod === 'mixed'
          ? [
              { method: 'cash' as const, amount: parseFloat(cashAmount) || 0 },
              { method: 'mobile_money' as const, amount: parseFloat(mobileAmount) || 0 },
            ]
          : [{ method: paymentMethod, amount: paidAmount }],
        createdAt: Date.now(),
        draft: opts?.draft || false,
        completedAt: !opts?.draft ? Date.now() : undefined,
        draftComment: opts?.comment || '',
      };

      if (opts?.draft) {
        await db.put('sales', sale);
        toast.success('Vente enregistrée en brouillon');
        setCart([]);
        setCashAmount('');
        setMobileAmount('');
        setPaymentMethod('cash');
        loadDraftSales();
        // Close any open modals and redirect to POS main view
        try { closeAllModals(); } catch (e) {}
        try { navigate('/pos'); } catch (e) {}
        return;
      } else {
        await db.put('sales', sale);
      }

      // Update stock - seulement pour les produits avec suivi de stock configuré
      const productsToUpdate = [];
      for (const item of cart) {
        const product = await db.get('products', item.product.id);
        if (product) {
          // Vérifier si le produit a un suivi de stock configuré pour ce magasin
          if (product.stock && user!.storeId in product.stock) {
            // Le produit a déjà un suivi de stock pour ce magasin, on met à jour
            product.stock[user!.storeId] = (product.stock[user!.storeId] || 0) - item.quantity;
            await db.put('products', product);
            productsToUpdate.push(product);
          }
          // Si le produit n'a pas de suivi configuré (stock vide ou pas de storeId), on ne fait rien
        }
      }

  // Si backend reachable, synchroniser immédiatement avec le backend
  if (isBackendReachable) {
        try {
          // Synchroniser la vente
          const salesResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sale)
          });

          if (!salesResponse.ok) {
            throw new Error(`Erreur backend vente: ${salesResponse.status}`);
          }

          // Synchroniser les mises à jour de stock
          for (const product of productsToUpdate) {
            const productDataForBackend = {
              ...product,
              stock: product.stock[user!.storeId],
              trackStock: true
            };
            
            await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(productDataForBackend)
            });
          }

        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Queue sale sync via performSyncOp (will queue if offline)
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php',
            method: 'POST',
            data: sale,
          });

          // Queue product stock updates via performSyncOp
          for (const product of productsToUpdate) {
            const productDataForBackend = {
              ...product,
              stock: product.stock[user!.storeId],
              trackStock: true
            };
            await performSyncOp({
              url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
              method: 'PUT',
              data: productDataForBackend,
            });
          }
        }
      } else {
        // Hors ligne: queue sale and product updates via performSyncOp
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php',
          method: 'POST',
          data: sale,
        });
        for (const product of productsToUpdate) {
          const productDataForBackend = {
            ...product,
            stock: product.stock[user!.storeId],
            trackStock: true
          };
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
            method: 'PUT',
            data: productDataForBackend,
          });
        }
      }

      // Prepare receipt data
      // Prépare les montants par mode de paiement
      let paymentDetails: { label: string, amount: number }[] = [];
      if (sale.paymentMethod === 'mixed') {
        paymentDetails = [
          { label: 'Especes', amount: sale.payments.find((p: any) => p.method === 'cash')?.amount || 0 },
          { label: 'Mobile Money', amount: sale.payments.find((p: any) => p.method === 'mobile_money')?.amount || 0 }
        ];
      } else if (sale.paymentMethod === 'cash') {
        paymentDetails = [
          { label: 'Especes', amount: sale.payments[0]?.amount || 0 }
        ];
      } else if (sale.paymentMethod === 'mobile_money') {
        paymentDetails = [
          { label: 'Mobile Money', amount: sale.payments[0]?.amount || 0 }
        ];
      }

      const receiptData = {
        ...sale,
        receiptNumber: sale.id.substring(0, 8).toUpperCase(),
        storeName: currentStore?.name || 'Magasin',
        storeAddress: currentStore?.address || '',
        items: sale.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
        paymentDetails,
        cashReceived: paidAmount,
        change: paidAmount - total,
        date: new Date(sale.createdAt),
      };

  setLastSale(receiptData);
  const syncMessage = isBackendReachable ? 'Vente validée et synchronisée' : 'Vente validée (mode hors ligne)';
  setCart([]);
  setCashAmount('');
  setMobileAmount('');
  setPaymentMethod('cash');
  loadDraftSales();
  // Close other modals and ensure we are on POS main view; keep receipt visible
  try { closeAllModals(); } catch (e) {}
  try { navigate('/pos'); } catch (e) {}
  setShowReceipt(true);
  // Try to print automatically on native devices. We will build HTML from
  // a temporary element similar to the Receipt content and try native print
  // via Cordova, otherwise fallback to the browser print window.
  try {
    const autoPrintSetting = localStorage.getItem('auto_print');
    const autoPrint = autoPrintSetting === null ? true : autoPrintSetting === 'true';
    if (!autoPrint) {
      // Auto-print disabled in settings
      return;
    }
    // Build a plain-text receipt (consistent format) and send via native print
    try {
      const lines: string[] = [];
      // small helper to center text for plain-text ESC/POS receipts
      const centerText = (s: string, w: number) => {
        const str = (s || '').toString();
        if (str.length >= w) return str;
        const left = Math.floor((w - str.length) / 2);
        return ' '.repeat(left) + str;
      };
      const paper = localStorage.getItem('printer_paper') || '80';
      const width = paper === '58' ? 32 : 48;
      // Center store name and address (bold)
      const headerLine = centerText(receiptData.storeName || 'Magasin', width);
      lines.push('\x1bE\x01' + headerLine + '\x1bE\x00');
      if (receiptData.storeAddress) {
        const addrLine = centerText(receiptData.storeAddress, width);
        lines.push('\x1bE\x01' + addrLine + '\x1bE\x00');
      }
      lines.push('');
      // Date on the left, receipt number on the right (same line)
      const dateText = receiptData.date ? new Date(receiptData.date).toLocaleString('fr-FR') : new Date(receiptData.createdAt).toLocaleString('fr-FR');
      lines.push(NativePrinter.formatColumns(dateText, `Recu N°: ${receiptData.receiptNumber}`, width));

      lines.push('--------------------------------');
      for (const it of (receiptData.items || [])) {
        const name = it.name || '';
        const qty = it.quantity || 0;
        const price = isNaN(it.price) ? 0 : Math.round(it.price);
        const totalItem = isNaN(it.total) ? qty * price : Math.round(it.total);
        const qtyText = `${qty} x ${price} FCFA`;
        const totalText = `${totalItem} FCFA`;
        const leftFull = (name + ' ' + qtyText).trim();
        if (leftFull.length + 1 + totalText.length <= width) {
          lines.push(NativePrinter.formatColumns(leftFull, totalText, width));
        } else {
          const firstLineLeft = name;
          if (firstLineLeft.length + 1 + totalText.length <= width) {
            lines.push(NativePrinter.formatColumns(firstLineLeft, totalText, width));
            lines.push(NativePrinter.formatColumns(qtyText, '', width));
          } else {
            lines.push(NativePrinter.formatColumns(name, totalText, width));
            lines.push(NativePrinter.formatColumns(qtyText, '', width));
          }
        }
      }
      lines.push('--------------------------------');
  lines.push(NativePrinter.formatColumns('Sous-total:', `${Math.round(receiptData.subtotal || 0)} FCFA`, width));
  lines.push(NativePrinter.formatColumns('TVA:', `${Math.round(receiptData.tax || 0)} FCFA`, width));
  // TOTAL in bold
  const totalLine = NativePrinter.formatColumns('TOTAL:', `${Math.round(receiptData.total || 0)} FCFA`, width);
  lines.push('\x1bE\x01' + totalLine + '\x1bE\x00');
      lines.push('');
      // Payment section: show method and any detailed payment lines in columns
      // Payment method title in bold
      const paymentTitle = NativePrinter.formatColumns('Mode de paiement:', receiptData.paymentMethod || '', width);
      lines.push('\x1bE\x01' + paymentTitle + '\x1bE\x00');
      if (receiptData.paymentDetails && receiptData.paymentDetails.length > 0) {
        for (const p of receiptData.paymentDetails) {
          // payment detail lines — keep normal but could be bold if desired
          lines.push(NativePrinter.formatColumns(p.label + ':', `${Math.round(p.amount)} FCFA`, width));
        }
      } else {
        if (receiptData.cashReceived !== undefined && receiptData.cashReceived !== null) {
          lines.push(NativePrinter.formatColumns('Espèces:', `${Math.round(receiptData.cashReceived)} FCFA`, width));
        }
        if (receiptData.change !== undefined && receiptData.change !== null) {
          lines.push(NativePrinter.formatColumns('Rendu:', `${Math.round(receiptData.change)} FCFA`, width));
        }
      }
      lines.push('');
      lines.push('Merci pour votre visite !');

      let mac: string | undefined = undefined;
      try {
        const s = await (await import('@/lib/secureStorage')).getItem('printer_mac');
        mac = s || localStorage.getItem('printer_mac') || undefined;
      } catch (e) {
        mac = localStorage.getItem('printer_mac') || undefined;
      }
      const ok = await NativePrinter.printText(lines, mac as any);
      if (!ok) {
        toast.error('Impression native indisponible. Veuillez associer une imprimante Bluetooth.');
      }
    } catch (e) {
      console.warn('Auto-text-print failed', e);
      toast.error('Échec impression automatique');
    }
  } catch (err) {
    console.warn('Auto-print failed:', err);
  }
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement de la vente');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // If we haven't finished checking shifts yet, don't render the "no shift"
  // card — return a neutral placeholder to avoid flashing the message. Once
  // shiftsChecked is true we can show the card if there's indeed no active shift.
  if (!shiftsChecked) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[80vh]">
        {/* Intentionally empty while we check for an active shift */}
      </div>
    );
  }

  if (!activeShift) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[80vh]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Aucun shift actif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Vous devez ouvrir un shift avant de pouvoir effectuer des ventes.
            </p>
            <Button
              onClick={() => {
                // Client-side navigation to avoid full page reload which triggers PIN flow
                try { navigate('/shifts'); } catch (e) { window.location.href = '/shifts'; }
              }}
              className="w-full"
            >
              Ouvrir un shift
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
  <div className="h-screen flex flex-col lg:flex-row">
      {/* Products Section */}
      <div className={`flex-1 p-6 space-y-4 overflow-auto ${showCartOnMobile ? 'hidden lg:block' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">Point de vente</h1>

            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Badge variant="secondary">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCartOnMobile(true)}
              >
                <ShoppingCart className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex w-full items-center gap-3">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="min-w-[180px]">
                <SelectValue placeholder="Filtrer par catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {draftSales.length > 0 && (
              <Button
                variant="secondary"
                className="font-bold"
                onClick={() => setShowDraftPanel(true)}
              >
                En attente ({draftSales.length})
              </Button>
            )}
          </div>
        </div>
  <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2">
    {filteredProducts.length === 0 ? (
      <div className="col-span-full text-center text-muted-foreground py-6 text-xs">
        Aucun produit ne correspond à la recherche ou à la catégorie sélectionnée.
      </div>
    ) : (
      filteredProducts.map(product => (
        <Card
          key={product.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => addToCart(product)}
          style={{ minHeight: 140 }}
        >
          <CardContent className="p-2 flex flex-col items-center">
            <img
              src={product.imageUrl ? product.imageUrl : '/placeholder.svg'}
              alt={product.name}
              style={{ width: 60, height: 60, marginBottom: 4, borderRadius: 6, objectFit: 'cover', background: '#f3f4f6' }}
            />
            <h3 className="font-semibold text-sm mb-1 text-center line-clamp-2" style={{ minHeight: 32 }}>{product.name}</h3>
            <p className="text-primary font-bold text-xs mb-1">
              {product.variablePrices && product.variablePrices.length > 0
                ? `${Math.min(...product.variablePrices.map(vp => vp.price))} - ${Math.max(...product.variablePrices.map(vp => vp.price))} FCFA`
                : product.salePrice !== undefined && product.salePrice !== null && !isNaN(Number(product.salePrice)) && Number(product.salePrice) > 0
                ? `${Number(product.salePrice).toFixed(0)} FCFA`
                : <span className="text-red-500">Prix à définir</span>
              }
            </p>
            <p className="text-[10px] text-muted-foreground">
              Stock: {Object.keys(product.stock || {}).length > 0
                ? (user?.storeId ? `${product.stock?.[user.storeId] || 0} ${product.unit}` : <span className="text-muted-foreground text-[10px]">—</span>)
                : <span className="text-muted-foreground text-[10px]">Non suivi</span>
              }
            </p>
          </CardContent>
        </Card>
      ))
    )}
  </div>
      </div>

      {/* Cart Section */}
      <div className={`w-full lg:w-96 bg-card border-l flex flex-col ${showCartOnMobile ? 'block' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="text-xl font-bold">Panier</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowCartOnMobile(false)}
              >
                <X className="w-4 h-4" />
              </Button>
              <Badge variant="secondary">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} article(s)
              </Badge>
              {cart.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCart}
                  title="Vider le panier"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <div style={{ position: 'relative' }}>
                <Button
                  variant="outline"
                  size="sm"
                  style={{ minWidth: 0, padding: '0 8px' }}
                  onClick={() => setShowClientList(v => !v)}
                >
                  {selectedCustomerId !== 'none'
                    ? (() => {
                        const c = customers.find(c => c.id === selectedCustomerId);
                        return c ? c.name : 'Client';
                      })()
                    : 'Client'}
                </Button>
                {showClientList && (
                  <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 220, boxShadow: '0 2px 8px #0001', padding: 8 }}>
                    <input
                      ref={clientInputRef}
                      type="text"
                      placeholder="Rechercher ou ajouter..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      readOnly={clientInputReadOnly}
                      onMouseDown={(e) => {
                        // User interacted with the field via mouse — enable input and focus
                        if (clientInputReadOnly) {
                          e.preventDefault();
                          setClientInputReadOnly(false);
                          // focus next tick
                          setTimeout(() => clientInputRef.current?.focus(), 0);
                        }
                      }}
                      onTouchStart={(e) => {
                        if (clientInputReadOnly) {
                          e.preventDefault();
                          setClientInputReadOnly(false);
                          setTimeout(() => clientInputRef.current?.focus(), 0);
                        }
                      }}
                      style={{ width: '100%', marginBottom: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '1em' }}
                    />
                    {clientSearch.trim().length > 0 && !customers.some(c => c.name.toLowerCase() === clientSearch.trim().toLowerCase()) && (
                      <div style={{ marginBottom: 8 }}>
                                       </div>
                    )}
                    <div
                      className={`cursor-pointer px-3 py-2 hover:bg-muted ${selectedCustomerId === 'none' ? 'bg-muted' : ''}`}
                      onMouseDown={() => {
                        setSelectedCustomerId('none');
                        setShowClientList(false);
                        setClientSearch('');
                      }}
                    >Dissocier</div>
                    {customers.filter(c =>
                      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                      c.phone.replace(/\s|\+226/g, '').includes(clientSearch.replace(/\s|\+226/g, ''))
                    ).map(c => (
                      <div
                        key={c.id}
                        className={`cursor-pointer px-3 py-2 hover:bg-muted ${selectedCustomerId === c.id ? 'bg-muted' : ''}`}
                        onMouseDown={() => {
                          setSelectedCustomerId(c.id);
                          setShowClientList(false);
                          setClientSearch('');
                        }}
                      >{c.name} <span style={{ color: '#888', fontSize: '0.8em', marginLeft: 4 }}>{c.phone}</span></div>
                    ))}
                    {clientSearch.trim().length > 0 && !customers.some(c => c.name.toLowerCase() === clientSearch.trim().toLowerCase()) && (
                      <div className="cursor-pointer px-3 py-2">
                        <Button size="sm" onMouseDown={() => {
                          setNewCustomerName(clientSearch.trim());
                          setNewCustomerPhone('');
                          setShowAddCustomer(true);
                        }}>Ajouter "{clientSearch.trim()}" comme client</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Panier vide</p>
          ) : (
            <div className="space-y-3">
              {cart.map((item, index) => (
                <Card key={`${item.product.id}-${item.priceLabel || 'default'}-${index}`}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-sm">{item.product.name}</h4>
                        {item.priceLabel && (
                          <p className="text-xs text-muted-foreground">({item.priceLabel})</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFromCart(item.product.id, item.priceLabel)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.product.id, item.priceLabel, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          className="w-14 text-center font-medium px-2 py-1"
                          onChange={e => {
                            const val = Math.max(1, Number(e.target.value));
                            setCart(cart.map(ci =>
                              ci.product.id === item.product.id && ci.priceLabel === item.priceLabel
                                ? { ...ci, quantity: val }
                                : ci
                            ));
                          }}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.product.id, item.priceLabel, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="font-bold text-primary">
                        {item.product.salePrice !== undefined && item.product.salePrice !== null && !isNaN(Number(item.product.salePrice)) && Number(item.product.salePrice) > 0
                          ? (Number(item.product.salePrice) * item.quantity).toFixed(0) + ' FCFA'
                          : <span className="text-red-500">Prix à définir</span>
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{formatMoneyDisplay(calculateSubtotal())} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">TVA</span>
              <span>{isNaN(calculateTax()) ? '0' : formatMoneyDisplay(calculateTax())} FCFA</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{isNaN(calculateTotal()) ? '0' : formatMoneyDisplay(calculateTotal())} FCFA</span>
            </div>
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
          >
            <DollarSign className="w-5 h-5 mr-2" />
            {loading ? 'Traitement...' : 'Encaisser'}
          </Button>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaissement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total à payer</p>
              <p className="text-2xl font-bold text-primary">{formatMoneyDisplay(calculateTotal())} FCFA</p>
            </div>

            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <Select value={paymentMethod} onValueChange={(v: any) => {
                setPaymentMethod(v);
                if (v === 'cash') {
                  setCashAmount(calculateTotal().toFixed(0));
                  setMobileAmount('');
                } else if (v === 'mobile_money') {
                  setMobileAmount(calculateTotal().toFixed(0));
                  setCashAmount('');
                } else if (v === 'mixed') {
                  setCashAmount(calculateTotal().toFixed(0));
                  setMobileAmount('');
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="mixed">Mixte</SelectItem>
                </SelectContent>
              </Select>
              {paymentMethod === 'mixed' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label>Espèces</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatNumberWithSpaces(cashAmount)}
                      onChange={e => {
                        const total = calculateTotal();
                        let cash = parseInt(e.target.value.replace(/\s/g, "")) || 0;
                        if (cash < 0) cash = 0;
                        if (cash > total) cash = total;
                        setCashAmount(cash.toString());
                        setMobileAmount((total - cash > 0 ? total - cash : 0).toString());
                      }}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Mobile Money</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatNumberWithSpaces(mobileAmount)}
                      onChange={e => {
                        const total = calculateTotal();
                        let mobile = parseInt(e.target.value.replace(/\s/g, "")) || 0;
                        if (mobile < 0) mobile = 0;
                        if (mobile > total) mobile = total;
                        setMobileAmount(mobile.toString());
                        setCashAmount((total - mobile > 0 ? total - mobile : 0).toString());
                      }}
                      required
                    />
                  </div>
                </div>
              )}
              {paymentMethod === 'cash' && (
                <div className="flex-1">
                  <Label>Montant espèces</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatNumberWithSpaces(cashAmount)}
                    onChange={e => setCashAmount(e.target.value.replace(/\s/g, ""))}
                    required
                  />
                </div>
              )}
              {paymentMethod === 'mobile_money' && (
                <div className="flex-1">
                  <Label>Montant Mobile Money</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatNumberWithSpaces(mobileAmount)}
                    onChange={e => setMobileAmount(e.target.value.replace(/\s/g, ""))}
                    required
                  />
                </div>
              )}
              </div>
            <div className="flex gap-2">
             <Button className="w-full" size="lg" variant="outline" onClick={() => setShowDraftCommentDialog(true)}>
                Enregistrer
              </Button>
             <Button className="w-full" size="lg" onClick={() => processSale()} disabled={loading}>
                {loading ? 'Traitement...' : 'Valider'}
              </Button>

            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Nom</Label>
            <Input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Nom du client" />
            <Label>Téléphone (8 chiffres)</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 12px',
                fontWeight: 'bold',
                color: '#374151',
                fontSize: '1rem',
                minWidth: '60px',
                textAlign: 'center',
              }}>+226</span>
              <Input
                type="tel"
                value={newCustomerPhone}
                onChange={e => setNewCustomerPhone(e.target.value.replace(/[^0-9]/g, '').slice(0,8))}
                placeholder="XXXXXXXX"
                maxLength={8}
                style={{ flex: 1 }}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-1/2" onClick={() => setShowAddCustomer(false)} disabled={addCustomerSubmitting}>Annuler</Button>
              <Button className="w-1/2" disabled={addCustomerSubmitting} onClick={async () => {
                if (addCustomerSubmitting) return;
                setAddCustomerSubmitting(true);
                const name = (newCustomerName || '').trim();
                const phone = (newCustomerPhone || '').trim();
                if (!name) { toast.error('Nom requis'); setAddCustomerSubmitting(false); return; }
                if (!phone || phone.length !== 8) { toast.error('Téléphone: 8 chiffres requis'); setAddCustomerSubmitting(false); return; }
                try {
                  setLoading(true);
                  const db = await getDB();
                  const newCustomer = {
                    id: generateId(),
                    name,
                    phone: `+226 ${phone}`,
                    email: '',
                    address: '',
                    notes: '',
                    balance: 0,
                    createdAt: Date.now(),
                    storeId: user?.storeId || '',
                  };
                  await db.add('customers', newCustomer);
                  if (isBackendReachable) {
                    try {
                      const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCustomer)
                      });
                      if (!response.ok) throw new Error(`Erreur backend: ${response.status}`);
                    } catch (err) {
                      await performSyncOp({ url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', method: 'POST', data: newCustomer });
                    }
                  } else {
                    await performSyncOp({ url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', method: 'POST', data: newCustomer });
                  }
                  setCustomers(await db.getAll('customers'));
                  setSelectedCustomerId(newCustomer.id);
                  setShowAddCustomer(false);
                  setShowClientList(false);
                  setClientSearch('');
                  setNewCustomerPhone('');
                  setNewCustomerName('');
                  toast.success(isBackendReachable ? 'Client ajouté et synchronisé' : 'Client ajouté (mode hors ligne)');
                } catch (err) {
                  console.error('Erreur ajout client', err);
                  toast.error('Erreur lors de l\'ajout du client');
                } finally { setLoading(false); setAddCustomerSubmitting(false); }
              }}>{addCustomerSubmitting ? 'Traitement...' : 'Ajouter'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bouton flottant panier mobile */}
      {!showCartOnMobile && cart.length > 0 && (
        <button
          onClick={() => setShowCartOnMobile(true)}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            zIndex: 50,
            background: '#fff',
            border: '2px solid #e5e7eb',
            borderRadius: '32px',
            boxShadow: '0 2px 12px #0002',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 'bold',
            fontSize: '1.1em',
          }}
          className="lg:hidden"
        >
          <ShoppingCart className="w-5 h-5 text-primary" />
          {formatMoneyDisplay(calculateTotal())} FCFA
        </button>
      )}

      {/* Panel latéral ventes en attente */}
      <Dialog open={showDraftPanel} onOpenChange={setShowDraftPanel}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle>Ventes en attente</DialogTitle>
          </DialogHeader>
          {/* Center and constrain inner content so child cards don't overflow */}
          <div className="w-full max-w-lg mx-auto px-2 sm:px-0">
            <div className="space-y-2">
            {draftSales.length === 0 ? (
              <p className="text-center text-muted-foreground">En attente</p>
            ) : (
              draftSales.map(draft => (
                <Card key={draft.id} className="w-full border-dashed border-2 border-primary">
                  <CardContent className="p-3 flex flex-col gap-2 w-full">
                    <div className="flex flex-col sm:flex-row sm:justify-between items-center text-center sm:text-left gap-1 w-full">
                      <span className="font-semibold w-full sm:w-auto">{draft.items.map((i: any) => i.name).join(', ')}</span>
                      <span className="text-xs text-muted-foreground w-full sm:w-auto">{new Date(draft.createdAt).toLocaleString('fr-FR')}</span>
                    </div>
                    {draft.draftComment && (
                      <div className="text-xs text-muted-foreground border-l-4 border-primary pl-2 my-1">
                        <span className="font-semibold">Commentaire :</span> {draft.draftComment}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" onClick={async () => {
                        // Remplir le panier avec la vente en attente
                        const newCart: CartItem[] = [];
                        for (const i of draft.items) {
                          let prod = products.find(p => p.id === i.productId) || i;
                          if (typeof i.price === 'number' && !isNaN(i.price)) {
                            prod = { ...prod, salePrice: i.price };
                          }
                          newCart.push({ product: prod, quantity: i.quantity });
                        }
                        setCart(newCart);
                        setSelectedCustomerId(draft.customerId || 'none');
                        setPaymentMethod(draft.paymentMethod);
                        setCashAmount(draft.payments?.find((p: any) => p.method === 'cash')?.amount?.toString() || '');
                        setMobileAmount(draft.payments?.find((p: any) => p.method === 'mobile_money')?.amount?.toString() || '');
                        setEditingDraft(null);
                        setShowDraftPanel(false);
                        // Supprimer le brouillon
                        const db = await getDB();
                        await db.delete('sales', draft.id);
                        loadDraftSales();
                        toast.success('Vente en attente poursuivie');
                      }}>
                        Finaliser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showDraftCommentDialog} onOpenChange={setShowDraftCommentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Commentaire pour le brouillon</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Commentaire (optionnel)</Label>
            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={3}
              value={draftComment}
              onChange={e => setDraftComment(e.target.value)}
              placeholder="Ajouter un commentaire pour ce brouillon..."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDraftCommentDialog(false)}>Annuler</Button>
              <Button
                onClick={() => {
                  processSale({ draft: true, comment: draftComment });
                  setShowDraftCommentDialog(false);
                  setDraftComment('');
                }}
              >Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Receipt Dialog */}
      {lastSale && (
        <Receipt
          open={showReceipt}
          onOpenChange={setShowReceipt}
          storeName={lastSale.storeName}
          storeAddress={lastSale.storeAddress}
          items={lastSale.items}
          subtotal={lastSale.subtotal}
          tax={lastSale.tax}
          total={lastSale.total}
          paymentMethod={lastSale.paymentMethod}
          cashReceived={lastSale.cashReceived}
          change={lastSale.change}
          receiptNumber={lastSale.receiptNumber}
          date={lastSale.date}
          paymentDetails={lastSale.paymentDetails}
        />
      )}
      {/* Stock Warning Dialog */}
      <Dialog open={stockWarning.open} onOpenChange={open => setStockWarning({ ...stockWarning, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock négatif</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-red-600">
              Attention, le stock sera négatif pour : <br />
              <span className="font-bold">{stockWarning.products.join(', ')}</span>
            </p>
            <p className="text-sm">Voulez-vous poursuivre la vente malgré tout&nbsp;?</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStockWarning({ open: false, products: [] })}>Annuler</Button>
              <Button
                onClick={() => {
                  setStockWarning({ open: false, products: [] });
                  setShowPayment(true);
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >Poursuivre</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Variable Price Selection Dialog */}
      <Dialog open={variablePriceDialog.open} onOpenChange={(open) => setVariablePriceDialog({ open, product: variablePriceDialog.product })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choisir le prix</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Sélectionnez le prix pour <strong>{variablePriceDialog.product?.name}</strong></p>
            <div className="grid gap-2">
              {variablePriceDialog.product?.variablePrices?.map((vp, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-between h-auto p-4"
                  onClick={() => {
                    const product = variablePriceDialog.product!;
                    const productWithPrice = { ...product, salePrice: vp.price };
                    
                    const existing = cart.find(item => 
                      item.product.id === product.id && 
                      item.product.salePrice === vp.price &&
                      item.priceLabel === vp.label
                    );
                    
                    if (existing) {
                      setCart(cart.map(item =>
                        item.product.id === product.id && 
                        item.product.salePrice === vp.price &&
                        item.priceLabel === vp.label
                          ? { ...item, quantity: item.quantity + 1 }
                          : item
                      ));
                    } else {
                      setCart([...cart, { product: productWithPrice, quantity: 1, priceLabel: vp.label }]);
                    }
                    
                    setVariablePriceDialog({ open: false, product: null });
                  }}
                >
                  <span className="font-medium">{vp.label}</span>
                  <span className="text-primary font-bold">{vp.price} FCFA</span>
                </Button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVariablePriceDialog({ open: false, product: null })}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Custom Price Dialog */}
      <Dialog open={customPriceDialog.open} onOpenChange={(open) => setCustomPriceDialog({ open, product: customPriceDialog.product })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Définir le prix du produit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Ce produit n'a pas de prix de vente défini. Veuillez saisir le prix à appliquer.</p>
            <Label>Prix de vente (FCFA)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatNumberWithSpaces(customPrice)}
              onChange={e => setCustomPrice(e.target.value.replace(/\s/g, ""))}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCustomPriceDialog({ open: false, product: null })}>Annuler</Button>
              <Button
                onClick={() => {
                  const price = parseInt(customPrice);
                  if (isNaN(price) || price <= 0) {
                    toast.error('Prix invalide');
                    return;
                  }
                  const product = customPriceDialog.product!;
                  // Ajoute au panier avec le prix défini
                  setCart([...cart, { product: { ...product, salePrice: price }, quantity: 1 }]);
                  setCustomPriceDialog({ open: false, product: null });
                  setCustomPrice('');
                }}
              >Valider</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
