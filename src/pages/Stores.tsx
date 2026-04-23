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
import { isActiveFlag } from '@/lib/status';
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

  function normalizeStoreIds(storeIds?: Array<string | null | undefined>, fallbackStoreId?: string | null) {
    const ids = Array.isArray(storeIds) ? storeIds : [];
    const candidates = ids.length > 0 ? ids : [fallbackStoreId];

    return Array.from(new Set(candidates
      .map((storeId) => String(storeId || '').trim())
      .filter(Boolean)));
  }

function StoreSummaryCard({ title, value, subtitle, icon: Icon, color }: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ElementType;
    color: string;
}) {
    return (<Card className="border-border/60 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={`shrink-0 rounded-xl p-2.5 ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>);
}

function formatStoreDate(value?: number) {
    if (!value) {
        return 'Non renseigne';
    }

    return new Date(value).toLocaleDateString('fr-FR');
}

function getStoreVisualState(store: StoreData) {
    const active = isActiveFlag(store.active);
    const subscriptionEnd = (store as any).subscriptionEnd ? Number((store as any).subscriptionEnd) : null;
    const now = Date.now();
    const hasSubscriptionEnd = subscriptionEnd !== null && !Number.isNaN(subscriptionEnd);
    const expired = Boolean(hasSubscriptionEnd && subscriptionEnd <= now);
    const remainingDays = hasSubscriptionEnd
        ? Math.max(0, Math.ceil((subscriptionEnd - now) / (1000 * 60 * 60 * 24)))
        : null;

    if (expired) {
        return {
            active,
            expired,
            remainingDays,
            statusLabel: active ? 'Abonnement expire' : 'Inactif',
            statusClassName: 'bg-rose-100 text-rose-700 border border-rose-200',
            accentClassName: 'bg-rose-100 text-rose-700',
            headerClassName: 'from-rose-50 via-white to-orange-100/70',
            cardClassName: 'border-rose-100/80 shadow-rose-100/60',
            subscriptionClassName: 'bg-rose-50 text-rose-700 border border-rose-200',
        };
    }

    if (!active) {
        return {
            active,
            expired,
            remainingDays,
            statusLabel: 'Inactif',
            statusClassName: 'bg-slate-100 text-slate-700 border border-slate-200',
            accentClassName: 'bg-slate-100 text-slate-700',
            headerClassName: 'from-slate-50 via-white to-slate-100/80',
            cardClassName: 'border-slate-200/80 shadow-slate-100/70',
            subscriptionClassName: 'bg-slate-50 text-slate-600 border border-slate-200',
        };
    }

    return {
        active,
        expired,
        remainingDays,
        statusLabel: 'Actif',
        statusClassName: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        accentClassName: 'bg-blue-100 text-blue-700',
        headerClassName: 'from-blue-50 via-white to-emerald-100/70',
        cardClassName: 'border-blue-100/80 shadow-blue-100/60',
        subscriptionClassName: 'bg-blue-50 text-blue-700 border border-blue-200',
    };
}

function StoreManagementCard({
    store,
    viewerRole,
    onEdit,
    onSwitch,
    onRenew,
    onToggleStatus,
    onDelete,
}: {
    store: StoreData;
    viewerRole?: string;
    onEdit: () => void;
    onSwitch?: () => void;
    onRenew?: () => void;
    onToggleStatus?: () => void;
    onDelete?: () => void;
}) {
    const visual = getStoreVisualState(store);
    const subscriptionStart = (store as any).subscriptionStart ? Number((store as any).subscriptionStart) : null;
    const subscriptionEnd = (store as any).subscriptionEnd ? Number((store as any).subscriptionEnd) : null;

    return (<Card className={`overflow-hidden rounded-[28px] border bg-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-xl ${visual.cardClassName}`}>
      <div className={`border-b border-border/60 bg-gradient-to-br ${visual.headerClassName} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${visual.accentClassName}`}>
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold tracking-tight text-slate-900">{store.name}</div>
              <div className="mt-1 text-sm text-slate-500">{store.address || 'Pas d\'adresse renseignee'}</div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${visual.statusClassName}`}>
              {visual.statusLabel}
            </span>
            {subscriptionEnd && (<span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${visual.subscriptionClassName}`}>
                {visual.remainingDays !== null ? `${visual.remainingDays} jours restants` : `Expire le ${formatStoreDate(subscriptionEnd)}`}
              </span>)}
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        <div className="rounded-2xl bg-slate-50/80 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Adresse</div>
          <div className="text-sm leading-6 text-slate-700">{store.address || 'Aucune adresse enregistree pour ce magasin.'}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Creation</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{formatStoreDate(store.createdAt)}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Abonnement</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{formatStoreDate(subscriptionStart || undefined)}</div>
          </div>
          <div className="col-span-2 rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Expiration</div>
                <div className={`mt-2 text-sm font-semibold ${visual.expired ? 'text-rose-600' : 'text-slate-900'}`}>
                  {formatStoreDate(subscriptionEnd || undefined)}
                </div>
              </div>
              {visual.remainingDays !== null ? (<div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {visual.remainingDays} jours
                </div>) : subscriptionEnd ? (<div className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                  Expire
                </div>) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" className="h-11 flex-1 rounded-2xl border-slate-200 bg-white text-base font-semibold hover:bg-slate-50" onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </Button>
          {viewerRole === 'admin' && onSwitch && (<Button className="h-11 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" onClick={onSwitch}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Basculer
            </Button>)}
          {viewerRole === 'super_admin' && onRenew && (<Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-blue-200 text-blue-700 hover:bg-blue-50" onClick={onRenew}>
              <RefreshCw className="h-4 w-4" />
            </Button>)}
          {viewerRole === 'super_admin' && onToggleStatus && (<Button variant="outline" size="icon" className={`h-11 w-11 rounded-2xl ${visual.active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`} onClick={onToggleStatus}>
              <Power className="h-4 w-4" />
            </Button>)}
          {viewerRole === 'super_admin' && onDelete && (<Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-slate-200 text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>)}
        </div>
      </CardContent>
    </Card>);
}

