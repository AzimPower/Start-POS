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
import { Store, Edit, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

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
  const [switchingStore, setSwitchingStore] = useState<{ id: string; name: string } | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const { isOnline } = useNetwork();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '' });
  // Ajout du formulaire admin
  const [adminForm, setAdminForm] = useState({ username: '', phone: '', password: '' });
  // Single input to search/select existing admins or create new one
  const [adminLookup, setAdminLookup] = useState('');
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [admins, setAdmins] = useState<Array<any>>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        await loadData();
      } finally {
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
            } else if (backendStores && Array.isArray(backendStores.stores)) {
              backendStores = backendStores.stores;
            } else {
              console.warn('Réponse stores inattendue (pas un tableau) :', backendStores);
              backendStores = [];
            }
          }

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

          const tx = db.transaction('stores', 'readwrite');
          const puts = backendStores.map((s: any) => tx.store.put(s));
          // Wait for all puts and tx completion
          await Promise.all([...puts, tx.done]);

          console.log(`Stores synchronisés depuis backend : ${backendStores.length} éléments`);
        } else {
          console.warn('stores fetch failed', resp.status);
        }
      } catch (e) {
        console.warn('Erreur récupération stores depuis backend:', e);
      }
    }

    let storesData = await db.getAll('stores');
    
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
      const userStoreIds = (user as any).storeIds && Array.isArray((user as any).storeIds)
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
    } catch (e) {
      console.warn('Erreur chargement admins locaux', e);
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
        if (selectedAdminId) putData.adminId = selectedAdminId;
        const apiRes = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
          method: 'PUT',
          data: putData,
        });
        console.log('Réponse API modification store:', apiRes);
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
            } else {
              const linkId = generateId();
              await db.add('userStores', { id: linkId, userId: selectedAdminId, storeId: editingStore.id });
            }
          } catch (e) {
            console.warn('Erreur lors de la création du mapping userStores (edit)', e);
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
          } catch (e) {
            console.warn('Erreur linkage admin existant localement (edit)', e);
          }
        }
        // If the only issue was that the admin was already linked, we already showed a toast
        // and should not show the generic "Magasin modifié" message in that case.
        if (!mappingAlreadyExisted) {
          toast.success('Magasin modifié');
        }
      } else {
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
            } else if (selectedAdminId) {
              storePayload.adminId = selectedAdminId;
            }
          }

        const apiRes = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
          method: 'POST',
          data: storePayload,
        });
        console.log('Réponse API création store:', apiRes);
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
          } else if (selectedAdminId) {
            // Link existing local user to this store in userStores mapping and update their storeIds
            try {
              const existingForUser = await db.getAllFromIndex('userStores', 'by-user', selectedAdminId as any);
              const alreadyLinked = existingForUser.some((m: any) => m.storeId === storeId);
              if (alreadyLinked) {
                toast('Cet administrateur est déjà affecté à ce magasin');
              } else {
                const linkId = generateId();
                await db.add('userStores', { id: linkId, userId: selectedAdminId, storeId: storeId });
              }
            } catch (e) {
              console.warn('Erreur lors de la création du mapping userStores (create)', e);
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
            } catch (e) {
              console.warn('Erreur linkage admin existant localement', e);
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
    } catch (error) {
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
        if (user) setAdminLookup(`${user.username || user.phone} — ${user.phone || ''}`);
      } else {
        setAdminLookup('');
      }
    } catch (e) {
      // ignore if index not present or any error
      setAdminLookup('');
    }
    // Load admins afterwards so suggestions are available
    await loadAdmins();
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce magasin ?')) return;

    const db = await getDB();
    try {
      const apiRes = await performSyncOp({
        url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
        method: 'DELETE',
        data: { id },
      });
      console.log('Réponse API suppression store:', apiRes);
      // Supprimer toutes les données locales liées au magasin
      const tables: Array<
        'users' | 'sales' | 'products' | 'categories' | 'expenses' | 'expensesAdvanced' | 'expenseCategories' | 'shifts' | 'stockSignals'
      > = [
        'users', 'sales', 'products', 'categories', 'expenses', 'expensesAdvanced', 'expenseCategories', 'shifts', 'stockSignals'
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
    } catch (error) {
      console.log('Erreur suppression store:', error);
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

  const renewSubscription = async (storeId: string) => {
    if (!confirm('Renouveler l\'abonnement de ce magasin pour 30 jours supplémentaires ?')) return;

    const db = await getDB();
    try {
      const store = await db.get('stores', storeId);
      if (store) {
        const now = Date.now();
        const currentEnd = (store as any).subscriptionEnd || now;
        const newEnd = Math.max(currentEnd, now) + (30 * 24 * 60 * 60 * 1000); // 30 jours de plus
        
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
        console.log('Réponse API renouvellement abonnement:', apiRes);
        
        // Puis mettre à jour localement
        await db.put('stores', updatedStore);
        
        // Réactiver tous les utilisateurs du magasin
        const allUsers = await db.getAll('users');
        const storeUsers = allUsers.filter(u => u.storeId === storeId);
        for (const storeUser of storeUsers) {
          await db.put('users', { ...storeUser, active: true });
        }
        
        toast.success('Abonnement renouvelé avec succès');
        loadStores();
      }
    } catch (error) {
      console.error('Erreur lors du renouvellement:', error);
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
        console.log('Réponse API toggle status:', apiRes);
        
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
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
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

  return (
    <div className="p-4 sm:p-6 space-y-6 lg:max-w-7xl lg:mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Magasins</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez vos points de vente</p>
          {user?.role === 'admin' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Magasin actif :</span>
              <span className="inline-block px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {stores.find(s => s.id === user.storeId)?.name || 'Aucun'}
              </span>
            </div>
          )}
        </div>
        {/* Dialog présent pour l'édition et la création. Le trigger (Nouveau magasin) reste réservé au super_admin. */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          {user?.role === 'super_admin' && (
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto" onClick={openNewDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau magasin
              </Button>
            </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStore ? 'Modifier le magasin' : 'Nouveau magasin'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du magasin *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Magasin Central"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Adresse complète du magasin"
                  rows={3}
                />
              </div>
              {/* Formulaire d'administration : saisie unique + suggestions */}
              {user?.role === 'super_admin' && (
                <div className="space-y-2">
                  <Label htmlFor="admin-lookup">Rechercher un Admin</Label>
                  <div>
                    <div className="flex items-start gap-3">
                      <div style={{ flex: 1 }}>
                        <Input
                          id="admin-lookup"
                          placeholder={admins.length ? 'Saisir nom ou téléphone, puis choisir dans la liste' : 'Saisir nom ou téléphone (aucun admin local)'}
                          value={adminLookup}
                          onChange={(e) => {
                            setAdminLookup(e.target.value);
                            setSelectedAdminId(null);
                            setIsCreatingAdmin(false);
                          }}
                        />
                        {/* Suggestions */}
                        {adminLookup && (
                          <div className="mt-1 border rounded bg-white max-h-40 overflow-auto">
                            {admins
                              .filter(a => {
                                const q = adminLookup.toLowerCase();
                                const name = (a.username || '').toString().toLowerCase();
                                const phone = (a.phone || '').toString().toLowerCase();
                                return name.includes(q) || phone.includes(q);
                              })
                              .map(a => (
                                <div
                                  key={a.id}
                                  className="p-2 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => {
                                    setSelectedAdminId(a.id);
                                    setAdminLookup(`${a.username || a.phone} — ${a.phone || ''}`);
                                    setIsCreatingAdmin(false);
                                  }}
                                >
                                  {a.username || a.phone} <span className="text-muted-foreground">{a.phone ? `— ${a.phone}` : ''}</span>
                                </div>
                              ))}
                            {/* If no match, show option text */}
                            {admins.filter(a => {
                              const q = adminLookup.toLowerCase();
                              const name = (a.username || '').toString().toLowerCase();
                              const phone = (a.phone || '').toString().toLowerCase();
                              return name.includes(q) || phone.includes(q);
                            }).length === 0 && (
                              <div className="p-2 text-sm text-gray-600">Aucun admin trouvé.</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {selectedAdminId ? (
                          <>
                            <div className="text-sm">Admin sélectionné <strong>{admins.find(a => a.id === selectedAdminId)?.username || ''}</strong></div>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedAdminId(null); setAdminLookup(''); }}>Effacer</Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => { setIsCreatingAdmin(true); setAdminForm(prev => ({ ...prev, username: adminLookup })); }}>Créer un nouvel admin</Button>
                        )}
                      </div>
                    </div>

                    {/* If creating new admin, show phone/password fields */}
                    {isCreatingAdmin && (
                      <div className="mt-3 space-y-2">
                        <Label htmlFor="admin-phone">Téléphone admin *</Label>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">+226</span>
                          <Input
                            id="admin-phone"
                            type="tel"
                            maxLength={8}
                            pattern="[0-9]{8}"
                            value={adminForm.phone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                              setAdminForm({ ...adminForm, phone: val });
                            }}
                            placeholder="XXXXXXXX"
                            style={{ flex: 1 }}
                            required
                          />
                        </div>
                        <Label htmlFor="admin-password">Mot de passe admin *</Label>
                        <Input
                          id="admin-password"
                          type="password"
                          value={adminForm.password}
                          onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                          placeholder="Mot de passe admin"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Button onClick={handleSubmit} className="w-full">
                {editingStore ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:items-stretch lg:gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="rounded-xl shadow-md border border-gray-200 bg-white overflow-hidden">
              <div className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-gray-200 rounded" />
                  <div className="h-5 bg-gray-200 rounded w-40 animate-pulse" />
                </div>
              </div>
              <CardContent>
                <div className="mb-3 space-y-1">
                  <div className="h-3 bg-gray-200 rounded w-28 animate-pulse mb-2" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 flex-1 bg-gray-200 rounded animate-pulse" />
                  <div className="h-9 w-12 bg-gray-200 rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          stores.map(store => (
            <Card key={store.id} className="rounded-xl shadow-md border border-gray-200 bg-white transition hover:shadow-lg overflow-hidden lg:h-full lg:flex lg:flex-col lg:justify-between">
            <div className="flex flex-col min-h-[180px] md:min-h-[220px] lg:h-full">
              <div className="flex items-start justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-primary" />
                  <div>
                    <div className="font-semibold text-lg">{store.name}</div>
                    <div className="text-xs text-muted-foreground">{store.address || 'Pas d\'adresse'}</div>
                  </div>
                </div>
                <div>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    (store.active !== false) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {(store.active !== false) ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
              <CardContent className="flex-1 p-4">
                <div className="mb-3 space-y-1">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Créé le: {new Date(store.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                  {(store as any).subscriptionStart && (
                    <p className="text-xs text-muted-foreground">
                      Abonnement depuis: {new Date((store as any).subscriptionStart).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                  {(store as any).subscriptionEnd && (
                    <p className={`text-[12px] sm:text-xs font-medium ${
                      (store as any).subscriptionEnd > Date.now() 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      Expire le: {new Date((store as any).subscriptionEnd).toLocaleDateString('fr-FR')}
                      {(store as any).subscriptionEnd <= Date.now() && ' (EXPIRÉ)'}
                    </p>
                  )}
                  {(store as any).subscriptionEnd && (store as any).subscriptionEnd > Date.now() && (
                    <p className="text-xs text-blue-600">
                      Jours restants: {Math.ceil(((store as any).subscriptionEnd - Date.now()) / (1000 * 60 * 60 * 24))}
                    </p>
                  )}
                </div>
              </CardContent>
              <div className="p-4 pt-0 lg:pt-4 lg:flex lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full lg:flex-row lg:items-center lg:justify-between">
                  {/* Left group: Modifier, Renouveler */}
                  <div className="flex flex-row flex-wrap gap-2 items-center w-full sm:w-1/2 lg:w-1/2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto sm:min-w-[120px] text-sm sm:text-base flex-shrink-0"
                      onClick={() => handleEdit(store)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      <span className="sr-only">Modifier</span>
                    </Button>
                    {user?.role === 'super_admin' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => renewSubscription(store.id)}
                        className="w-full sm:w-auto sm:min-w-[120px] bg-blue-600 hover:bg-blue-700 text-sm sm:text-base flex-shrink-0"
                      >
                        Renouveler
                      </Button>
                    )}
                  </div>

                  {/* Right group: Désactiver/Activer, Supprimer */}
                  <div className="flex flex-row flex-wrap gap-2 items-center justify-end w-full sm:w-1/2 lg:w-auto">
                    {/* If admin (not super_admin) allow to switch active store */}
                    {user?.role === 'admin' && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            // Open confirmation modal instead of switching immediately
                            setSwitchingStore({ id: store.id, name: store.name || store.id });
                          }}
                          className="w-full sm:w-auto sm:min-w-[120px] text-sm sm:text-base flex-shrink-0"
                        >
                          Basculer
                        </Button>

                        <Dialog open={!!switchingStore} onOpenChange={() => { if (!isSwitching) setSwitchingStore(null); }}>
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
                                <Button
                                  onClick={async () => {
                                    if (!switchingStore) return;
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
                                    } catch (e) {
                                      console.warn('switch store error', e);
                                      setIsSwitching(false);
                                      toast.error('Impossible de basculer sur ce magasin');
                                    }
                                  }}
                                  disabled={isSwitching}
                                  className="flex-1"
                                >
                                  {isSwitching ? <span className="inline-block w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin" /> : null}
                                  Confirmer
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                    {user?.role === 'super_admin' && (
                      <Button
                        variant={(store.active !== false) ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => toggleStoreStatus(store.id, store.active !== false)}
                        className="w-full sm:w-auto sm:min-w-[120px] text-sm sm:text-base flex-shrink-0"
                      >
                        {(store.active !== false) ? 'Désactiver' : 'Activer'}
                      </Button>
                    )}
                    {user?.role === 'super_admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(store.id)}
                        className="w-full sm:w-auto sm:min-w-[40px] text-sm flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
          ))
        )}
      </div>

      {!isLoading && stores.length === 0 && (
        <Card className="p-12 text-center">
          <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Aucun magasin. Créez-en un pour commencer.</p>
        </Card>
      )}
    </div>
  );
}
