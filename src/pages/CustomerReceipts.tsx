import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { Badge } from '@/components/ui/badge';
import Receipt from '@/components/Receipt';
import { useParams, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';

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

export default function CustomerReceipts() {
  const { user } = useAuth();
  const { isOnline, manualSync } = useNetwork();
  const { id: customerId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [allCustomerIds, setAllCustomerIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [user, customerId]);

  const updatePendingSyncCount = async (db: any) => {
    try {
      const syncQueue = await db.getAll('syncQueue');
      const salesPendingOps = syncQueue.filter(op => 
        op.table === 'sales' && op.storeId === user?.storeId
      );
      setPendingSyncCount(salesPendingOps.length);
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
            processSales(backendSales, db);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale
          await loadFromLocal(db);
        }
      } else {
        // Hors ligne : charger depuis la base locale
        await loadFromLocal(db);
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
    let salesData = await db.getAll('sales');
    processSales(salesData, db);
  };

  const processSales = async (allSales: any[], db: any) => {
    // Load stores - synchroniser avec le backend si en ligne
    let storesData;
    if (isOnline) {
      try {
        const storesResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php');
        if (storesResponse.ok) {
          const backendStores = await storesResponse.json();
          // Mettre à jour la base locale
          const tx = db.transaction('stores', 'readwrite');
          await Promise.all([
            ...backendStores.map(s => tx.store.put(s)),
            tx.done
          ]);
          storesData = backendStores;
        } else {
          storesData = await db.getAll('stores');
        }
      } catch (error) {
        console.error('Erreur synchronisation stores:', error);
        storesData = await db.getAll('stores');
      }
    } else {
      storesData = await db.getAll('stores');
    }
    setStores(storesData);
    
    // Load customers - synchroniser avec le backend si en ligne
    let allCustomers;
    if (isOnline) {
      try {
        const customersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php');
        if (customersResponse.ok) {
          const backendCustomers = await customersResponse.json();
          // Mettre à jour la base locale
          const tx = db.transaction('customers', 'readwrite');
          await Promise.all([
            ...backendCustomers.map(c => tx.store.put(c)),
            tx.done
          ]);
          allCustomers = backendCustomers;
        } else {
          allCustomers = await db.getAll('customers');
        }
      } catch (error) {
        console.error('Erreur synchronisation customers:', error);
        allCustomers = await db.getAll('customers');
      }
    } else {
      allCustomers = await db.getAll('customers');
    }
    
    setAllCustomerIds(allCustomers.map(cust => String(cust.id)));
    
    if (customerId) {
      const c = allCustomers.find(cust => String(cust.id) === String(customerId));
      setCustomer(c);
    }
    
    // Normaliser les données numériques et filtrer par client
    const normalizedSales = allSales.map((s: any) => ({
      ...s,
      subtotal: Number(s.subtotal) || 0,
      tax: Number(s.tax) || 0,
      total: Number(s.total) || 0,
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
    
    // Filtrer par client
    let salesData = normalizedSales.filter(sale => 
      sale.customerId && String(sale.customerId) === String(customerId)
    );
    
    // Filtrer par magasin pour admin et caissier
    if ((user?.role === 'admin' || user?.role === 'cashier') && user?.storeId) {
      salesData = salesData.filter(s => s.storeId === user.storeId);
    }
    
    salesData.sort((a, b) => b.createdAt - a.createdAt);
    setSales(salesData);
    setFilteredSales(salesData);
  };

  useEffect(() => {
    let filtered = sales;
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

  const handlePrintReceipt = (sale: Sale) => {
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
      <Button variant="outline" className="mb-4 w-auto px-4 py-2 rounded text-sm flex items-center gap-2" onClick={() => navigate(-1)}>
        Retour
      </Button>
      {customer ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-xl sm:text-2xl">Reçus du client</CardTitle>
            </div>
            
            <div className="mt-2 text-sm sm:text-base text-muted-foreground space-y-1">
              <div><strong>Nom :</strong> {customer.name}</div>
              <div><strong>Téléphone :</strong> {customer.phone}</div>
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
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Reçu</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden md:table-cell">Magasin</TableHead>
                    <TableHead className="hidden lg:table-cell">Articles</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="hidden md:table-cell">Paiement</TableHead>
                    <TableHead className="hidden lg:table-cell">Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Ce client n'a aucun reçu.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.map((sale) => {
                      const store = stores.find(s => s.id === sale.storeId);
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
                                  {sale.refunded && (
                                    <div className="text-xs text-destructive font-medium">Remboursé</div>
                                  )}
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
                          <TableCell className="hidden md:table-cell">{store?.name || '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {sale.items?.length || 0} article{(sale.items?.length || 0) > 1 ? 's' : ''}
                          </TableCell>
                          <TableCell className="font-medium">{Number(sale.total).toFixed(0)} FCFA</TableCell>
                          <TableCell className="hidden md:table-cell">{getPaymentMethodText(sale.paymentMethod)}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {sale.refunded ? (
                              <span className="text-destructive font-medium">Remboursé</span>
                            ) : (
                              <span className="text-green-600 font-medium">Payé</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => printSaleDirect(sale)}
                              title="Imprimer"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>{loading ? 'Chargement du client...' : ''}</CardTitle>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
        </Card>
      )}
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
    </div>
  );
}
