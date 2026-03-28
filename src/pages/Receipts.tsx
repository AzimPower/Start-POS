import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, Undo2, Wifi, WifiOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Receipt from '@/components/Receipt';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { pendingEmailService } from '@/lib/pendingEmailService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Sale {
  id: string;
  shiftId: string;
  userId: string;
  storeId: string;
  customerId: string | null;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    tax: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'cash' | 'mobile_money' | 'mixed';
  payments: Array<{
    method: 'cash' | 'mobile_money';
    amount: number;
  }>;
  createdAt: number;
  refunded?: boolean;
  refundedAt?: number;
}

export default function Receipts() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [shiftsChecked, setShiftsChecked] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isOnline, isBackendReachable, manualSync } = useNetwork();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [saleToRefund, setSaleToRefund] = useState<Sale | null>(null);
  const [refundComment, setRefundComment] = useState('');

  useEffect(() => {
    // Check if the user has an active (open) shift, but load data regardless
    let cancelled = false;
    const checkShiftAndLoad = async () => {
      setShiftsChecked(false);
      let userShift: any = null;
      try {
        const db = await getDB();
        const shiftsOpen = await db.getAllFromIndex('shifts', 'by-status', 'open');
        userShift = shiftsOpen.find((s: any) => s.userId === user?.id);
        if (!cancelled) setActiveShift(userShift);
      } catch (e) {
        console.error('Erreur vérification shift:', e);
        if (!cancelled) setActiveShift(null);
      } finally {
        if (!cancelled) setShiftsChecked(true);
      }

      // Load data regardless of shift status to show existing receipts
      try {
        if (!cancelled) {
          await loadData(0, pageSize, true);
        }
      } catch (e) {
        console.error('Erreur lors du chargement initial:', e);
      }
    };

    checkShiftAndLoad();
    return () => { cancelled = true; };
  }, [user]);

  // we'll lazy-import getPendingSyncCount when needed to avoid circular imports
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

  const loadData = async (offset = 0, limit = pageSize, reset = true) => {
    setLoading(true);
    try {
      const db = await getDB();
      // Si en ligne, charger depuis le backend et synchroniser
      if (isOnline) {
        try {
          // Pagination côté backend
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php';
          const params = new URLSearchParams();
          if (user?.storeId) params.append('storeId', user.storeId);
          params.append('offset', String(offset));
          params.append('limit', String(limit));
          url += `?${params.toString()}`;
          const response = await fetch(url);
          if (response.ok) {
            const backendResult = await response.json();
            // backendResult: { data: Sale[], total, offset, limit }
            const backendSales = backendResult.data || [];
            // Mettre à jour la base locale
            const tx = db.transaction('sales', 'readwrite');
            await Promise.all([
              ...backendSales.map(s => tx.store.put(s)),
              tx.done
            ]);
            // Charger la page demandée depuis le backend (et non tout)
            if (reset) {
              setSales(backendSales);
              setLoadedCount(backendSales.length);
            } else {
              setSales(prev => [...prev, ...backendSales]);
              setLoadedCount(prev => prev + backendSales.length);
            }
            // Il y a plus de données si on a reçu exactement le nombre demandé
            const stillHasMore = backendSales.length === limit;
            setHasMore(stillHasMore);
            console.log('Backend loaded:', { received: backendSales.length, limit, hasMore: stillHasMore });
            await processSales(reset ? backendSales : [...sales, ...backendSales], db);
            return;
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale
          await loadFromLocal(db);
        }
      } else {
        // Hors ligne : charger depuis la base locale (paged)
        await loadSalesPage(db, offset, limit, reset);
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

  const loadFromLocal = async (db: any) => {
    // by default load the first page, ensuring we have data
    const result = await loadSalesPage(db, 0, pageSize, true);
    // If no results from pagination, try loading all and filtering
    if (result.length === 0) {
      const allSales = await db.getAll('sales');
      if (allSales.length > 0) {
        await processSales(allSales, db);
      }
    }
    return result;
  };

  const loadSalesPage = async (db: any, offset: number, limit: number, reset = false) => {
    // Use the createdAt index in descending order. If the index doesn't exist yet, fall back to getAll
    try {
      const tx = db.transaction('sales');
      const store = tx.objectStore('sales');
      // Try to use the index 'by-createdAt'
      const canUseIndex = store.indexNames && Array.from(store.indexNames).includes('by-createdAt');
      const results: any[] = [];

      if (canUseIndex) {
        let cursor = await store.index('by-createdAt').openCursor(null, 'prev');
        let skipped = 0;
        while (cursor) {
          if (skipped >= offset && results.length < limit) {
            results.push(cursor.value);
          }
          if (results.length >= limit) break;
          skipped++;
          cursor = await cursor.continue();
        }
      } else {
        // Fallback: load all keys and then slice (cheaper than loading all objects when there are very large objects)
        const all = await db.getAll('sales');
        all.sort((a: any, b: any) => b.createdAt - a.createdAt);
        const slice = all.slice(offset, offset + limit);
        results.push(...slice);
      }

      // If we reset, replace state; otherwise append
      if (reset) {
        setSales(results);
        setLoadedCount(results.length);
      } else {
        setSales(prev => [...prev, ...results]);
        setLoadedCount(prev => prev + results.length);
      }

      setHasMore(results.length === limit);
      console.log('Local loaded:', { received: results.length, limit, hasMore: results.length === limit });
      // Process the newly loaded page (this will set filteredSales and other derived data)
      await processSales(reset ? results : [...sales, ...results], db);
      return results;
    } catch (e) {
      console.error('Erreur lors du chargement paginé des reçus:', e);
      // Fallback to loading everything
      const all = await db.getAll('sales');
      all.sort((a: any, b: any) => b.createdAt - a.createdAt);
      const page = all.slice(offset, offset + limit);
      if (reset) {
        setSales(page);
            // Charger les utilisateurs
            const usersData = await db.getAll('users');
            setUsers(usersData);
        setLoadedCount(page.length);
      } else {
        setSales(prev => [...prev, ...page]);
        setLoadedCount(prev => prev + page.length);
      }
      setHasMore(page.length === limit);
      await processSales(reset ? page : [...sales, ...page], db);
      return page;
    }
  };

  // Scroll container ref for infinite loading
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = async () => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) {
      console.log('Skip scroll:', { hasEl: !!el, loadingMore, hasMore, loadedCount });
      return;
    }
    
    const { scrollTop, scrollHeight, clientHeight } = el;
    const threshold = 100; // px from bottom
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - threshold;
    
    console.log('Scroll event:', { scrollTop, scrollHeight, clientHeight, threshold, isNearBottom, loadedCount });
    
    if (isNearBottom) {
      console.log('Loading more data...', { currentOffset: loadedCount });
      setLoadingMore(true);
      try {
        await loadData(loadedCount, pageSize, false);
      } catch (e) {
        console.error('Erreur lors du chargement de la page suivante:', e);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // Infinite scroll avec le container de la table
  useEffect(() => {
    // Pas besoin de window scroll, on utilise le container
    return () => {};
  }, []);

  const processSales = async (allSales: any[], db: any) => {
    // Load shifts and stores
  const shiftsData = await db.getAll('shifts');
  setShifts(shiftsData);
  const storesData = await db.getAll('stores');
  setStores(storesData);
  const usersData = await db.getAll('users');
  setUsers(usersData);
    
    // Normaliser les données numériques et s'assurer que les items existent
    const normalizedSales = allSales.map((s: any) => ({
      ...s,
      subtotal: Number(s.subtotal) || 0,
      tax: Number(s.tax) || 0,
      total: Number(s.total) || 0,
      refunded: !!s.refunded,
      cashAmount: s.cashAmount !== undefined ? Number(s.cashAmount) : undefined,
      mobileMoneyAmount: s.mobileMoneyAmount !== undefined ? Number(s.mobileMoneyAmount) : undefined,
      otherAmount: s.otherAmount !== undefined ? Number(s.otherAmount) : undefined,
      createdAt: Number(s.createdAt) || Date.now(),
      refundedAt: s.refundedAt ? Number(s.refundedAt) : null,
      completedAt: s.completedAt ? Number(s.completedAt) : null,
      items: s.items || [], // S'assurer que items existe toujours
      // Normaliser aussi les items si ils existent
      ...(s.items && Array.isArray(s.items) ? {
        items: s.items.map((item: any) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          tax: Number(item.tax) || 0,
          total: Number(item.total) || 0
        }))
      } : {})
    }));
    
    // Filtrer par magasin pour admin et caissier
    let salesData = normalizedSales;
    if ((user?.role === 'admin' || user?.role === 'cashier') && user?.storeId) {
      salesData = salesData.filter(s => s.storeId === user.storeId);
    }
    salesData.sort((a, b) => b.createdAt - a.createdAt);
    setSales(salesData);
    setFilteredSales(salesData);
  };

  useEffect(() => {
    let filtered = sales;

    // Filter by search
    if (search) {
      filtered = filtered.filter(sale => {
        const store = stores.find(s => s.id === sale.storeId);
        const receiptNumber = `REC${sale.id.slice(-6).toUpperCase()}`;
        return (
          receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
          store?.name.toLowerCase().includes(search.toLowerCase()) ||
          (sale.items && sale.items.some(item => item.name.toLowerCase().includes(search.toLowerCase())))
        );
      });
    }

    setFilteredSales(filtered);
  }, [search, sales, stores]);

  const handlePrintReceipt = async (sale: Sale) => {
    const db = await getDB();
    const store = await db.get('stores', sale.storeId);
    
    if (!store) return;

    setSelectedSale(sale);
    setShowReceipt(true);
  };

  const printSaleDirect = async (sale: Sale) => {
    try {
      const db = await getDB();
      const store = await db.get('stores', sale.storeId);
      if (!store) {
        toast.error('Magasin introuvable pour ce reçu');
        return;
      }

      const receiptNumber = `REC${sale.id.slice(-6).toUpperCase()}`;
      const date = new Date(sale.createdAt);

      // Build plain-text lines for ESC/POS
      const lines: string[] = [];
      const centerText = (s: string, w: number) => {
        const str = (s || '').toString();
        if (str.length >= w) return str;
        const left = Math.floor((w - str.length) / 2);
        return ' '.repeat(left) + str;
      };
      const paper = localStorage.getItem('printer_paper') || '80';
      const width = paper === '58' ? 32 : 48;

      lines.push(centerText(store.name || 'Magasin', width));
      if (store.address) lines.push(centerText(store.address, width));
      lines.push('');
      const dateText = date.toLocaleString('fr-FR');
      lines.push(NativePrinter.formatColumns(dateText, `Recu N°: ${receiptNumber}`, width));
      lines.push('--------------------------------');

      for (const it of (sale.items || [])) {
        const name = it.name || '';
        const qty = Number(it.quantity) || 0;
        const price = isNaN(Number(it.price)) ? 0 : Math.round(Number(it.price));
        const totalItem = isNaN(Number(it.total)) ? qty * price : Math.round(Number(it.total));
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
      lines.push(NativePrinter.formatColumns('Sous-total:', `${Math.round(sale.subtotal || 0)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('TVA:', `${Math.round(sale.tax || 0)} FCFA`, width));
      lines.push(NativePrinter.formatColumns('TOTAL:', `${Math.round(sale.total || 0)} FCFA`, width));
      lines.push('');
      lines.push(NativePrinter.formatColumns('Mode de paiement:', sale.paymentMethod || '', width));
      if (sale.payments && sale.payments.length > 0) {
        for (const p of sale.payments) {
          const label = p.method === 'cash' ? 'Especes' : p.method === 'mobile_money' ? 'Mobile Money' : p.method;
          lines.push(NativePrinter.formatColumns(label + ':', `${Math.round(p.amount || 0)} FCFA`, width));
        }
      }
      lines.push('');
      lines.push('Merci pour votre visite !');

      const printed = await NativePrinter.printText(lines);
      if (!printed) {
        // Build HTML fallback and try native HTML print
        const tmp = document.createElement('div');
        tmp.innerHTML = `
          <div>
            <h2>${store.name || 'Magasin'}</h2>
            <div>${store.address || ''}</div>
            <div>Reçu N°: ${receiptNumber}</div>
            <div>Date: ${date.toLocaleString('fr-FR')}</div>
            <hr/>
            ${sale.items.map(it => `<div>${it.name} - ${it.quantity} x ${Math.round(it.price || 0)} = ${Math.round(it.total || 0)}</div>`).join('')}
            <hr/>
            <div>Sous-total: ${Math.round(sale.subtotal || 0)} FCFA</div>
            <div>TVA: ${Math.round(sale.tax || 0)} FCFA</div>
            <div><strong>TOTAL: ${Math.round(sale.total || 0)} FCFA</strong></div>
          </div>
        `;
        const html = buildReceiptHtml(tmp, `Reçu-${receiptNumber}`);
        const usedNative = await tryNativePrint(html, `Reçu-${receiptNumber}`);
        if (!usedNative) {
          toast.error('Imprimante native indisponible. Veuillez associer une imprimante Bluetooth.');
        }
      }
    } catch (e) {
      console.error('Erreur impression directe:', e);
      toast.error('Erreur lors de l\'impression');
    }
  };

  const handleRefund = async () => {
    if (!saleToRefund) return;

    try {
      setLoading(true);
      const db = await getDB();
      
      // Créer l'objet vente remboursée
      const refundedSale = {
        ...saleToRefund,
        refunded: true,
        refundedAt: Date.now(),
      };

      // Sauvegarder localement d'abord
      await db.put('sales', refundedSale);

      // Mise à jour optimiste de l'UI : remplacer la vente remboursée localement
      setSales(prev => prev.map(s => (s.id === refundedSale.id ? refundedSale : s)));
      setFilteredSales(prev => prev.map(s => (s.id === refundedSale.id ? refundedSale : s)));
      if (selectedSale && selectedSale.id === refundedSale.id) setSelectedSale(refundedSale);

      // Restore stock locally - Restaurer le stock des articles remboursés
      const productsToRestoreStock = [];
      for (const item of (saleToRefund.items || [])) {
        let product = await db.get('products', item.productId);
        
        // Si le backend est disponible, recharger le produit pour avoir le stock le plus récent
        if (isBackendReachable && product) {
          try {
            const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${item.productId}`);
            if (response.ok) {
              const freshProduct = await response.json();
              if (freshProduct && freshProduct.id) {
                product = freshProduct;
                // Mettre à jour aussi en local
                await db.put('products', freshProduct);
              }
            }
          } catch (error) {
            console.warn(`Impossible de recharger le produit ${item.name} depuis le backend:`, error);
          }
        }
        
        if (product) {
          // Vérifier si le produit a un suivi de stock configuré pour ce magasin
          if (product.stock && typeof product.stock === 'object') {
            const updatedStock = { ...product.stock };
            const currentStock = updatedStock[saleToRefund.storeId] || 0;
            updatedStock[saleToRefund.storeId] = currentStock + item.quantity;
            
            const updatedProduct = {
              ...product,
              stock: updatedStock,
            };
            
            await db.put('products', updatedProduct);
            productsToRestoreStock.push({
              product: updatedProduct,
              restoredQuantity: item.quantity,
              itemName: item.name
            });
            
            console.log(`📦 Stock restauré pour "${item.name}": +${item.quantity} (nouveau stock: ${updatedStock[saleToRefund.storeId]})`);
          } else {
            console.log(`ℹ️ Produit "${item.name}" sans suivi de stock - pas de restauration`);
          }
        } else {
          console.warn(`⚠️ Produit "${item.name}" (ID: ${item.productId}) non trouvé lors de la restauration du stock`);
        }
      }

      // Always attempt to sync via performSyncOp which will queue if offline or on error
      try {
        const res = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php',
          method: 'PUT',
          data: refundedSale,
        });

        // Synchroniser aussi la restauration du stock des produits concernés
        if (productsToRestoreStock.length > 0) {
          console.log(`🔄 Synchronisation du stock restauré pour ${productsToRestoreStock.length} produit(s)`);
          
              for (const { product, restoredQuantity } of productsToRestoreStock) {
            try {
              // Préparer les données pour l'API backend
              // N'envoyer le flag `trackStock` au backend QUE si le produit le contient déjà.
              // Cela évite de forcer le produit à devenir suivi lorsqu'il ne l'était pas.
              const productDataForBackend: any = {
                ...product,
                stock: product.stock ? product.stock[saleToRefund.storeId] : undefined, // Envoyer seulement le stock pour ce magasin
                storeId: saleToRefund.storeId
              };
              if (product.trackStock !== undefined) {
                productDataForBackend.trackStock = product.trackStock;
              }
              
              await performSyncOp({
                url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
                method: 'PUT',
                data: productDataForBackend,
              });
              
              console.log(`✅ Synchronisation stock prévue pour "${product.name}": ${product.stock[saleToRefund.storeId]} unités`);
            } catch (stockSyncError) {
              console.error(`❌ Erreur synchronisation stock pour "${product.name}":`, stockSyncError);
            }
          }
        }

        if (res.queued) {
          toast.success(`Vente remboursée - Stock restauré pour ${productsToRestoreStock.length} produit(s) (sera synchronisée plus tard)`);
        } else if (res.success) {
          toast.success(`Vente remboursée et synchronisée - Stock restauré pour ${productsToRestoreStock.length} produit(s)`);
        } else {
          toast.success(`Vente remboursée - Stock restauré pour ${productsToRestoreStock.length} produit(s) (synchronisation différée)`);
        }
      } catch (error) {
        console.error('Erreur lors de la demande de synchronisation:', error);
        toast.success(`Vente remboursée - Stock restauré pour ${productsToRestoreStock.length} produit(s) (sera synchronisée plus tard)`);
      }

      // Envoyer notification email aux admins du store
      try {
        const emailSettings = JSON.parse(localStorage.getItem(`emailSettings_${saleToRefund.storeId}`) || '{}');
        const shouldSendEmail = emailSettings?.refunds !== false; // Par défaut true si pas de config
        
        if (shouldSendEmail) {
          const store = stores.find(s => s.id === saleToRefund.storeId);
          const storeName = store?.name || 'Magasin';
          
          // Construction du template HTML structuré comme pour les dépenses
          const refundMessage = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">↩️ Remboursement de Vente</h3>
    <div class="info-row">
      <span class="info-label">Magasin :&nbsp;</span>
      <span class="info-value">${storeName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Traité par :&nbsp;</span>
      <span class="info-value">${user?.username || 'Inconnu'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Montant remboursé :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${Number(saleToRefund.total).toLocaleString('fr-FR')} F CFA</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date :&nbsp;</span>
      <span class="info-value">${new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Ouagadougou' })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Méthode de paiement :&nbsp;</span>
      <span class="info-value">${getPaymentMethodText(saleToRefund.paymentMethod)}</span>
    </div>
    ${refundComment ? `
    <div class="info-row">
      <span class="info-label">Commentaire :&nbsp;</span>
      <span class="info-value">${refundComment}</span>
    </div>` : ''}
  </div>

  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📦 Articles Remboursés</h3>
    ${(saleToRefund.items || []).map(item => `
    <div class="info-row">
      <span class="info-label">${item.name} :&nbsp;</span>
      <span class="info-value">${item.quantity} × ${Number(item.price).toLocaleString('fr-FR')} = ${Number(item.total).toLocaleString('fr-FR')} F CFA</span>
    </div>
    `).join('')}
    <div style="margin-top: 10px; padding: 10px; background: #d4edda; border-left: 4px solid #28a745; font-size: 12px;">
      <strong>📈 Stock restauré :</strong> Les quantités vendues ont été remises dans le stock du magasin
    </div>
  </div>

  <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
    <strong>ID de la Vente :&nbsp;</strong>${saleToRefund.id}
  </div>
</div>
`;

          console.log('📧 [REFUND] Envoi notification remboursement à tous les admins...');
          const result = await pendingEmailService.sendToAllAdmins({
            message: refundMessage,
            storeName: storeName,
            type: 'refund',
            relatedId: saleToRefund.id,
            storeId: saleToRefund.storeId,
            userId: user?.id || 'unknown'
          });

          if (result.sent > 0) {
            console.log('✅ Emails remboursement envoyés directement');
            toast.success(`Remboursement effectué - Emails envoyés à ${result.totalAdmins} admin(s)`);
          } else if (result.queued > 0) {
            console.log('📦 Emails remboursement mis en attente, seront envoyés lors de la sync');
            toast.success('Remboursement effectué - Notifications en attente d\'envoi');
          }
        } else {
          console.log('📧 [REFUND] Envoi email désactivé pour les remboursements');
        }
      } catch (emailError) {
        console.warn('❌ Erreur envoi email remboursement:', emailError);
        // Ne pas bloquer le processus si l'email échoue
      }

  setShowRefundDialog(false);
  setSaleToRefund(null);
  setRefundComment('');
  // Update pending sync count and reload
  await updatePendingSyncCount();
  loadData();
    } catch (error) {
      toast.error('Erreur lors du remboursement');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentMethodText = (method: string) => {
    switch (method) {
      case 'cash': return 'Espèces';
      case 'mobile_money': return 'Mobile Money';
      case 'mixed': return 'Mixte';
      default: return method;
    }
  };
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl sm:text-2xl">Liste des Reçus</CardTitle>
            {/* Network status is shown in the header; duplicate controls removed here. */}
          </div>
          
          <div className="flex gap-2 sm:gap-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isMobile ? "Rechercher..." : "Rechercher par N° reçu, magasin, produit..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground hidden sm:block">
                {loadedCount} chargés
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-auto max-h-[70vh]" ref={scrollRef} onScroll={handleScroll}>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Reçu</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Vendeur</TableHead>
                  <TableHead className="hidden lg:table-cell">Articles</TableHead>
                  {user?.role !== 'cashier' && <TableHead>Total</TableHead>}
                  <TableHead className="hidden md:table-cell">Paiement</TableHead>
                  <TableHead className="hidden lg:table-cell">Statut</TableHead>
                  <TableHead>Actions</TableHead>
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
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>{search ? 'Aucun reçu trouvé pour cette recherche' : 'Aucun reçu enregistré'}</p>
                      {!search && shiftsChecked && !activeShift && (
                        <p className="text-sm mt-2">
                          Les nouveaux reçus nécessitent un shift ouvert
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => {
                    const store = stores.find(s => s.id === sale.storeId);
                    const cashier = users.find(u => u.id === sale.userId);
                    const receiptNumber = `REC${sale.id.slice(-6).toUpperCase()}`;
                    // ...existing code for receipt row...
                    return (
                      <TableRow key={sale.id} className={sale.refunded ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{receiptNumber}</div>
                            {isMobile && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                <div>
                                  {new Date(sale.createdAt).toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                                {store && <div className="text-xs">{store.name}</div>}
                                <div className="text-xs">
                                  {sale.items?.length || 0} article{(sale.items?.length || 0) > 1 ? 's' : ''} • {getPaymentMethodText(sale.paymentMethod)}
                                </div>
                                {sale.refunded ? (
                                  <div className="text-xs text-destructive font-medium">Remboursé</div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {new Date(sale.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{cashier?.username || cashier?.phone || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {sale.items?.length || 0} article{(sale.items?.length || 0) > 1 ? 's' : ''}
                        </TableCell>
                        {user?.role !== 'cashier' && (
                          <TableCell className="font-medium">{Number(sale.total).toFixed(0)} FCFA</TableCell>
                        )}
                        <TableCell className="hidden md:table-cell">{getPaymentMethodText(sale.paymentMethod)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {sale.refunded ? (
                            <span className="text-destructive font-medium">Remboursé</span>
                          ) : (
                            <span className="text-green-600 font-medium">Payé</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {user?.role === 'admin' && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setSelectedSale(sale);
                                  setShowReceipt(true);
                                }}
                                title="Voir le détail du reçu"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {user?.role !== 'cashier' && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => printSaleDirect(sale)}
                                title="Imprimer"
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                            )}
                            {!sale.refunded && (() => {
                              const shift = shifts.find(s => s.id === sale.shiftId);
                              const isClosed = shift && shift.status === 'closed';
                              return (
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  disabled={isClosed || loading}
                                  title={isClosed ? 'Impossible : shift fermé' : 'Rembourser'}
                                  onClick={() => {
                                    if (!isClosed) {
                                      setSaleToRefund(sale);
                                      setShowRefundDialog(true);
                                    }
                                  }}
                                >
                                  <Undo2 className="w-4 h-4" />
                                </Button>
                              );
                            })()}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                {loadingMore && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4">
                      <div className="animate-pulse text-muted-foreground">
                        Chargement de plus de reçus...
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!hasMore && sales.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                      Tous les reçus ont été chargés
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedSale && (
        <Receipt
          open={showReceipt}
          onOpenChange={setShowReceipt}
          storeName={stores.find(s => s.id === selectedSale.storeId)?.name || ''}
          storeAddress={stores.find(s => s.id === selectedSale.storeId)?.address || ''}
          items={(selectedSale.items || []).map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
          }))}
          subtotal={selectedSale.subtotal}
          tax={selectedSale.tax}
          total={selectedSale.total}
          paymentMethod={selectedSale.paymentMethod}
          cashReceived={(selectedSale.payments || []).find(p => p.method === 'cash')?.amount}
          change={(() => {
            const payments = selectedSale.payments || [];
            if (selectedSale.paymentMethod === 'cash') {
              return (payments[0]?.amount || 0) - selectedSale.total;
            }
            if (selectedSale.paymentMethod === 'mobile_money') {
              return (payments[0]?.amount || 0) - selectedSale.total;
            }
            if (selectedSale.paymentMethod === 'mixed') {
              const totalPaid = (payments.find(p => p.method === 'cash')?.amount || 0) + (payments.find(p => p.method === 'mobile_money')?.amount || 0);
              return totalPaid - selectedSale.total;
            }
            return undefined;
          })()}
          receiptNumber={`REC${selectedSale.id.slice(-6).toUpperCase()}`}
          date={new Date(selectedSale.createdAt)}
        />
      )}

      <AlertDialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le remboursement</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir rembourser cette vente ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <strong>Cette action va :</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Marquer la vente comme remboursée</li>
                <li>Restaurer automatiquement le stock des articles vendus</li>
                <li>Envoyer une notification aux administrateurs</li>
              </ul>
            </div>
            <div className="text-sm text-muted-foreground">
              Cette action ne peut pas être annulée.
            </div>
            <div className="space-y-2">
              <label htmlFor="refund-comment" className="text-sm font-medium">
                Commentaire (optionnel)
              </label>
              <Input
                id="refund-comment"
                value={refundComment}
                onChange={(e) => setRefundComment(e.target.value)}
                placeholder="Raison du remboursement, notes..."
                className="w-full"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefund} disabled={loading}>
              {loading ? 'Remboursement...' : 'Confirmer le remboursement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
