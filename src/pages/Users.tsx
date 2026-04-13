import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDB, generateId } from '@/lib/db';
import { queueSyncOp, connectionState, forceSyncNow } from '@/lib/sync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { UserCircle, Edit, Trash2, Plus, Shield, RefreshCw,  User, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
function UserSummaryCard({ title, value, subtitle, icon: Icon, color }: {
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
interface UserData {
    id: string;
    username: string;
    phone: string;
    email?: string;
    password: string;
    role: 'super_admin' | 'admin' | 'cashier' | 'manager';
    storeId: string;
    storeIds?: string[];
    createdAt: number;
    pin?: string;
}
interface StoreData {
    id: string;
    name: string;
}
export default function Users() {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [stores, setStores] = useState<StoreData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
    const [showDialog, setShowDialog] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [storeFilter, setStoreFilter] = useState<string>('all');
    const [formData, setFormData] = useState({
        username: '',
        phone: '',
        email: '',
        password: '',
        role: 'cashier' as 'admin' | 'cashier' | 'manager',
        storeId: '',
        pin: '',
    });
    useEffect(() => {
        // We intentionally call loadData once when `user` changes. loadData is stable here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        loadData();
    }, [user]);
    const loadData = async () => {
        setIsLoading(true);
        const db = await getDB();
        // Load stores
        const storesData = await db.getAll('stores');
        setStores(storesData);
        try {
            await loadUsers();
        }
        finally {
            setIsLoading(false);
          setLastRefresh(new Date());
        }
    };
    const loadUsers = async () => {
        if (connectionState.isOnline) {
            try {
                // Ajouter storeId pour les admins (les super_admin peuvent voir tous les utilisateurs)
                let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php';
                if (user?.role === 'admin' && user?.storeId) {
                    url += `?storeId=${user.storeId}`;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const remoteUsers = await res.json();
                    // Si admin, filtrer côté client aussi pour sécurité
                    const storeUsers = user?.role === 'admin' && user?.storeId
                        ? remoteUsers.filter((u: any) => {
                            const uStoreIds: string[] = u.storeIds || (u.storeId ? [u.storeId] : []);
                            return uStoreIds.includes(user.storeId);
                        })
                        : remoteUsers;
                    // Met à jour IndexedDB locale
                    const db = await getDB();
                    const tx = db.transaction('users', 'readwrite');
                    await tx.store.clear();
                    for (const u of storeUsers) {
                        // Preserve existing local PIN if backend doesn't return one
                        try {
                            const local = await tx.store.get(u.id as string);
                            const merged = {
                                ...u,
                                pin: (u as any).pin ?? (local ? (local as any).pin : '')
                            };
                            await tx.store.put(merged);
                        }
                        catch (e) {
                            // fallback: put remote as-is
                            await tx.store.put(u);
                        }
                    }
                    await tx.done;
                    // Filtrage et affichage
                    let filteredUsers = storeUsers.filter(u => u.role !== 'super_admin');
                    if (user?.role === 'admin') {
                        // For admin viewers, only show users that belong to at least one of the admin's stores
                        filteredUsers = filteredUsers.filter(u => {
                            const uStoreIds: string[] = (u as any).storeIds || ((u as any).storeId ? [(u as any).storeId] : []);
                            return uStoreIds.includes(user.storeId);
                        });
                    }
                    setUsers(filteredUsers.sort((a, b) => b.createdAt - a.createdAt));
                    return;
                }
            }
            catch (e) {
                // Si erreur, fallback local
            }
        }
        // Fallback local
        const db = await getDB();
        const data: any[] = await db.getAll('users');
        const normalizedUsers = data.map((u: unknown) => ({
            ...(u as any),
            storeId: (u as any).storeId || '',
            storeIds: (u as any).storeIds || ((u as any).storeId ? [(u as any).storeId] : []),
        }));
        let filteredUsers = normalizedUsers.filter(u => u.role !== 'super_admin');
        if (user?.role === 'admin') {
            filteredUsers = filteredUsers.filter((u: any) => {
                const ids: string[] = (u as any).storeIds || [];
                return ids.includes(user.storeId);
            });
        }
        setUsers(filteredUsers.sort((a: any, b: any) => b.createdAt - a.createdAt));
    };
    const handleSubmit = async () => {
      if (!editingUser && user?.role !== 'super_admin') {
        toast.error('Seul le super admin peut créer des utilisateurs');
        return;
      }
        if (!formData.username.trim() || !formData.phone.trim() || !formData.password.trim() || !formData.storeId) {
            toast.error('Tous les champs sont requis');
            return;
        }
        if (!/^[0-9]{8}$/.test(formData.phone)) {
            toast.error('Le numéro doit contenir exactement 8 chiffres.');
            return;
        }
        let finalRole = formData.role;
        let finalStoreId = formData.storeId;
        if (user?.role === 'admin') {
            if (!editingUser || editingUser.id !== user.id) {
                // L'admin peut créer des caissiers et des gestionnaires, mais pas d'autres admins
                if (formData.role === 'admin') {
                    finalRole = 'cashier';
                }
                else {
                    finalRole = formData.role; // Permet 'cashier' et 'manager'
                }
                finalStoreId = user.storeId;
            }
        }
        const db = await getDB();
        try {
            if (editingUser) {
                // Modification
                const userData = {
                    ...editingUser,
                    username: formData.username,
                    phone: `+226${formData.phone}`,
                    email: formData.email.trim() || null,
                    password: formData.password,
                    role: finalRole,
                    storeId: finalStoreId,
                    // Only overwrite pin if admin provided a new one
                    ...(formData.pin ? { pin: formData.pin } : {}),
                };
                await db.put('users', userData);
                if (connectionState.isOnline) {
                    const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userData),
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `Server returned ${res.status}`);
                    }
                }
                else {
                    await queueSyncOp({
                        url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
                        method: 'PUT',
                        data: userData,
                    });
                }
                toast.success('Utilisateur modifié');
                // Mettre à jour le state local immédiatement sans refetch
                setUsers(prev => prev.map(u => u.id === userData.id ? userData as UserData : u));
            }
            else {
                // Création
                const existingUser = await db.getFromIndex('users', 'by-username', formData.username);
                if (existingUser) {
                    toast.error('Ce nom d\'utilisateur existe déjà');
                    return;
                }
                const existingPhone = await db.getFromIndex('users', 'by-phone', `+226${formData.phone}`);
                if (existingPhone) {
                    toast.error('Ce numéro de téléphone existe déjà');
                    return;
                }
                if (formData.email && formData.email.trim()) {
                    const existingEmail = await db.getFromIndex('users', 'by-email', formData.email.trim());
                    if (existingEmail) {
                        toast.error('Cette adresse email existe déjà');
                        return;
                    }
                }
                const newUser = {
                    id: generateId(),
                    username: formData.username,
                    phone: `+226${formData.phone}`,
                    email: formData.email.trim() || null,
                    password: formData.password,
                    role: finalRole,
                    storeId: finalStoreId,
                    pin: formData.pin || '',
                    active: true,
                    createdAt: Date.now(),
                };
                await db.add('users', newUser);
                if (connectionState.isOnline) {
                    const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newUser),
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `Server returned ${res.status}`);
                    }
                }
                else {
                    await queueSyncOp({
                        url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
                        method: 'POST',
                        data: newUser,
                    });
                }
                toast.success('Utilisateur créé');
                // Ajouter au state local immédiatement sans refetch
                setUsers(prev => [newUser as unknown as UserData, ...prev]);
            }
            setShowDialog(false);
            setEditingUser(null);
            setShowPassword(false);
            setShowPin(false);
            setFormData({ username: '', phone: '', email: '', password: '', role: 'cashier' as 'admin' | 'cashier' | 'manager', storeId: '', pin: '' });
        }
        catch (error) {
            const msg = (error as any)?.message || 'Erreur lors de l\'enregistrement';
            toast.error(msg);
        }
    };
    const handleEdit = (editUser: UserData) => {
        setEditingUser(editUser);
        // Ensure phone is prefilled as 8 digits (strip +226 and non-digits)
        const rawPhone = String(editUser.phone || '').replace(/[^0-9]/g, '');
        const phone8 = rawPhone.replace(/^226/, '').slice(-8);
        setFormData({
            username: editUser.username,
            phone: phone8,
            email: editUser.email || '',
            password: editUser.password || '',
            role: editUser.role === 'super_admin' ? 'admin' : editUser.role as 'admin' | 'cashier' | 'manager',
            storeId: editUser.storeId,
            pin: editUser.pin || '',
        });
        setShowDialog(true);
    };
    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?'))
            return;
        const db = await getDB();
        try {
            await db.delete('users', id);
            if (connectionState.isOnline) {
                await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php?id=${id}`, {
                    method: 'DELETE',
                });
            }
            else {
                await queueSyncOp({
                    url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php?id=${id}`,
                    method: 'DELETE',
                    data: {},
                });
            }
            toast.success('Utilisateur supprimé');
            // Supprimer du state local immédiatement sans refetch
            setUsers(prev => prev.filter(u => u.id !== id));
        }
        catch (error) {
            toast.error('Erreur lors de la suppression');
        }
    };
    const openNewDialog = () => {
      if (user?.role !== 'super_admin') {
        toast.error('Seul le super admin peut créer des utilisateurs');
        return;
      }
        setEditingUser(null);
        setShowPassword(false);
        setShowPin(false);
        setFormData({ username: '', phone: '', email: '', password: '', role: 'cashier' as 'admin' | 'cashier' | 'manager', storeId: stores[0]?.id || '', pin: '' });
        setShowDialog(true);
    };
    const getUserStoreIds = (u: UserData) => {
      if (Array.isArray(u.storeIds)) {
        return u.storeIds.filter(Boolean);
      }
      return u.storeId ? [u.storeId] : [];
    };
    const getStoreName = (storeId: string) => {
      return stores.find(s => s.id === storeId)?.name || 'Inconnu';
    };
    const getStoreNames = (u: UserData) => {
      const names = getUserStoreIds(u)
        .map(id => stores.find(s => s.id === id)?.name)
        .filter((name): name is string => Boolean(name));
        return names; // return array of names; rendering will handle empty case
    };
    const filteredUsers = users.filter(u => {
        // Filtre de recherche
        const matchesSearch = !searchQuery ||
            u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.phone.includes(searchQuery) ||
            (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));
        // Filtre par rôle
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        // Filtre par magasin
        const matchesStore = storeFilter === 'all' || (() => {
            const ids = getUserStoreIds(u);
            return ids.includes(storeFilter);
        })();
        return matchesSearch && matchesRole && matchesStore;
    });
    const adminCount = users.filter(item => item.role === 'admin').length;
    const managerCount = users.filter(item => item.role === 'manager').length;
    const cashierCount = users.filter(item => item.role === 'cashier').length;
    if (user?.role !== 'super_admin') {
        return (<div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Utilisateurs</h1>
            <Badge variant="outline" className="px-2 py-0.5 text-xs">
              {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Gérez les administrateurs et caissiers</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Nom d'utilisateur *</Label>
                <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Ex: caissier1"/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone *</Label>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">+226</span>
                  <Input id="phone" type="tel" maxLength={8} pattern="[0-9]{8}" value={formData.phone} onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                setFormData({ ...formData, phone: val });
            }} placeholder="XXXXXXXX"/>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="utilisateur@exemple.com"/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="pr-10"/>
                  <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (<EyeOff className="h-4 w-4 text-gray-400"/>) : (<Eye className="h-4 w-4 text-gray-400"/>)}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (4-8 chiffres)</Label>
                <div className="relative">
                  <Input id="pin" type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={8} value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} placeholder={editingUser ? 'Laisser vide pour conserver le PIN actuel' : 'Ex: 1234'} className="pr-10"/>
                  <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3" onClick={() => setShowPin(!showPin)}>
                    {showPin ? (<EyeOff className="h-4 w-4 text-gray-400"/>) : (<Eye className="h-4 w-4 text-gray-400"/>)}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle *</Label>
                {(user?.role === 'admin' && editingUser && editingUser.id === user.id) ? (<Input id="role" value="Administrateur" disabled/>) : user?.role === 'admin' ? (<Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Caissier</SelectItem>
                      <SelectItem value="manager">Gestionnaire</SelectItem>
                    </SelectContent>
                  </Select>) : (<Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Caissier</SelectItem>
                      <SelectItem value="manager">Gestionnaire</SelectItem>
                      <SelectItem value="admin">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>)}
              </div>
              <div className="space-y-2">
                {user?.role !== 'admin' && (<>
                    <Label htmlFor="store">Magasin *</Label>
                    <Select value={formData.storeId} onValueChange={(v) => setFormData({ ...formData, storeId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un magasin"/>
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map(store => (<SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>))}
                      </SelectContent>
                    </Select>
                  </>)}
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingUser ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground"/>
              <Input placeholder="Rechercher par nom, téléphone ou email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10"/>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <Label className="mb-2 block text-sm">Rôle</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les rôles"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les rôles</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="manager">Gestionnaire</SelectItem>
                    <SelectItem value="cashier">Caissier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-2 block text-sm">Magasin</Label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les magasins"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les magasins</SelectItem>
                    {stores.map(store => (<SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-gray-200"/>
                    <div className="h-4 w-32 animate-pulse rounded bg-gray-200"/>
                  </div>
                  <div className="h-4 w-12 animate-pulse rounded bg-gray-200"/>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 text-sm text-muted-foreground">
                  <div className="mb-2 h-3 w-24 animate-pulse rounded bg-gray-200"/>
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-20 animate-pulse rounded bg-gray-200"/>
                    <div className="h-6 w-16 animate-pulse rounded bg-gray-200"/>
                    <div className="h-6 w-24 animate-pulse rounded bg-gray-200"/>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 flex-1 animate-pulse rounded bg-gray-200"/>
                  <div className="h-9 w-12 animate-pulse rounded bg-gray-200"/>
                </div>
              </CardContent>
            </Card>))) : (filteredUsers.map(listUser => (<Card key={listUser.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-2">
                    {listUser.role === 'admin' ? (<Shield className="h-5 w-5 text-primary"/>) : (<User className="h-5 w-5 text-primary"/>)}
                    {listUser.username}
                  </div>
                  <Badge variant={listUser.role === 'admin' ? 'default' : listUser.role === 'manager' ? 'outline' : 'secondary'}>
                    {listUser.role === 'admin' ? 'Admin' : listUser.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 text-sm text-muted-foreground">
                  {listUser.email && (<div className="mb-2">
                      <span className="font-medium">Email:</span> {listUser.email}
                    </div>)}
                  <div>Magasins:</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(() => {
                const names = getStoreNames(listUser);
                if (!names || names.length === 0) {
                    return <span className="text-muted-foreground">Aucun magasin</span>;
                }
                return names.map((name, idx) => (<Badge key={idx} className="text-xs">
                          {name}
                        </Badge>));
            })()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(listUser)}>
                    <Edit className="mr-2 h-4 w-4"/>
                    Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(listUser.id)}>
                    <Trash2 className="h-4 w-4"/>
                  </Button>
                </div>
              </CardContent>
            </Card>)))}
      </div>

      {!isLoading && users.length === 0 && (<Card className="p-12 text-center">
          <UserCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground"/>
          <p className="text-muted-foreground">Aucun utilisateur.</p>
        </Card>)}

      {!isLoading && users.length > 0 && filteredUsers.length === 0 && (<Card className="p-12 text-center">
          <Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground"/>
          <p className="text-muted-foreground">Aucun utilisateur ne correspond à votre recherche.</p>
          <Button variant="link" className="mt-2" onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setStoreFilter('all');
            }}>
            Réinitialiser les filtres
          </Button>
        </Card>)}
    </div>);
    }
    return (<div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-slate-900 via-violet-900 to-slate-800 px-4 pb-8 pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Utilisateurs</h1>
              <p className="mt-1 hidden text-sm text-violet-100 sm:block sm:text-base">Administrez les comptes, roles et affectations magasin depuis une interface plus claire.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="secondary" size="sm" onClick={loadData} className="flex-1 bg-white/10 text-white hover:bg-white/20 sm:flex-none">
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Actualiser
                </Button>
                <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="flex-1 bg-white text-slate-900 hover:bg-slate-100 sm:flex-none" onClick={openNewDialog}>
              <Plus className="w-4 h-4 mr-2"/>
              Nouvel utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Nom d'utilisateur *</Label>
                <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Ex: caissier1"/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone *</Label>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">+226</span>
                  <Input id="phone" type="tel" maxLength={8} pattern="[0-9]{8}" value={formData.phone} onChange={(e) => {
            // N'accepte que des chiffres et max 8 caractères
            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
            setFormData({ ...formData, phone: val });
        }} placeholder="XXXXXXXX"/>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="utilisateur@exemple.com"/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="pr-10"/>
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (<EyeOff className="h-4 w-4 text-gray-400"/>) : (<Eye className="h-4 w-4 text-gray-400"/>)}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (4-8 chiffres)</Label>
                <div className="relative">
                  <Input id="pin" type={showPin ? "text" : "password"} inputMode="numeric" maxLength={8} value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} placeholder={editingUser ? 'Laisser vide pour conserver le PIN actuel' : 'Ex: 1234'} className="pr-10"/>
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPin(!showPin)}>
                    {showPin ? (<EyeOff className="h-4 w-4 text-gray-400"/>) : (<Eye className="h-4 w-4 text-gray-400"/>)}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle *</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Caissier</SelectItem>
                    <SelectItem value="manager">Gestionnaire</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="store">Magasin *</Label>
                <Select value={formData.storeId} onValueChange={(v) => setFormData({ ...formData, storeId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un magasin"/>
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (<SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingUser ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-7xl space-y-6 px-4 pb-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <UserSummaryCard title="Utilisateurs" value={users.length} subtitle="Hors super admin" icon={UserCircle} color="bg-slate-800" />
        <UserSummaryCard title="Administrateurs" value={adminCount} subtitle="Acces complet magasin" icon={Shield} color="bg-violet-500" />
        <UserSummaryCard title="Gestionnaires" value={managerCount} subtitle="Supervision operationnelle" icon={User} color="bg-sky-500" />
        <UserSummaryCard title="Caissiers" value={cashierCount} subtitle="Comptes de caisse" icon={User} color="bg-emerald-500" />
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
              <Input placeholder="Rechercher par nom, téléphone ou email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 pl-10"/>
            </div>
            
            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label className="text-sm mb-2 block">Rôle</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les rôles"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les rôles</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="manager">Gestionnaire</SelectItem>
                    <SelectItem value="cashier">Caissier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <Label className="text-sm mb-2 block">Magasin</Label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les magasins"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les magasins</SelectItem>
                    {stores.map(store => (<SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              

            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
        // show skeleton cards while loading
        Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`} className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gray-200 rounded"/>
                    <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"/>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"/>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  <div className="h-3 bg-gray-200 rounded w-24 animate-pulse mb-2"/>
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"/>
                    <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"/>
                    <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"/>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 flex-1 bg-gray-200 rounded animate-pulse"/>
                  <div className="h-9 w-12 bg-gray-200 rounded animate-pulse"/>
                </div>
              </CardContent>
            </Card>))) : (filteredUsers.map(user => (<Card key={user.id} className="overflow-hidden rounded-2xl border border-border/60 shadow-sm transition hover:shadow-md">
              <div className="border-b border-border/60 bg-gradient-to-r from-slate-50 to-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {user.role === 'admin' ? (<Shield className="h-5 w-5"/>) : (<User className="h-5 w-5"/>)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{user.username}</div>
                      <div className="text-xs text-muted-foreground">{user.phone}</div>
                    </div>
                  </div>
                  <Badge variant={user.role === 'admin' ? 'default' : user.role === 'manager' ? 'outline' : 'secondary'} className="shrink-0">
                    {user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Gestionnaire' : 'Caissier'}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="mb-4 space-y-3 text-sm text-muted-foreground">
                  {user.email && (<div className="mb-2">
                      <span className="font-medium">Email:</span> {user.email}
                    </div>)}
                  <div>Magasins:</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(() => {
                const names = getStoreNames(user);
                if (!names || names.length === 0) {
                    return <span className="text-muted-foreground">Aucun magasin</span>;
                }
                return names.map((n, idx) => (<Badge key={idx} className="text-xs">
                          {n}
                        </Badge>));
            })()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(user)}>
                    <Edit className="w-4 h-4 mr-2"/>
                    Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(user.id)}>
                    <Trash2 className="w-4 h-4"/>
                  </Button>
                </div>
              </CardContent>
            </Card>)))}
      </div>

      {!isLoading && users.length === 0 && (<Card className="p-12 text-center">
          <UserCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4"/>
          <p className="text-muted-foreground">Aucun utilisateur.</p>
        </Card>)}
      
      {!isLoading && users.length > 0 && filteredUsers.length === 0 && (<Card className="p-12 text-center">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4"/>
          <p className="text-muted-foreground">Aucun utilisateur ne correspond à votre recherche.</p>
          <Button variant="link" className="mt-2" onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setStoreFilter('all');
            }}>
            Réinitialiser les filtres
          </Button>
        </Card>)}
      </div>
    </div>);
}
