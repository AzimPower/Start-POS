import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, CalendarDays, Eye, Loader2, Phone, Printer, ReceiptText, RefreshCcw, Search, Store } from 'lucide-react';
import { toast } from 'sonner';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { Badge } from '@/components/ui/badge';
import Receipt from '@/components/Receipt';
import { formatReceiptNumber } from '@/lib/receiptNumber';
import { buildBypassUrl, isSaleRefunded, mergeBackendSalesIntoLocalDb } from '@/lib/salesSync';
import { useParams, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { BACKEND_BASE } from '@/lib/backend';

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
    refundedAt?: number | null;
    receiptSequence?: number;
    receiptNumber?: string;
}

interface Customer {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    storeId?: string;
}

interface StoreInfo {
    id: string;
    name: string;
    address?: string;
}
type CustomerReceiptsSnapshot = {
    customerId: string;
    sales: Sale[];
    filteredSales: Sale[];
    stores: StoreInfo[];
    customer: Customer | null;
    pendingSyncCount: number;
};
let lastCustomerReceiptsSnapshot: CustomerReceiptsSnapshot | null = null;

const formatCurrency = (value: number) => `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} FCFA`;

const formatDateTime = (value: number | null | undefined) => {
    if (!value) {
        return '-';
    }

    return new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function CustomerReceipts() {
    const { user } = useAuth();
    const { isOnline } = useNetwork();
    const { id: customerId } = useParams();
    const navigate = useNavigate();
    const isMobile = useIsMobile();

    const hasSnapshotForCurrentCustomer = Boolean(lastCustomerReceiptsSnapshot && String(lastCustomerReceiptsSnapshot.customerId) === String(customerId || ''));
    const [loading, setLoading] = useState(!hasSnapshotForCurrentCustomer);
    const [refreshing, setRefreshing] = useState(false);
    const [printingSaleId, setPrintingSaleId] = useState<string | null>(null);
    const [pendingSyncCount, setPendingSyncCount] = useState(hasSnapshotForCurrentCustomer ? (lastCustomerReceiptsSnapshot?.pendingSyncCount || 0) : 0);
    const [sales, setSales] = useState<Sale[]>(hasSnapshotForCurrentCustomer ? (lastCustomerReceiptsSnapshot?.sales || []) : []);
    const [filteredSales, setFilteredSales] = useState<Sale[]>(hasSnapshotForCurrentCustomer ? (lastCustomerReceiptsSnapshot?.filteredSales || []) : []);
    const [search, setSearch] = useState('');
    const [stores, setStores] = useState<StoreInfo[]>(hasSnapshotForCurrentCustomer ? (lastCustomerReceiptsSnapshot?.stores || []) : []);
    const [showReceipt, setShowReceipt] = useState(false);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(hasSnapshotForCurrentCustomer ? (lastCustomerReceiptsSnapshot?.customer || null) : null);

    useEffect(() => {
        void loadData(!hasSnapshotForCurrentCustomer);
    }, [user, customerId, isOnline]);
    useEffect(() => {
        if (!customerId || !customer) {
            return;
        }
        lastCustomerReceiptsSnapshot = {
            customerId: String(customerId),
            sales,
            filteredSales,
            stores,
            customer,
            pendingSyncCount,
        };
    }, [customerId, customer, sales, filteredSales, stores, pendingSyncCount]);

    const updatePendingSyncCount = async (db: any) => {
        try {
            const syncQueue = await db.getAll('syncQueue');
            const salesPendingOps = syncQueue.filter((op: any) => op.table === 'sales' && op.storeId === user?.storeId);
            setPendingSyncCount(salesPendingOps.length);
        }
        catch (error) {
            setPendingSyncCount(0);
        }
    };

    const loadData = async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }

        try {
            const db = await getDB();

            if (isOnline) {
                try {
                    const response = await fetch(buildBypassUrl(`${BACKEND_BASE}/api/sales.php`, {
                        storeId: user?.storeId,
                    }), { cache: 'no-store' });

                    if (response.ok) {
                        const salesPayload = await response.json();
                        const backendSales = Array.isArray(salesPayload) ? salesPayload : (salesPayload.data || []);
                        const mergedBackendSales = await mergeBackendSalesIntoLocalDb(db, backendSales);
                        await processSales(mergedBackendSales, db);
                    }
                    else {
                        await loadFromLocal(db);
                    }
                }
                catch (error) {
                    await loadFromLocal(db);
                }
            }
            else {
                await loadFromLocal(db);
            }

            await updatePendingSyncCount(db);
        }
        catch (error) {
            toast.error('Erreur lors du chargement des données');
        }
        finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    };

    const loadFromLocal = async (db: any) => {
        const salesData = await db.getAll('sales');
        await processSales(salesData, db);
    };

    const processSales = async (allSales: any[], db: any) => {
        let storesData: StoreInfo[] = [];

        if (isOnline) {
            try {
                const storesResponse = await fetch(`${BACKEND_BASE}/api/stores.php`);

                if (storesResponse.ok) {
                    const backendStoresPayload = await storesResponse.json();
                    const backendStores = Array.isArray(backendStoresPayload) ? backendStoresPayload : (backendStoresPayload.data || []);
                    const tx = db.transaction('stores', 'readwrite');
                    const backendStoreIds = new Set(backendStores.map((store: StoreInfo) => store.id));
                    const localStores = await tx.store.getAll();
                    const storeDeletes = localStores
                        .filter((store: StoreInfo) => !backendStoreIds.has(store.id))
                        .map((store: StoreInfo) => tx.store.delete(store.id));

                    await Promise.all([
                        ...backendStores.map((store: StoreInfo) => tx.store.put(store)),
                        ...storeDeletes,
                        tx.done,
                    ]);

                    storesData = backendStores;
                }
                else {
                    storesData = await db.getAll('stores');
                }
            }
            catch (error) {
                storesData = await db.getAll('stores');
            }
        }
        else {
            storesData = await db.getAll('stores');
        }

        setStores(storesData);

        let allCustomers: Customer[] = [];

        if (isOnline) {
            try {
                let url = `${BACKEND_BASE}/api/customers.php`;
                if (user?.storeId) {
                    url += `?storeId=${user.storeId}`;
                }

                const customersResponse = await fetch(url, { cache: 'no-store' });

                if (customersResponse.ok) {
                    const backendCustomersPayload = await customersResponse.json();
                    const backendCustomers = Array.isArray(backendCustomersPayload) ? backendCustomersPayload : (backendCustomersPayload.data || []);
                    const storeCustomers = backendCustomers.filter((entry: Customer) => !user?.storeId || entry.storeId === user.storeId);
                    const tx = db.transaction('customers', 'readwrite');
                    const backendCustomerIds = new Set(storeCustomers.map((entry: Customer) => entry.id));
                    const localCustomers = await tx.store.getAll();
                    const storeLocalCustomers = user?.storeId
                        ? localCustomers.filter((entry: Customer) => entry.storeId === user.storeId)
                        : localCustomers;
                    const customerDeletes = storeLocalCustomers
                        .filter((entry: Customer) => !backendCustomerIds.has(entry.id))
                        .map((entry: Customer) => tx.store.delete(entry.id));

                    await Promise.all([
                        ...storeCustomers.map((entry: Customer) => tx.store.put(entry)),
                        ...customerDeletes,
                        tx.done,
                    ]);

                    allCustomers = storeCustomers;
                }
                else {
                    allCustomers = await db.getAll('customers');
                }
            }
            catch (error) {
                allCustomers = await db.getAll('customers');
            }
        }
        else {
            allCustomers = await db.getAll('customers');
        }

        if (customerId) {
            const currentCustomer = allCustomers.find((entry) => String(entry.id) === String(customerId)) || null;
            setCustomer(currentCustomer);
        }

        const normalizedSales = allSales.map((sale: any) => ({
            ...sale,
            subtotal: Number(sale.subtotal) || 0,
            tax: Number(sale.tax) || 0,
            total: Number(sale.total) || 0,
            refunded: isSaleRefunded(sale),
            createdAt: Number(sale.createdAt) || Date.now(),
            refundedAt: sale.refundedAt ? Number(sale.refundedAt) : null,
            items: Array.isArray(sale.items)
                ? sale.items.map((item: any) => ({
                    ...item,
                    quantity: Number(item.quantity) || 0,
                    price: Number(item.price) || 0,
                    tax: Number(item.tax) || 0,
                    total: Number(item.total) || 0,
                }))
                : [],
        }));

        let salesData = normalizedSales.filter((sale: Sale) => sale.customerId && String(sale.customerId) === String(customerId));

        if ((user?.role === 'admin' || user?.role === 'cashier') && user?.storeId) {
            salesData = salesData.filter((sale: Sale) => sale.storeId === user.storeId);
        }

        salesData.sort((first: Sale, second: Sale) => second.createdAt - first.createdAt);
        setSales(salesData);
        setFilteredSales(salesData);
    };

    useEffect(() => {
        const normalizedSearch = search.trim().toLowerCase();

        if (!normalizedSearch) {
            setFilteredSales(sales);
            return;
        }

        const filtered = sales.filter((sale) => {
            const store = stores.find((entry) => entry.id === sale.storeId);
            const receiptNumber = formatReceiptNumber(sale, sales);
            const itemsText = (sale.items || []).map((item) => item.name.toLowerCase()).join(' ');

            return receiptNumber.toLowerCase().includes(normalizedSearch)
                || (store?.name || '').toLowerCase().includes(normalizedSearch)
                || itemsText.includes(normalizedSearch)
                || getPaymentMethodText(sale.paymentMethod).toLowerCase().includes(normalizedSearch);
        });

        setFilteredSales(filtered);
    }, [search, sales, stores]);

    const handlePreviewReceipt = (sale: Sale) => {
        setSelectedSale(sale);
        setShowReceipt(true);
    };

    const handleRefresh = async () => {
        setRefreshing(true);

        try {
            await loadData(false);
        }
        finally {
            setRefreshing(false);
        }
    };

    const printSaleDirect = async (sale: Sale) => {
        setPrintingSaleId(sale.id);

        try {
            const db = await getDB();
            const store = await db.get('stores', sale.storeId);

            if (!store) {
                toast.error('Magasin introuvable pour ce reçu');
                return;
            }

            const receiptNumber = formatReceiptNumber(sale, sales);
            const date = new Date(sale.createdAt);
            const lines: string[] = [];

            const centerText = (value: string, width: number) => {
                const normalizedValue = (value || '').toString();

                if (normalizedValue.length >= width) {
                    return normalizedValue;
                }

                const left = Math.floor((width - normalizedValue.length) / 2);
                return ' '.repeat(left) + normalizedValue;
            };

            const paper = localStorage.getItem('printer_paper') || '80';
            const width = paper === '58' ? 32 : 48;

            lines.push(centerText(store.name || 'Magasin', width));
            if (store.address) {
                lines.push(centerText(store.address, width));
            }

            lines.push('');
            lines.push(NativePrinter.formatColumns(date.toLocaleString('fr-FR'), `Recu N°: ${receiptNumber}`, width));
            lines.push('--------------------------------');

            for (const item of sale.items || []) {
                const name = item.name || '';
                const quantity = Number(item.quantity) || 0;
                const price = Number.isNaN(Number(item.price)) ? 0 : Math.round(Number(item.price));
                const totalItem = Number.isNaN(Number(item.total)) ? quantity * price : Math.round(Number(item.total));
                const quantityText = `${quantity} x ${price} FCFA`;
                const totalText = `${totalItem} FCFA`;
                const leftFull = `${name} ${quantityText}`.trim();

                if (leftFull.length + 1 + totalText.length <= width) {
                    lines.push(NativePrinter.formatColumns(leftFull, totalText, width));
                }
                else if (name.length + 1 + totalText.length <= width) {
                    lines.push(NativePrinter.formatColumns(name, totalText, width));
                    lines.push(NativePrinter.formatColumns(quantityText, '', width));
                }
                else {
                    lines.push(NativePrinter.formatColumns(name, totalText, width));
                    lines.push(NativePrinter.formatColumns(quantityText, '', width));
                }
            }

            lines.push('--------------------------------');
            lines.push(NativePrinter.formatColumns('Sous-total:', formatCurrency(sale.subtotal || 0), width));
            lines.push(NativePrinter.formatColumns('TVA:', formatCurrency(sale.tax || 0), width));
            lines.push(NativePrinter.formatColumns('TOTAL:', formatCurrency(sale.total || 0), width));
            lines.push('');
            lines.push(NativePrinter.formatColumns('Mode de paiement:', getPaymentMethodText(sale.paymentMethod), width));

            if (sale.payments?.length) {
                for (const payment of sale.payments) {
                    const label = payment.method === 'cash' ? 'Especes' : payment.method === 'mobile_money' ? 'Mobile Money' : payment.method;
                    lines.push(NativePrinter.formatColumns(`${label}:`, formatCurrency(payment.amount || 0), width));
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
            <div>Recu N°: ${receiptNumber}</div>
            <div>Date: ${date.toLocaleString('fr-FR')}</div>
            <hr/>
            ${(sale.items || []).map((item) => `<div>${item.name} - ${item.quantity} x ${Math.round(item.price || 0)} = ${Math.round(item.total || 0)}</div>`).join('')}
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
        }
        catch (error) {
            toast.error('Erreur lors de l\'impression');
        }
        finally {
            setPrintingSaleId(null);
        }
    };

    const getPaymentMethodText = (method: string) => {
        switch (method) {
            case 'cash':
                return 'Espèces';
            case 'mobile_money':
                return 'Mobile Money';
            case 'mixed':
                return 'Mixte';
            default:
                return method;
        }
    };

    const totalRevenue = sales
        .filter((sale) => !sale.refunded)
        .reduce((sum, sale) => sum + sale.total, 0);
    const refundedCount = sales.filter((sale) => sale.refunded).length;
    const itemsCount = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const filteredRevenue = filteredSales
        .filter((sale) => !sale.refunded)
        .reduce((sum, sale) => sum + sale.total, 0);
    const customerInitial = customer?.name?.trim()?.charAt(0)?.toUpperCase() || 'C';

    return (
        <div className="space-y-4 p-3 sm:space-y-6 sm:p-6 lg:p-8">
            {pendingSyncCount > 0 && (
                <div className="flex justify-end">
                    <Badge variant="outline" className="px-3 py-1">
                        {pendingSyncCount} reçu{pendingSyncCount > 1 ? 's' : ''} en attente de sync
                    </Badge>
                </div>
            )}

            {loading && !customer ? (
                <Card>
                    <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 pt-6 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <div>
                            <p className="font-medium">Chargement des reçus client</p>
                            <p className="text-sm text-muted-foreground">Récupération du profil client et de son historique d'achats.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : !customer ? (
                <Card>
                    <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 pt-6 text-center">
                        <ReceiptText className="h-10 w-10 text-muted-foreground" />
                        <div>
                            <p className="font-medium">Client introuvable</p>
                            <p className="text-sm text-muted-foreground">Ce client n'existe plus localement ou n'a pas encore été synchronisé.</p>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/customers')}>Retour à la liste</Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card className={isMobile ? 'border-border/60 shadow-sm' : 'overflow-hidden'}>
                        <CardHeader className={isMobile ? 'gap-4 p-4 pb-3' : 'gap-6 pb-4'}>
                            {isMobile ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                                            {customerInitial}
                                        </div>

                                        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(-1)}>
                                            <ArrowLeft className="h-4 w-4" />
                                            Retour aux clients
                                        </Button>
                                    </div>

                                    <div className="space-y-1.5">
                                        <CardTitle className="text-xl leading-tight">Reçus de {customer.name}</CardTitle>
                                        <CardDescription className="max-w-[34ch] text-xs leading-5">
                                            Historique des tickets, paiements et remboursements pour ce client.
                                        </CardDescription>
                                    </div>

                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                                            <Phone className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{customer.phone || 'Téléphone non renseigné'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{sales.length > 0 ? `Dernier achat ${formatDateTime(sales[0]?.createdAt)}` : 'Aucun achat enregistré'}</span>
                                        </div>
                                    </div>

                                    <Button variant="outline" className="h-10 w-full" onClick={handleRefresh} disabled={refreshing || loading}>
                                        <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                        Actualiser
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
                                            {customerInitial}
                                        </div>

                                        <div className="min-w-0 space-y-3">
                                            <Button variant="outline" className="w-fit gap-2" onClick={() => navigate(-1)}>
                                                <ArrowLeft className="h-4 w-4" />
                                                Retour aux clients
                                            </Button>

                                            <div>
                                                <CardTitle className="text-3xl leading-tight">Reçus de {customer.name}</CardTitle>
                                                <CardDescription className="mt-1 text-sm">
                                                    Historique des tickets, paiements et remboursements pour ce client.
                                                </CardDescription>
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
                                                    <Phone className="h-3.5 w-3.5" />
                                                    {customer.phone || 'Téléphone non renseigné'}
                                                </div>
                                                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
                                                    <CalendarDays className="h-3.5 w-3.5" />
                                                    {sales.length > 0 ? `Dernier achat ${formatDateTime(sales[0]?.createdAt)}` : 'Aucun achat enregistré'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
                                            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                            Actualiser
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardHeader>

                        <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0 xl:grid-cols-4">
                            <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground sm:text-sm">Nombre de reçus</p>
                                        <p className="mt-2 text-xl font-semibold sm:text-2xl">{sales.length}</p>
                                    </div>
                                    <ReceiptText className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                                </div>
                            </div>

                            <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground sm:text-sm">Montant encaissé</p>
                                        <p className="mt-2 text-lg font-semibold sm:text-2xl">{formatCurrency(totalRevenue)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground sm:text-sm">Articles vendus</p>
                                        <p className="mt-2 text-xl font-semibold sm:text-2xl">{itemsCount}</p>
                                    </div>
                                    <Store className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                                </div>
                            </div>

                            <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground sm:text-sm">Remboursements</p>
                                        <p className="mt-2 text-xl font-semibold sm:text-2xl">{refundedCount}</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={isMobile ? 'border-border/60 shadow-sm' : ''}>
                        <CardHeader className={isMobile ? 'gap-3 p-4 pb-3' : 'gap-4'}>
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <CardTitle className="text-lg sm:text-xl">Historique des reçus</CardTitle>
                                    <CardDescription className="mt-1 text-xs sm:text-sm">
                                        {search
                                            ? `${filteredSales.length} résultat(s) sur ${sales.length} pour ${formatCurrency(filteredRevenue)}`
                                            : `${sales.length} reçu(s) enregistrés pour ${formatCurrency(totalRevenue)}`}
                                    </CardDescription>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="relative min-w-0 flex-1 sm:min-w-[320px]">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder={isMobile ? 'N° reçu, produit, paiement...' : 'Rechercher par N° reçu, magasin, produit ou paiement...'}
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            className="pl-10"
                                        />
                                    </div>

                                    {search && (
                                        <Button variant="ghost" onClick={() => setSearch('')}>
                                            Effacer
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0 sm:p-6 sm:pt-0">
                            {loading ? (
                                <div className="flex min-h-[220px] items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredSales.length === 0 ? (
                                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
                                    <ReceiptText className="h-10 w-10 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{search ? 'Aucun reçu ne correspond à votre recherche' : 'Ce client n\'a encore aucun reçu'}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {search ? 'Essayez un numéro de reçu, un produit ou un magasin.' : 'Les prochains achats apparaîtront ici automatiquement.'}
                                        </p>
                                    </div>
                                </div>
                            ) : isMobile ? (
                                <div className="space-y-3 p-3">
                                    {filteredSales.map((sale) => {
                                        const store = stores.find((entry) => entry.id === sale.storeId);
                                        const receiptNumber = formatReceiptNumber(sale, sales);

                                        return (
                                            <Card key={sale.id} className={`overflow-hidden rounded-2xl border shadow-sm ${sale.refunded ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                                                <CardHeader className="space-y-3 p-4 pb-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <CardTitle className="text-base">{receiptNumber}</CardTitle>
                                                            <CardDescription className="mt-1">{formatDateTime(sale.createdAt)}</CardDescription>
                                                        </div>

                                                        <Badge variant={sale.refunded ? 'destructive' : 'secondary'}>
                                                            {sale.refunded ? 'Remboursé' : 'Payé'}
                                                        </Badge>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <Badge variant="outline">{getPaymentMethodText(sale.paymentMethod)}</Badge>
                                                        <Badge variant="outline">{sale.items.length} article{sale.items.length > 1 ? 's' : ''}</Badge>
                                                    </div>
                                                </CardHeader>

                                                <CardContent className="space-y-4 p-4 pt-0">
                                                    <div className="space-y-2 text-sm text-muted-foreground">
                                                        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                                                            <span>Montant total</span>
                                                            <span className="font-semibold text-foreground">{formatCurrency(sale.total)}</span>
                                                        </div>

                                                        <div className="rounded-xl border bg-muted/20 p-3">
                                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Magasin</div>
                                                            <div className="mt-1 text-sm text-foreground">{store?.name || 'Magasin inconnu'}</div>
                                                        </div>

                                                        <div className="rounded-xl border bg-muted/20 p-3">
                                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Articles</div>
                                                            <div className="mt-2 space-y-2">
                                                                {sale.items.slice(0, 3).map((item) => (
                                                                    <div key={`${sale.id}-${item.productId}-${item.name}`} className="flex items-start justify-between gap-3 text-sm">
                                                                        <span className="line-clamp-2 text-foreground">{item.name}</span>
                                                                        <span className="shrink-0 text-muted-foreground">x{item.quantity}</span>
                                                                    </div>
                                                                ))}

                                                                {sale.items.length > 3 && (
                                                                    <div className="text-xs text-muted-foreground">+{sale.items.length - 3} autre(s) article(s)</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Button variant="ghost" className="h-11" onClick={() => handlePreviewReceipt(sale)} title="Aperçu du reçu">
                                                            <Eye className="h-4 w-4" />
                                                            Aperçu
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            className="h-11"
                                                            onClick={() => void printSaleDirect(sale)}
                                                            title="Imprimer"
                                                            disabled={printingSaleId === sale.id}
                                                        >
                                                            {printingSaleId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                                                            Imprimer
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
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
                                                <TableHead className="w-[140px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {filteredSales.map((sale) => {
                                                const store = stores.find((entry) => entry.id === sale.storeId);
                                                const receiptNumber = formatReceiptNumber(sale, sales);

                                                return (
                                                    <TableRow key={sale.id} className={sale.refunded ? 'bg-muted/20' : ''}>
                                                        <TableCell className="font-medium">
                                                            <div>
                                                                <div className="font-medium">{receiptNumber}</div>

                                                                {isMobile && (
                                                                    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                                                                        <div>{formatDateTime(sale.createdAt)}</div>
                                                                        {store && <div className="text-xs">{store.name}</div>}
                                                                        <div className="text-xs">
                                                                            {sale.items.length} article{sale.items.length > 1 ? 's' : ''} • {getPaymentMethodText(sale.paymentMethod)}
                                                                        </div>
                                                                        {sale.refunded && <div className="text-xs font-medium text-destructive">Remboursé</div>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="hidden sm:table-cell">{formatDateTime(sale.createdAt)}</TableCell>
                                                        <TableCell className="hidden md:table-cell">{store?.name || '-'}</TableCell>

                                                        <TableCell className="hidden lg:table-cell">
                                                            <div className="space-y-1">
                                                                {sale.items.slice(0, 2).map((item) => (
                                                                    <div key={`${sale.id}-${item.productId}-${item.name}`} className="text-sm leading-5 text-muted-foreground">
                                                                        {item.name} x{item.quantity}
                                                                    </div>
                                                                ))}
                                                                {sale.items.length > 2 && (
                                                                    <div className="text-xs text-muted-foreground">+{sale.items.length - 2} autre(s) article(s)</div>
                                                                )}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="font-medium">{formatCurrency(sale.total)}</TableCell>
                                                        <TableCell className="hidden md:table-cell">{getPaymentMethodText(sale.paymentMethod)}</TableCell>

                                                        <TableCell className="hidden lg:table-cell">
                                                            <Badge variant={sale.refunded ? 'destructive' : 'secondary'}>
                                                                {sale.refunded ? 'Remboursé' : 'Payé'}
                                                            </Badge>
                                                        </TableCell>

                                                        <TableCell>
                                                            <div className="flex gap-1">
                                                                <Button variant="ghost" size="icon" onClick={() => handlePreviewReceipt(sale)} title="Aperçu du reçu">
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => void printSaleDirect(sale)}
                                                                    title="Imprimer"
                                                                    disabled={printingSaleId === sale.id}
                                                                >
                                                                    {printingSaleId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                                                                </Button>
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
                </>
            )}

            {selectedSale && (
                <Receipt
                    open={showReceipt}
                    onOpenChange={setShowReceipt}
                    storeName={stores.find((entry) => entry.id === selectedSale.storeId)?.name || ''}
                    storeAddress={stores.find((entry) => entry.id === selectedSale.storeId)?.address || ''}
                    items={(selectedSale.items || []).map((item) => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total,
                    }))}
                    subtotal={selectedSale.subtotal}
                    tax={selectedSale.tax}
                    total={selectedSale.total}
                    paymentMethod={selectedSale.paymentMethod}
                    cashReceived={selectedSale.payments.find((payment) => payment.method === 'cash')?.amount}
                    change={(() => {
                        if (selectedSale.paymentMethod === 'cash' || selectedSale.paymentMethod === 'mobile_money') {
                            return (selectedSale.payments[0]?.amount || 0) - selectedSale.total;
                        }

                        if (selectedSale.paymentMethod === 'mixed') {
                            const totalPaid = (selectedSale.payments.find((payment) => payment.method === 'cash')?.amount || 0)
                                + (selectedSale.payments.find((payment) => payment.method === 'mobile_money')?.amount || 0);
                            return totalPaid - selectedSale.total;
                        }

                        return undefined;
                    })()}
                    receiptNumber={formatReceiptNumber(selectedSale, sales)}
                    date={new Date(selectedSale.createdAt)}
                />
            )}
        </div>
    );
}
