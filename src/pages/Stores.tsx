import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Store, Edit, Trash2, Plus, RefreshCw, Power, ArrowLeftRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
interface StoreData {
    id: string;
    name: string;
    address: string;
    active?: boolean; // Optionnel pour compatibilité avec les données existantes
    createdAt: number;
    subscriptionStart?: number; // Date de début d'abonnement
    subscriptionEnd?: number; // Date de fin d'abonnement
    lastPayment?: number; // Date du dernier paiement
}
export default function Stores() {
    const { user, setActiveStore } = useAuth();
    const navigate = useNavigate();
    const [switchingStore, setSwitchingStore] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    const { isOnline } = useNetwork();
    const [stores, setStores] = useState<StoreData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDialog, setShowDialog] = useState(false);
    const [editingStore, setEditingStore] = useState<StoreData | null>(null);
    const [formData, setFormData] = useState({ name: '', address: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [subscriptionFilter, setSubscriptionFilter] = useState<string>('all');
    // Ajout du formulaire admin
    const [adminForm, setAdminForm] = useState({ username: '', phone: '', password: '' });
    // Single input to search/select existing admins or create new one
    const [adminLookup, setAdminLookup] = useState('');
    const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
    const [admins, setAdmins] = useState<Array<any>>([]);
    const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
    // Renouvellement abonnement
    const PRICE_PER_MONTH = 5000;
    const [renewalDialog, setRenewalDialog] = useState<{
        open: boolean;
        store: StoreData | null;
        months: number;
    }>({
        open: false, store: null, months: 1
    });
    useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                await loadData();
            }
            finally {
                setIsLoading(false);
            }
        })();
    }, []);
    const loadData = async () => {
        await loadStores();
    };
    const loadStores = async () => {
        const db = await getDB();
        // If online, try to fetch latest stores from backend and persist locally
        if (isOnline) {
            try {
                const resp = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php');
                if (resp.ok) {
                    let backendStores: any = await resp.json();
                    // Accept common wrapper shapes
                    if (!Array.isArray(backendStores)) {
                        if (backendStores && Array.isArray(backendStores.data)) {
                            backendStores = backendStores.data;
                        }
                        else if (backendStores && Array.isArray(backendStores.stores)) {
                            backendStores = backendStores.stores;
                        }
                        else {
                            backendStores = [];
                        }
                    }
                    // Filter out stores pending local deletion
                    let pendingDeleteIds = new Set<string>();
                    try {
                        const pending = await db.getAll('syncQueue');
                        pendingDeleteIds = new Set(pending
                            .filter((op: any) => String(op?.method || '').toUpperCase() === 'DELETE' && String(op?.url || '').includes('/stores.php'))
                            .map((op: any) => op?.data?.id)
                            .filter(Boolean));
                    }
                    catch (e) {
                        // ignore if syncQueue unavailable
                    }
                    backendStores = backendStores.filter((s: any) => !pendingDeleteIds.has(s.id));
                    // Normalize stores and ensure createdAt is numeric
                    backendStores = backendStores.map((s: any) => ({
                        id: s.id,
                        name: s.name || s.title || 'Magasin',
                        address: s.address || s.location || '',
                        active: s.active !== undefined ? !!s.active : true,
                        createdAt: s.createdAt ? Number(s.createdAt) : Date.now(),
                        subscriptionStart: s.subscriptionStart ? Number(s.subscriptionStart) : undefined,
                        subscriptionEnd: s.subscriptionEnd ? Number(s.subscriptionEnd) : undefined,
                        lastPayment: s.lastPayment ? Number(s.lastPayment) : undefined,
                        // keep any extra fields
                        ...s
                    }));
                    // Also remove from local DB any stores that no longer exist on backend
                    // (except those pending a local create that haven't synced yet)
                    const localStores = await db.getAll('stores');
                    const backendIds = new Set(backendStores.map((s: any) => s.id));
                    let pendingCreateIds = new Set<string>();
                    try {
                        const pending = await db.getAll('syncQueue');
                        pendingCreateIds = new Set(pending
                            .filter((op: any) => String(op?.method || '').toUpperCase() === 'POST' && String(op?.url || '').includes('/stores.php'))
                            .map((op: any) => op?.data?.id)
                            .filter(Boolean));
                    }
                    catch (_) { /* ignore */ }
                    const tx = db.transaction('stores', 'readwrite');
                    const puts = backendStores.map((s: any) => tx.store.put(s));
                    const deletes = localStores
                        .filter((s: any) => !backendIds.has(s.id) && !pendingCreateIds.has(s.id))
                        .map((s: any) => tx.store.delete(s.id));
                    // Wait for all puts, deletes and tx completion
                    await Promise.all([...puts, ...deletes, tx.done]);
                }
                else {
                }
            }
            catch (e) {
            }
        }
        let storesData = await db.getAll('stores');
        // Hide stores pending deletion from local list too
        try {
            const pending = await db.getAll('syncQueue');
            const pendingDeleteIds = new Set(pending
                .filter((op: any) => String(op?.method || '').toUpperCase() === 'DELETE' && String(op?.url || '').includes('/stores.php'))
                .map((op: any) => op?.data?.id)
                .filter(Boolean));
            storesData = storesData.filter(s => !pendingDeleteIds.has(s.id));
        }
        catch (e) {
            // ignore
        }
        // Vérifier et désactiver les abonnements expirés
        const now = Date.now();
        for (const store of storesData) {
            if (store.subscriptionEnd && store.subscriptionEnd <= now && store.active) {
                await db.put('stores', { ...store, active: false });
                // Désactiver aussi tous les utilisateurs du magasin
                const allUsers = await db.getAll('users');
                const storeUsers = allUsers.filter(u => u.storeId === store.id);
                for (const storeUser of storeUsers) {
                    await db.put('users', { ...storeUser, active: false });
                }
            }
        }
        // Recharger les données après mise à jour
        storesData = await db.getAll('stores');
        // Ajouter les propriétés d'abonnement et active si elles n'existent pas (compatibilité)
        storesData = storesData.map(store => ({
            ...store,
            active: store.active !== undefined ? store.active : true,
            subscriptionStart: (store as any).subscriptionStart || store.createdAt,
            subscriptionEnd: (store as any).subscriptionEnd || (store.createdAt + (30 * 24 * 60 * 60 * 1000)),
            lastPayment: (store as any).lastPayment || store.createdAt
        }));
        // Si c'est un admin, il ne voit que les magasins qui lui sont liés
        if (user?.role === 'admin') {
            const userStoreIds = (user as any).storeIds && Array.isArray((user as any).storeIds) && (user as any).storeIds.length > 0
                ? (user as any).storeIds
                : (user?.storeId ? [user.storeId] : []);
            storesData = storesData.filter(store => userStoreIds.includes(store.id));
        }
        setStores(storesData);
    };
    const loadAdmins = async () => {
        try {
            const db = await getDB();
            const allUsers = await db.getAll('users');
            const adminsOnly = allUsers.filter(u => u.role === 'admin');
            setAdmins(adminsOnly);
            setAdminLookup('');
            setIsCreatingAdmin(false);
            setSelectedAdminId(null);
        }
        catch (e) {
        }
    };
    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            toast.error('Le nom du magasin est requis');
            return;
        }
        if (user?.role === 'super_admin' && !editingStore) {
            // Require either selecting an existing admin or explicitly creating a new one
            if (!selectedAdminId && !isCreatingAdmin) {
                toast.error('Veuillez sélectionner un administrateur existant ou créer un nouvel admin');
                return;
            }
            if (isCreatingAdmin) {
                if (!adminForm.phone.trim() || !adminForm.password.trim()) {
                    toast.error('Téléphone et mot de passe sont requis pour créer un nouvel admin');
                    return;
                }
            }
        }
        const db = await getDB();
        try {
            let storeId = editingStore ? editingStore.id : generateId();
            // Ajout automatique du préfixe +226 au téléphone admin avant enregistrement
            let adminPhone = adminForm.phone;
            if (adminPhone && !adminPhone.startsWith('+226')) {
                adminPhone = '+226' + adminPhone;
            }
            if (editingStore) {
                // Modification store (API ou file d'attente)
                const putData: any = {
                    ...editingStore,
                    name: formData.name,
                    address: formData.address,
                };
                if (selectedAdminId)
                    putData.adminId = selectedAdminId;
                const apiRes = await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                    method: 'PUT',
                    data: putData,
                });
                await db.put('stores', {
                    ...editingStore,
                    name: formData.name,
                    address: formData.address,
                });
                // If assigned an existing admin during edit, create local mapping and update user
                let mappingAlreadyExisted = false;
                if (selectedAdminId) {
                    try {
                        // Avoid duplicate mapping: check if a mapping already exists for this user/store
                        const existingForUser = await db.getAllFromIndex('userStores', 'by-user', selectedAdminId as any);
                        const alreadyLinked = existingForUser.some((m: any) => m.storeId === editingStore.id);
                        if (alreadyLinked) {
                            mappingAlreadyExisted = true;
                            toast('Cet administrateur est déjà affecté à ce magasin');
                        }
                        else {
                            const linkId = generateId();
                            await db.add('userStores', { id: linkId, userId: selectedAdminId, storeId: editingStore.id });
                        }
                    }
                    catch (e) {
                    }
                    try {
                        const existing = await db.get('users', selectedAdminId);
                        if (existing) {
                            const currentStoreIds = (existing as any).storeIds && Array.isArray((existing as any).storeIds)
                                ? (existing as any).storeIds
                                : (existing.storeId ? [existing.storeId] : []);
                            const updated = Array.from(new Set([...currentStoreIds, editingStore.id]));
                            await db.put('users', { ...existing, storeIds: updated, storeId: existing.storeId || editingStore.id });
                        }
                    }
                    catch (e) {
                    }
                }
                // If the only issue was that the admin was already linked, we already showed a toast
                // and should not show the generic "Magasin modifié" message in that case.
                if (!mappingAlreadyExisted) {
                    toast.success('Magasin modifié');
                }
            }
            else {
                const now = Date.now();
                const subscriptionEnd = now + (30 * 24 * 60 * 60 * 1000); // 30 jours
                // Ajout store (API ou file d'attente)
                const storePayload: any = {
                    id: storeId,
                    name: formData.name,
                    address: formData.address,
                    active: true,
                    createdAt: now,
                    subscriptionStart: now,
                    subscriptionEnd: subscriptionEnd,
                    lastPayment: now,
                };
                // If super_admin creating a store: either include admin (new) or adminId (existing)
                if (user?.role === 'super_admin') {
                    if (isCreatingAdmin) {
                        storePayload.admin = {
                            id: generateId(),
                            username: adminForm.username && adminForm.username.trim() ? adminForm.username : (adminLookup || 'admin'),
                            phone: adminPhone,
                            password: adminForm.password,
                            role: 'admin',
                            active: true,
                            createdAt: Date.now(),
                        };
                    }
                    else if (selectedAdminId) {
                        storePayload.adminId = selectedAdminId;
                    }
                }
                const apiRes = await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                    method: 'POST',
                    data: storePayload,
                });
                await db.add('stores', {
                    id: storeId,
                    name: formData.name,
                    address: formData.address,
                    active: true,
                    createdAt: now,
                    subscriptionStart: now,
                    subscriptionEnd: subscriptionEnd,
                    lastPayment: now,
                });
                // Création de l'admin associé au magasin (super_admin seulement)
                if (user?.role === 'super_admin') {
                    if (isCreatingAdmin) {
                        // Vérifier l'unicité du téléphone en local
                        const existingUser = await db.getFromIndex('users', 'by-phone', adminPhone);
                        if (existingUser) {
                            toast.error('Ce numéro de téléphone est déjà utilisé');
                            return;
                        }
                        // Création en local (persist localement)
                        await createUser({
                            username: adminForm.username && adminForm.username.trim() ? adminForm.username : (adminLookup || 'admin'),
                            phone: adminPhone,
                            password: adminForm.password,
                            role: 'admin',
                            storeId: storeId
                        });
                        // The backend will create the remote user when provided in the storePayload.admin field.
                    }
                    else if (selectedAdminId) {
                        // Link existing local user to this store in userStores mapping and update their storeIds
                        try {
                            const existingForUser = await db.getAllFromIndex('userStores', 'by-user', selectedAdminId as any);
                            const alreadyLinked = existingForUser.some((m: any) => m.storeId === storeId);
                            if (alreadyLinked) {
                                toast('Cet administrateur est déjà affecté à ce magasin');
                            }
                            else {
                                const linkId = generateId();
                                await db.add('userStores', { id: linkId, userId: selectedAdminId, storeId: storeId });
                            }
                        }
                        catch (e) {
                        }
                        try {
                            const existing = await db.get('users', selectedAdminId);
                            if (existing) {
                                const currentStoreIds = (existing as any).storeIds && Array.isArray((existing as any).storeIds)
                                    ? (existing as any).storeIds
                                    : (existing.storeId ? [existing.storeId] : []);
                                const updated = Array.from(new Set([...currentStoreIds, storeId]));
                                await db.put('users', { ...existing, storeIds: updated, storeId: existing.storeId || storeId });
                            }
                        }
                        catch (e) {
                        }
                    }
                }
                toast.success('Magasin et admin créés');
            }
            setShowDialog(false);
            setEditingStore(null);
            setFormData({ name: '', address: '' });
            setAdminForm({ username: '', phone: '', password: '' });
            loadStores();
        }
        catch (error) {
            toast.error('Erreur lors de l\'enregistrement');
        }
    };
    const handleEdit = async (store: StoreData) => {
        setEditingStore(store);
        setFormData({ name: store.name, address: store.address });
        // Prepare admin selection for edit: load admins and existing mapping
        setIsCreatingAdmin(false);
        setSelectedAdminId(null);
        // Try to find existing mapping(s) for this store and prefill the lookup immediately
        try {
            const db = await getDB();
            const mappings = await db.getAllFromIndex('userStores', 'by-store', store.id as any);
            if (mappings && mappings.length > 0) {
                const first = mappings[0];
                setSelectedAdminId(first.userId);
                const user = await db.get('users', first.userId);
                if (user)
                    setAdminLookup(`${user.username || user.phone} — ${user.phone || ''}`);
            }
            else {
                setAdminLookup('');
            }
        }
        catch (e) {
            // ignore if index not present or any error
            setAdminLookup('');
        }
        // Load admins afterwards so suggestions are available
        await loadAdmins();
        setShowDialog(true);
    };
    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce magasin ?'))
            return;
        const db = await getDB();
        try {
            const apiRes = await performSyncOp({
                url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                method: 'DELETE',
                data: { id },
            });
            // Supprimer toutes les données locales liées au magasin
            const tables: Array<'users' | 'userStores' | 'customers' | 'sales' | 'products' | 'categories' | 'expenses' | 'expensesAdvanced' | 'expenseCategories' | 'shifts' | 'stockSignals' | 'hiddenCategories' | 'emailSettings' | 'pendingEmails'> = [
                'users', 'userStores', 'customers', 'sales', 'products', 'categories', 'expenses', 'expensesAdvanced', 'expenseCategories', 'shifts', 'stockSignals', 'hiddenCategories', 'emailSettings', 'pendingEmails'
            ];
            for (const table of tables) {
                const all = await db.getAll(table);
                // On ne filtre que si l'item a un champ storeId
                const toDelete = all.filter(item => 'storeId' in item && item.storeId === id);
                for (const item of toDelete) {
                    await db.delete(table, item.id);
                }
            }
            await db.delete('stores', id);
            toast.success('Magasin supprimé');
            loadStores();
        }
        catch (error) {
            toast.error('Erreur lors de la suppression');
        }
    };
    const createUser = async (userData: any) => {
        const db = await getDB();
        await db.add('users', {
            id: generateId(),
            ...userData,
            active: true,
            createdAt: Date.now(),
        });
    };
    const renewSubscription = async (storeId: string, months: number) => {
        const db = await getDB();
        try {
            const store = await db.get('stores', storeId);
            if (store) {
                const now = Date.now();
                const currentEnd = (store as any).subscriptionEnd || now;
                const newEnd = Math.max(currentEnd, now) + (months * 30 * 24 * 60 * 60 * 1000);
                const updatedStore = {
                    ...store,
                    subscriptionEnd: newEnd,
                    lastPayment: now,
                    active: true // Réactiver le magasin
                };
                // Synchroniser avec le backend d'abord
                const apiRes = await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                    method: 'PUT',
                    data: updatedStore,
                });
                // Puis mettre à jour localement
                await db.put('stores', updatedStore);
                // Réactiver tous les utilisateurs du magasin
                const allUsers = await db.getAll('users');
                const storeUsers = allUsers.filter(u => u.storeId === storeId);
                for (const storeUser of storeUsers) {
                    await db.put('users', { ...storeUser, active: true });
                }
                const total = months * PRICE_PER_MONTH;
                // Enregistrer l'encaissement
                try {
                    await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/subscription_payments.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: generateId(),
                            storeId,
                            storeName: store.name,
                            months,
                            amount: total,
                            paidAt: now,
                            note: `Renouvellement ${months} mois — nouvelle expiration: ${new Date(newEnd).toLocaleDateString('fr-FR')}`,
                        }),
                    });
                }
                catch (e) {
                }
                toast.success(`Abonnement renouvelé — ${months} mois — ${total.toLocaleString('fr-FR')} F`);
                setRenewalDialog({ open: false, store: null, months: 1 });
                loadStores();
            }
        }
        catch (error) {
            toast.error('Erreur lors du renouvellement');
        }
    };
    const toggleStoreStatus = async (storeId: string, currentStatus: boolean) => {
        const db = await getDB();
        try {
            // Mettre à jour le statut du magasin
            const store = await db.get('stores', storeId);
            if (store) {
                const updatedStore = { ...store, active: !currentStatus };
                // Synchroniser avec le backend d'abord
                const apiRes = await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                    method: 'PUT',
                    data: updatedStore,
                });
                // Puis mettre à jour localement
                await db.put('stores', updatedStore);
                // Mettre à jour tous les utilisateurs liés à ce magasin
                const allUsers = await db.getAll('users');
                const storeUsers = allUsers.filter(u => u.storeId === storeId);
                for (const storeUser of storeUsers) {
                    await db.put('users', { ...storeUser, active: !currentStatus });
                }
                toast.success(`Magasin ${!currentStatus ? 'activé' : 'désactivé'} avec succès`);
                loadStores();
            }
        }
        catch (error) {
            toast.error('Erreur lors de la mise à jour du statut');
        }
    };
    const openNewDialog = () => {
        setEditingStore(null);
        setFormData({ name: '', address: '' });
        setAdminForm({ username: '', phone: '', password: '' });
        setAdminLookup('');
        setIsCreatingAdmin(false);
        setSelectedAdminId(null);
        loadAdmins();
        setShowDialog(true);
    };
    const filteredStores = stores.filter(store => {
        // Filtre de recherche
        const matchesSearch = !searchQuery ||
            store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (store.address && store.address.toLowerCase().includes(searchQuery.toLowerCase()));
        // Filtre par statut
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'active' && store.active !== false) ||
            (statusFilter === 'inactive' && store.active === false);
        // Filtre par état d'abonnement
        const matchesSubscription = subscriptionFilter === 'all' || (() => {
            const now = Date.now();
            const subEnd = (store as any).subscriptionEnd;
            if (!subEnd)
                return subscriptionFilter === 'active'; // Si pas d'info, considérer comme actif
            const isExpired = subEnd <= now;
            return (subscriptionFilter === 'active' && !isExpired) ||
                (subscriptionFilter === 'expired' && isExpired);
        })();
        return matchesSearch && matchesStatus && matchesSubscription;
    });
    return (<div className="p-4 sm:p-6 space-y-6 lg:max-w-7xl lg:mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Magasins</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez vos points de vente</p>
          {user?.role === 'admin' && (<div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Magasin actif :</span>
              <span className="inline-block px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {stores.find(s => s.id === user.storeId)?.name || 'Aucun'}
              </span>
              <Badge variant="outline" className="px-2 py-0.5 text-xs">
                {filteredStores.length} magasin{filteredStores.length > 1 ? 's' : ''}
              </Badge>
            </div>)}
        </div>
        {/* Dialog présent pour l'édition et la création. Le trigger (Nouveau magasin) reste réservé au super_admin. */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          {user?.role === 'super_admin' && (<DialogTrigger asChild>
              <Button className="w-full sm:w-auto" onClick={openNewDialog}>
                <Plus className="w-4 h-4 mr-2"/>
                Nouveau magasin
              </Button>
            </DialogTrigger>)}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStore ? 'Modifier le magasin' : 'Nouveau magasin'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du magasin *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Magasin Central"/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Adresse complète du magasin" rows={3}/>
              </div>
              {/* Formulaire d'administration : saisie unique + suggestions */}
              {user?.role === 'super_admin' && (<div className="space-y-2">
                  <Label htmlFor="admin-lookup">Rechercher un Admin</Label>
                  <div>
                    <div className="flex items-start gap-3">
                      <div style={{ flex: 1 }}>
                        <Input id="admin-lookup" placeholder={admins.length ? 'Saisir nom ou téléphone, puis choisir dans la liste' : 'Saisir nom ou téléphone (aucun admin local)'} value={adminLookup} onChange={(e) => {
                setAdminLookup(e.target.value);
                setSelectedAdminId(null);
                setIsCreatingAdmin(false);
            }}/>
                        {/* Suggestions */}
                        {adminLookup && (<div className="mt-1 border rounded bg-white max-h-40 overflow-auto">
                            {admins
                    .filter(a => {
                    const q = adminLookup.toLowerCase();
                    const name = (a.username || '').toString().toLowerCase();
                    const phone = (a.phone || '').toString().toLowerCase();
                    return name.includes(q) || phone.includes(q);
                })
                    .map(a => (<div key={a.id} className="p-2 hover:bg-gray-100 cursor-pointer" onClick={() => {
                        setSelectedAdminId(a.id);
                        setAdminLookup(`${a.username || a.phone} — ${a.phone || ''}`);
                        setIsCreatingAdmin(false);
                    }}>
                                  {a.username || a.phone} <span className="text-muted-foreground">{a.phone ? `— ${a.phone}` : ''}</span>
                                </div>))}
                            {/* If no match, show option text */}
                            {admins.filter(a => {
                    const q = adminLookup.toLowerCase();
                    const name = (a.username || '').toString().toLowerCase();
                    const phone = (a.phone || '').toString().toLowerCase();
                    return name.includes(q) || phone.includes(q);
                }).length === 0 && (<div className="p-2 text-sm text-gray-600">Aucun admin trouvé.</div>)}
                          </div>)}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {selectedAdminId ? (<>
                            <div className="text-sm">Admin sélectionné <strong>{admins.find(a => a.id === selectedAdminId)?.username || ''}</strong></div>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedAdminId(null); setAdminLookup(''); }}>Effacer</Button>
                          </>) : (<Button variant="outline" size="sm" onClick={() => { setIsCreatingAdmin(true); setAdminForm(prev => ({ ...prev, username: adminLookup })); }}>Créer un nouvel admin</Button>)}
                      </div>
                    </div>

                    {/* If creating new admin, show phone/password fields */}
                    {isCreatingAdmin && (<div className="mt-3 space-y-2">
                        <Label htmlFor="admin-phone">Téléphone admin *</Label>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">+226</span>
                          <Input id="admin-phone" type="tel" maxLength={8} pattern="[0-9]{8}" value={adminForm.phone} onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                    setAdminForm({ ...adminForm, phone: val });
                }} placeholder="XXXXXXXX" style={{ flex: 1 }} required/>
                        </div>
                        <Label htmlFor="admin-password">Mot de passe admin *</Label>
                        <Input id="admin-password" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="Mot de passe admin"/>
                      </div>)}
                  </div>
                </div>)}
              <Button onClick={handleSubmit} className="w-full">
                {editingStore ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barre de recherche et filtres */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Barre de recherche */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4"/>
              <Input placeholder="Rechercher par nom ou adresse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10"/>
            </div>
            
            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label className="text-sm mb-2 block">Statut</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les statuts"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="inactive">Inactif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <Label className="text-sm mb-2 block">Abonnement</Label>
                <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les abonnements"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les états</SelectItem>
                    <SelectItem value="active">Abonnement actif</SelectItem>
                    <SelectItem value="expired">Abonnement expiré</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              

            </div>
          </div>
        </CardContent>
      </Card>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:items-stretch lg:gap-6">
        {isLoading ? (Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`} className="rounded-xl shadow-md border border-gray-200 bg-white overflow-hidden">
              <div className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-gray-200 rounded"/>
                  <div className="h-5 bg-gray-200 rounded w-40 animate-pulse"/>
                </div>
              </div>
              <CardContent>
                <div className="mb-3 space-y-1">
                  <div className="h-3 bg-gray-200 rounded w-28 animate-pulse mb-2"/>
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"/>
                    <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"/>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 flex-1 bg-gray-200 rounded animate-pulse"/>
                  <div className="h-9 w-12 bg-gray-200 rounded animate-pulse"/>
                </div>
              </CardContent>
            </Card>))) : (filteredStores.map(store => (<Card key={store.id} className="rounded-2xl border border-border/60 bg-card shadow-sm hover:shadow-md transition overflow-hidden lg:h-full lg:flex lg:flex-col lg:justify-between">
            <div className="flex flex-col min-h-[190px] md:min-h-[220px] lg:h-full">
              <div className="flex items-start justify-between p-4 border-b border-border/60 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Store className="w-5 h-5"/>
                  </div>
                  <div>
                    <div className="font-semibold text-base sm:text-lg">{store.name}</div>
                    <div className="text-xs text-muted-foreground">{store.address || 'Pas d\'adresse'}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${(store.active !== false) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${(store.active !== false) ? 'bg-green-600' : 'bg-red-600'}`}/>
                  {(store.active !== false) ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <CardContent className="flex-1 p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Créé le</p>
                    <p className="font-medium">{new Date(store.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  {(store as any).subscriptionStart && (<div className="space-y-1">
                      <p className="text-muted-foreground">Abonnement depuis</p>
                      <p className="font-medium">{new Date((store as any).subscriptionStart).toLocaleDateString('fr-FR')}</p>
                    </div>)}
                  {(store as any).subscriptionEnd && (<div className="space-y-1 col-span-2">
                      <p className="text-muted-foreground">Expiration</p>
                      <p className={`font-medium ${(store as any).subscriptionEnd > Date.now()
                    ? 'text-green-600'
                    : 'text-red-600'}`}>
                        {new Date((store as any).subscriptionEnd).toLocaleDateString('fr-FR')}
                        {(store as any).subscriptionEnd <= Date.now() && ' (EXPIRÉ)'}
                      </p>
                    </div>)}
                  <div className="col-span-2 flex items-center justify-between gap-2">
                    {(store as any).subscriptionEnd && (store as any).subscriptionEnd > Date.now() ? (<span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                        Jours restants: {Math.ceil(((store as any).subscriptionEnd - Date.now()) / (1000 * 60 * 60 * 24))}
                      </span>) : <span />}
                    <div className="flex items-center gap-1 ml-auto">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEdit(store)} title="Modifier" aria-label="Modifier">
                        <Edit className="w-3.5 h-3.5"/>
                      </Button>
                      {user?.role === 'admin' && (<Button variant="default" size="icon" className="h-7 w-7" onClick={() => setSwitchingStore({ id: store.id, name: store.name || store.id })} title="Basculer" aria-label="Basculer">
                          <ArrowLeftRight className="w-3.5 h-3.5"/>
                        </Button>)}
                    </div>
                  </div>
                </div>
              </CardContent>
              <div className="p-4 pt-2 lg:pt-4 lg:flex lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full lg:flex-row lg:items-center lg:justify-between">
                  {/* Left group: Renouveler */}
                  <div className="flex flex-row flex-wrap gap-2 items-center w-full sm:w-1/2 lg:w-1/2">
                    {user?.role === 'super_admin' && (<Button variant="default" size="icon" onClick={() => setRenewalDialog({ open: true, store: store, months: 1 })} className="h-9 w-9 bg-blue-600 hover:bg-blue-700" title="Renouveler l'abonnement" aria-label="Renouveler l'abonnement">
                        <RefreshCw className="w-4 h-4"/>
                      </Button>)}
                  </div>

                  {/* Right group: Désactiver/Activer, Supprimer */}
                  <div className="flex flex-row flex-wrap gap-2 items-center justify-end w-full sm:w-1/2 lg:w-auto">
                    {/* If admin (not super_admin) allow to switch active store */}
                    {user?.role === 'admin' && (<>
                        <Dialog open={!!switchingStore} onOpenChange={() => { if (!isSwitching)
                setSwitchingStore(null); }}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Confirmer le basculement</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <p>Vous vous apprêtez à basculer sur le magasin <strong>{switchingStore?.name}</strong>. Voulez-vous continuer ?</p>
                              <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setSwitchingStore(null)} disabled={isSwitching} className="flex-1">
                                  Annuler
                                </Button>
                                <Button onClick={async () => {
                    if (!switchingStore)
                        return;
                    setIsSwitching(true);
                    try {
                        await setActiveStore(switchingStore.id);
                        const name = switchingStore.name || switchingStore.id;
                        // small animated confirmation: show spinner then redirect
                        toast.success(`Vous êtes maintenant connecté sur : ${name}`);
                        // refresh local lists
                        await loadStores();
                        // keep the spinner visible briefly for perceived animation
                        setTimeout(() => {
                            setIsSwitching(false);
                            setSwitchingStore(null);
                            navigate('/dashboard');
                        }, 700);
                    }
                    catch (e) {
                        setIsSwitching(false);
                        toast.error('Impossible de basculer sur ce magasin');
                    }
                }} disabled={isSwitching} className="flex-1">
                                  {isSwitching ? <span className="inline-block w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin"/> : null}
                                  Confirmer
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>)}
                    {user?.role === 'super_admin' && (<Button variant={(store.active !== false) ? 'destructive' : 'default'} size="icon" onClick={() => toggleStoreStatus(store.id, store.active !== false)} className="h-9 w-9" title={(store.active !== false) ? 'Désactiver' : 'Activer'} aria-label={(store.active !== false) ? 'Désactiver' : 'Activer'}>
                        <Power className="w-4 h-4"/>
                      </Button>)}
                    {user?.role === 'super_admin' && (<Button variant="outline" size="icon" onClick={() => handleDelete(store.id)} className="h-9 w-9" title="Supprimer" aria-label="Supprimer">
                        <Trash2 className="w-4 h-4"/>
                      </Button>)}
                  </div>
                </div>
              </div>
            </div>
          </Card>)))}
      </div>

      {/* Dialog renouvellement abonnement */}
      <Dialog open={renewalDialog.open} onOpenChange={(open) => { if (!open)
        setRenewalDialog({ open: false, store: null, months: 1 }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renouveler l'abonnement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Magasin : <strong>{renewalDialog.store?.name}</strong>
            </p>
            {renewalDialog.store && (renewalDialog.store as any).subscriptionEnd && (<p className="text-sm text-muted-foreground">
                Expiration actuelle :{' '}
                <span className={(renewalDialog.store as any).subscriptionEnd <= Date.now() ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {new Date((renewalDialog.store as any).subscriptionEnd).toLocaleDateString('fr-FR')}
                  {(renewalDialog.store as any).subscriptionEnd <= Date.now() && ' (EXPIRÉ)'}
                </span>
              </p>)}
            <div className="space-y-2">
              <Label htmlFor="renewal-months">Nombre de mois</Label>
              <Select value={String(renewalDialog.months)} onValueChange={(v) => setRenewalDialog(d => ({ ...d, months: Number(v) }))}>
                <SelectTrigger id="renewal-months">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (<SelectItem key={m} value={String(m)}>
                      {m} mois — {(m * PRICE_PER_MONTH).toLocaleString('fr-FR')} F
                    </SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Prix par mois</span>
                <span className="font-medium">{PRICE_PER_MONTH.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Durée</span>
                <span className="font-medium">{renewalDialog.months} mois ({renewalDialog.months * 30} jours)</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-blue-200 pt-2 mt-2">
                <span>Total à payer</span>
                <span className="text-blue-700">{(renewalDialog.months * PRICE_PER_MONTH).toLocaleString('fr-FR')} F</span>
              </div>
            </div>
            {renewalDialog.store && (renewalDialog.store as any).subscriptionEnd && (<p className="text-xs text-muted-foreground">
                Nouvelle expiration :{' '}
                <strong>
                  {new Date(Math.max((renewalDialog.store as any).subscriptionEnd, Date.now()) +
                renewalDialog.months * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')}
                </strong>
              </p>)}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRenewalDialog({ open: false, store: null, months: 1 })}>
                Annuler
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => renewalDialog.store && renewSubscription(renewalDialog.store.id, renewalDialog.months)}>
                Confirmer — {(renewalDialog.months * PRICE_PER_MONTH).toLocaleString('fr-FR')} F
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!isLoading && stores.length === 0 && (<Card className="p-12 text-center">
          <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4"/>
          <p className="text-muted-foreground">Aucun magasin. Créez-en un pour commencer.</p>
        </Card>)}
      
      {!isLoading && stores.length > 0 && filteredStores.length === 0 && (<Card className="p-12 text-center">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4"/>
          <p className="text-muted-foreground">Aucun magasin ne correspond à votre recherche.</p>
          <Button variant="link" className="mt-2" onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setSubscriptionFilter('all');
            }}>
            Réinitialiser les filtres
          </Button>
        </Card>)}
    </div>);
}
