import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, Undo2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import Receipt from '@/components/Receipt';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const { user } = useAuth();
  const { isOnline, manualSync } = useNetwork();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    loadData();
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

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      
      // Si en ligne, charger depuis le backend et synchroniser
      if (isOnline) {
        try {
          // Charger les ventes depuis le backend
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php';
          if (user?.storeId) url += `?storeId=${user.storeId}`;
          const response = await fetch(url);
          if (response.ok) {
            const backendSales = await response.json();
            // Mettre à jour la base locale
            const tx = db.transaction('sales', 'readwrite');
            await Promise.all([
              ...backendSales.map(s => tx.store.put(s)),
              tx.done
            ]);
            // After syncing backend results into the DB, reset pagination and load first page from local
            setLoadedCount(0);
            setHasMore(true);
            await loadSalesPage(db, 0, pageSize, true);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale
          await loadFromLocal(db);
        }
      } else {
        // Hors ligne : charger depuis la base locale (paged)
        await loadSalesPage(db, 0, pageSize, true);
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
    // by default load the first page
    return loadSalesPage(db, 0, pageSize, true);
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
    if (!el || loadingMore || !hasMore) return;
    const threshold = 200; // px from bottom
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      setLoadingMore(true);
      try {
        const db = await getDB();
        await loadSalesPage(db, loadedCount, pageSize, false);
      } catch (e) {
        console.error('Erreur lors du chargement de la page suivante:', e);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // Fallback: also listen to window scroll so infinite loading works when page scroll is used
  useEffect(() => {
    let cancelled = false;
    const onWindowScroll = async () => {
      if (cancelled) return;
      if (loadingMore || !hasMore) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const threshold = 200;
      if (windowHeight + scrollTop >= docHeight - threshold) {
        setLoadingMore(true);
        try {
          const db = await getDB();
          await loadSalesPage(db, loadedCount, pageSize, false);
        } catch (e) {
          console.error('Erreur lors du chargement de la page suivante (window):', e);
        } finally {
          if (!cancelled) setLoadingMore(false);
        }
      }
    };

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, [loadedCount, pageSize, hasMore, loadingMore]);

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

      // Restore stock locally
      for (const item of (saleToRefund.items || [])) {
        const product = await db.get('products', item.productId);
        if (product) {
          const updatedStock = { ...product.stock };
          updatedStock[saleToRefund.storeId] = (updatedStock[saleToRefund.storeId] || 0) + item.quantity;
          await db.put('products', {
            ...product,
            stock: updatedStock,
          });
        }
      }

      // Always attempt to sync via performSyncOp which will queue if offline or on error
      try {
        const res = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php',
          method: 'PUT',
          data: refundedSale,
        });

        if (res.queued) {
          toast.success('Vente remboursée (sera synchronisée plus tard)');
        } else if (res.success) {
          toast.success('Vente remboursée et synchronisée avec succès');
        } else {
          toast.success('Vente remboursée (synchronisation différée)');
        }
      } catch (error) {
        console.error('Erreur lors de la demande de synchronisation:', error);
        toast.success('Vente remboursée (sera synchronisée plus tard)');
      }

  setShowRefundDialog(false);
  setSaleToRefund(null);
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
              <Button size="sm" variant="outline" onClick={async () => {
                try {
                  setLoading(true);
                  const db = await getDB();
                  const all = await db.getAll('sales');
                  // Filter by user's storeId if present
                  const salesForStore = user?.storeId ? all.filter(s => s.storeId === user.storeId) : all;
                  salesForStore.sort((a: any, b: any) => b.createdAt - a.createdAt);
                  setSales(salesForStore);
                  setFilteredSales(salesForStore);
                  setLoadedCount(salesForStore.length);
                  setHasMore(false);
                  // ensure related data loaded
                  const storesData = await db.getAll('stores');
                  setStores(storesData);
                  const usersData = await db.getAll('users');
                  setUsers(usersData);
                  toast.success('Tous les reçus locaux chargés');
                } catch (e) {
                  console.error('Erreur chargement complet des reçus:', e);
                  toast.error('Impossible de charger tous les reçus');
                } finally {
                  setLoading(false);
                }
              }}>Charger tout</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {loading ? (
            <div className="p-6 flex items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-transparent rounded-full" />
                <div>Chargement des reçus...</div>
              </div>
            </div>
          ) : (
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
                {filteredSales.map((sale) => {
                  const store = stores.find(s => s.id === sale.storeId);
                  const cashier = users.find(u => u.id === sale.userId);
                  const receiptNumber = `REC${sale.id.slice(-6).toUpperCase()}`;
                  
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
                })}
              </TableBody>
              </Table>
            </div>
          )}
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
          cashReceived={selectedSale.payments.find(p => p.method === 'cash')?.amount}
          change={(() => {
            if (selectedSale.paymentMethod === 'cash') {
              return (selectedSale.payments[0]?.amount || 0) - selectedSale.total;
            }
            if (selectedSale.paymentMethod === 'mobile_money') {
              return (selectedSale.payments[0]?.amount || 0) - selectedSale.total;
            }
            if (selectedSale.paymentMethod === 'mixed') {
              const totalPaid = (selectedSale.payments.find(p => p.method === 'cash')?.amount || 0) + (selectedSale.payments.find(p => p.method === 'mobile_money')?.amount || 0);
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
              Êtes-vous sûr de vouloir rembourser cette vente ? Cette action restaurera le stock des produits.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
