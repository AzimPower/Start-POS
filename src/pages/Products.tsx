import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { backendAvailable, normalizeImageUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Package, History } from 'lucide-react';
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

interface StockAdjustmentLine {
  productId: string;
  delta: string;
  physical?: string;
  oldStock?: number;
  reason: string;
}

export default function Products() {
  // Calcul automatique de la marge en %
  function calculateMargin(sale: string, cost: string) {
    const salePrice = parseFloat(sale.replace(/\s/g, ''));
    const costPrice = parseFloat(cost.replace(/\s/g, ''));
    // New logic: margin as percentage of sale price (gain / salePrice)
    // Requires both salePrice and costPrice and salePrice !== 0
    if (isNaN(salePrice) || isNaN(costPrice) || salePrice === 0) return '';
    const margin = ((salePrice - costPrice) / salePrice) * 100;
    return margin.toFixed(2);
  }
  // Formate un nombre avec espace entre les milliers
  function formatNumberWithSpaces(value: string) {
    if (!value && value !== '0') return "";
    // Normalize to string
    let s = String(value);
    // Replace non-breaking spaces
    s = s.replace(/\u00A0|\u202F/g, '');
    // Allow comma as decimal separator
    s = s.replace(/,/g, '.');
    // Remove any characters except digits and dot and minus
    s = s.replace(/[^0-9.\-]/g, '');
    // Split integer and fractional parts
    const parts = s.split('.');
    const intPart = parts[0] || '';
    let fracPart = parts[1] || '';
    // Format integer part with spaces every 3 digits
    const intDigits = intPart.replace(/[^0-9\-]/g, '');
    if (!intDigits) return fracPart ? `0.${fracPart}` : '';
    const sign = intDigits.startsWith('-') ? '-' : '';
    const absInt = sign ? intDigits.slice(1) : intDigits;
    const formattedInt = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // Clean fractional part: keep up to 2 decimals, trim trailing zeros
    if (fracPart) {
      fracPart = fracPart.replace(/[^0-9]/g, '').slice(0, 2).replace(/0+$/,'');
    }
    return fracPart ? `${sign}${formattedInt}.${fracPart}` : `${sign}${formattedInt}`;
  }
  const { user } = useAuth();
  // Permettre aux managers, admins et super_admins de gérer les ajustements de stock
  const canManageStockAdjustments = user.role === 'manager' || user.role === 'admin' || user.role === 'super_admin';
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const isMobile = useIsMobile();
  const { isBackendReachable, manualSync } = useNetwork();
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryAddStatus, setCategoryAddStatus] = useState<'idle'|'success'|'error'>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
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
  const stepLabels = ['Informations', 'Prix', 'Variantes', 'Stock'];
  const isStepValid = (step: number) => {
    if (step === 0) return formData.name.trim().length > 0;
    if (step === 2) {
      return formData.variablePrices.every((vp) => {
        const hasLabel = vp.label.trim().length > 0;
        const hasPrice = String(vp.price || '').trim().length > 0;
        return !hasLabel || hasPrice;
      });
    }
    return true;
  };
  const canGoNext = isStepValid(currentStep);
  const isLastStep = currentStep === stepLabels.length - 1;
  const submitNow = () => handleSubmit({ preventDefault() {} } as React.FormEvent);
  const goNext = () => {
    if (!canGoNext) return;
    setCurrentStep((s) => Math.min(s + 1, stepLabels.length - 1));
  };
  const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 0));
  const [categoryExists, setCategoryExists] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [productsSearch, setProductsSearch] = useState('');
  // Stock adjust batch (for managers)
  const [adjustments, setAdjustments] = useState<StockAdjustmentLine[]>([]);
  const [adjustGlobalReason, setAdjustGlobalReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [draftProductId, setDraftProductId] = useState('');
  const [draftPhysicalQty, setDraftPhysicalQty] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const loadedOnceRef = useRef(false);

  // Chargement initial des données
  useEffect(() => {
    if (!user?.storeId) return;

    const shouldReload = !loadedOnceRef.current;
    if (!shouldReload) return;

    const initialLoad = async () => {
      setIsLoading(true);
      try {
        await loadData();
      } catch (error) {
        console.error('Erreur lors du chargement initial:', error);
        toast.error('Erreur de chargement des données');
      } finally {
        setIsLoading(false);
      }
    };

    initialLoad();
    loadedOnceRef.current = true;
  }, [user?.storeId]);

  // Synchronisation automatique quand le backend devient accessible
  useEffect(() => {
    if (!user?.storeId || !isBackendReachable || !loadedOnceRef.current) return;
    
    const syncData = async () => {
      try {
        console.log('🔄 [Products] Backend accessible - synchronisation des données');
        await loadData();
      } catch (error) {
        console.warn('Erreur de synchronisation en arrière-plan:', error);
      }
    };
    
    syncData();
  }, [isBackendReachable, user?.storeId]);

  // Rechargement quand la page devient visible
  useEffect(() => {
    if (!user?.storeId) return;
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && loadedOnceRef.current) {
        console.log('👁️ [Products] Page visible - rechargement des données');
        try {
          await loadData();
        } catch (error) {
          console.warn('Erreur rechargement données:', error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.storeId]);

  if (!user) {
    return <div className="p-4">Veuillez vous connecter pour voir les produits.</div>;
  }

  const loadData = async () => {
    if (!user?.storeId) {
      console.error('Aucun storeId trouvé');
      return;
    }

    try {
      const db = await getDB();
      
      // 1. Charger et afficher les données locales immédiatement
      await loadFromLocal(db);
      
      // 2. Synchroniser en arrière-plan si backend accessible (sans bloquer l'UI)
      if (isBackendReachable) {
        // Synchronisation en arrière-plan
        try {
          const [productsResponse, categoriesResponse] = await Promise.all([
            fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?storeId=${user.storeId}&_t=${Date.now()}`, {
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            }),
            fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php?storeId=${user.storeId}&_t=${Date.now()}`, {
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            })
          ]);

          if (productsResponse.ok) {
            const backendProducts = await productsResponse.json();
            console.log(`🔄 ${backendProducts?.length || 0} produits rechargés depuis le backend`);
            // Mettre à jour l'UI avec les données backend
            const normalizedBackendProducts = (backendProducts || []).map((p: any) => ({
              ...p,
              stock: p.stock || {},
              imageUrl: normalizeImageUrl(p.imageUrl)
            }));
            setProducts(normalizedBackendProducts);
            // Stocker en local pour usage hors-ligne
            try {
              const tx = db.transaction('products', 'readwrite');
              await tx.store.clear();
              for (const p of normalizedBackendProducts) {
                await tx.store.put(p);
              }
              await tx.done;
            } catch (e) {
              console.warn('Erreur en enregistrant les produits en local:', e);
            }
          }

          if (categoriesResponse.ok) {
            const backendCategories = await categoriesResponse.json();
            setCategories(backendCategories || []);
            try {
              const txc = db.transaction('categories', 'readwrite');
              await txc.store.clear();
              for (const c of (backendCategories || [])) {
                await txc.store.put({ ...c, storeId: c.storeId || user.storeId });
              }
              await txc.done;
            } catch (e) {
              console.warn('Erreur en enregistrant les catégories en local:', e);
            }
          }
        } catch (error: any) {
          console.warn('Erreur de synchronisation en arrière-plan:', error);
          // Les données locales sont déjà affichées, pas besoin de bloquer l'UI
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      toast.error('Erreur de chargement des données');
    }
  };

  const loadFromLocal = async (db: any) => {
    try {
      const localProducts = await db.getAll('products');
      const localCategories = await db.getAll('categories');
      
      // Filtrer par magasin courant
      const prods = (localProducts || [])
        .filter((p: any) => p.storeId === user.storeId || !p.storeId)
        .map((p: any) => ({
          ...p,
          storeId: p.storeId || user.storeId,
          stock: p.stock || {},
          imageUrl: normalizeImageUrl(p.imageUrl)
        }));
      
      const cats = (localCategories || []).filter(
        (c: any) => c.storeId === user.storeId || !c.storeId
      );
      
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


    if (productSubmitting) return;
    setProductSubmitting(true);

    try {
      let categoryId;
      if (formData.categoryName) {
        let cat = categories.find(c => c.name.toLowerCase() === formData.categoryName.trim().toLowerCase());
        if (!cat) {
          // Create category locally and queue sync operation instead of requiring immediate backend availability.
          const newCategory = {
            id: generateId(),
            name: formData.categoryName.trim(),
            description: newCategoryDesc,
            storeId: user.storeId,
            createdAt: Date.now(),
          };
          try {
            const dbLocal = await getDB();
            await dbLocal.add('categories', { ...newCategory, storeId: user.storeId });
            setCategories(prev => [...prev, newCategory]);
          } catch (e) {
            console.warn('Impossible d\'enregistrer la catégorie localement:', e);
          }
          await performSyncOp({
            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php',
            method: 'POST',
            data: newCategory,
          });
          cat = newCategory;
        }
        categoryId = cat.id;
      }
      const db = await getDB();
      let uploadedImageUrl = formData.imageUrl || '';
      if (formData.pendingImage) {
        try {
          const backendUpForUpload = await backendAvailable().catch(() => false);
          if (!backendUpForUpload) {
            toast.error('Serveur indisponible — upload de l\'image différé jusqu\'à la reconnexion.');
          } else {
            if (editingProduct && editingProduct.imageUrl) {
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
                  let delJson: any = null;
                  try { delJson = await delRes.json(); } catch (e) {}
                  if (delRes.ok && delJson && delJson.success) {
                    deleted = true;
                    toast.success('Ancienne image supprimée du serveur');
                    break;
                  } else {
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
              setFormData(f => ({ ...f, imageUrl: fullUrl, pendingImage: '' }));
            } else {
              toast.error('Erreur lors de l\'upload de l\'image: ' + (result?.error || ''));
            }
          }
        } catch (err) {
          console.error('Upload image failed', err);
          toast.error('Erreur réseau lors de l\'upload de l\'image — upload différé');
        }
      }
      // IMPORTANT : Toute modification de stock doit passer par performSyncOp pour garantir la cohérence et la synchronisation hors-ligne/online.
      // Ne jamais modifier le stock local directement sans passer par cette file d'attente !
      if (editingProduct) {
        // Recharger le stock actuel depuis la BD avant de mettre à jour
        let currentStock = editingProduct?.stock || {};
        try {
          if (isBackendReachable) {
            const stockResponse = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${editingProduct.id}`);
            if (stockResponse.ok) {
              const freshProduct = await stockResponse.json();
              if (freshProduct && freshProduct.stock) {
                currentStock = freshProduct.stock;
              }
            }
          } else {
            const freshLocal = await db.get('products', editingProduct.id);
            if (freshLocal && freshLocal.stock) {
              currentStock = freshLocal.stock;
            }
          }
        } catch (error) {
          console.warn('Impossible de recharger le stock actuel, utilisation de la valeur en mémoire:', error);
        }
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
            ...currentStock,
            [user.storeId]: formData.stock ? parseFloat(formData.stock) : 0,
          } : {},
          minStock: formData.trackStock && formData.minStock ? parseFloat(formData.minStock) : undefined,
          imageUrl: uploadedImageUrl || formData.imageUrl || '',
          updatedAt: Date.now(),
          trackStock: formData.trackStock,
        };
        
        // 1. METTRE À JOUR LOCALEMENT D'ABORD (pour que l'UI se rafraîchisse immédiatement)
        await db.put('products', updated);
        console.log('✅ Produit mis à jour localement:', updated.name);
        
        // 2. Rafraîchir l'UI immédiatement
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
        
        // 3. Synchroniser vers le backend (en arrière-plan)
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
          method: 'PUT',
          data: { ...updated, storeId: user.storeId, stock: formData.trackStock ? parseFloat(formData.stock) || 0 : 0 }
        });
        
        toast.success('Produit mis à jour avec succès');
      } else {
        const finalSku = formData.sku || `PRD-${Date.now().toString().slice(-6)}`;
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
        
        // 1. AJOUTER LOCALEMENT D'ABORD (pour que l'UI se rafraîchisse immédiatement)
        await db.add('products', newProduct);
        console.log('✅ Produit créé localement:', newProduct.name);
        
        // 2. Rafraîchir l'UI immédiatement
        setProducts(prev => [...prev, newProduct]);
        
        // 3. Synchroniser vers le backend (en arrière-plan)
        await performSyncOp({
          url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php',
          method: 'POST',
          data: { ...newProduct, stock: formData.trackStock ? parseFloat(formData.stock) || 0 : 0 }
        });
        
        toast.success('Produit créé avec succès');
      }
      setIsDialogOpen(false);
      resetForm();
      
      // Recharger depuis le backend pour s'assurer de la cohérence
      if (isBackendReachable) {
        setTimeout(() => loadData(), 500); // Petit délai pour laisser le backend traiter
      }
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement: ' + (error as Error).message);
      console.error('Erreur:', error);
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleEdit = async (product: Product) => {
    // Toujours recharger le produit depuis la BD pour avoir les quantités à jour
    // Ceci évite les incohérences entre plusieurs appareils
    try {
      let currentProduct: Product = product;
      
      // Si le backend est disponible, recharger depuis le backend pour avoir les données les plus récentes
      if (isBackendReachable) {
        try {
          const response = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${product.id}&_t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          if (response.ok) {
            const freshProduct = await response.json() as any;
            if (freshProduct && freshProduct.id) {
              // S'assurer que le storeId est présent
              currentProduct = {
                ...freshProduct,
                storeId: freshProduct.storeId || user.storeId,
                stock: freshProduct.stock || {},
                trackStock: freshProduct.trackStock !== undefined ? freshProduct.trackStock : (freshProduct.stock && Object.keys(freshProduct.stock).length > 0)
              } as Product;
              // Mettre à jour aussi en local
              const db = await getDB();
              await db.put('products', currentProduct);
            }
          }
        } catch (error) {
          console.warn('Impossible de recharger depuis le backend, utilisation des données locales:', error);
        }
      } else {
        // Sinon, recharger depuis IndexedDB pour avoir la version la plus récente
        const db = await getDB();
        const freshProduct = await db.get('products', product.id) as any;
        if (freshProduct) {
          currentProduct = {
            ...freshProduct,
            storeId: freshProduct.storeId || user.storeId,
            stock: freshProduct.stock || {},
            trackStock: freshProduct.trackStock !== undefined ? freshProduct.trackStock : (freshProduct.stock && Object.keys(freshProduct.stock).length > 0)
          } as Product;
        }
      }
      
      setEditingProduct(currentProduct);
      const cat = categories.find(c => c.id === currentProduct.categoryId);
      setFormData({
        name: currentProduct.name,
        sku: currentProduct.sku,
        categoryName: cat?.name || '',
        salePrice: currentProduct.salePrice?.toString() || '',
        costPrice: currentProduct.costPrice?.toString() || '',
        targetMargin: currentProduct.targetMargin?.toString() || '',
        variablePrices: currentProduct.variablePrices?.map(vp => ({ label: vp.label, price: vp.price.toString() })) || [],
        unit: currentProduct.unit,
        taxRate: currentProduct.taxRate?.toString() || '',
        stock: (currentProduct.stock?.[user.storeId] || 0).toString(),
        minStock: currentProduct.minStock?.toString() || '',
        trackStock: currentProduct.stock ? Object.keys(currentProduct.stock).length > 0 : false,
        imageUrl: currentProduct.imageUrl || '',
        pendingImage: '',
      });
      setIsDialogOpen(true);
    } catch (error) {
      console.error('Erreur lors du rechargement du produit:', error);
      toast.error('Erreur lors du chargement du produit');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      try {
        const db = await getDB();
        // Récupérer le produit pour obtenir l'image
        const product = products.find(p => p.id === id);
        
        // 1. Supprimer localement d'abord
        await db.delete('products', id);
        console.log('✅ Produit supprimé localement:', id);
        
        // 2. Rafraîchir l'UI immédiatement
        setProducts(prev => prev.filter(p => p.id !== id));

        // 3. Supprimer l'image du backend si elle existe (en arrière-plan)
        if (product?.imageUrl) {
          try {
            await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/upload_image.php', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: product.imageUrl })
            });
          } catch (e) {
            console.warn('Erreur suppression image backend:', e);
          }
        }

        // 4. Synchroniser la suppression vers le backend (en arrière-plan)
        await performSyncOp({
          url: `https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php?id=${id}`,
          method: 'DELETE',
          data: {}
        });

        toast.success('Produit supprimé avec succès');
      } catch (error) {
        toast.error('Erreur lors de la suppression');
        console.error('Erreur:', error);
      }
    }
  };

  const trackedProducts = products.filter(
    (p) => p.trackStock || (p.stock && Object.keys(p.stock).length > 0)
  );

  const removeAdjustmentLine = (index: number) => {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear draft product selection if it was just added to adjustments
  useEffect(() => {
    if (draftProductId && adjustments.some(a => a.productId === draftProductId)) {
      setDraftProductId('');
    }
  }, [adjustments, draftProductId]);

  const submitAdjust = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleaned = adjustments
      .filter((line) => line.productId && line.delta !== '')
      .map((line) => ({
        productId: line.productId,
        delta: parseInt(line.delta, 10),
        reason: line.reason || ''
      }))
      .filter((line) => !isNaN(line.delta) && line.delta !== 0);

    if (cleaned.length === 0) {
      toast.error('Ajoutez au moins un ajustement valide (delta non nul).');
      return;
    }

    setAdjustSubmitting(true);
    try {
      await performSyncOp({
        url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_adjust.php',
        method: 'POST',
        data: {
          storeId: user.storeId,
          userId: user.id,
          reason: adjustGlobalReason || '',
          adjustments: cleaned
        }
      });
      toast.success('Ajustements envoyés. Un email résumé a été notifié à l\'admin.');
      setAdjustments([]);
      setAdjustGlobalReason('');
      setDraftProductId('');
      setDraftPhysicalQty('');
      setDraftReason('');
      loadData();
    } catch (err) {
      console.error('Erreur ajustement stock:', err);
      toast.error('Erreur lors de l\'envoi des ajustements');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const addDraftLine = () => {
    const physical = parseInt(draftPhysicalQty, 10);
    if (!draftProductId || isNaN(physical)) {
      toast.error('Sélectionnez un produit et saisissez la quantité présente en physique.');
      return;
    }
    // Prevent duplicate product lines
    if (adjustments.some(a => a.productId === draftProductId)) {
      toast.error('Ce produit est déjà dans la liste d\'ajustement.');
      return;
    }
    const prod = products.find(p => p.id === draftProductId);
    const currentStock = prod?.stock?.[user.storeId] ?? 0;
    const delta = physical - (typeof currentStock === 'number' ? currentStock : parseInt(String(currentStock) || '0', 10));
    if (delta === 0) {
      toast.error('Aucun écart détecté entre quantité physique et quantité dans l\'app.');
      return;
    }
    setAdjustments((prev) => [
      ...prev,
      { productId: draftProductId, delta: String(delta), physical: String(physical), oldStock: currentStock as number, reason: draftReason }
    ]);
    setDraftProductId('');
    setDraftPhysicalQty('');
    setDraftReason('');
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

  const getProductLabel = (productId: string) => {
    const p = products.find((prod) => prod.id === productId);
    if (!p) return productId;
    return `${p.name}${p.sku ? ` (${p.sku})` : ''}`;
  };

  // Exclude already-selected products from the adjustments product picker
  const availableTrackedProducts = trackedProducts.filter(p => !adjustments.some(a => a.productId === p.id));

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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canManageStockAdjustments && (
            <Button className="w-full sm:w-auto" onClick={() => setAdjustDialogOpen(true)}>
              <Package className="w-4 h-4 mr-2" />
              Ajustement
            </Button>
          )}
          {(user.role === 'admin' || user.role === 'super_admin') && (
            <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate('/stock-adjustments')}>
              <History className="w-4 h-4 mr-2" />
              Historique
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
            setCurrentStep(0);
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
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{stepLabels[currentStep]}</span>
                  <span>{currentStep + 1}/{stepLabels.length}</span>
                </div>
                <div className="flex gap-2">
                  {stepLabels.map((label, index) => (
                    <div
                      key={label}
                      className={`h-2 flex-1 rounded-full transition-colors ${
                        index <= currentStep ? 'bg-primary' : 'bg-muted/60'
                      }`}
                    />
                  ))}
                </div>
              </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isLastStep && canGoNext) goNext();
              }}
              className="space-y-6"
            >
              {currentStep === 0 && (
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4 ring-1 ring-border/40">
                <div>
                  <h3 className="text-sm font-semibold">Informations produit</h3>
                  <p className="text-xs text-muted-foreground">Identité, catégorie et unité</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Image du produit (optionnel)</Label>
                  <div className="flex flex-row items-center gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      className="h-10 flex-1"
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
                      <div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-border/60">
                        <img
                          src={formData.pendingImage || normalizeImageUrl(formData.imageUrl)}
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
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                          title="Supprimer l'image"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Format carré conseillé, max 1MB.</p>
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
                </div>
              </div>
              )}

              {currentStep === 1 && (
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Prix</h3>
                  <p className="text-xs text-muted-foreground">Valeurs principales et marge</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    Calculé sur le prix de vente (gain / prix de vente)
                  </p>
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
                </div>
              </div>
              )}

              {currentStep === 2 && (
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Variantes de prix</h3>
                  <p className="text-xs text-muted-foreground">Plusieurs prix par format</p>
                </div>
                <div className="space-y-2">
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
              </div>
              )}

              {currentStep === 3 && (
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Stock</h3>
                  <p className="text-xs text-muted-foreground">Activer le suivi et définir les seuils</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div>
                    <Label>Suivi de stock</Label>
                    <p className="text-xs text-muted-foreground">Activer pour gérer le stock de ce produit</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.trackStock}
                    onChange={e => setFormData({ ...formData, trackStock: e.target.checked })}
                    className="w-5 h-5 accent-green-600"
                  />
                </div>
                {formData.trackStock && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stock initial (optionnel)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        placeholder="0 par défaut"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Stock minimal (optionnel)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.minStock}
                        onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                        placeholder="Alerte de réapprovisionnement"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-1/3" onClick={() => setIsDialogOpen(false)} disabled={productSubmitting}>
                  Annuler
                </Button>
                <Button type="button" variant="outline" className="w-1/3" onClick={goPrev} disabled={currentStep === 0}>
                  Précédent
                </Button>
                {!isLastStep ? (
                  <Button type="button" className="w-1/3" onClick={goNext} disabled={!canGoNext}>
                    Suivant
                  </Button>
                ) : (
                  <Button type="button" className="w-1/3" disabled={productSubmitting} onClick={submitNow}>
                    {productSubmitting ? 'Traitement...' : (editingProduct ? 'Mettre à jour' : 'Créer')}
                  </Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
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

        {/* Manager/Admin: trigger dialog for adjustments */}
        {canManageStockAdjustments && (
          <Dialog open={adjustDialogOpen} onOpenChange={(open) => setAdjustDialogOpen(open)}>
            <DialogContent>
              <Card>
                <CardHeader>
                  <CardTitle>Ajustements de stock (résumé unique)</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitAdjust} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Motif global (optionnel)</Label>
                      <Input
                        value={adjustGlobalReason}
                        onChange={(e) => setAdjustGlobalReason(e.target.value)}
                        placeholder="Ex: Inventaire de fin de journée"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-lg p-3">
                      <div className="md:col-span-5 space-y-1">
                        <Label>Produit</Label>
                        <Select value={draftProductId} onValueChange={setDraftProductId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un produit" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableTrackedProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} ({product.sku || 'Sans SKU'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label>Quantité physique</Label>
                        <Input
                          type="number"
                          value={draftPhysicalQty}
                          onChange={(e) => setDraftPhysicalQty(e.target.value)}
                          placeholder="Ex: 12"
                        />
                      </div>
                      <div className="md:col-span-4 space-y-1">
                        <Label>Motif ligne</Label>
                        <Input
                          value={draftReason}
                          onChange={(e) => setDraftReason(e.target.value)}
                          placeholder="Optionnel"
                        />
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <Button type="button" variant="outline" onClick={addDraftLine}>
                          Ajouter
                        </Button>
                      </div>
                    </div>

                    {adjustments.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produit</TableHead>
                              <TableHead>Delta</TableHead>
                              <TableHead>Motif</TableHead>
                              <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {adjustments.map((line, index) => (
                              <TableRow key={`${line.productId}-${index}`}>
                                <TableCell>
                                  {getProductLabel(line.productId)}
                                  <div className="text-xs text-muted-foreground mt-1">
                                    phys: {line.physical ?? '-'} • app: {line.oldStock ?? '-'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const n = parseInt(line.delta || '0', 10);
                                    const sign = n > 0 ? '+' : '';
                                    return (<span>{sign}{n}</span>);
                                  })()}
                                </TableCell>
                                <TableCell>{line.reason || '-'}</TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeAdjustmentLine(index)}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={adjustSubmitting || trackedProducts.length === 0}>
                        {adjustSubmitting ? 'Envoi...' : 'Envoyer tous les ajustements'}
                      </Button>
                    </div>

                    {trackedProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground">Aucun produit avec suivi de stock disponible pour ajustement.</p>
                    )}
                  </form>
                </CardContent>
              </Card>
            </DialogContent>
          </Dialog>
        )}

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
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={6} className="py-8">
                        <div className="flex items-center gap-3 animate-pulse">
                          <div className="w-10 h-10 bg-gray-200 rounded-md" />
                          <div className="h-5 bg-gray-200 rounded w-32" />
                          <div className="h-5 bg-gray-200 rounded w-16" />
                          <div className="h-5 bg-gray-200 rounded w-20" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : getFilteredProducts().length === 0 ? (
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
                      {/* ...existing code for product row... */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {product.imageUrl && (
                            <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                              <img 
                                src={normalizeImageUrl(product.imageUrl)} 
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
                        {user.role !== 'manager' ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} title="Modifier">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Via ajustement</span>
                        )}
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
