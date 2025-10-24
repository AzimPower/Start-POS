import { useEffect, useState, useRef } from 'react';
import { getDB, generateId } from '@/lib/db';
import { useNetwork } from '@/hooks/useNetwork';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users, Phone, Eye, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

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
export default function Customers() {
  const { user } = useAuth();
  const { isOnline, manualSync } = useNetwork();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  // Ajout pour détails client
  const [salesByCustomer, setSalesByCustomer] = useState<{ [customerId: string]: any[] }>({});

  useEffect(() => {
    loadCustomers();
    loadSales();
  }, []);

  useEffect(() => {
    // Filtrer les clients en fonction de la recherche
    if (searchTerm.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        customer.email?.toLowerCase().includes(term) ||
        customer.address?.toLowerCase().includes(term)
      );
      setFilteredCustomers(filtered);
    }
  }, [searchTerm, customers]);

  const loadSales = async () => {
    const db = await getDB();
    const sales = await db.getAll('sales');
    // Regroupe les ventes par client
    const byCustomer: { [customerId: string]: any[] } = {};
    for (const sale of sales) {
      if (sale.customerId) {
        if (!byCustomer[sale.customerId]) byCustomer[sale.customerId] = [];
        byCustomer[sale.customerId].push(sale);
      }
    }
    setSalesByCustomer(byCustomer);
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      
      // Si en ligne, charger depuis le backend et synchroniser
      if (isOnline) {
        try {
          // Charger les clients depuis le backend (n'ajouter storeId que s'il est défini)
          let url = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php';
          if (user?.storeId) url += `?storeId=${user.storeId}`;
          const response = await fetch(url);
          if (response.ok) {
            const backendCustomers = await response.json();
            // Mettre à jour la base locale
            const tx = db.transaction('customers', 'readwrite');
            await Promise.all([
              ...backendCustomers.map(c => tx.store.put(c)),
              tx.done
            ]);
            // reset pagination and load first page
            setLoadedCount(0);
            setHasMore(true);
            await loadCustomersPage(db, 0, pageSize, true);
          }
        } catch (error) {
          console.error('Erreur de synchronisation avec le backend:', error);
          // En cas d'erreur, charger depuis la base locale (paged)
          await loadCustomersPage(db, 0, pageSize, true);
        }
      } else {
        // Hors ligne : charger depuis la base locale (paged)
        await loadCustomersPage(db, 0, pageSize, true);
      }

      // Compter les éléments en attente de synchronisation
      await updatePendingSyncCount(db);
    } catch (error) {
      toast.error('Erreur lors du chargement des clients');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFromLocal = async (db: any) => {
    return loadCustomersPage(db, 0, pageSize, true);
  };

  const loadCustomersPage = async (db: any, offset: number, limit: number, reset = false) => {
    try {
      const store = db.transaction('customers').objectStore('customers');
      const results: any[] = [];
      // No index for createdAt in customers; fallback to getAll
      const all = await db.getAll('customers');
      const normalized = all.map((c: any) => ({ ...c, storeId: c.storeId || '' }));
      // optionally filter by store
      const filtered = user?.storeId ? normalized.filter((c: any) => c.storeId === user.storeId) : normalized;
      filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);
      const page = filtered.slice(offset, offset + limit);

      if (reset) {
        setCustomers(page);
        setLoadedCount(page.length);
      } else {
        setCustomers(prev => [...prev, ...page]);
        setLoadedCount(prev => prev + page.length);
      }

      setHasMore(page.length === limit);
      setFilteredCustomers(reset ? page : [...customers, ...page]);
      return page;
    } catch (e) {
      console.error('Erreur chargement paginé clients:', e);
      // fallback
      const all = await db.getAll('customers');
      const normalized = all.map((c: any) => ({ ...c, storeId: c.storeId || '' }));
      const filtered = user?.storeId ? normalized.filter((c: any) => c.storeId === user.storeId) : normalized;
      filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);
      const page = filtered.slice(offset, offset + limit);
      if (reset) setCustomers(page); else setCustomers(prev => [...prev, ...page]);
      setHasMore(page.length === limit);
      setFilteredCustomers(reset ? page : [...customers, ...page]);
      return page;
    }
  };

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const handleListScroll = async () => {
    const el = listScrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setLoadingMore(true);
      try {
        const db = await getDB();
        await loadCustomersPage(db, loadedCount, pageSize, false);
      } catch (e) {
        console.error('Erreur page clients suivante:', e);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  const updatePendingSyncCount = async (db: any) => {
    try {
      const syncQueue = await db.getAll('syncQueue');
      const customerPendingOps = syncQueue.filter(op => 
        op.table === 'customers' && op.storeId === user?.storeId
      );
      setPendingSyncCount(customerPendingOps.length);
    } catch (error) {
      console.error('Erreur lors du comptage des synchronisations en attente:', error);
    }
  };

  const addToSyncQueue = async (db: any, syncOp: any) => {
    try {
      await db.add('syncQueue', syncOp);
      await updatePendingSyncCount(db);
    } catch (error) {
      console.error('Erreur lors de l\'ajout à la queue de synchronisation:', error);
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
      setLoading(true);
      const db = await getDB();

      if (editingCustomer) {
        // Modification
        const updated: Customer = {
          ...editingCustomer,
          ...formData,
          phone: `+226 ${phone}`,
          storeId: user.storeId, // Forcer le storeId de l'utilisateur connecté
        };
        
        console.log('Updating customer with storeId:', updated.storeId); // Debug
        
        // Sauvegarder localement d'abord
        await db.put('customers', updated);
        
        // Si en ligne, synchroniser immédiatement avec le backend
        if (isOnline) {
          try {
            const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', {
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
          } catch (error) {
            console.error('Erreur de synchronisation:', error);
            // Ajouter à la queue de synchronisation pour plus tard
            await addToSyncQueue(db, {
              id: generateId(),
              table: 'customers',
              operation: 'PUT',
              data: updated,
              url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php',
              storeId: user.storeId,
              createdAt: Date.now()
            });
            toast.success('Client mis à jour (sera synchronisé plus tard)');
          }
        } else {
          // Hors ligne : ajouter directement à la queue de synchronisation
          await addToSyncQueue(db, {
            id: generateId(),
            table: 'customers',
            operation: 'PUT',
            data: updated,
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php',
            storeId: user.storeId,
            createdAt: Date.now()
          });
          toast.success('Client mis à jour (mode hors ligne)');
        }
      } else {
        // Création
        const newCustomer: Customer = {
          id: generateId(),
          ...formData,
          phone: `+226 ${phone}`,
          balance: 0,
          createdAt: Date.now(),
          storeId: user.storeId, // Forcer le storeId de l'utilisateur connecté
        };
        
        console.log('Creating customer with storeId:', newCustomer.storeId); // Debug
        
        // Sauvegarder localement d'abord
        await db.add('customers', newCustomer);
        
        // Si en ligne, synchroniser immédiatement avec le backend
        if (isOnline) {
          try {
            const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', {
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
          } catch (error) {
            console.error('Erreur de synchronisation:', error);
            // Ajouter à la queue de synchronisation pour plus tard
            await addToSyncQueue(db, {
              id: generateId(),
              table: 'customers',
              operation: 'POST',
              data: newCustomer,
              url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php',
              storeId: user.storeId,
              createdAt: Date.now()
            });
            toast.success('Client créé (sera synchronisé plus tard)');
          }
        } else {
          // Hors ligne : ajouter directement à la queue de synchronisation
          await addToSyncQueue(db, {
            id: generateId(),
            table: 'customers',
            operation: 'POST',
            data: newCustomer,
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php',
            storeId: user.storeId,
            createdAt: Date.now()
          });
          toast.success('Client créé (mode hors ligne)');
        }
      }

      setIsDialogOpen(false);
      resetForm();
      loadCustomers();
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du client:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
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
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;
    
    try {
      setLoading(true);
      const db = await getDB();
      await db.delete('customers', id);
      
      // Si en ligne, synchroniser immédiatement avec le backend
      if (isOnline) {
        try {
          const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php?id=${id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`Erreur backend: ${response.status}`);
          }

          toast.success('Client supprimé et synchronisé');
        } catch (error) {
          console.error('Erreur de synchronisation:', error);
          // Ajouter à la queue de synchronisation pour plus tard
          await addToSyncQueue(db, {
            id: generateId(),
            table: 'customers',
            operation: 'DELETE',
            data: { id },
            url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php?id=${id}`,
            storeId: user?.storeId,
            createdAt: Date.now()
          });
          toast.success('Client supprimé (sera synchronisé plus tard)');
        }
      } else {
        // Hors ligne : ajouter directement à la queue de synchronisation
        await addToSyncQueue(db, {
          id: generateId(),
          table: 'customers',
          operation: 'DELETE',
          data: { id },
          url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php?id=${id}`,
          storeId: user?.storeId,
          createdAt: Date.now()
        });
        toast.success('Client supprimé (mode hors ligne)');
      }
      
      loadCustomers();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
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
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Clients</h1>
            {loading && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez votre base de clients</p>
        </div>
        {/* ...Dialog code inchangé... */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
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
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
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
                  <Input
                    value={formData.phone}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                      setFormData({ ...formData, phone: val });
                    }}
                    placeholder="XXXXXXXX"
                    type="tel"
                    maxLength={8}
                    style={{ flex: 1 }}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center sm:justify-end">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
                  {loading ? 'Traitement...' : (editingCustomer ? 'Mettre à jour' : 'Créer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4">
            <Input
              placeholder="Rechercher par nom, téléphone, email ou adresse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
    <div className="overflow-x-auto" ref={listScrollRef} onScroll={handleListScroll}>
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Chargement des clients...
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>{searchTerm ? 'Aucun client trouvé' : 'Aucun client enregistré'}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const sales = salesByCustomer[customer.id] || [];
                    const lastVisit = sales.length > 0 ? new Date(Math.max(...sales.map(s => s.createdAt))) : null;
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{customer.name}</div>
                            {isMobile && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                {customer.phone && (
                                  <div className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    <span>{customer.phone}</span>
                                  </div>
                                )}
                                {sales.length > 0 && (
                                  <div className="text-xs">
                                    {sales.length} visite{sales.length > 1 ? 's' : ''}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
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
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleEdit(customer)} 
                              title="Modifier"
                              disabled={loading}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDelete(customer.id)} 
                              title="Supprimer"
                              disabled={loading}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" title="Voir les reçus du client" onClick={() => navigate(`/customer-receipts/${customer.id}`)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                {loadingMore && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      Chargement...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
