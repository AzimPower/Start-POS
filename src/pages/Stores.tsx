import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '' });
  // Ajout du formulaire admin
  const [adminForm, setAdminForm] = useState({ username: '', phone: '', password: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    loadStores();
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
    
    // Si c'est un admin, il ne voit que son magasin
    if (user?.role === 'admin') {
      storesData = storesData.filter(store => store.id === user.storeId);
    }
    
    setStores(storesData);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom du magasin est requis');
      return;
    }
    if (user?.role === 'super_admin' && !editingStore && (!adminForm.username.trim() || !adminForm.phone.trim() || !adminForm.password.trim())) {
      toast.error('Tous les champs admin sont requis (nom, téléphone, mot de passe)');
      return;
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
        const apiRes = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
          method: 'PUT',
          data: {
            ...editingStore,
            name: formData.name,
            address: formData.address,
          },
        });
        console.log('Réponse API modification store:', apiRes);
        await db.put('stores', {
          ...editingStore,
          name: formData.name,
          address: formData.address,
        });
        toast.success('Magasin modifié');
      } else {
        const now = Date.now();
        const subscriptionEnd = now + (30 * 24 * 60 * 60 * 1000); // 30 jours
        // Ajout store (API ou file d'attente)
        const apiRes = await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php',
          method: 'POST',
          data: {
            id: storeId,
            name: formData.name,
            address: formData.address,
            active: true,
            createdAt: now,
            subscriptionStart: now,
            subscriptionEnd: subscriptionEnd,
            lastPayment: now,
          },
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
          // Vérifier l'unicité du téléphone en local
          const existingUser = await db.getFromIndex('users', 'by-phone', adminPhone);
          if (existingUser) {
            toast.error('Ce numéro de téléphone est déjà utilisé');
            return;
          }
          // Création en local
          await createUser({
            username: adminForm.username,
            phone: adminPhone,
            password: adminForm.password,
            role: 'admin',
            storeId: storeId
          });
          // Création dans la base distante
          const apiUserRes = await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
            method: 'POST',
            data: {
              id: generateId(),
              username: adminForm.username,
              phone: adminPhone,
              password: adminForm.password,
              role: 'admin',
              storeId: storeId,
              active: true,
              createdAt: Date.now(),
            },
          });
          console.log('Réponse API création admin:', apiUserRes);
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

  const handleEdit = (store: StoreData) => {
    setEditingStore(store);
    setFormData({ name: store.name, address: store.address });
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
        
        await db.put('stores', { 
          ...store, 
          subscriptionEnd: newEnd,
          lastPayment: now,
          active: true // Réactiver le magasin
        });
        
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
      toast.error('Erreur lors du renouvellement');
    }
  };

  const toggleStoreStatus = async (storeId: string, currentStatus: boolean) => {
    const db = await getDB();
    try {
      // Mettre à jour le statut du magasin
      const store = await db.get('stores', storeId);
      if (store) {
        await db.put('stores', { ...store, active: !currentStatus });
        
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
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  const openNewDialog = () => {
    setEditingStore(null);
    setFormData({ name: '', address: '' });
    setAdminForm({ username: '', phone: '', password: '' });
    setShowDialog(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 lg:max-w-7xl lg:mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Magasins</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez vos points de vente</p>
        </div>
        {/* Dialog présent pour l'édition et la création. Le trigger (Nouveau magasin) reste réservé au super_admin. */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          {user?.role === 'super_admin' && (
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto max-w-xs sm:max-w-none" onClick={openNewDialog}>
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
              {/* Formulaire pour créer l'admin du magasin - Super admin seulement */}
              {!editingStore && user?.role === 'super_admin' && (
                <div className="space-y-2">
                  <Label htmlFor="admin-username">Nom d'utilisateur admin *</Label>
                  <Input
                    id="admin-username"
                    value={adminForm.username}
                    onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                    placeholder="Nom d'utilisateur admin"
                  />
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
                        // N'accepte que des chiffres et max 8 caractères
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
              <Button onClick={handleSubmit} className="w-full">
                {editingStore ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:items-stretch lg:gap-6">
        {stores.map(store => (
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
        ))}
      </div>

      {stores.length === 0 && (
        <Card className="p-12 text-center">
          <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Aucun magasin. Créez-en un pour commencer.</p>
        </Card>
      )}
    </div>
  );
}
