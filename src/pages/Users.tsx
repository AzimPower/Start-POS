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
import { hashPasswordForCache } from '@/lib/auth';
import { BACKEND_BASE } from '@/lib/backend';

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

function getRoleConfig(role: UserData['role']) {
    switch (role) {
        case 'admin':
            return {
                label: 'Admin',
                Icon: Shield,
                badgeClassName: 'bg-blue-600 text-white border-blue-600',
                iconWrapperClassName: 'bg-blue-100 text-blue-700',
                headerClassName: 'from-blue-50 via-white to-blue-100/70',
                cardClassName: 'border-blue-100/80 shadow-blue-100/60',
            };
        case 'manager':
            return {
                label: 'Gestionnaire',
                Icon: User,
                badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
                iconWrapperClassName: 'bg-amber-100 text-amber-700',
                headerClassName: 'from-amber-50 via-white to-orange-100/60',
                cardClassName: 'border-amber-100/80 shadow-amber-100/50',
            };
        default:
            return {
                label: 'Caissier',
                Icon: User,
                badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                iconWrapperClassName: 'bg-emerald-100 text-emerald-700',
                headerClassName: 'from-emerald-50 via-white to-emerald-100/60',
                cardClassName: 'border-emerald-100/80 shadow-emerald-100/50',
            };
    }
}

