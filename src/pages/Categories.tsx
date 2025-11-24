import { useEffect, useState } from 'react';
import { getDB, generateId } from '@/lib/db';
import { queueSyncOp, connectionState } from '@/lib/sync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Folder } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  storeId: string;
}

interface HiddenCategory {
  id: string;
  categoryId: string;
  storeId: string;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<HiddenCategory[]>([]);
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
  name: '',
  description: '',
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    const db = await getDB();
    // Chargement des catégories
    let categoriesData = await db.getAll('categories');
    categoriesData = categoriesData.map((c: any) => ({ ...c, storeId: c.storeId || '' }));
    // Chargement des catégories masquées pour ce magasin
    let hidden = [];
    if (user?.storeId) {
      hidden = await db.getAll('hiddenCategories');
      hidden = hidden.filter((h: HiddenCategory) => h.storeId === user.storeId);
    }
    setHiddenCategories(hidden);
    let visibleCategories: Category[] = [];
    if (user?.role === 'super_admin') {
      // Le superadmin voit toutes les catégories par défaut (storeId vide)
      visibleCategories = categoriesData.filter(c => c.storeId === '');
    } else if (user?.storeId) {
      // Les autres voient les catégories par défaut non masquées + celles de leur boutique
      visibleCategories = categoriesData.filter(c => {
        if (!c.storeId) {
          // Catégorie par défaut, masquée ?
          return !hidden.some(h => h.categoryId === c.id);
        }
        // Catégories du magasin
        return c.storeId === user.storeId;
      });
    }
    setCategories(visibleCategories);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const db = await getDB();
    try {
      if (editingCategory) {
        // Modification
        const updated = {
          ...editingCategory,
          name: formData.name,
          description: formData.description,
          createdAt: editingCategory.createdAt,
          storeId: editingCategory.storeId,
        };
        await db.put('categories', updated);
        if (connectionState.isOnline) {
          await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          });
        } else {
          await queueSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php',
            method: 'PUT',
            data: updated,
          });
        }
        toast.success('Catégorie mise à jour');
      } else {
        // Création
        const already = categories.some(c => c.name.toLowerCase() === formData.name.trim().toLowerCase());
        if (already) {
          toast.error('Cette catégorie existe déjà');
          return;
        }
        // storeId = '' si superadmin, sinon magasin (obligatoire)
        let storeId = '';
        if (user?.role !== 'super_admin') {
          if (!user?.storeId) {
            toast.error('Impossible de créer une catégorie sans boutique associée');
            return;
          }
          storeId = user.storeId;
        }
        const newCategory: Category = {
          id: generateId(),
          name: formData.name.trim(),
          description: formData.description,
          createdAt: Date.now(),
          storeId,
        };
        await db.add('categories', newCategory);
        if (connectionState.isOnline) {
          await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newCategory),
          });
        } else {
          await queueSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php',
            method: 'POST',
            data: newCategory,
          });
        }
        toast.success('Catégorie créée');
      }
      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (category: Category) => {
    // Seul le superadmin peut éditer une catégorie par défaut
    if (!category.storeId && user?.role !== 'super_admin') {
      toast.error('Seul le superadmin peut modifier cette catégorie par défaut');
      return;
    }
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const db = await getDB();
    const category = categories.find(c => c.id === id);
    if (!category) return;
    if (!category.storeId && user?.role !== 'super_admin') {
      // Catégorie par défaut, admin/caissier : masquer pour ce magasin
      if (confirm('Voulez-vous masquer cette catégorie par défaut pour votre magasin ?')) {
        const hiddenCat: HiddenCategory = {
          id: generateId(),
          categoryId: id,
          storeId: user!.storeId,
        };
        await db.add('hiddenCategories', hiddenCat);
        toast.success('Catégorie masquée pour ce magasin');
        loadData();
      }
      return;
    }
    // Suppression normale
    if (confirm('Êtes-vous sûr de vouloir supprimer cette catégorie ?')) {
      await db.delete('categories', id);
      if (connectionState.isOnline) {
        await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php?id=${id}`, {
          method: 'DELETE',
        });
      } else {
        await queueSyncOp({
          url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php?id=${id}`,
          method: 'DELETE',
          data: {},
        });
      }
      toast.success('Catégorie supprimée');
      loadData();
    }
  };

  const resetForm = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Catégories</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez vos catégories de produits</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle catégorie
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optionnel)</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description de la catégorie"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-1/2" onClick={() => setIsDialogOpen(false)} disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" className="w-1/2" disabled={submitting}>
                  {submitting ? 'Traitement...' : (editingCategory ? 'Mettre à jour' : 'Créer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Aucune catégorie</p>
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      {category.name}
                      {!category.storeId && (
                        <span className="ml-2 text-xs text-primary">(Défaut)</span>
                      )}
                    </TableCell>
                    <TableCell>{category.description}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(category)}
                          disabled={!category.storeId && user?.role !== 'super_admin'}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(category.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
