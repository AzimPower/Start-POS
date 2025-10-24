import { useEffect, useState } from 'react';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNetwork } from '@/hooks/useNetwork';

interface Product {
  id: string;
  name: string;
  sku: string;
  storeId: string;
  categoryId?: string;
  salePrice?: number;
  costPrice?: number;
  targetMargin?: number; // Pourcentage de gain cible
  variablePrices?: Array<{ label: string; price: number }>; // Prix variables (ex: petit, moyen, grand)
  unit: string;
  taxRate?: number;
  stock: { [storeId: string]: number };
  minStock?: number;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
  trackStock?: boolean; // Ajout pour le suivi du stock
}

interface Category {
  id: string;
  name: string;
  description: string;
  storeId: string;
  createdAt: number;
}

export default function Products() {
  // Calcul automatique de la marge en %
  function calculateMargin(sale: string, cost: string) {
    const salePrice = parseFloat(sale.replace(/\s/g, ''));
    const costPrice = parseFloat(cost.replace(/\s/g, ''));
    if (!costPrice || isNaN(salePrice) || isNaN(costPrice) || costPrice === 0) return '';
    const margin = ((salePrice - costPrice) / costPrice) * 100;
    return margin.toFixed(2);
  }
  // Formate un nombre avec espace entre les milliers
  function formatNumberWithSpaces(value: string) {
    const num = value.replace(/\D/g, "");
    if (!num) return "";
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const { isOnline: connectionState, manualSync } = useNetwork();
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryAddStatus, setCategoryAddStatus] = useState<'idle'|'success'|'error'>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    categoryName: '', // Remplace categoryId par categoryName
    salePrice: '',
    costPrice: '',
    targetMargin: '',
    variablePrices: [] as Array<{ label: string; price: string }>,
    unit: 'pièce',
    taxRate: '',
    stock: '',
    minStock: '',
    trackStock: false,
    imageUrl: '',
    pendingImage: '',
  });
  const [categoryExists, setCategoryExists] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [productsSearch, setProductsSearch] = useState('');

  useEffect(() => {
    if (user?.storeId) {
      loadData();
    }
  }, [user]);

  if (isLoading) {
    return <div className="p-4">Chargement des données utilisateur...</div>;
  }

  if (!user) {
    return <div className="p-4">Veuillez vous connecter pour voir les produits.</div>;
  }

  const loadData = async () => {
    if (!user?.storeId) {
      console.error('Aucun storeId trouvé');
      return;
    }

    // Tentative : récupérer toujours les produits depuis le backend si on est en ligne.
    if (connectionState) {
      try {
        const [productsResponse, categoriesResponse] = await Promise.all([
          fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?storeId=${user.storeId}`),
          fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php?storeId=${user.storeId}`)
        ]);

        const db = await getDB();

        if (productsResponse.ok) {
          const backendProducts = await productsResponse.json();
          // Mettre à jour l'UI
          setProducts(backendProducts || []);
          // Stocker en local pour usage hors-ligne
          try {
            const tx = db.transaction('products', 'readwrite');
            await tx.store.clear();
            for (const p of (backendProducts || [])) {
              // Normaliser le stock
              await tx.store.put({ ...p, stock: p.stock || {} });
            }
            await tx.done;
          } catch (e) {
            console.warn('Erreur en enregistrant les produits en local:', e);
          }
        } else {
          console.error('Erreur lors du chargement des produits depuis le backend');
        }

        if (categoriesResponse.ok) {
          const backendCategories = await categoriesResponse.json();
          setCategories(backendCategories || []);
          try {
            const txc = db.transaction('categories', 'readwrite');
            await txc.store.clear();
            for (const c of (backendCategories || [])) await txc.store.put({ ...c, storeId: c.storeId || user.storeId });
            await txc.done;
          } catch (e) {
            console.warn('Erreur en enregistrant les catégories en local:', e);
          }
        } else {
          console.error('Erreur lors du chargement des catégories depuis le backend');
        }

        return;
      } catch (error: any) {
        console.error('Erreur de connexion avec le backend:', error);
        // Provide the error message in the toast to help debugging (ex: "Failed to fetch")
        toast.error('Impossible de se connecter au serveur — ' + (error?.message || String(error)) + ' — utilisation des données locales');
        // fallthrough to load local data
      }
    }

    // Fallback: charger depuis IndexedDB (hors-ligne ou erreur réseau)
    try {
      const db = await getDB();
      const localProducts = await db.getAll('products');
      const localCategories = await db.getAll('categories');
      // Filtrer par magasin courant
      const prods = (localProducts || [])
        .filter((p: any) => p.storeId === user.storeId || !p.storeId)
        .map((p: any) => ({
          ...p,
          storeId: p.storeId || user.storeId // Ensure storeId is present
        }));
      const cats = (localCategories || []).filter((c: any) => c.storeId === user.storeId || !c.storeId);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      console.error('Erreur en chargeant les données locales:', e);
      setProducts([]);
      setCategories([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let categoryId;
      if (formData.categoryName) {
        let cat = categories.find(c => c.name.toLowerCase() === formData.categoryName.trim().toLowerCase());
        if (!cat) {
          // Ajout catégorie directement au backend
          const newCategory = {
            id: generateId(),
            name: formData.categoryName.trim(),
            description: newCategoryDesc,
            storeId: user.storeId,
            createdAt: Date.now(),
          };

          const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(newCategory)
          });

          if (response.ok) {
            cat = newCategory;
            // Recharger les catégories depuis le backend
            const categoriesResponse = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php?storeId=${user.storeId}`);
            if (categoriesResponse.ok) {
              const updatedCategories = await categoriesResponse.json();
              setCategories(updatedCategories);
            }
          } else {
            throw new Error('Erreur lors de la création de la catégorie');
          }
        }
        categoryId = cat.id;
      }
      const db = await getDB();
      // If there's a pending image, upload it now and capture the returned URL locally.
      // We use a local variable so we don't rely on setState being applied synchronously.
      let uploadedImageUrl = formData.imageUrl || '';
      if (formData.pendingImage) {
        try {
          // If editing an existing product and it has an image, delete the old image first
          // to avoid accumulating orphan files on the server.
          if (editingProduct && editingProduct.imageUrl) {
            // Try to delete the previous image. We'll try multiple candidate paths:
            // 1) the exact stored URL
            // 2) fallback to 'img_products/<basename>' (some servers store relative paths)
            const prevUrl = editingProduct.imageUrl;
            const basename = prevUrl ? prevUrl.split('/').pop() : null;
            const candidates: string[] = [];
            if (prevUrl) candidates.push(prevUrl);
            if (basename) candidates.push(`img_products/${basename}`);

            let deleted = false;
            for (const candidate of candidates) {
              try {
                const delRes = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/upload_image.php', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: candidate })
                });
                // Try to parse JSON response (server echoes success/error)
                let delJson: any = null;
                try {
                  delJson = await delRes.json();
                } catch (e) {
                  // ignore parse error
                }
                if (delRes.ok && delJson && delJson.success) {
                  deleted = true;
                  toast.success('Ancienne image supprimée du serveur');
                  break;
                } else {
                  // keep trying other candidates
                  console.warn('Suppression image tentative échouée', candidate, delRes.status, delJson);
                }
              } catch (delErr) {
                console.warn('Erreur lors de la tentative de suppression de l\'ancienne image:', delErr);
              }
            }
            if (!deleted) {
              toast.error('Impossible de supprimer l\'ancienne image sur le serveur (vérifiez les logs). Le fichier peut rester présent.');
            }
          }

          const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/upload_image.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: formData.pendingImage })
          });
          const result = await res.json();
          if (result && result.success) {
            const fullUrl = `https://mediumslateblue-cod-399211.hostingersite.com/backend/${result.url}`;
            uploadedImageUrl = fullUrl;
            // still update the form state for UI consistency
            setFormData(f => ({ ...f, imageUrl: fullUrl, pendingImage: '' }));
          } else {
            toast.error('Erreur lors de l\'upload de l\'image: ' + (result?.error || ''));
            // continue without blocking save
          }
        } catch (err) {
          console.error('Upload image failed', err);
          toast.error('Erreur réseau lors de l\'upload de l\'image');
        }
      }
  if (editingProduct) {
        // Update existing product
        const updated = {
          ...editingProduct,
          name: formData.name,
          sku: formData.sku,
          storeId: user.storeId,
          categoryId: categoryId || undefined,
          salePrice: formData.salePrice ? parseFloat(formData.salePrice) : undefined,
          costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
          targetMargin: formData.targetMargin ? parseFloat(formData.targetMargin) : undefined,
          variablePrices: formData.variablePrices.length > 0 
            ? formData.variablePrices.map(vp => ({ label: vp.label, price: parseFloat(vp.price) }))
            : undefined,
          unit: formData.unit,
          taxRate: formData.taxRate ? parseFloat(formData.taxRate) : undefined,
          stock: formData.trackStock ? {
            ...(editingProduct?.stock || {}),
            [user.storeId]: formData.stock ? parseFloat(formData.stock) : 0,
          } : {},
          minStock: formData.trackStock && formData.minStock ? parseFloat(formData.minStock) : undefined,
          imageUrl: uploadedImageUrl || formData.imageUrl || '',
          updatedAt: Date.now(),
          trackStock: formData.trackStock,
        };

        // Écrire immédiatement en local
        await db.put('products', updated as any);

        // Essayer de synchroniser (performSyncOp gère la mise en file si hors-ligne)
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
          method: 'PUT',
          data: { ...updated, storeId: user.storeId, stock: formData.trackStock ? parseFloat(formData.stock) || 0 : 0 }
        });

        toast.success('Produit mis à jour (localement). La synchronisation se fera automatiquement.');
      } else {
        // Generate default SKU if not provided
        const finalSku = formData.sku || `PRD-${Date.now().toString().slice(-6)}`;
        // Create new product
        const newProduct: Product = {
          id: generateId(),
          name: formData.name,
          sku: finalSku,
          storeId: user.storeId,
          categoryId: categoryId || undefined,
          salePrice: formData.salePrice ? parseFloat(formData.salePrice) : undefined,
          costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
          targetMargin: formData.targetMargin ? parseFloat(formData.targetMargin) : undefined,
          variablePrices: formData.variablePrices.length > 0 
            ? formData.variablePrices.map(vp => ({ label: vp.label, price: parseFloat(vp.price) }))
            : undefined,
          unit: formData.unit,
          taxRate: formData.taxRate ? parseFloat(formData.taxRate) : undefined,
          stock: formData.trackStock ? {
            [user.storeId]: formData.stock ? parseFloat(formData.stock) : 0,
          } : {},
          minStock: formData.trackStock && formData.minStock ? parseFloat(formData.minStock) : undefined,
          imageUrl: uploadedImageUrl || formData.imageUrl || '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          trackStock: formData.trackStock,
        };

        // Enregistrer localement
        await db.add('products', newProduct as any);

        // Demander la synchronisation (ou mise en queue)
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
          method: 'POST',
          data: { ...newProduct, stock: formData.trackStock ? parseFloat(formData.stock) || 0 : 0 }
        });

        toast.success('Produit créé localement. La synchronisation se fera automatiquement.');
      }
      setIsDialogOpen(false);
      resetForm();
      loadData(); // Recharger depuis le backend
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement: ' + (error as Error).message);
      console.error('Erreur:', error);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const cat = categories.find(c => c.id === product.categoryId);
    setFormData({
      name: product.name,
      sku: product.sku,
      categoryName: cat?.name || '',
      salePrice: product.salePrice?.toString() || '',
      costPrice: product.costPrice?.toString() || '',
      targetMargin: product.targetMargin?.toString() || '',
      variablePrices: product.variablePrices?.map(vp => ({ label: vp.label, price: vp.price.toString() })) || [],
      unit: product.unit,
      taxRate: product.taxRate?.toString() || '',
      stock: (product.stock?.[user.storeId] || 0).toString(),
      minStock: product.minStock?.toString() || '',
      trackStock: product.stock ? Object.keys(product.stock).length > 0 : false,
      imageUrl: product.imageUrl || '',
      pendingImage: '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      try {
        const db = await getDB();
        // Récupérer le produit pour obtenir l'image
        const product = products.find(p => p.id === id);
        // Supprimer localement
        await db.delete('products', id);

        // Supprimer l'image du backend si elle existe
        if (product?.imageUrl) {
          try {
            await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/upload_image.php', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: product.imageUrl })
            });
          } catch (e) {
            // Ne bloque pas la suppression produit si l'image échoue
            console.warn('Erreur suppression image backend:', e);
          }
        }

        // Demander suppression au backend (ou mise en queue si hors-ligne)
        await performSyncOp({
          url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${id}`,
          method: 'DELETE',
          data: {}
        });

        toast.success('Produit supprimé localement. La suppression sera synchronisée.');
        loadData(); // Recharger depuis la source (backend si en ligne, sinon local)
      } catch (error) {
        toast.error('Erreur lors de la suppression');
        console.error('Erreur:', error);
      }
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      categoryName: '',
      salePrice: '',
      costPrice: '',
      targetMargin: '',
      variablePrices: [],
      unit: 'pièce',
      taxRate: '',
      stock: '',
      minStock: '',
      trackStock: false,
      imageUrl: '',
      pendingImage: '',
    });
    setCategoryExists(true);
    setShowAddCategory(false);
    setNewCategoryDesc('');
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || '';
  };

  const getFilteredProducts = () => {
    const q = productsSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.sku && p.sku.toLowerCase().includes(q)) return true;
      const catName = getCategoryName(p.categoryId || '').toLowerCase();
      if (catName.includes(q)) return true;
      try {
        if (p.salePrice && String(p.salePrice).toLowerCase().includes(q)) return true;
        if (p.costPrice && String(p.costPrice).toLowerCase().includes(q)) return true;
        // allow formatted search with spaces
        if (p.salePrice && p.salePrice.toLocaleString().toLowerCase().includes(q)) return true;
      } catch (e) {}
      return false;
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Produits</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gérez votre inventaire</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nouveau produit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </DialogTitle>

            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Image du produit (optionnel)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          // Vérifier la taille du fichier (max 1MB)
                          if (file.size > 1024 * 1024) {
                            toast.error('L\'image est trop grande. Maximum 1MB.');
                            return;
                          }

                          // Créer éléments pour redimensionner
                          const img = new Image();
                          const canvas = document.createElement('canvas');
                          const ctx = canvas.getContext('2d');

                          // On lit le fichier en base64, puis on attend que l'image soit chargée,
                          // on compresse et on upload, et on résout la promesse une fois que le serveur a répondu.
                          await new Promise<void>((resolve, reject) => {
                            img.onload = () => {
                              (async () => {
                                try {
                                  // Calculer les nouvelles dimensions
                                  let width = img.width;
                                  let height = img.height;
                                  const maxSize = 800;

                                  if (width > height) {
                                    if (width > maxSize) {
                                      height *= maxSize / width;
                                      width = maxSize;
                                    }
                                  } else {
                                    if (height > maxSize) {
                                      width *= maxSize / height;
                                      height = maxSize;
                                    }
                                  }

                                  // Configurer le canvas
                                  canvas.width = width;
                                  canvas.height = height;

                                  // Dessiner l'image redimensionnée
                                  ctx?.drawImage(img, 0, 0, width, height);

                                        // Convertir en base64 avec compression
                                        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

                                        // Ne pas uploader immédiatement : stocker l'image compressée dans l'état pendingImage
                                        setFormData(f => ({ ...f, pendingImage: compressedBase64 }));
                                        toast.success('Image prête — cliquez sur Enregistrer pour l\'uploader');
                                        resolve();
                                } catch (err) {
                                  reject(err);
                                }
                              })();
                            };
                            img.onerror = () => reject(new Error('Erreur lors du chargement de l\'image'));

                            // Charger l'image (démarre le flux)
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              img.src = reader.result as string;
                            };
                            reader.readAsDataURL(file);
                          });

                        } catch (error) {
                          toast.error('Erreur lors du traitement de l\'image');
                          console.error(error);
                        }
                      }
                    }}
                  />
                  {(formData.pendingImage || formData.imageUrl) && (
                    <div className="relative w-[120px] h-[120px] mt-2 rounded-lg overflow-hidden">
                      <img 
                        src={formData.pendingImage || formData.imageUrl} 
                        alt="Aperçu" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          // Si l'image est seulement en pending (non uploadée), on la supprime localement
                          if (formData.pendingImage) {
                            setFormData(f => ({ ...f, pendingImage: '' }));
                            return;
                          }
                          // Sinon supprimer l'image du backend si elle existe
                          if (formData.imageUrl) {
                            try {
                              await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/upload_image.php', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: formData.imageUrl })
                              });
                            } catch (e) {
                              toast.error("Erreur lors de la suppression de l'image sur le serveur");
                            }
                          }
                          setFormData(f => ({ ...f, imageUrl: '', pendingImage: '' }));
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                        title="Supprimer l'image"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
                  <Label>Suivi de stock</Label>
                  <input
                    type="checkbox"
                    checked={formData.trackStock}
                    onChange={e => setFormData({ ...formData, trackStock: e.target.checked })}
                    className="w-5 h-5 accent-green-600"
                  />
                  <span className="text-muted-foreground text-sm">Activer pour gérer le stock de ce produit</span>
                </div>
                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Nom du produit</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code SKU (généré automatiquement si vide)</Label>
                  <Input
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Ex: PRD-001 (optionnel)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Catégorie (saisie ou sélection)</Label>
                  <Input
                    list="categories-list"
                    value={formData.categoryName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, categoryName: val });
                      const exists = categories.some(c => c.name.toLowerCase() === val.trim().toLowerCase());
                      setCategoryExists(exists);
                      setShowAddCategory(!exists && val.trim().length > 0);
                      setCategoryAddStatus('idle');
                    }}
                    placeholder="Tapez ou sélectionnez une catégorie"
                  />
                  <datalist id="categories-list">
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name} />
                    ))}
                  </datalist>
                  {!categoryExists && formData.categoryName.trim().length > 0 && (
                    <div className="mt-2">
                      <span className="text-sm text-red-500">Catégorie non trouvée, elle sera créée automatiquement.</span>
                    </div>
                  )}
                  {showAddCategory && (
                    <div className="mt-2 space-y-2">
                      <Label>Description (optionnel)</Label>
                      <Input
                        value={newCategoryDesc}
                        onChange={e => setNewCategoryDesc(e.target.value)}
                        placeholder="Description de la catégorie"
                      />
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Unité</Label>
                  <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pièce">Pièce</SelectItem>
                      <SelectItem value="kg">Kilogramme</SelectItem>
                      <SelectItem value="litre">Litre</SelectItem>
                      <SelectItem value="carton">Carton</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Prix de vente (optionnel)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithSpaces(formData.salePrice)}
                    onChange={e => {
                      const raw = e.target.value.replace(/\s/g, "");
                      setFormData({ ...formData, salePrice: raw });
                      // Calcul automatique de la marge quand on change le prix de vente
                      if (raw && formData.costPrice) {
                        const margin = calculateMargin(raw, formData.costPrice);
                        if (margin) {
                          setFormData(prev => ({ ...prev, salePrice: raw, targetMargin: margin }));
                        }
                      }
                    }}
                    placeholder="Définir lors de la vente si vide"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Prix de revient (optionnel)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithSpaces(formData.costPrice)}
                    onChange={e => {
                      const raw = e.target.value.replace(/\s/g, "");
                      setFormData({ ...formData, costPrice: raw });
                      // Calcul automatique de la marge quand on change le prix de revient
                      if (raw && formData.salePrice) {
                        const margin = calculateMargin(formData.salePrice, raw);
                        if (margin) {
                          setFormData(prev => ({ ...prev, costPrice: raw, targetMargin: margin }));
                        }
                      }
                    }}
                    placeholder="Pour calcul de marge"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pourcentage de gain cible (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.targetMargin}
                    onChange={(e) => setFormData({ ...formData, targetMargin: e.target.value })}
                    placeholder="Calculé auto ou saisissez manuellement"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se remplit automatiquement avec le calcul prix vente/prix revient, mais modifiable
                  </p>
                </div>

                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Prix variables (optionnel)</Label>
                  <p className="text-xs text-muted-foreground">Définissez plusieurs prix pour ce produit (ex: petit, moyen, grand)</p>
                  {formData.variablePrices.map((vp, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input
                          placeholder="Label (ex: Petit)"
                          value={vp.label}
                          onChange={e => {
                            const newPrices = [...formData.variablePrices];
                            newPrices[index].label = e.target.value;
                            setFormData({ ...formData, variablePrices: newPrices });
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Prix"
                          value={formatNumberWithSpaces(vp.price)}
                          onChange={e => {
                            const newPrices = [...formData.variablePrices];
                            newPrices[index].price = e.target.value.replace(/\s/g, "");
                            setFormData({ ...formData, variablePrices: newPrices });
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const newPrices = formData.variablePrices.filter((_, i) => i !== index);
                          setFormData({ ...formData, variablePrices: newPrices });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        variablePrices: [...formData.variablePrices, { label: '', price: '' }]
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un prix
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label>TVA % (optionnel)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.taxRate}
                    onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
                    placeholder="Ex: 18"
                  />
                </div>
                
                <div className="space-y-2">
                  {formData.trackStock && (
                    <>
                      <Label>Stock initial (optionnel)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        placeholder="0 par défaut"
                      />
                    </>
                  )}
                </div>
                
                <div className="space-y-2">
                  {formData.trackStock && (
                    <>
                      <Label>Stock minimal (optionnel)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.minStock}
                        onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                        placeholder="Alerte de réapprovisionnement"
                      />
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 justify-center sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                  Annuler
                </Button>
                <Button type="submit" className="w-full sm:w-auto">
                  {editingProduct ? 'Mettre à jour' : 'Créer'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 w-full space-y-2">
                <Label>Rechercher les produits</Label>
                <Input 
                  placeholder="Nom, SKU, catégorie, prix..." 
                  value={productsSearch} 
                  onChange={e => setProductsSearch(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="hidden md:table-cell">Catégorie</TableHead>
                  <TableHead className="hidden lg:table-cell">Prix</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getFilteredProducts().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      {productsSearch ? (
                        <p>Aucun résultat pour la recherche « {productsSearch} »</p>
                      ) : (
                        <p>Aucun produit</p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  getFilteredProducts().map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {product.imageUrl && (
                            <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                              <img 
                                src={product.imageUrl} 
                                alt={product.name} 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{product.name}</div>
                            {isMobile && (
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                <div className="text-xs">SKU: {product.sku}</div>
                                {product.categoryId && (
                                  <div className="text-xs">{getCategoryName(product.categoryId)}</div>
                                )}
                                {product.salePrice && (
                                  <div className="text-xs font-medium">{product.salePrice} FCFA</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{product.sku}</TableCell>
                      <TableCell className="hidden md:table-cell">{getCategoryName(product.categoryId || '') || 'Aucune'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {product.salePrice ? `${product.salePrice} FCFA` : 'Définir lors de la vente'}
                      </TableCell>
                      <TableCell>
                        {product.stock && Object.keys(product.stock).length > 0
                          ? `${product.stock[user.storeId] || 0} ${product.unit}`
                          : <span className="text-muted-foreground text-xs">Non suivi</span>
                        }
                        {product.stock && product.minStock && product.stock[user.storeId] <= product.minStock && Object.keys(product.stock).length > 0 && (
                          <span className="ml-2 text-red-500 text-xs">⚠️</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} title="Modifier">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