function UserAccountCard({
    account,
    stores,
    onEdit,
    onDelete,
}: {
    account: UserData;
    stores: string[];
    onEdit: () => void;
    onDelete: () => void;
}) {
    const roleConfig = getRoleConfig(account.role);
    const RoleIcon = roleConfig.Icon;

    return (<Card className={`overflow-hidden rounded-[28px] border bg-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-xl ${roleConfig.cardClassName}`}>
      <div className={`border-b border-border/60 bg-gradient-to-br ${roleConfig.headerClassName} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${roleConfig.iconWrapperClassName}`}>
              <RoleIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold tracking-tight text-slate-900">{account.username}</div>
              <div className="mt-1 text-sm text-slate-500">{account.phone}</div>
            </div>
          </div>
          <Badge className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${roleConfig.badgeClassName}`}>
            {roleConfig.label}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        <div className="rounded-2xl bg-slate-50/80 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Affectations</div>
          <div className="text-sm text-slate-500">Magasins associés</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stores.length === 0 ? (<span className="text-sm text-muted-foreground">Aucun magasin</span>) : (stores.map((storeName, idx) => (<Badge key={`${account.id}-${idx}`} className="rounded-full border border-blue-200 bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-600">
                  {storeName}
                </Badge>)))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contact</div>
          <div className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">Téléphone :</span> {account.phone}
          </div>
          <div className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">Email :</span> {account.email || 'Non renseigné'}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" className="h-11 flex-1 rounded-2xl border-slate-200 bg-white text-base font-semibold hover:bg-slate-50" onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-slate-200 text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>);
}

interface UserData {
    id: string;
    username: string;
    phone: string;
    email?: string;
    password?: string;
    passwordHash?: string;
    role: 'super_admin' | 'admin' | 'cashier' | 'manager';
    storeId: string;
    storeIds?: string[];
    active?: boolean;
    createdAt: number;
    pin?: string;
}
interface StoreData {
    id: string;
    name: string;
}

  function normalizeStoreIds(storeIds?: Array<string | null | undefined>, fallbackStoreId?: string | null) {
    const ids = Array.isArray(storeIds) ? storeIds : [];
    const candidates = ids.length > 0 ? ids : [fallbackStoreId];

    return Array.from(new Set(candidates
      .map((storeId) => String(storeId || '').trim())
      .filter(Boolean)));
  }

export default function Users() {
    const { user } = useAuth();
  const userFormTotalSteps = 2;
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
      storeIds: [] as string[],
        pin: '',
    });
    const [storePickerKey, setStorePickerKey] = useState(0);
    const [userFormStep, setUserFormStep] = useState(1);
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
                let url = `${BACKEND_BASE}/api/users.php`;
                if (user?.role === 'admin' && user?.storeId) {
                    url += `?storeId=${user.storeId}`;
                }
                const res = await fetch(url);
                if (res.ok) {
                  const remoteUsers = await res.json();
                  const normalizedRemoteUsers = Array.isArray(remoteUsers)
                    ? remoteUsers.map((remoteUser: any) => ({
                      ...remoteUser,
                      storeId: remoteUser?.storeId || '',
                      storeIds: normalizeStoreIds(remoteUser?.storeIds, remoteUser?.storeId),
                    }))
                    : [];
                    // Si admin, filtrer côté client aussi pour sécurité
                    const storeUsers = user?.role === 'admin' && user?.storeId
                    ? normalizedRemoteUsers.filter((u: any) => {
                      const uStoreIds: string[] = normalizeStoreIds(u.storeIds, u.storeId);
                            return uStoreIds.includes(user.storeId);
                        })
                    : normalizedRemoteUsers;
                    // Met à jour IndexedDB locale
                    const db = await getDB();
                  const existingLocalUsers = await db.getAll('users');
                  const localUsersById = new Map(existingLocalUsers.map((existingUser: any) => [existingUser.id, existingUser]));
                    const tx = db.transaction('users', 'readwrite');
                    const normalizedStoreUsers = storeUsers.map((u: any) => {
                      const local = localUsersById.get(u.id as string);
                      return {
                        ...u,
                        pin: (u as any).pin ?? (local ? (local as any).pin : ''),
                        passwordHash: (local as any)?.passwordHash,
                        password: (local as any)?.password,
                      };
                    });
                    const remoteUserIds = new Set(normalizedStoreUsers.map((u: any) => String(u.id)));
                    const usersToDelete = user?.role === 'admin' && user?.storeId
                      ? existingLocalUsers.filter((existingUser: any) => {
                        const existingStoreIds = normalizeStoreIds(existingUser.storeIds, existingUser.storeId);
                        return existingStoreIds.includes(user.storeId) && !remoteUserIds.has(String(existingUser.id));
                      })
                      : existingLocalUsers.filter((existingUser: any) => !remoteUserIds.has(String(existingUser.id)));
                    await Promise.all([
                      ...usersToDelete.map((u: any) => tx.store.delete(u.id)),
                      ...normalizedStoreUsers.map((u: any) => tx.store.put(u)),
                      tx.done
                    ]);
                      for (const syncedUser of storeUsers) {
                        await syncLocalUserStoreMappings(db, syncedUser.id, normalizeStoreIds((syncedUser as any).storeIds, (syncedUser as any).storeId));
                      }
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
          storeIds: normalizeStoreIds((u as any).storeIds, (u as any).storeId),
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
        const requestedStoreIds = user?.role === 'admin'
            ? normalizeStoreIds(undefined, user.storeId)
            : normalizeStoreIds(formData.storeIds);

        const requiresPassword = !editingUser;
        if (!formData.username.trim() || !formData.phone.trim() || (requiresPassword && !formData.password.trim()) || requestedStoreIds.length === 0) {
            toast.error('Tous les champs sont requis');
            return;
        }
        if (!/^[0-9]{8}$/.test(formData.phone)) {
            toast.error('Le numéro doit contenir exactement 8 chiffres.');
            return;
        }
        let finalRole = formData.role;
        let finalStoreIds = requestedStoreIds;
        if (user?.role === 'admin') {
            if (!editingUser || editingUser.id !== user.id) {
                // L'admin peut créer des caissiers et des gestionnaires, mais pas d'autres admins
                if (formData.role === 'admin') {
                    finalRole = 'cashier';
                }
                else {
                    finalRole = formData.role; // Permet 'cashier' et 'manager'
                }
            }
              finalStoreIds = normalizeStoreIds(undefined, user.storeId);
        }
            const finalStoreId = finalStoreIds[0] || '';
        const db = await getDB();
        try {
            if (editingUser) {
                const nextPasswordHash = formData.password.trim()
                    ? await hashPasswordForCache(formData.password)
                    : editingUser.passwordHash;
                // Modification
                const userData = {
                    ...editingUser,
                    username: formData.username,
                    phone: `+226${formData.phone}`,
                    email: formData.email.trim() || null,
                    passwordHash: nextPasswordHash,
                    role: finalRole,
                    storeIds: finalStoreIds,
                    storeId: finalStoreId,
                    // Only overwrite pin if admin provided a new one
                    ...(formData.pin ? { pin: formData.pin } : {}),
                };
                await db.put('users', userData);
                  await syncLocalUserStoreMappings(db, userData.id, finalStoreIds);
                if (connectionState.isOnline) {
                    const remotePayload = {
                        ...userData,
                        ...(formData.password.trim() ? { password: formData.password } : {}),
                    };
                    const res = await fetch(`${BACKEND_BASE}/api/users.php`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(remotePayload),
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `Server returned ${res.status}`);
                    }
                }
                else {
                    await queueSyncOp({
                        url: `${BACKEND_BASE}/api/users.php`,
                        method: 'PUT',
                        data: {
                            ...userData,
                            ...(formData.password.trim() ? { password: formData.password } : {}),
                        },
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
                    passwordHash: await hashPasswordForCache(formData.password),
                    role: finalRole,
                    storeIds: finalStoreIds,
                    storeId: finalStoreId,
                    pin: formData.pin || '',
                    active: true,
                    createdAt: Date.now(),
                };
                await db.add('users', newUser);
                  await syncLocalUserStoreMappings(db, newUser.id, finalStoreIds);
                if (connectionState.isOnline) {
                    const remotePayload = {
                        ...newUser,
                        password: formData.password,
                    };
                    const res = await fetch(`${BACKEND_BASE}/api/users.php`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(remotePayload),
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `Server returned ${res.status}`);
                    }
                }
                else {
                    await queueSyncOp({
                        url: `${BACKEND_BASE}/api/users.php`,
                        method: 'POST',
                        data: {
                            ...newUser,
                            password: formData.password,
                        },
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
            setFormData({ username: '', phone: '', email: '', password: '', role: 'cashier' as 'admin' | 'cashier' | 'manager', storeIds: [], pin: '' });
        }
        catch (error) {
            const msg = (error as any)?.message || 'Erreur lors de l\'enregistrement';
            toast.error(msg);
        }
    };
    const handleEdit = (editUser: UserData) => {
        setEditingUser(editUser);
      setUserFormStep(1);
        // Ensure phone is prefilled as 8 digits (strip +226 and non-digits)
        const rawPhone = String(editUser.phone || '').replace(/[^0-9]/g, '');
        const phone8 = rawPhone.replace(/^226/, '').slice(-8);
        setFormData({
            username: editUser.username,
            phone: phone8,
            email: editUser.email || '',
            password: '',
            role: editUser.role === 'super_admin' ? 'admin' : editUser.role as 'admin' | 'cashier' | 'manager',
          storeIds: normalizeStoreIds(editUser.storeIds, editUser.storeId),
            pin: editUser.pin || '',
        });
        setShowDialog(true);
        setStorePickerKey((current) => current + 1);
    };
    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?'))
            return;
        const db = await getDB();
        try {
            await db.delete('users', id);
          const mappings = await db.getAllFromIndex('userStores', 'by-user', id as any);
          for (const mapping of mappings) {
            await db.delete('userStores', (mapping as any).id);
          }
            if (connectionState.isOnline) {
                await fetch(`${BACKEND_BASE}/api/users.php?id=${id}`, {
                    method: 'DELETE',
                });
            }
            else {
                await queueSyncOp({
                    url: `${BACKEND_BASE}/api/users.php?id=${id}`,
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
        setUserFormStep(1);
        setShowPassword(false);
        setShowPin(false);
        setFormData({ username: '', phone: '', email: '', password: '', role: 'cashier' as 'admin' | 'cashier' | 'manager', storeIds: [], pin: '' });
        setStorePickerKey((current) => current + 1);
        setShowDialog(true);
    };
    const syncLocalUserStoreMappings = async (db: any, userId: string, storeIds: string[]) => {
        const existingMappings = await db.getAllFromIndex('userStores', 'by-user', userId as any);
        for (const mapping of existingMappings) {
            await db.delete('userStores', (mapping as any).id);
        }
        for (const storeId of normalizeStoreIds(storeIds)) {
            await db.add('userStores', { id: generateId(), userId, storeId });
        }
    };
    const toggleStoreSelection = (storeId: string, checked: boolean) => {
        setFormData((current) => {
            const currentStoreIds = normalizeStoreIds(current.storeIds);
            const nextStoreIds = checked
                ? Array.from(new Set([...currentStoreIds, storeId]))
                : currentStoreIds.filter((currentStoreId) => currentStoreId !== storeId);

            return {
                ...current,
                storeIds: nextStoreIds,
            };
        });
    };
          const addStoreSelection = (storeId: string) => {
            toggleStoreSelection(storeId, true);
            setStorePickerKey((current) => current + 1);
          };
    const getUserStoreIds = (u: UserData) => {
      return normalizeStoreIds(u.storeIds, u.storeId);
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
    const goToNextUserStep = () => {
        if (!formData.username.trim() || !formData.phone.trim() || !formData.password.trim()) {
            toast.error('Complétez les champs obligatoires avant de continuer');
            return;
        }

        if (!/^[0-9]{8}$/.test(formData.phone)) {
            toast.error('Le numéro doit contenir exactement 8 chiffres.');
            return;
        }

        setUserFormStep(2);
    };
    const renderUserRoleField = () => (<div className="space-y-2">
        <Label htmlFor="role">Rôle *</Label>
        {(user?.role === 'admin' && editingUser && editingUser.id === user.id) ? (<Input id="role" value="Administrateur" disabled />) : user?.role === 'admin' ? (<Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
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
      </div>);
    const renderUserDialogForm = () => (<div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-muted-foreground">Étape {userFormStep} sur {userFormTotalSteps}</div>
            <div className="text-xs text-muted-foreground">{userFormStep === 1 ? 'Informations' : 'Rôle et magasins'}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={`h-1.5 rounded-full ${userFormStep >= 1 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 rounded-full ${userFormStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </div>

        {userFormStep === 1 ? (<>
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur *</Label>
              <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Ex: caissier1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone *</Label>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">+226</span>
                <Input id="phone" type="tel" maxLength={8} pattern="[0-9]{8}" value={formData.phone} onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                    setFormData({ ...formData, phone: val });
                }} placeholder="XXXXXXXX" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="utilisateur@exemple.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe *</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="pr-10" />
                <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? (<EyeOff className="h-4 w-4 text-gray-400" />) : (<Eye className="h-4 w-4 text-gray-400" />)}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4-8 chiffres)</Label>
              <div className="relative">
                <Input id="pin" type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={8} value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} placeholder={editingUser ? 'Laisser vide pour conserver le PIN actuel' : 'Ex: 1234'} className="pr-10" />
                <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3" onClick={() => setShowPin(!showPin)}>
                  {showPin ? (<EyeOff className="h-4 w-4 text-gray-400" />) : (<Eye className="h-4 w-4 text-gray-400" />)}
                </button>
              </div>
            </div>
          </>) : (<>
            {renderUserRoleField()}
            {renderStoreSelection()}
          </>)}

        <div className="flex gap-2 pt-2">
          {userFormStep > 1 && (<Button type="button" variant="outline" className="flex-1" onClick={() => setUserFormStep(1)}>
              Précédent
            </Button>)}
          {userFormStep < userFormTotalSteps ? (<Button type="button" className="flex-1" onClick={goToNextUserStep}>
              Suivant
            </Button>) : (<Button onClick={handleSubmit} className="flex-1">
              {editingUser ? 'Modifier' : 'Créer'}
            </Button>)}
        </div>
      </div>);
    const renderStoreSelection = () => {
      if (user?.role === 'admin') {
        return null;
      }

      const selectedStoreIds = normalizeStoreIds(formData.storeIds);
      const associatedStores = stores.filter((store) => selectedStoreIds.includes(store.id));
      const availableStores = stores.filter((store) => !selectedStoreIds.includes(store.id));

      return (<div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>Magasins associés *</Label>
          <span className="text-xs text-muted-foreground">
            {selectedStoreIds.length === 0
              ? 'Aucun magasin sélectionné'
              : `${selectedStoreIds.length} magasin${selectedStoreIds.length > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="max-h-52 space-y-3 overflow-auto rounded-md border border-border/60 p-3">
          {associatedStores.length === 0 ? (<p className="text-sm text-muted-foreground">Aucun magasin associé.</p>) : (associatedStores.map((store) => (<div key={store.id} className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-muted/40">
                <span className="text-sm font-medium">{store.name}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => toggleStoreSelection(store.id, false)} aria-label={`Dissocier ${store.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>)))}
        </div>
        {availableStores.length > 0 && (<div className="space-y-2">
          <Label>Associer un magasin</Label>
          <Select key={storePickerKey} onValueChange={addStoreSelection}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un magasin à associer" />
            </SelectTrigger>
            <SelectContent>
              {availableStores.map((store) => (<SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>))}
            </SelectContent>
          </Select>
        </div>)}
        {selectedStoreIds.length > 0 && (<div className="flex flex-wrap gap-2">
          {selectedStoreIds.map((storeId) => (<Badge key={storeId} variant="outline">{getStoreName(storeId)}</Badge>))}
        </div>)}
      </div>);
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
            {renderUserDialogForm()}
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
        {isLoading ? (Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`} className="overflow-hidden rounded-[28px] border border-slate-200 shadow-sm">
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
            </Card>))) : (filteredUsers.map(listUser => (<UserAccountCard key={listUser.id} account={listUser} stores={getStoreNames(listUser)} onEdit={() => handleEdit(listUser)} onDelete={() => handleDelete(listUser.id)} />)))}
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
            {renderUserDialogForm()}
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

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (<Card key={`skeleton-${i}`} className="overflow-hidden rounded-[28px] border border-slate-200 shadow-sm">
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
                  <div className="mb-4 text-sm text-muted-foreground">
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
              </Card>))
        ) : (
          filteredUsers.map((listUser) => (<UserAccountCard key={listUser.id} account={listUser} stores={getStoreNames(listUser)} onEdit={() => handleEdit(listUser)} onDelete={() => handleDelete(listUser.id)} />))
        )}
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
