import { useEffect, useState, useRef } from 'react';
import { getDB, generateId } from '@/lib/db';
import { useNetwork } from '@/hooks/useNetwork';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users, Phone, Eye, Loader2, Mail, MapPin, CalendarDays, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { showAppConfirm } from '@/contexts/AppDialogContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { BACKEND_BASE } from '@/lib/backend';
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
type CustomersViewSnapshot = {
    storeId: string;
    customers: Customer[];
    filteredCustomers: Customer[];
    salesByCustomer: {
        [customerId: string]: any[];
    };
    loadedCount: number;
    hasMore: boolean;
    pendingSyncCount: number;
};
let lastCustomersViewSnapshot: CustomersViewSnapshot | null = null;

const formatVisitDate = (date: Date | null) => {
    if (!date) {
        return 'Aucune visite';
    }

    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export default function Customers() {
    const { user } = useAuth();
    const { isBackendReachable, manualSync } = useNetwork();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const hasSnapshotForCurrentStore = Boolean(lastCustomersViewSnapshot && String(lastCustomersViewSnapshot.storeId || '') === String(user?.storeId || ''));
    const [customers, setCustomers] = useState<Customer[]>(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.customers || []) : []);
    const [loadedCount, setLoadedCount] = useState(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.loadedCount || 0) : 0);
    const [pageSize] = useState(25);
    const [hasMore, setHasMore] = useState(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.hasMore ?? true) : true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.filteredCustomers || []) : []);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(() => !hasSnapshotForCurrentStore);
    const [isMutatingCustomer, setIsMutatingCustomer] = useState(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.pendingSyncCount || 0) : 0);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
    });
    // Ajout pour détails client
    const [salesByCustomer, setSalesByCustomer] = useState<{
        [customerId: string]: any[];
    }>(() => hasSnapshotForCurrentStore ? (lastCustomersViewSnapshot?.salesByCustomer || {}) : {});
    useEffect(() => {
        loadCustomers(!hasSnapshotForCurrentStore);
        loadSales();
    }, []);
    useEffect(() => {
        if (!user?.storeId) {
            return;
        }
        lastCustomersViewSnapshot = {
            storeId: user.storeId,
            customers,
            filteredCustomers,
            salesByCustomer,
            loadedCount,
            hasMore,
            pendingSyncCount,
        };
    }, [user?.storeId, customers, filteredCustomers, salesByCustomer, loadedCount, hasMore, pendingSyncCount]);
    useEffect(() => {
        // Filtrer les clients en fonction de la recherche
        if (searchTerm.trim() === '') {
            setFilteredCustomers(customers);
        }
        else {
            const term = searchTerm.toLowerCase();
            const filtered = customers.filter(customer => customer.name.toLowerCase().includes(term) ||
                customer.phone.toLowerCase().includes(term) ||
                customer.email?.toLowerCase().includes(term) ||
                customer.address?.toLowerCase().includes(term));
            setFilteredCustomers(filtered);
        }
    }, [searchTerm, customers]);
    const loadSales = async () => {
        const db = await getDB();
        const sales = user?.storeId
            ? await db.getAllFromIndex('sales', 'by-store', user.storeId)
            : await db.getAll('sales');
        // Regroupe les ventes par client
        const byCustomer: {
            [customerId: string]: any[];
        } = {};
        for (const sale of sales) {
            if (sale.customerId) {
                if (!byCustomer[sale.customerId])
                    byCustomer[sale.customerId] = [];
                byCustomer[sale.customerId].push(sale);
            }
        }
        setSalesByCustomer(byCustomer);
    };
    const getOrderedCustomers = async (db: any) => {
        const allCustomers = await db.getAll('customers');
        const normalizedCustomers = allCustomers.map((customer: any) => ({ ...customer, storeId: customer.storeId || '' }));
        const storeCustomers = user?.storeId
            ? normalizedCustomers.filter((customer: any) => customer.storeId === user.storeId)
            : normalizedCustomers;

        storeCustomers.sort((a: any, b: any) => b.createdAt - a.createdAt);
        return storeCustomers as Customer[];
    };
    const refreshCustomersFromLocal = async (db: any, visibleCount = pageSize) => {
        const orderedCustomers = await getOrderedCustomers(db);
        const nextVisibleCount = Math.max(visibleCount, pageSize);
        const nextCustomers = orderedCustomers.slice(0, nextVisibleCount);

        setCustomers(nextCustomers);
        setLoadedCount(nextCustomers.length);
        setHasMore(orderedCustomers.length > nextCustomers.length);

        return nextCustomers;
    };
    const loadCustomers = async (showLoading = true) => {
        if (showLoading) {
            setIsLoadingCustomers(true);
        }
        try {
            const db = await getDB();
            // Si en ligne, charger depuis le backend et synchroniser
            if (isBackendReachable) {
                try {
                    // Charger les clients depuis le backend (n'ajouter storeId que s'il est défini)
                    let url = `${BACKEND_BASE}/api/customers.php`;
                    if (user?.storeId)
                        url += `?storeId=${user.storeId}`;
                    const response = await fetch(url);
                    if (response.ok) {
                        const backendCustomersResponse = await response.json();
                        const backendCustomers = Array.isArray(backendCustomersResponse)
                            ? backendCustomersResponse
                            : backendCustomersResponse.data || [];
                        // Filtrer côté client aussi pour sécurité
                        const storeCustomers = backendCustomers.filter((c: any) => !user?.storeId || c.storeId === user.storeId);
                        // Mettre à jour la base locale et supprimer les clients effacés côté backend
                        const tx = db.transaction('customers', 'readwrite');
                        const backendCustomerIds = new Set(storeCustomers.map((c: any) => c.id));
                        const localCustomers = await tx.store.getAll();
                        const storeLocalCustomers = user?.storeId
                            ? localCustomers.filter((c: any) => c.storeId === user.storeId)
                            : localCustomers;
                        const deletes = storeLocalCustomers
                            .filter((c: any) => !backendCustomerIds.has(c.id))
                            .map((c: any) => tx.store.delete(c.id));
                        await Promise.all([
                            ...storeCustomers.map(c => tx.store.put(c)),
                            ...deletes,
                            tx.done
                        ]);
                        // reset pagination and load first page
                        setLoadedCount(0);
                        setHasMore(true);
                        await loadCustomersPage(db, 0, pageSize, true);
                    }
                    else {
                        await loadCustomersPage(db, 0, pageSize, true);
                    }
                }
                catch (error) {
                    // En cas d'erreur, charger depuis la base locale (paged)
                    await loadCustomersPage(db, 0, pageSize, true);
                }
            }
            else {
                // Hors ligne : charger depuis la base locale (paged)
                await loadCustomersPage(db, 0, pageSize, true);
            }
            // Compter les éléments en attente de synchronisation
            await updatePendingSyncCount(db);
        }
        catch (error) {
            toast.error('Erreur lors du chargement des clients');
        }
        finally {
            if (showLoading) {
                setIsLoadingCustomers(false);
            }
        }
    };
    const loadFromLocal = async (db: any) => {
        return loadCustomersPage(db, 0, pageSize, true);
    };
    const loadCustomersPage = async (db: any, offset: number, limit: number, reset = false) => {
        try {
            const orderedCustomers = await getOrderedCustomers(db);
            const page = orderedCustomers.slice(offset, offset + limit);
            if (reset) {
                setCustomers(page);
                setLoadedCount(page.length);
            }
            else {
                setCustomers(prev => [...prev, ...page]);
                setLoadedCount(prev => prev + page.length);
            }
            setHasMore(orderedCustomers.length > offset + page.length);
            return page;
        }
        catch (e) {
            // fallback
            const orderedCustomers = await getOrderedCustomers(db);
            const page = orderedCustomers.slice(offset, offset + limit);
            if (reset)
                setCustomers(page);
            else
                setCustomers(prev => [...prev, ...page]);
            setLoadedCount(reset ? page.length : offset + page.length);
            setHasMore(orderedCustomers.length > offset + page.length);
            return page;
        }
    };
    const listScrollRef = useRef<HTMLDivElement | null>(null);
    const handleListScroll = async () => {
        const el = listScrollRef.current;
        if (!el || loadingMore || !hasMore)
            return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
            setLoadingMore(true);
            try {
                const db = await getDB();
                await loadCustomersPage(db, loadedCount, pageSize, false);
            }
            catch (e) {
            }
            finally {
                setLoadingMore(false);
            }
        }
    };
    const updatePendingSyncCount = async (db: any) => {
        try {
            const syncQueue = await db.getAll('syncQueue');
            const customerPendingOps = syncQueue.filter(op => op.table === 'customers' && op.storeId === user?.storeId);
            setPendingSyncCount(customerPendingOps.length);
        }
        catch (error) {
        }
    };
    const addToSyncQueue = async (db: any, syncOp: any) => {
        try {
            await db.add('syncQueue', syncOp);
            await updatePendingSyncCount(db);
        }
        catch (error) {
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.storeId) {
            toast.error('Erreur: utilisateur non authentifié ou magasin non défini');
            return;
        }
        // Validation téléphone
        const phone = formData.phone.trim();
        if (!phone || phone.length !== 8) {
            toast.error('Téléphone: 8 chiffres requis');
            return;
        }
        try {
            setIsMutatingCustomer(true);
            const db = await getDB();
            if (editingCustomer) {
                // Modification
                const updated: Customer = {
                    ...editingCustomer,
                    ...formData,
                    phone: `+226 ${phone}`,
                    storeId: user.storeId, // Forcer le storeId de l'utilisateur connecté
                };
                // Sauvegarder localement d'abord
                await db.put('customers', updated);
                await refreshCustomersFromLocal(db, Math.max(loadedCount, pageSize));
                // Si en ligne, synchroniser immédiatement avec le backend
                if (isBackendReachable) {
                    try {
                        const response = await fetch(`${BACKEND_BASE}/api/customers.php`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(updated)
                        });
                        if (!response.ok) {
                            throw new Error(`Erreur backend: ${response.status}`);
                        }
                        toast.success('Client mis à jour et synchronisé');
                    }
                    catch (error) {
                        // Ajouter à la queue de synchronisation pour plus tard
                        await addToSyncQueue(db, {
                            id: generateId(),
                            table: 'customers',
                            operation: 'PUT',
                            data: updated,
                            url: `${BACKEND_BASE}/api/customers.php`,
                            storeId: user.storeId,
                            createdAt: Date.now()
                        });
                        toast.success('Client mis à jour (sera synchronisé plus tard)');
                    }
                }
                else {
                    // Hors ligne : ajouter directement à la queue de synchronisation
                    await addToSyncQueue(db, {
                        id: generateId(),
                        table: 'customers',
                        operation: 'PUT',
                        data: updated,
                        url: `${BACKEND_BASE}/api/customers.php`,
                        storeId: user.storeId,
                        createdAt: Date.now()
                    });
                    toast.success('Client mis à jour (mode hors ligne)');
                }
            }
            else {
                // Création
                const newCustomer: Customer = {
                    id: generateId(),
                    ...formData,
                    phone: `+226 ${phone}`,
                    balance: 0,
                    createdAt: Date.now(),
                    storeId: user.storeId, // Forcer le storeId de l'utilisateur connecté
                };
                // Sauvegarder localement d'abord
                await db.add('customers', newCustomer);
                await refreshCustomersFromLocal(db, Math.max(loadedCount + 1, pageSize));
                // Si en ligne, synchroniser immédiatement avec le backend
                if (isBackendReachable) {
                    try {
                        const response = await fetch(`${BACKEND_BASE}/api/customers.php`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(newCustomer)
                        });
                        if (!response.ok) {
                            throw new Error(`Erreur backend: ${response.status}`);
                        }
                        toast.success('Client créé et synchronisé');
                    }
                    catch (error) {
                        // Ajouter à la queue de synchronisation pour plus tard
                        await addToSyncQueue(db, {
                            id: generateId(),
                            table: 'customers',
                            operation: 'POST',
                            data: newCustomer,
                            url: `${BACKEND_BASE}/api/customers.php`,
                            storeId: user.storeId,
                            createdAt: Date.now()
                        });
                        toast.success('Client créé (sera synchronisé plus tard)');
                    }
                }
                else {
                    // Hors ligne : ajouter directement à la queue de synchronisation
                    await addToSyncQueue(db, {
                        id: generateId(),
                        table: 'customers',
                        operation: 'POST',
                        data: newCustomer,
                        url: `${BACKEND_BASE}/api/customers.php`,
                        storeId: user.storeId,
                        createdAt: Date.now()
                    });
                    toast.success('Client créé (mode hors ligne)');
                }
            }
            setIsDialogOpen(false);
            resetForm();
            await updatePendingSyncCount(db);
        }
        catch (error) {
            toast.error('Erreur lors de l\'enregistrement');
        }
        finally {
            setIsMutatingCustomer(false);
        }
    };
    const handleEdit = (customer: Customer) => {
        setEditingCustomer(customer);
        setFormData({
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            notes: customer.notes,
        });
        setIsDialogOpen(true);
    };
    const handleDelete = async (id: string) => {
        if (!await showAppConfirm('Êtes-vous sûr de vouloir supprimer ce client ?'))
            return;
        try {
            setIsMutatingCustomer(true);
            const db = await getDB();
            await db.delete('customers', id);
            await refreshCustomersFromLocal(db, Math.max(loadedCount, pageSize));
            // Si en ligne, synchroniser immédiatement avec le backend
            if (isBackendReachable) {
                try {
                    const response = await fetch(`${BACKEND_BASE}/api/customers.php?id=${id}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    });
                    if (!response.ok) {
                        throw new Error(`Erreur backend: ${response.status}`);
                    }
                    toast.success('Client supprimé et synchronisé');
                }
                catch (error) {
                    // Ajouter à la queue de synchronisation pour plus tard
                    await addToSyncQueue(db, {
                        id: generateId(),
                        table: 'customers',
                        operation: 'DELETE',
                        data: { id },
                        url: `${BACKEND_BASE}/api/customers.php?id=${id}`,
                        storeId: user?.storeId,
                        createdAt: Date.now()
                    });
                    toast.success('Client supprimé (sera synchronisé plus tard)');
                }
            }
            else {
                // Hors ligne : ajouter directement à la queue de synchronisation
                await addToSyncQueue(db, {
                    id: generateId(),
                    table: 'customers',
                    operation: 'DELETE',
                    data: { id },
                    url: `${BACKEND_BASE}/api/customers.php?id=${id}`,
                    storeId: user?.storeId,
                    createdAt: Date.now()
                });
                toast.success('Client supprimé (mode hors ligne)');
            }
            await updatePendingSyncCount(db);
        }
        catch (error) {
            toast.error('Erreur lors de la suppression');
        }
        finally {
            setIsMutatingCustomer(false);
        }
    };
    const resetForm = () => {
        setEditingCustomer(null);
        setFormData({
            name: '',
            phone: '',
            email: '',
            address: '',
            notes: '',
        });
    };
    // ...existing code...
    // Place return at the root of the component
        return (<div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Clients</h1>
                        {(isLoadingCustomers || isMutatingCustomer) && (<div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin"/>
              </div>)}
          </div>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez votre base de clients</p>
        </div>
        {/* ...Dialog code inchangé... */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open)
                resetForm();
        }}>
          <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2"/>
                Nouveau client
              </Button>
            </DialogTrigger>
      <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCustomer ? 'Modifier le client' : 'Nouveau client'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ...form fields inchangés... */}
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required/>
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
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
                  <Input value={formData.phone} onChange={e => {
            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
            setFormData({ ...formData, phone: val });
        }} placeholder="XXXXXXXX" type="tel" maxLength={8} style={{ flex: 1 }} required/>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}/>
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}/>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3}/>
              </div>
              <div className="flex gap-2">
                                <Button type="button" variant="outline" className="w-1/2" onClick={() => setIsDialogOpen(false)} disabled={isMutatingCustomer}>
                  Annuler
                </Button>
                                <Button type="submit" className="w-1/2" disabled={isMutatingCustomer}>
                                    {isMutatingCustomer ? 'Traitement...' : (editingCustomer ? 'Mettre à jour' : 'Créer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
                    <div className="mb-4">
            <Input placeholder="Rechercher par nom, téléphone, email ou adresse..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full"/>
          </div>

                    {isMobile && (<div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border bg-muted/30 p-3">
                                <div className="text-xs text-muted-foreground">Clients affichés</div>
                                <div className="mt-1 text-xl font-semibold">{filteredCustomers.length}</div>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-3">
                                <div className="text-xs text-muted-foreground">En attente de sync</div>
                                <div className="mt-1 text-xl font-semibold">{pendingSyncCount}</div>
                            </div>
                        </div>)}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
                    {isMobile ? (<div className="space-y-3 p-3">
                                                        {isLoadingCustomers && customers.length === 0 ? (Array.from({ length: 6 }).map((_, i) => (<div key={`mobile-skeleton-${i}`} className="rounded-2xl border p-4">
                                        <div className="animate-pulse space-y-3">
                                            <div className="h-5 w-32 rounded bg-gray-200"/>
                                            <div className="h-4 w-24 rounded bg-gray-200"/>
                                            <div className="h-4 w-40 rounded bg-gray-200"/>
                                            <div className="grid grid-cols-3 gap-2 pt-1">
                                                <div className="h-10 rounded bg-gray-200"/>
                                                <div className="h-10 rounded bg-gray-200"/>
                                                <div className="h-10 rounded bg-gray-200"/>
                                            </div>
                                        </div>
                                    </div>))) : filteredCustomers.length === 0 ? (<div className="py-10 text-center text-muted-foreground">
                                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50"/>
                                    <p>{searchTerm ? 'Aucun client trouvé' : 'Aucun client enregistré'}</p>
                                </div>) : (filteredCustomers.map((customer) => {
                                const sales = salesByCustomer[customer.id] || [];
                                const lastVisit = sales.length > 0 ? new Date(Math.max(...sales.map(s => s.createdAt))) : null;
                                return (<Card key={customer.id} className="overflow-hidden rounded-2xl border shadow-sm">
                                            <CardHeader className="space-y-3 p-4 pb-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <CardTitle className="truncate text-base">{customer.name}</CardTitle>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            <Badge variant="secondary">{sales.length} visite{sales.length > 1 ? 's' : ''}</Badge>
                                                            <Badge variant="outline">{lastVisit ? 'Actif' : 'Nouveau'}</Badge>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                                        Client
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3 p-4 pt-0">
                                                <div className="space-y-2 text-sm text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Phone className="h-4 w-4 shrink-0"/>
                                                        <span className="truncate">{customer.phone || 'Téléphone non renseigné'}</span>
                                                    </div>
                                                    {customer.email && (<div className="flex items-center gap-2">
                                                            <Mail className="h-4 w-4 shrink-0"/>
                                                            <span className="truncate">{customer.email}</span>
                                                        </div>)}
                                                    {customer.address && (<div className="flex items-center gap-2">
                                                            <MapPin className="h-4 w-4 shrink-0"/>
                                                            <span className="line-clamp-2">{customer.address}</span>
                                                        </div>)}
                                                    <div className="flex items-center gap-2">
                                                        <CalendarDays className="h-4 w-4 shrink-0"/>
                                                        <span className="truncate">{formatVisitDate(lastVisit)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <ReceiptText className="h-4 w-4 shrink-0"/>
                                                        <span>{sales.length} passage{sales.length > 1 ? 's' : ''} en caisse</span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 pt-1">
                                                    <Button variant="ghost" className="h-10" onClick={() => handleEdit(customer)} title="Modifier" disabled={isMutatingCustomer}>
                                                        <Edit className="w-4 h-4"/>
                                                    </Button>
                                                    <Button variant="ghost" className="h-10" onClick={() => handleDelete(customer.id)} title="Supprimer" disabled={isMutatingCustomer}>
                                                        <Trash2 className="w-4 h-4"/>
                                                    </Button>
                                                    <Button variant="outline" className="h-10" title="Voir les reçus du client" onClick={() => navigate(`/customer-receipts/${customer.id}`)}>
                                                        <Eye className="w-4 h-4"/>
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>);
                        }))}

                            {loadingMore && (<div className="py-4 text-center text-sm text-muted-foreground">
                                    Chargement...
                                </div>)}
                        </div>) : (<div className="overflow-x-auto" ref={listScrollRef} onScroll={handleListScroll}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Adresse</TableHead>
                  <TableHead className="hidden md:table-cell">Dernière visite</TableHead>
                  <TableHead className="hidden lg:table-cell">Nb visites</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                                {isLoadingCustomers && customers.length === 0 ? (Array.from({ length: 6 }).map((_, i) => (<TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={7} className="py-8">
                        <div className="flex items-center gap-3 animate-pulse">
                          <div className="h-5 bg-gray-200 rounded w-32"/>
                          <div className="h-4 bg-gray-200 rounded w-20"/>
                          <div className="h-4 bg-gray-200 rounded w-16"/>
                        </div>
                      </TableCell>
                    </TableRow>))) : filteredCustomers.length === 0 ? (<TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50"/>
                      <p>{searchTerm ? 'Aucun client trouvé' : 'Aucun client enregistré'}</p>
                    </TableCell>
                  </TableRow>) : (filteredCustomers.map((customer) => {
            const sales = salesByCustomer[customer.id] || [];
            const lastVisit = sales.length > 0 ? new Date(Math.max(...sales.map(s => s.createdAt))) : null;
            return (<TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{customer.name}</div>
                            {isMobile && (<div className="text-sm text-muted-foreground mt-1 space-y-1">
                                {customer.phone && (<div className="flex items-center gap-1">
                                    <Phone className="w-3 h-3"/>
                                    <span>{customer.phone}</span>
                                  </div>)}
                                {sales.length > 0 && (<div className="text-xs">
                                    {sales.length} visite{sales.length > 1 ? 's' : ''}
                                  </div>)}
                              </div>)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground"/>
                            {customer.phone}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{customer.email || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell max-w-xs truncate">{customer.address || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {lastVisit ? lastVisit.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {sales.length}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)} title="Modifier" disabled={isMutatingCustomer}>
                              <Edit className="w-4 h-4"/>
                            </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(customer.id)} title="Supprimer" disabled={isMutatingCustomer}>
                              <Trash2 className="w-4 h-4"/>
                            </Button>
                            <Button variant="outline" size="icon" title="Voir les reçus du client" onClick={() => navigate(`/customer-receipts/${customer.id}`)}>
                              <Eye className="w-4 h-4"/>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>);
        }))}
                {loadingMore && (<TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      Chargement...
                    </TableCell>
                  </TableRow>)}
              </TableBody>
                        </Table>
                    </div>)}
        </CardContent>
      </Card>
    </div>);
}