export default function Stores() {
    const { user, setActiveStore } = useAuth();
  const storeFormTotalSteps = user?.role === 'super_admin' ? 2 : 1;
    const navigate = useNavigate();
    const [switchingStore, setSwitchingStore] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    const { isOnline } = useNetwork();
    const [stores, setStores] = useState<StoreData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());
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
    const [linkedAdmins, setLinkedAdmins] = useState<Array<any>>([]);
    const [storeFormStep, setStoreFormStep] = useState(1);
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
      loadData();
    }, []);
    const loadData = async () => {
      setIsLoading(true);
      try {
        await loadStores();
      }
      finally {
        setIsLoading(false);
        setLastRefresh(new Date());
      }
    };
    const loadStores = async () => {
        const db = await getDB();
        // If online, try to fetch latest stores from backend and persist locally
        if (isOnline) {
            try {
                const resp = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php?include_inactive=1');
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
                      active: isActiveFlag(s.active),
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
          if (store.subscriptionEnd && store.subscriptionEnd <= now && isActiveFlag(store.active)) {
                await db.put('stores', { ...store, active: false });
            }
        }
        // Recharger les données après mise à jour
        storesData = await db.getAll('stores');
        // Ajouter les propriétés d'abonnement et active si elles n'existent pas (compatibilité)
        storesData = storesData.map(store => ({
            ...store,
          active: isActiveFlag(store.active),
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
        }
        catch (e) {
        }
    };
      const loadLinkedAdmins = async (storeId: string) => {
        try {
          const db = await getDB();
          const allUsers = await db.getAll('users');
          const nextLinkedAdmins = allUsers.filter((candidate: any) => candidate.role === 'admin' && normalizeStoreIds(candidate.storeIds, candidate.storeId).includes(storeId));
          setLinkedAdmins(nextLinkedAdmins);
        }
        catch (e) {
          setLinkedAdmins([]);
        }
      };
      const handleDetachAdminFromStore = async (adminId: string, storeId: string) => {
        const db = await getDB();
        try {
          const existingUser = await db.get('users', adminId);
          if (!existingUser) {
            toast.error('Administrateur introuvable');
            return;
          }

          const currentStoreIds = normalizeStoreIds((existingUser as any).storeIds, (existingUser as any).storeId);
          if (!currentStoreIds.includes(storeId)) {
            return;
          }

          const nextStoreIds = currentStoreIds.filter((currentStoreId) => currentStoreId !== storeId);
          if (nextStoreIds.length === 0) {
            toast.error('Impossible de dissocier le dernier magasin de cet administrateur');
            return;
          }

          const updatedUser = {
            ...existingUser,
            storeIds: nextStoreIds,
            storeId: String((existingUser as any).storeId || '') === String(storeId)
              ? (nextStoreIds[0] || '')
              : (existingUser as any).storeId,
          };

          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
            method: 'PUT',
            data: updatedUser,
          });

          await db.put('users', updatedUser);

          const mappings = await db.getAllFromIndex('userStores', 'by-user', adminId as any);
          for (const mapping of mappings.filter((mapping: any) => String(mapping.storeId || '') === String(storeId))) {
            await db.delete('userStores', (mapping as any).id);
          }

          if (selectedAdminId === adminId) {
            setSelectedAdminId(null);
            setAdminLookup('');
          }

          setLinkedAdmins((current) => current.filter((candidate: any) => candidate.id !== adminId));
          toast.success('Administrateur dissocié du magasin');
        }
        catch (error) {
          toast.error('Erreur lors de la dissociation');
        }
      };
    const handleConfirmStoreSwitch = async () => {
        if (!switchingStore) {
            return;
        }

        setIsSwitching(true);
        try {
            await setActiveStore(switchingStore.id);
            const name = switchingStore.name || switchingStore.id;
            toast.success(`Vous êtes maintenant connecté sur : ${name}`);
            await loadStores();
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
    };
    const renderStoreSwitchDialog = () => {
        if (user?.role !== 'admin') {
            return null;
        }

        return (<Dialog open={!!switchingStore} onOpenChange={() => { if (!isSwitching)
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
                <Button onClick={handleConfirmStoreSwitch} disabled={isSwitching} className="flex-1">
                  {isSwitching ? <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-white"/> : null}
                  Confirmer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>);
    };
    const handleSubmit = async () => {
      if (!editingStore && user?.role !== 'super_admin') {
        toast.error('Seul le super admin peut créer des magasins');
        return;
      }
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
      setStoreFormStep(1);
        setFormData({ name: store.name, address: store.address });
        // Prepare admin selection for edit: load admins and existing mapping
        setIsCreatingAdmin(false);
        setSelectedAdminId(null);
      setAdminLookup('');
        // Load admins afterwards so suggestions are available
        await loadAdmins();
      await loadLinkedAdmins(store.id);
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
          const users = await db.getAll('users');
          const deletedUserIds = new Set<string>();
          for (const existingUser of users) {
            const primaryStoreId = String((existingUser as any).storeId || '');
            const currentStoreIds = Array.isArray((existingUser as any).storeIds)
              ? (existingUser as any).storeIds.filter(Boolean)
              : (primaryStoreId ? [primaryStoreId] : []);
            const isLinkedToDeletedStore = primaryStoreId === id || currentStoreIds.includes(id);
            if (!isLinkedToDeletedStore) {
              continue;
            }
            const remainingStoreIds = currentStoreIds.filter((storeId: string) => storeId !== id);
            if (remainingStoreIds.length === 0 && (existingUser as any).role !== 'super_admin') {
              deletedUserIds.add(existingUser.id);
              await db.delete('users', existingUser.id);
              continue;
            }
            const nextPrimaryStoreId = primaryStoreId === id ? (remainingStoreIds[0] || '') : primaryStoreId;
            await db.put('users', {
              ...existingUser,
              storeIds: remainingStoreIds,
              storeId: nextPrimaryStoreId,
            });
          }

          const userStoreMappings = await db.getAll('userStores');
          for (const mapping of userStoreMappings.filter((mapping: any) => mapping.storeId === id || deletedUserIds.has(String(mapping.userId || '')))) {
            await db.delete('userStores', mapping.id);
          }

          const storeScopedTables: Array<'customers' | 'sales' | 'products' | 'categories' | 'expenses' | 'expensesAdvanced' | 'expenseCategories' | 'shifts' | 'stockSignals' | 'hiddenCategories' | 'emailSettings' | 'pendingEmails'> = [
            'customers',
            'sales',
            'products',
            'categories',
            'expenses',
            'expensesAdvanced',
            'expenseCategories',
            'shifts',
            'stockSignals',
            'hiddenCategories',
            'emailSettings',
            'pendingEmails',
          ];
          for (const table of storeScopedTables) {
            const all = await db.getAll(table);
            const toDelete = all.filter((item: any) => item.storeId === id || deletedUserIds.has(String(item.userId || '')));
            for (const item of toDelete) {
              await db.delete(table, item.id);
            }
          }

          const adminCaches = await db.getAll('adminCache');
          for (const cache of adminCaches.filter((cache: any) => cache.id === id || cache.storeId === id)) {
            await db.delete('adminCache', cache.id);
          }

          const inboxEntries = await db.getAll('notificationInbox');
          for (const entry of inboxEntries.filter((entry: any) => entry.notification?.targetStoreId === id || deletedUserIds.has(String(entry.viewerId || '')) || deletedUserIds.has(String(entry.notification?.senderUserId || '')))) {
            await db.delete('notificationInbox', entry.cacheKey);
          }

          const sentEntries = await db.getAll('notificationSent');
          for (const entry of sentEntries.filter((entry: any) => entry.notification?.targetStoreId === id || deletedUserIds.has(String(entry.senderUserId || '')))) {
            await db.delete('notificationSent', entry.cacheKey);
          }

          const syncOps = await db.getAll('syncQueue');
          for (const op of syncOps) {
            const method = String((op as any).method || (op as any).operation || '').toUpperCase();
            const url = String((op as any).url || '');
            const data = (op as any).data || {};
            const touchesDeletedStore = String(data.storeId || data.targetStoreId || '') === id || (url.includes('/stores.php') && String(data.id || '') === id);
            const touchesDeletedUser = deletedUserIds.has(String(data.userId || data.id || ''));
            const isCurrentStoreDeleteOp = method === 'DELETE' && url.includes('/stores.php') && String(data.id || '') === id;
            if ((touchesDeletedStore || touchesDeletedUser) && !isCurrentStoreDeleteOp) {
              await db.delete('syncQueue', (op as any).id);
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
    const resetSubscriptionCounter = async (storeId: string) => {
        const db = await getDB();
        try {
            const store = await db.get('stores', storeId);
            if (!store) {
                return;
            }

            const now = Date.now();
            const updatedStore = {
                ...store,
                subscriptionEnd: now,
                lastPayment: now,
                active: false
            };

            await performSyncOp({
                url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                method: 'PUT',
                data: updatedStore,
            });

            await db.put('stores', updatedStore);
            toast.success('Compteur remis à zéro: expiration fixée à aujourd\'hui (0 jour restant)');
            setRenewalDialog({ open: false, store: null, months: 1 });
            loadStores();
        }
        catch (error) {
            toast.error('Erreur lors de la remise à zéro');
        }
    };
    const grantFreeTrial14Days = async (storeId: string) => {
        const db = await getDB();
        try {
            const store = await db.get('stores', storeId);
            if (!store) {
                return;
            }

            const now = Date.now();
            const currentEnd = (store as any).subscriptionEnd || now;
            const newEnd = Math.max(currentEnd, now) + (14 * 24 * 60 * 60 * 1000);
            const updatedStore = {
                ...store,
                subscriptionEnd: newEnd,
                lastPayment: now,
                active: true
            };

            await performSyncOp({
                url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
                method: 'PUT',
                data: updatedStore,
            });

            await db.put('stores', updatedStore);
            toast.success('14 jours gratuit appliques avec succes');
            setRenewalDialog({ open: false, store: null, months: 1 });
            loadStores();
        }
        catch (error) {
            toast.error('Erreur lors de l\'activation des 14 jours gratuit');
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
                toast.success(`Magasin ${!currentStatus ? 'activé' : 'désactivé'} avec succès`);
                loadStores();
            }
        }
        catch (error) {
            toast.error('Erreur lors de la mise à jour du statut');
        }
    };
    const openNewDialog = () => {
      if (user?.role !== 'super_admin') {
        toast.error('Seul le super admin peut créer des magasins');
        return;
      }
        setEditingStore(null);
        setStoreFormStep(1);
        setFormData({ name: '', address: '' });
        setAdminForm({ username: '', phone: '', password: '' });
        setAdminLookup('');
        setIsCreatingAdmin(false);
        setSelectedAdminId(null);
        setLinkedAdmins([]);
        loadAdmins();
        setShowDialog(true);
    };
    const goToNextStoreStep = () => {
        if (!formData.name.trim()) {
            toast.error('Le nom du magasin est requis');
            return;
        }

        setStoreFormStep(2);
    };
    const renderStoreBasics = () => (<>
        <div className="space-y-2">
          <Label htmlFor="name">Nom du magasin *</Label>
          <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Magasin Central" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Adresse</Label>
          <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Adresse complète du magasin" rows={3} />
        </div>
      </>);
    const renderStoreAdminSection = () => (<>
        {user?.role === 'super_admin' && editingStore && (<div className="space-y-2">
            <Label>Admins associés</Label>
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              {linkedAdmins.length === 0 ? (<p className="text-sm text-muted-foreground">Aucun administrateur associé pour ce magasin.</p>) : (linkedAdmins.map((linkedAdmin) => (<div key={linkedAdmin.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{linkedAdmin.username || linkedAdmin.phone}</div>
                        <div className="truncate text-xs text-muted-foreground">{linkedAdmin.phone || 'Sans téléphone'}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDetachAdminFromStore(linkedAdmin.id, editingStore.id)} aria-label={`Dissocier ${linkedAdmin.username || linkedAdmin.phone || 'cet administrateur'}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>)))}
            </div>
          </div>)}
        {user?.role === 'super_admin' && (<div className="space-y-2">
            <Label htmlFor="admin-lookup">Associer un admin</Label>
            <div>
              <div className="flex items-start gap-3">
                <div style={{ flex: 1 }}>
                  <Input id="admin-lookup" placeholder={admins.length ? 'Saisir nom ou téléphone, puis choisir dans la liste' : 'Saisir nom ou téléphone (aucun admin local)'} value={adminLookup} onChange={(e) => {
                      setAdminLookup(e.target.value);
                      setSelectedAdminId(null);
                      setIsCreatingAdmin(false);
                  }} />
                  {adminLookup && (<div className="mt-1 max-h-40 overflow-auto rounded border bg-white">
                      {admins
                          .filter(a => {
                          const q = adminLookup.toLowerCase();
                          const name = (a.username || '').toString().toLowerCase();
                          const phone = (a.phone || '').toString().toLowerCase();
                          return name.includes(q) || phone.includes(q);
                      })
                          .map(a => (<div key={a.id} className="cursor-pointer p-2 hover:bg-gray-100" onClick={() => {
                              setSelectedAdminId(a.id);
                              setAdminLookup(`${a.username || a.phone} — ${a.phone || ''}`);
                              setIsCreatingAdmin(false);
                          }}>
                            {a.username || a.phone} <span className="text-muted-foreground">{a.phone ? `— ${a.phone}` : ''}</span>
                          </div>))}
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
              {isCreatingAdmin && (<div className="mt-3 space-y-2">
                  <Label htmlFor="admin-phone">Téléphone admin *</Label>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">+226</span>
                    <Input id="admin-phone" type="tel" maxLength={8} pattern="[0-9]{8}" value={adminForm.phone} onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                        setAdminForm({ ...adminForm, phone: val });
                    }} placeholder="XXXXXXXX" style={{ flex: 1 }} required />
                  </div>
                  <Label htmlFor="admin-password">Mot de passe admin *</Label>
                  <Input id="admin-password" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="Mot de passe admin" />
                </div>)}
            </div>
          </div>)}
      </>);
    const renderStoreDialogForm = () => (<div className="space-y-4">
        {storeFormTotalSteps > 1 && (<div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-muted-foreground">Étape {storeFormStep} sur {storeFormTotalSteps}</div>
              <div className="text-xs text-muted-foreground">{storeFormStep === 1 ? 'Informations du magasin' : 'Association admin'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`h-1.5 rounded-full ${storeFormStep >= 1 ? 'bg-primary' : 'bg-muted'}`} />
              <div className={`h-1.5 rounded-full ${storeFormStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            </div>
          </div>)}

        {storeFormStep === 1 ? renderStoreBasics() : renderStoreAdminSection()}

        <div className="flex gap-2 pt-2">
          {storeFormStep > 1 && (<Button type="button" variant="outline" className="flex-1" onClick={() => setStoreFormStep(1)}>
              Précédent
            </Button>)}
          {storeFormStep < storeFormTotalSteps ? (<Button type="button" className="flex-1" onClick={goToNextStoreStep}>
              Suivant
            </Button>) : (<Button onClick={handleSubmit} className="flex-1">
              {editingStore ? 'Modifier' : 'Créer'}
            </Button>)}
        </div>
      </div>);
    const filteredStores = stores.filter(store => {
        // Filtre de recherche
        const matchesSearch = !searchQuery ||
            store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (store.address && store.address.toLowerCase().includes(searchQuery.toLowerCase()));
        // Filtre par statut
        const matchesStatus = statusFilter === 'all' ||
          (statusFilter === 'active' && isActiveFlag(store.active)) ||
          (statusFilter === 'inactive' && !isActiveFlag(store.active));
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
    if (user?.role !== 'super_admin') {
        return (<div className="p-4 space-y-6 sm:p-6 lg:mx-auto lg:max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Magasins</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Gérez vos points de vente</p>
          {user?.role === 'admin' && (<div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Magasin actif :</span>
              <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-sm font-medium text-blue-800">
                {stores.find(s => s.id === user.storeId)?.name || 'Aucun'}
              </span>
              <Badge variant="outline" className="px-2 py-0.5 text-xs">
                {filteredStores.length} magasin{filteredStores.length > 1 ? 's' : ''}
              </Badge>
            </div>)}
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStore ? 'Modifier le magasin' : 'Nouveau magasin'}
              </DialogTitle>
            </DialogHeader>
            {renderStoreDialogForm()}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground"/>
              <Input placeholder="Rechercher par nom ou adresse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10"/>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <Label className="mb-2 block text-sm">Statut</Label>
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
                <Label className="mb-2 block text-sm">Abonnement</Label>
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

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded bg-gray-200"/>
                  <div className="h-5 w-40 animate-pulse rounded bg-gray-200"/>
                </div>
              </div>
              <CardContent>
                <div className="mb-3 space-y-1">
                  <div className="mb-2 h-3 w-28 animate-pulse rounded bg-gray-200"/>
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-24 animate-pulse rounded bg-gray-200"/>
                    <div className="h-6 w-20 animate-pulse rounded bg-gray-200"/>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 flex-1 animate-pulse rounded bg-gray-200"/>
                  <div className="h-9 w-12 animate-pulse rounded bg-gray-200"/>
                </div>
              </CardContent>
            </Card>))) : (filteredStores.map((store) => (<StoreManagementCard key={store.id} store={store} viewerRole={user?.role} onEdit={() => handleEdit(store)} onSwitch={user?.role === 'admin' ? () => setSwitchingStore({ id: store.id, name: store.name || store.id }) : undefined} onRenew={user?.role === 'super_admin' ? () => setRenewalDialog({ open: true, store, months: 1 }) : undefined} onToggleStatus={user?.role === 'super_admin' ? () => toggleStoreStatus(store.id, isActiveFlag(store.active)) : undefined} onDelete={user?.role === 'super_admin' ? () => handleDelete(store.id) : undefined} />)))}
      </div>

      {renderStoreSwitchDialog()}

      <Dialog open={renewalDialog.open} onOpenChange={(open) => { if (!open)
        setRenewalDialog({ open: false, store: null, months: 1 }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renouveler l'abonnement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Magasin : <strong>{renewalDialog.store?.name}</strong>
                </p>
                {renewalDialog.store && (renewalDialog.store as any).subscriptionEnd && (<p className="text-sm text-muted-foreground">
                Expiration actuelle :{' '}
                <span className={(renewalDialog.store as any).subscriptionEnd <= Date.now() ? 'font-semibold text-red-600' : 'font-semibold text-green-600'}>
                  {new Date((renewalDialog.store as any).subscriptionEnd).toLocaleDateString('fr-FR')}
                  {(renewalDialog.store as any).subscriptionEnd <= Date.now() && ' (EXPIRÉ)'}
                </span>
              </p>)}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => renewalDialog.store && grantFreeTrial14Days(renewalDialog.store.id)}
                  aria-label="Activer 14 jours gratuit"
                  title="Activer 14 jours gratuit"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Gratuit
                </Button>
                <Button
                  variant="outline"
                  className="h-10 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => renewalDialog.store && resetSubscriptionCounter(renewalDialog.store.id)}
                  aria-label="Remettre a zero (0 jour)"
                  title="Remettre a zero (0 jour)"
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Reinitialiser
                </Button>
              </div>
            </div>
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
            <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex justify-between text-sm">
                <span>Prix par mois</span>
                <span className="font-medium">{PRICE_PER_MONTH.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Durée</span>
                <span className="font-medium">{renewalDialog.months} mois ({renewalDialog.months * 30} jours)</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-blue-200 pt-2 text-base font-bold">
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
          <Store className="mx-auto mb-4 h-12 w-12 text-muted-foreground"/>
          <p className="text-muted-foreground">Aucun magasin. Créez-en un pour commencer.</p>
        </Card>)}

      {!isLoading && stores.length > 0 && filteredStores.length === 0 && (<Card className="p-12 text-center">
          <Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground"/>
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
    const now = Date.now();
    const activeStoreCount = stores.filter(store => isActiveFlag(store.active)).length;
    const inactiveStoreCount = stores.length - activeStoreCount;
    const expiredSubscriptionCount = stores.filter(store => (store as any).subscriptionEnd && (store as any).subscriptionEnd <= now).length;
    const expiringSoonCount = stores.filter(store => {
        const subscriptionEnd = (store as any).subscriptionEnd;
        return subscriptionEnd && subscriptionEnd > now && subscriptionEnd <= now + (30 * 24 * 60 * 60 * 1000);
    }).length;
    return (<div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 px-4 pb-8 pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Magasins</h1>
              <p className="mt-1 hidden text-sm text-blue-100 sm:block sm:text-base">Pilotez les points de vente, abonnements et affectations admin depuis une vue unique.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="secondary" size="sm" onClick={loadData} className="flex-1 bg-white/10 text-white hover:bg-white/20 sm:flex-none">
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Actualiser
                </Button>
                <Dialog open={showDialog} onOpenChange={setShowDialog}>
                  {user?.role === 'super_admin' && (<DialogTrigger asChild>
                      <Button className="flex-1 bg-white text-slate-900 hover:bg-slate-100 sm:flex-none" onClick={openNewDialog}>
                        <Plus className="mr-2 h-4 w-4"/>
                        Nouveau magasin
                      </Button>
                    </DialogTrigger>)}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStore ? 'Modifier le magasin' : 'Nouveau magasin'}
              </DialogTitle>
            </DialogHeader>
            {renderStoreDialogForm()}
          </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-7xl space-y-6 px-4 pb-10">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StoreSummaryCard title="Magasins" value={stores.length} subtitle={`${filteredStores.length} visibles`} icon={Store} color="bg-slate-800" />
          <StoreSummaryCard title="Actifs" value={activeStoreCount} subtitle={`${inactiveStoreCount} inactifs`} icon={Power} color="bg-emerald-500" />
          <StoreSummaryCard title="Expirent bientot" value={expiringSoonCount} subtitle="Sous 30 jours" icon={RefreshCw} color="bg-amber-500" />
          <StoreSummaryCard title="Abonnements expires" value={expiredSubscriptionCount} subtitle="Necessitent une action" icon={Trash2} color="bg-rose-500" />
        </div>

      {/* Barre de recherche et filtres */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recherche et filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-col gap-4">
            {/* Barre de recherche */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4"/>
              <Input placeholder="Rechercher par nom ou adresse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 pl-10"/>
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

  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
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
            </Card>))) : (filteredStores.map((store) => (<StoreManagementCard key={store.id} store={store} viewerRole={user?.role} onEdit={() => handleEdit(store)} onSwitch={user?.role === 'admin' ? () => setSwitchingStore({ id: store.id, name: store.name || store.id }) : undefined} onRenew={user?.role === 'super_admin' ? () => setRenewalDialog({ open: true, store, months: 1 }) : undefined} onToggleStatus={user?.role === 'super_admin' ? () => toggleStoreStatus(store.id, isActiveFlag(store.active)) : undefined} onDelete={user?.role === 'super_admin' ? () => handleDelete(store.id) : undefined} />)))}
      </div>

      {renderStoreSwitchDialog()}

      {/* Dialog renouvellement abonnement */}
      <Dialog open={renewalDialog.open} onOpenChange={(open) => { if (!open)
        setRenewalDialog({ open: false, store: null, months: 1 }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renouveler l'abonnement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
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
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => renewalDialog.store && grantFreeTrial14Days(renewalDialog.store.id)}
                  aria-label="Activer 14 jours gratuit"
                  title="Activer 14 jours gratuit"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Gratuit
                </Button>
                <Button
                  variant="outline"
                  className="h-10 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => renewalDialog.store && resetSubscriptionCounter(renewalDialog.store.id)}
                  aria-label="Remettre a zero (0 jour)"
                  title="Remettre a zero (0 jour)"
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Reinitialiser
                </Button>
              </div>
            </div>
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
      </div>
    </div>);
}








