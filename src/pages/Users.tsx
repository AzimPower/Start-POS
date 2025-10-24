import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDB, generateId } from '@/lib/db';
import { queueSyncOp, connectionState, forceSyncNow } from '@/lib/sync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { UserCircle, Edit, Trash2, Plus, Shield, User } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface UserData {
  id: string;
  username: string;
  phone: string;
  password: string;
  role: 'super_admin' | 'admin' | 'cashier';
  storeId: string;
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
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    phone: '',
    password: '',
    role: 'cashier' as 'admin' | 'cashier',
    storeId: '',
    pin: '',
  });

  useEffect(() => {
    // We intentionally call loadData once when `user` changes. loadData is stable here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadData();
  }, [user]);

  const loadData = async () => {
    const db = await getDB();

    // Load stores
    const storesData = await db.getAll('stores');
    setStores(storesData);

    loadUsers();
  };

  const loadUsers = async () => {
    if (connectionState.isOnline) {
      try {
        const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
        if (res.ok) {
          const remoteUsers = await res.json();
          // Met à jour IndexedDB locale
          const db = await getDB();
          const tx = db.transaction('users', 'readwrite');
          await tx.store.clear();
          for (const u of remoteUsers) {
            // Preserve existing local PIN if backend doesn't return one
            try {
              const local = await tx.store.get(u.id as string);
              const merged = {
                ...u,
                pin: (u as any).pin ?? (local ? (local as any).pin : '')
              };
              await tx.store.put(merged);
            } catch (e) {
              // fallback: put remote as-is
              await tx.store.put(u);
            }
          }
          await tx.done;
          // Filtrage et affichage
          let filteredUsers = remoteUsers.filter(u => u.role !== 'super_admin');
          if (user?.role === 'admin') {
            filteredUsers = filteredUsers.filter(u => u.storeId === user.storeId);
          }
          setUsers(filteredUsers.sort((a, b) => b.createdAt - a.createdAt));
          return;
        }
      } catch (e) {
        // Si erreur, fallback local
      }
    }
    // Fallback local
    const db = await getDB();
    const data: any[] = await db.getAll('users');
    const normalizedUsers = data.map((u: unknown) => ({
      ...(u as any),
      storeId: (u as any).storeId || ''
    }));
    let filteredUsers = normalizedUsers.filter(u => u.role !== 'super_admin');
    if (user?.role === 'admin') {
      filteredUsers = filteredUsers.filter(u => u.storeId === user.storeId);
    }
  setUsers(filteredUsers.sort((a: any, b: any) => b.createdAt - a.createdAt));
  };

  const handleSubmit = async () => {
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
        finalRole = 'cashier';
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
        } else {
          await queueSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
            method: 'PUT',
            data: userData,
          });
        }
        toast.success('Utilisateur modifié');
      } else {
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
        const newUser = {
          id: generateId(),
          username: formData.username,
          phone: `+226${formData.phone}`,
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
        } else {
          await queueSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
            method: 'POST',
            data: newUser,
          });
        }
        toast.success('Utilisateur créé');
      }
      setShowDialog(false);
      setEditingUser(null);
      setFormData({ username: '', phone: '', password: '', role: 'cashier', storeId: '', pin: '' });
      loadUsers();
    } catch (error) {
      console.error('User save error:', error);
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
      password: '',
      role: editUser.role === 'super_admin' ? 'admin' : editUser.role,
      storeId: editUser.storeId,
      pin: '',
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    const db = await getDB();
    try {
      await db.delete('users', id);
      if (connectionState.isOnline) {
        await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php?id=${id}`, {
          method: 'DELETE',
        });
      } else {
        await queueSyncOp({
          url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php?id=${id}`,
          method: 'DELETE',
          data: {},
        });
      }
      toast.success('Utilisateur supprimé');
      loadUsers();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const openNewDialog = () => {
    setEditingUser(null);
    setFormData({ username: '', phone: '', password: '', role: 'cashier', storeId: stores[0]?.id || '', pin: '' });
    setShowDialog(true);
  };

  const getStoreName = (storeId: string) => {
    return stores.find(s => s.id === storeId)?.name || 'Inconnu';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez les administrateurs et caissiers</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" onClick={openNewDialog}>
              <Plus className="w-4 h-4 mr-2" />
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
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Ex: caissier1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone *</Label>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">+226</span>
                  <Input
                    id="phone"
                    type="tel"
                    maxLength={8}
                    pattern="[0-9]{8}"
                    value={formData.phone}
                    onChange={(e) => {
                      // N'accepte que des chiffres et max 8 caractères
                      const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                      setFormData({ ...formData, phone: val });
                    }}
                    placeholder="XXXXXXXX"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (4-8 chiffres)</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '').slice(0,8) })}
                  placeholder={editingUser ? 'Laisser vide pour conserver le PIN actuel' : 'Ex: 1234'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle *</Label>
                {(user?.role === 'admin' && editingUser && editingUser.id === user.id) ? (
                  <Input id="role" value="Administrateur" disabled />
                ) : user?.role === 'admin' ? (
                  <Input id="role" value="Caissier" disabled />
                ) : (
                  <Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Caissier</SelectItem>
                      <SelectItem value="admin">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                {user?.role !== 'admin' && (
                  <>
                    <Label htmlFor="store">Magasin *</Label>
                    <Select value={formData.storeId} onValueChange={(v) => setFormData({ ...formData, storeId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un magasin" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map(store => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingUser ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(user => (
          <Card key={user.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  {user.role === 'admin' ? (
                    <Shield className="w-5 h-5 text-primary" />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                  {user.username}
                </div>
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                  {user.role === 'admin' ? 'Admin' : 'Caissier'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Magasin: {getStoreName(user.storeId)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEdit(user)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(user.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {users.length === 0 && (
        <Card className="p-12 text-center">
          <UserCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Aucun utilisateur.</p>
        </Card>
      )}
    </div>
  );
}