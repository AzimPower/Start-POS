import { useEffect, useState, useRef } from 'react';
import { useDeferredValue, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDB, generateId, performSyncOp } from '@/lib/db';
import { BACKEND_BASE, backendAvailable, normalizeImageUrl } from '@/lib/backend';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Package, History, Upload, Download, FileSpreadsheet, FileOutput } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { showAppConfirm } from '@/contexts/AppDialogContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNetwork } from '@/hooks/useNetwork';
import { hasPendingStockOperations } from '@/lib/sync';
import { sendStockAdjustmentNotifications, type StockAdjustmentNotificationPayload } from '@/lib/storeAdminNotifications';
declare global {
    interface Window {
        showOpenFilePicker?: (options?: {
            multiple?: boolean;
            excludeAcceptAllOption?: boolean;
            types?: Array<{
                description?: string;
                accept: Record<string, string[]>;
            }>;
        }) => Promise<Array<{
            getFile: () => Promise<File>;
        }>>;
    }
}
interface Product {
    id: string;
    name: string;
    sku: string;
    storeId: string;
    categoryId?: string;
    salePrice?: number;
    costPrice?: number;
    targetMargin?: number; // Pourcentage de gain cible
    variablePrices?: Array<{
        label: string;
        price: number;
    }>; // Prix variables (ex: petit, moyen, grand)
    unit: string;
    taxRate?: number;
    stock: {
        [storeId: string]: number;
    };
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
    delta?: string;
    physical?: string;
    oldStock?: number;
    deltaPreview?: string;
    oldStockPreview?: number;
    oldStockRaw?: number;
    roundedPreview?: boolean;
    reason: string;
}
interface ImportProductRow {
    name: string;
    sku: string;
    categoryName: string;
    salePrice?: number;
    costPrice?: number;
    targetMargin?: number;
    variablePrices?: Array<{
        label: string;
        price: number;
    }>;
    unit: string;
    taxRate?: number;
    stock?: number;
    minStock?: number;
    trackStock: boolean;
    imageUrl?: string;
}
interface SaleRecord {
    id: string;
    storeId: string;
    createdAt: number;
    refunded?: boolean;
    draft?: boolean;
    items: Array<{
        productId: string;
        quantity?: number;
        price?: number;
        total?: number;
    }>;
}
interface DirectExpenseRecord {
    id: string;
    type: 'direct' | 'indirect' | 'operational';
    storeId: string;
    amount: number;
    directProduct?: {
        productId: string;
        quantity: number;
        startDate: number;
        endDate?: number;
    };
}
interface StockSignalRecord {
    id: string;
    expenseId: string;
    productId: string;
    storeId: string;
    endDate: number;
}
interface ProductStockValueInfo {
    label: string;
    amount: number | null;
    tone: 'success' | 'warning' | 'danger' | 'muted';
}
export default function Products() {
    // Calcul automatique de la marge en %
    function calculateMargin(sale: string, cost: string) {
        const salePrice = parseFloat(sale.replace(/\s/g, ''));
        const costPrice = parseFloat(cost.replace(/\s/g, ''));
        // New logic: margin as percentage of sale price (gain / salePrice)
        // Requires both salePrice and costPrice and salePrice !== 0
        if (isNaN(salePrice) || isNaN(costPrice) || salePrice === 0)
            return '';
        const margin = ((salePrice - costPrice) / salePrice) * 100;
        return margin.toFixed(2);
    }
    // Formate un nombre avec espace entre les milliers
    function formatNumberWithSpaces(value: string) {
        if (!value && value !== '0')
            return "";
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
        if (!intDigits)
            return fracPart ? `0.${fracPart}` : '';
        const sign = intDigits.startsWith('-') ? '-' : '';
        const absInt = sign ? intDigits.slice(1) : intDigits;
        const formattedInt = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        // Clean fractional part: keep up to 2 decimals, trim trailing zeros
        if (fracPart) {
            fracPart = fracPart.replace(/[^0-9]/g, '').slice(0, 2).replace(/0+$/, '');
        }
        return fracPart ? `${sign}${formattedInt}.${fracPart}` : `${sign}${formattedInt}`;
    }
    function parseWholeQuantity(value: string) {
        const trimmed = String(value || '').trim();
        if (!/^\d+$/.test(trimmed))
            return null;
        const parsed = parseInt(trimmed, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    function normalizeStockForAdjustment(value: unknown) {
        const numeric = typeof value === 'number' ? value : Number(value ?? 0);
        const raw = Number.isFinite(numeric) ? numeric : 0;
        const normalized = Math.round(raw);
        return {
            raw,
            normalized,
            wasRounded: Math.abs(raw - normalized) > 0.0001,
        };
    }
    const { user } = useAuth();
    // Permettre aux managers, admins et super_admins de gérer les ajustements de stock
    const canManageStockAdjustments = user.role === 'manager' || user.role === 'admin' || user.role === 'super_admin';
    const canViewExactStock = user.role === 'admin' || user.role === 'super_admin';
    const canViewStockValueAmounts = user.role === 'admin' || user.role === 'super_admin';
    const canViewStockDelta = user.role === 'admin' || user.role === 'super_admin';
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const isMobile = useIsMobile();
    const { isBackendReachable, manualSync } = useNetwork();
    const [products, setProducts] = useState<Product[]>([]);
    const [categoryAddStatus, setCategoryAddStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [categories, setCategories] = useState<Category[]>([]);
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [directExpenses, setDirectExpenses] = useState<DirectExpenseRecord[]>([]);
    const [stockSignals, setStockSignals] = useState<StockSignalRecord[]>([]);
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
        variablePrices: [] as Array<{
            label: string;
            price: string;
        }>,
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
        if (step === 0)
            return formData.name.trim().length > 0;
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
    const submitNow = () => handleSubmit({ preventDefault() { } } as React.FormEvent);
    const goNext = () => {
        if (!canGoNext)
            return;
        setCurrentStep((s) => Math.min(s + 1, stepLabels.length - 1));
    };
    const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 0));
    const [categoryExists, setCategoryExists] = useState(true);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [newCategoryDesc, setNewCategoryDesc] = useState('');
    const [productsSearch, setProductsSearch] = useState('');
    const deferredProductsSearch = useDeferredValue(productsSearch);
    // Stock adjust batch (for managers)
    const [adjustments, setAdjustments] = useState<StockAdjustmentLine[]>([]);
    const [adjustGlobalReason, setAdjustGlobalReason] = useState('');
    const [adjustSubmitting, setAdjustSubmitting] = useState(false);
    const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
    const [draftProductId, setDraftProductId] = useState('');
    const [draftPhysicalQty, setDraftPhysicalQty] = useState('');
    const [draftReason, setDraftReason] = useState('');
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importRows, setImportRows] = useState<ImportProductRow[]>([]);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [importFileName, setImportFileName] = useState('');
    const [importSubmitting, setImportSubmitting] = useState(false);
    const importFileInputRef = useRef<HTMLInputElement | null>(null);
    const loadedOnceRef = useRef(false);
    const backgroundRefreshInFlightRef = useRef(false);
    const lastBackgroundRefreshAtRef = useRef(0);
    const readTextFile = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
        reader.readAsText(file);
    });
    const parseImportNumber = (value: unknown): number | undefined => {
        if (value == null)
            return undefined;
        const normalized = String(value).trim().replace(/\u00A0|\u202F/g, '').replace(/\s/g, '').replace(',', '.');
        if (!normalized)
            return undefined;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    const parseImportBoolean = (value: unknown): boolean => {
        const normalized = String(value ?? '').trim().toLowerCase();
        return ['1', 'true', 'oui', 'yes', 'y', 'on'].includes(normalized);
    };
    const normalizeImportHeader = (value: unknown) => String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[%()]/g, '')
        .replace(/[^a-z0-9]+/g, '');
    const parseVariablePricesText = (value: unknown) => {
        const raw = String(value ?? '').trim();
        if (!raw)
            return undefined;
        const parsed = raw
            .split('|')
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .map((chunk) => {
            const parts = chunk.split(':');
            if (parts.length < 2)
                return null;
            const label = parts.slice(0, -1).join(':').trim();
            const price = parseImportNumber(parts[parts.length - 1]);
            if (!label || price == null)
                return null;
            return { label, price };
        })
            .filter((entry): entry is {
            label: string;
            price: number;
        } => Boolean(entry));
        return parsed.length > 0 ? parsed : undefined;
    };
    const parseDelimitedLine = (line: string, delimiter: string) => {
        const cells: string[] = [];
        let current = '';
        let insideQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (insideQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                }
                else {
                    insideQuotes = !insideQuotes;
                }
                continue;
            }
            if (char === delimiter && !insideQuotes) {
                cells.push(current.trim());
                current = '';
                continue;
            }
            current += char;
        }
        cells.push(current.trim());
        return cells;
    };
    const detectDelimiter = (line: string) => {
        const delimiters = [',', ';', '\t'];
        let best = ';';
        let bestScore = -1;
        for (const delimiter of delimiters) {
            const score = line.split(delimiter).length;
            if (score > bestScore) {
                bestScore = score;
                best = delimiter;
            }
        }
        return best;
    };
    const parseImportFileContent = (content: string) => {
        const sanitized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = sanitized
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length < 2) {
            return { rows: [] as ImportProductRow[], errors: ['Le fichier doit contenir un en-tête et au moins une ligne produit.'] };
        }
        const delimiter = detectDelimiter(lines[0]);
        const headers = parseDelimitedLine(lines[0], delimiter).map((header) => normalizeImportHeader(header));
        const rows: ImportProductRow[] = [];
        const errors: string[] = [];
        const getCell = (cells: string[], names: string[]) => {
            const normalizedNames = names.map((name) => normalizeImportHeader(name));
            const index = headers.findIndex((header) => normalizedNames.includes(header));
            return index >= 0 ? cells[index] ?? '' : '';
        };
        for (let i = 1; i < lines.length; i++) {
            const cells = parseDelimitedLine(lines[i], delimiter);
            const name = getCell(cells, ['name', 'nom', 'produit', 'nom du produit']).trim();
            if (!name) {
                errors.push(`Ligne ${i + 1}: nom du produit manquant.`);
                continue;
            }
            const variablePrices = parseVariablePricesText(getCell(cells, ['variableprices', 'prixvariables', 'variants', 'variantes', 'variantes de prix']));
            const salePrice = parseImportNumber(getCell(cells, ['saleprice', 'prixvente', 'prix_vente', 'prix de vente']));
            const costPrice = parseImportNumber(getCell(cells, ['costprice', 'prixrevient', 'prix_revient', 'cout', 'coût', 'prix de revient']));
            const targetMargin = parseImportNumber(getCell(cells, ['targetmargin', 'marge', 'margecible', 'pourcentage de gain cible']));
            const stock = parseImportNumber(getCell(cells, ['stock', 'stockinitial', 'stock_initial', 'stock initial']));
            const minStock = parseImportNumber(getCell(cells, ['minstock', 'stockmin', 'stock_min', 'stockminimal', 'stock minimal']));
            const taxRate = parseImportNumber(getCell(cells, ['taxrate', 'tva', 'taxe', 'tva %']));
            const trackStockCell = getCell(cells, ['trackstock', 'suivistock', 'suivi_stock', 'suivi de stock']);
            const explicitTrackStock = trackStockCell.trim().length > 0 ? parseImportBoolean(trackStockCell) : undefined;
            rows.push({
                name,
                sku: getCell(cells, ['sku', 'code']).trim(),
                categoryName: getCell(cells, ['category', 'categorie', 'catégorie', 'categorie']).trim(),
                salePrice,
                costPrice,
                targetMargin,
                variablePrices,
                unit: getCell(cells, ['unit', 'unite', 'unité', 'unite']).trim() || 'pièce',
                taxRate,
                stock,
                minStock,
                trackStock: explicitTrackStock ?? (stock != null || minStock != null),
                imageUrl: getCell(cells, ['imageurl', 'image', 'image_url', 'image du produit']).trim() || undefined,
            });
        }
        return { rows, errors };
    };
    const parseImportObjects = (records: Record<string, unknown>[]) => {
        const rows: ImportProductRow[] = [];
        const errors: string[] = [];
        for (let i = 0; i < records.length; i++) {
            const record = records[i] || {};
            const normalizedRecord = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalizeImportHeader(key), value]));
            const getValue = (...names: string[]) => {
                for (const name of names) {
                    const normalizedName = normalizeImportHeader(name);
                    if (Object.prototype.hasOwnProperty.call(normalizedRecord, normalizedName)) {
                        return normalizedRecord[normalizedName];
                    }
                }
                return '';
            };
            const name = String(getValue('name', 'nom', 'produit', 'nom du produit') ?? '').trim();
            if (!name) {
                errors.push(`Ligne ${i + 2}: nom du produit manquant.`);
                continue;
            }
            const variablePrices = parseVariablePricesText(getValue('variableprices', 'prixvariables', 'variants', 'variantes', 'variantes de prix'));
            const salePrice = parseImportNumber(getValue('saleprice', 'prixvente', 'prix_vente', 'prix de vente'));
            const costPrice = parseImportNumber(getValue('costprice', 'prixrevient', 'prix_revient', 'cout', 'coût', 'prix de revient'));
            const targetMargin = parseImportNumber(getValue('targetmargin', 'marge', 'margecible', 'pourcentage de gain cible'));
            const stock = parseImportNumber(getValue('stock', 'stockinitial', 'stock_initial', 'stock initial'));
            const minStock = parseImportNumber(getValue('minstock', 'stockmin', 'stock_min', 'stockminimal', 'stock minimal'));
            const taxRate = parseImportNumber(getValue('taxrate', 'tva', 'taxe', 'tva %'));
            const trackStockCell = String(getValue('trackstock', 'suivistock', 'suivi_stock', 'suivi de stock') ?? '').trim();
            const explicitTrackStock = trackStockCell ? parseImportBoolean(trackStockCell) : undefined;
            rows.push({
                name,
                sku: String(getValue('sku', 'code') ?? '').trim(),
                categoryName: String(getValue('category', 'categorie', 'catégorie') ?? '').trim(),
                salePrice,
                costPrice,
                targetMargin,
                variablePrices,
                unit: String(getValue('unit', 'unite', 'unité') ?? '').trim() || 'pièce',
                taxRate,
                stock,
                minStock,
                trackStock: explicitTrackStock ?? (stock != null || minStock != null),
                imageUrl: String(getValue('imageurl', 'image', 'image_url', 'image du produit') ?? '').trim() || undefined,
            });
        }
        return { rows, errors };
    };
    const handleImportFile = async (file: File) => {
        try {
            let parsed: { rows: ImportProductRow[]; errors: string[]; };
            const lowerName = file.name.toLowerCase();
            const allowedExtensions = ['.csv', '.txt', '.xlsx', '.xls'];
            const isAllowed = allowedExtensions.some((extension) => lowerName.endsWith(extension));
            if (!isAllowed) {
                setImportRows([]);
                setImportErrors(['Format non supporté. Utilisez un fichier CSV ou Excel (.xlsx, .xls).']);
                setImportFileName(file.name);
                toast.error('Format non supporté. Fichier CSV ou Excel uniquement.');
                return;
            }
            if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                if (!firstSheetName) {
                    throw new Error('Aucune feuille trouvée dans le fichier Excel.');
                }
                const sheet = workbook.Sheets[firstSheetName];
                const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
                    defval: '',
                    raw: false,
                });
                parsed = parseImportObjects(records);
            }
            else {
                const content = await readTextFile(file);
                parsed = parseImportFileContent(content);
            }
            setImportRows(parsed.rows);
            setImportErrors(parsed.errors);
            setImportFileName(file.name);
            if (parsed.rows.length > 0) {
                toast.success(`${parsed.rows.length} produit(s) prêt(s) à être importé(s).`);
            }
            else {
                toast.error('Aucune ligne valide trouvée dans le fichier.');
            }
        }
        catch (error) {
            setImportRows([]);
            setImportErrors(['Impossible de lire le fichier sélectionné.']);
            setImportFileName(file.name);
            toast.error('Lecture du fichier impossible');
        }
    };
    const resetImportState = () => {
        setImportRows([]);
        setImportErrors([]);
        setImportFileName('');
        setImportSubmitting(false);
    };
    const submitImport = async () => {
        if (importSubmitting || importRows.length === 0)
            return;
        setImportSubmitting(true);
        try {
            const db = await getDB();
            const localProducts = await db.getAll('products');
            const existingSkuSet = new Set((localProducts || [])
                .map((product: any) => String(product?.sku || '').trim().toLowerCase())
                .filter(Boolean));
            const existingNameSet = new Set((localProducts || [])
                .filter((product: any) => String(product?.storeId || '') === String(user.storeId || ''))
                .map((product: any) => String(product?.name || '').trim().toLowerCase())
                .filter(Boolean));
            const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));
            const createdCategories: Category[] = [];
            const createdProducts: Product[] = [];
            const skippedReasons: string[] = [];
            const seenImportSkuSet = new Set<string>();
            const seenImportNameSet = new Set<string>();
            const createUniqueSku = () => {
                let sku = '';
                do {
                    sku = `PRD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
                } while (existingSkuSet.has(sku.toLowerCase()) || seenImportSkuSet.has(sku.toLowerCase()));
                return sku;
            };
            for (const row of importRows) {
                const normalizedSku = String(row.sku || '').trim().toLowerCase();
                const normalizedName = String(row.name || '').trim().toLowerCase();
                if (normalizedSku) {
                    if (existingSkuSet.has(normalizedSku)) {
                        skippedReasons.push(`${row.name}: SKU déjà existant (${row.sku}).`);
                        continue;
                    }
                    if (seenImportSkuSet.has(normalizedSku)) {
                        skippedReasons.push(`${row.name}: SKU en doublon dans le fichier (${row.sku}).`);
                        continue;
                    }
                }
                else if (normalizedName) {
                    if (existingNameSet.has(normalizedName)) {
                        skippedReasons.push(`${row.name}: produit déjà présent dans ce magasin.`);
                        continue;
                    }
                    if (seenImportNameSet.has(normalizedName)) {
                        skippedReasons.push(`${row.name}: produit en doublon dans le fichier.`);
                        continue;
                    }
                }
                let categoryId: string | undefined;
                const categoryName = row.categoryName.trim();
                if (categoryName) {
                    const key = categoryName.toLowerCase();
                    let category = categoryByName.get(key);
                    if (!category) {
                        category = {
                            id: generateId(),
                            name: categoryName,
                            description: '',
                            storeId: user.storeId,
                            createdAt: Date.now(),
                        };
                        await db.put('categories', category);
                        await performSyncOp({
                            url: `${BACKEND_BASE}/api/categories.php`,
                            method: 'POST',
                            data: category,
                        });
                        categoryByName.set(key, category);
                        createdCategories.push(category);
                    }
                    categoryId = category.id;
                }
                const finalSku = normalizedSku ? String(row.sku).trim() : createUniqueSku();
                const product: Product = {
                    id: generateId(),
                    name: row.name,
                    sku: finalSku,
                    storeId: user.storeId,
                    categoryId,
                    salePrice: row.salePrice,
                    costPrice: row.costPrice,
                    targetMargin: row.targetMargin,
                    variablePrices: row.variablePrices,
                    unit: row.unit || 'pièce',
                    taxRate: row.taxRate,
                    stock: row.trackStock ? { [user.storeId]: row.stock ?? 0 } : {},
                    minStock: row.trackStock ? row.minStock : undefined,
                    imageUrl: row.imageUrl || '',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    trackStock: row.trackStock,
                };
                await db.put('products', product);
                await performSyncOp({
                    url: `${BACKEND_BASE}/api/products.php`,
                    method: 'POST',
                    data: {
                        ...product,
                        stock: row.trackStock ? row.stock ?? 0 : 0,
                    }
                });
                createdProducts.push(product);
                existingSkuSet.add(finalSku.trim().toLowerCase());
                seenImportSkuSet.add(finalSku.trim().toLowerCase());
                if (normalizedName) {
                    existingNameSet.add(normalizedName);
                    seenImportNameSet.add(normalizedName);
                }
            }
            if (createdCategories.length > 0) {
                setCategories((prev) => [...prev, ...createdCategories]);
            }
            setProducts((prev) => [...prev, ...createdProducts]);
            if (skippedReasons.length > 0) {
                setImportErrors(skippedReasons);
            }
            if (createdProducts.length > 0 && skippedReasons.length > 0) {
                toast.success(`${createdProducts.length} produit(s) importé(s), ${skippedReasons.length} ignoré(s).`);
            }
            else if (createdProducts.length > 0) {
                toast.success(`${createdProducts.length} produit(s) importé(s) avec succès.`);
            }
            else {
                toast.warning(`Aucun produit importé. ${skippedReasons.length} ligne(s) ignorée(s).`);
            }
            if (skippedReasons.length > 0) {
                toast.warning(skippedReasons.slice(0, 3).join(' '));
            }
            setImportDialogOpen(false);
            resetImportState();
            if (isBackendReachable) {
                setTimeout(() => loadData(), 500);
            }
        }
        catch (error) {
            toast.error(`Erreur pendant l'import: ${(error as Error).message}`);
        }
        finally {
            setImportSubmitting(false);
        }
    };
    const exportProducts = () => {
        try {
            const rows = products.map((product) => {
                const categoryName = getCategoryName(product.categoryId || '');
                const stockQty = product.trackStock ? Number(product.stock?.[user.storeId] ?? 0) : '';
                const minStock = product.trackStock ? (product.minStock ?? '') : '';
                const variablePrices = Array.isArray(product.variablePrices) && product.variablePrices.length > 0
                    ? product.variablePrices
                        .map((variant) => `${variant.label}:${variant.price}`)
                        .join('|')
                    : '';
                return {
                    'Nom du produit': product.name || '',
                    'SKU': product.sku || '',
                    'Catégorie': categoryName || '',
                    'Prix de vente': product.salePrice ?? '',
                    'Prix de revient': product.costPrice ?? '',
                    'Pourcentage de gain cible': product.targetMargin ?? '',
                    'Unité': product.unit || 'pièce',
                    'TVA %': product.taxRate ?? '',
                    'Stock initial': stockQty,
                    'Stock minimal': minStock,
                    'Suivi de stock': product.trackStock ? 'oui' : 'non',
                    'Image du produit': product.imageUrl || '',
                    'Variantes de prix': variablePrices,
                };
            });
            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Produits');
            const today = new Date();
            const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            XLSX.writeFile(workbook, `produits_magasin_${formattedDate}.xlsx`);
            toast.success(`${products.length} produit(s) exporté(s) avec succès.`);
        }
        catch (error) {
            toast.error(`Erreur pendant l'export: ${(error as Error).message}`);
        }
    };
    const openImportFilePicker = async () => {
        try {
            if (typeof window.showOpenFilePicker === 'function') {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    excludeAcceptAllOption: true,
                    types: [
                        {
                            description: 'Fichiers produits',
                            accept: {
                                'text/csv': ['.csv'],
                                'text/plain': ['.txt'],
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                                'application/vnd.ms-excel': ['.xls'],
                            },
                        },
                    ],
                });
                if (!handle) {
                    return;
                }
                const file = await handle.getFile();
                await handleImportFile(file);
                return;
            }
        }
        catch (error) {
            if ((error as DOMException)?.name === 'AbortError') {
                return;
            }
        }
        importFileInputRef.current?.click();
    };
    const refreshFromBackend = async (db: any, force = false) => {
        if (!user?.storeId || !isBackendReachable)
            return;
        const now = Date.now();
        if (!force) {
            if (backgroundRefreshInFlightRef.current)
                return;
            if (now - lastBackgroundRefreshAtRef.current < 30000)
                return;
        }
        backgroundRefreshInFlightRef.current = true;
        lastBackgroundRefreshAtRef.current = now;
        try {
            const [productsResponse, categoriesResponse] = await Promise.all([
                fetch(`${BACKEND_BASE}/api/products.php?storeId=${user.storeId}&_t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                }),
                fetch(`${BACKEND_BASE}/api/categories.php?storeId=${user.storeId}&_t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                })
            ]);
            if (productsResponse.ok) {
                const backendProducts = await productsResponse.json();
                const normalizedBackendProducts = (backendProducts || []).map((p: any) => ({
                    ...p,
                    stock: p.stock || {},
                    imageUrl: normalizeImageUrl(p.imageUrl)
                }));
                const pendingStockOperations = await hasPendingStockOperations(user.storeId);
                if (!pendingStockOperations) {
                    setProducts(normalizedBackendProducts);
                    try {
                        const backendProductIds = new Set(normalizedBackendProducts.map((p: any) => String(p.id)));
                        const localProducts = await db.getAll('products');
                        const tx = db.transaction('products', 'readwrite');
                        const scopedLocalProducts = (localProducts || []).filter((p: any) => p.storeId === user.storeId ||
                            (p.stock && Object.prototype.hasOwnProperty.call(p.stock, user.storeId)));
                        await Promise.all([
                            ...scopedLocalProducts
                                .filter((p: any) => !backendProductIds.has(String(p.id)))
                                .map((p: any) => tx.store.delete(p.id)),
                            ...normalizedBackendProducts.map((p: any) => tx.store.put(p)),
                            tx.done
                        ]);
                    }
                    catch (e) {
                    }
                }
            }
            if (categoriesResponse.ok) {
                const backendCategories = await categoriesResponse.json();
                const normalizedBackendCategories = (backendCategories || []).map((c: any) => ({ ...c, storeId: c.storeId || user.storeId }));
                setCategories(normalizedBackendCategories);
                try {
                    const backendCategoryIds = new Set(normalizedBackendCategories.map((c: any) => String(c.id)));
                    const localCategories = await db.getAll('categories');
                    const txc = db.transaction('categories', 'readwrite');
                    const scopedLocalCategories = (localCategories || []).filter((c: any) => c.storeId === user.storeId || !c.storeId);
                    await Promise.all([
                        ...scopedLocalCategories
                            .filter((c: any) => !backendCategoryIds.has(String(c.id)))
                            .map((c: any) => txc.store.delete(c.id)),
                        ...normalizedBackendCategories.map((c: any) => txc.store.put(c)),
                        txc.done
                    ]);
                }
                catch (e) {
                }
            }
        }
        catch (error) {
        }
        finally {
            backgroundRefreshInFlightRef.current = false;
        }
    };
    if (!user) {
        return <div className="p-4">Veuillez vous connecter pour voir les produits.</div>;
    }
    const loadData = async (refresh = true) => {
        if (!user?.storeId) {
            return;
        }
        try {
            const db = await getDB();
            await loadFromLocal(db);
            if (refresh) {
                void refreshFromBackend(db);
            }
        }
        catch (error) {
            toast.error('Erreur de chargement des données');
        }
    };
    // Chargement initial des données
    useEffect(() => {
        if (!user?.storeId)
            return;
        const shouldReload = !loadedOnceRef.current;
        if (!shouldReload)
            return;
        const initialLoad = async () => {
            setIsLoading(true);
            try {
                await loadData(true);
            }
            catch (error) {
                toast.error('Erreur de chargement des données');
            }
            finally {
                setIsLoading(false);
            }
        };
        initialLoad();
        loadedOnceRef.current = true;
    }, [user?.storeId]);
    // Synchronisation automatique quand le backend devient accessible
    useEffect(() => {
        if (!user?.storeId || !isBackendReachable || !loadedOnceRef.current)
            return;
        getDB().then((db) => refreshFromBackend(db, true)).catch(() => { });
    }, [isBackendReachable, user?.storeId]);
    // Rechargement quand la page devient visible
    useEffect(() => {
        if (!user?.storeId)
            return;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && loadedOnceRef.current) {
                getDB().then((db) => refreshFromBackend(db, false)).catch(() => { });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user?.storeId, isBackendReachable]);
    const loadFromLocal = async (db: any) => {
        try {
            const [localProducts, localCategories, localSales, localExpenses, localSignals] = await Promise.all([
                db.getAll('products'),
                db.getAll('categories'),
                db.getAll('sales'),
                db.getAll('expensesAdvanced'),
                db.getAll('stockSignals'),
            ]);
            // Filtrer par magasin courant
            const prods = (localProducts || [])
                .filter((p: any) => p.storeId === user.storeId || !p.storeId)
                .map((p: any) => ({
                ...p,
                storeId: p.storeId || user.storeId,
                stock: p.stock || {},
                imageUrl: normalizeImageUrl(p.imageUrl)
            }));
            const cats = (localCategories || []).filter((c: any) => c.storeId === user.storeId || !c.storeId);
            const scopedSales = (localSales || []).filter((sale: any) => sale.storeId === user.storeId);
            const scopedDirectExpenses = (localExpenses || []).filter((expense: any) => expense.storeId === user.storeId && expense.type === 'direct');
            const scopedSignals = (localSignals || []).filter((signal: any) => signal.storeId === user.storeId);
            setProducts(prods);
            setCategories(cats);
            setSales(scopedSales);
            setDirectExpenses(scopedDirectExpenses);
            setStockSignals(scopedSignals);
        }
        catch (e) {
            setProducts([]);
            setCategories([]);
            setSales([]);
            setDirectExpenses([]);
            setStockSignals([]);
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (productSubmitting)
            return;
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
                    }
                    catch (e) {
                    }
                    await performSyncOp({
                        url: `${BACKEND_BASE}/api/categories.php`,
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
                    }
                    else {
                        if (editingProduct && editingProduct.imageUrl) {
                            const prevUrl = editingProduct.imageUrl;
                            const basename = prevUrl ? prevUrl.split('/').pop() : null;
                            const candidates: string[] = [];
                            if (prevUrl)
                                candidates.push(prevUrl);
                            if (basename)
                                candidates.push(`img_products/${basename}`);
                            let deleted = false;
                            for (const candidate of candidates) {
                                try {
                                    const delRes = await fetch(`${BACKEND_BASE}/api/upload_image.php`, {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ url: candidate })
                                    });
                                    let delJson: any = null;
                                    try {
                                        delJson = await delRes.json();
                                    }
                                    catch (e) { }
                                    if (delRes.ok && delJson && delJson.success) {
                                        deleted = true;
                                        toast.success('Ancienne image supprimée du serveur');
                                        break;
                                    }
                                    else {
                                    }
                                }
                                catch (delErr) {
                                }
                            }
                            if (!deleted) {
                                toast.error('Impossible de supprimer l\'ancienne image sur le serveur (vérifiez les logs). Le fichier peut rester présent.');
                            }
                        }
                        const res = await fetch(`${BACKEND_BASE}/api/upload_image.php`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ image: formData.pendingImage })
                        });
                        const result = await res.json();
                        if (result && result.success) {
                            const fullUrl = `${BACKEND_BASE}/${result.url}`;
                            uploadedImageUrl = fullUrl;
                            setFormData(f => ({ ...f, imageUrl: fullUrl, pendingImage: '' }));
                        }
                        else {
                            toast.error('Erreur lors de l\'upload de l\'image: ' + (result?.error || ''));
                        }
                    }
                }
                catch (err) {
                    toast.error('Erreur réseau lors de l\'upload de l\'image â€” upload différé');
                }
            }
            // IMPORTANT : Toute modification de stock doit passer par performSyncOp pour garantir la cohérence et la synchronisation hors-ligne/online.
            // Ne jamais modifier le stock local directement sans passer par cette file d'attente !
            if (editingProduct) {
                // Recharger le stock actuel depuis la BD avant de mettre à jour
                let currentStock = editingProduct?.stock || {};
                try {
                    if (isBackendReachable) {
                        const stockResponse = await fetch(`${BACKEND_BASE}/api/products.php?id=${editingProduct.id}`);
                        if (stockResponse.ok) {
                            const freshProduct = await stockResponse.json();
                            if (freshProduct && freshProduct.stock) {
                                currentStock = freshProduct.stock;
                            }
                        }
                    }
                    else {
                        const freshLocal = await db.get('products', editingProduct.id);
                        if (freshLocal && freshLocal.stock) {
                            currentStock = freshLocal.stock;
                        }
                    }
                }
                catch (error) {
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
                // 2. Rafraîchir l'UI immédiatement
                setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
                // 3. Synchroniser vers le backend (en arrière-plan)
                await performSyncOp({
                    url: `${BACKEND_BASE}/api/products.php`,
                    method: 'PUT',
                    data: { ...updated, storeId: user.storeId, stock: formData.trackStock ? parseFloat(formData.stock) || 0 : 0 }
                });
                toast.success('Produit mis à jour avec succès');
            }
            else {
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
                // 2. Rafraîchir l'UI immédiatement
                setProducts(prev => [...prev, newProduct]);
                // 3. Synchroniser vers le backend (en arrière-plan)
                await performSyncOp({
                    url: `${BACKEND_BASE}/api/products.php`,
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
        }
        catch (error) {
            toast.error('Erreur lors de l\'enregistrement: ' + (error as Error).message);
        }
        finally {
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
                    const response = await fetch(`${BACKEND_BASE}/api/products.php?id=${product.id}&_t=${Date.now()}`, {
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
                }
                catch (error) {
                }
            }
            else {
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
        }
        catch (error) {
            toast.error('Erreur lors du chargement du produit');
        }
    };
    const handleDelete = async (id: string) => {
        if (await showAppConfirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
            try {
                const db = await getDB();
                // Récupérer le produit pour obtenir l'image
                const product = products.find(p => p.id === id);
                // 1. Supprimer localement d'abord
                await db.delete('products', id);
                // 2. Rafraîchir l'UI immédiatement
                setProducts(prev => prev.filter(p => p.id !== id));
                // 3. Supprimer l'image du backend si elle existe (en arrière-plan)
                if (product?.imageUrl) {
                    try {
                        await fetch(`${BACKEND_BASE}/api/upload_image.php`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: product.imageUrl })
                        });
                    }
                    catch (e) {
                    }
                }
                // 4. Synchroniser la suppression vers le backend (en arrière-plan)
                await performSyncOp({
                    url: `${BACKEND_BASE}/api/products.php?id=${id}`,
                    method: 'DELETE',
                    data: {}
                });
                toast.success('Produit supprimé avec succès');
            }
            catch (error) {
                toast.error('Erreur lors de la suppression');
            }
        }
    };
    const trackedProducts = useMemo(() => products.filter((p) => p.trackStock || (p.stock && Object.keys(p.stock).length > 0)), [products]);
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
        if (e)
            e.preventDefault();
        if (adjustSubmitting)
            return;
        setAdjustSubmitting(true);
        try {
            const db = await getDB();
            const computedLines: Array<{
                product: Product;
                productId: string;
                delta: number;
                reason: string;
                previousStock: number;
                nextStock: number;
            }> = [];
            for (const line of adjustments) {
                if (!line.productId)
                    continue;
                const physical = parseWholeQuantity(line.physical || '');
                if (physical === null) {
                    toast.error('Chaque quantité physique doit être un nombre entier positif ou nul.');
                    return;
                }
                const freshProduct = await db.get('products', line.productId) as Product | undefined;
                if (!freshProduct) {
                    toast.error(`Produit introuvable pour l'ajustement: ${getProductLabel(line.productId)}`);
                    return;
                }
                const { normalized: previousStock } = normalizeStockForAdjustment(freshProduct.stock?.[user.storeId] ?? 0);
                const nextStock = physical;
                const delta = nextStock - previousStock;
                if (delta === 0)
                    continue;
                computedLines.push({
                    product: freshProduct,
                    productId: line.productId,
                    delta,
                    reason: line.reason || '',
                    previousStock,
                    nextStock,
                });
            }
            if (computedLines.length === 0) {
                toast.error('Ajoutez au moins un ajustement valide (écart non nul après recalcul).');
                return;
            }
            const updatedProducts = computedLines.map((line) => ({
                ...line.product,
                stock: {
                    ...(line.product.stock || {}),
                    [user.storeId]: line.nextStock,
                },
                updatedAt: Date.now(),
            }));
            const tx = db.transaction('products', 'readwrite');
            for (const product of updatedProducts) {
                await tx.store.put(product);
            }
            await tx.done;
            const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
            setProducts((prev) => prev.map((product) => updatedById.get(product.id) || product));
            const store = await db.get('stores', user.storeId);
            const storeName = store?.name || user.storeId || 'le magasin';
            const preview = computedLines
                .slice(0, 4)
                .map((line) => {
                const sign = line.delta > 0 ? '+' : '';
                return `${line.product.name || 'Produit inconnu'} (${sign}${line.delta})`;
            })
                .join(', ');
            const remainingCount = computedLines.length - Math.min(computedLines.length, 4);
            const previewText = remainingCount > 0
                ? `${preview}, +${remainingCount} autre(s)`
                : preview;
            const notificationPayload: StockAdjustmentNotificationPayload = {
                senderUserId: user.id,
                storeId: user.storeId,
                actorName: user.username,
                storeName,
                adjustmentCount: computedLines.length,
                previewText,
                reason: adjustGlobalReason.trim() || undefined,
                lines: computedLines.map((line) => ({
                    productId: line.product.id,
                    productName: line.product.name,
                    unit: line.product.unit,
                    minStock: line.product.minStock,
                    previousStock: line.previousStock,
                    nextStock: line.nextStock,
                })),
            };
            const syncResult = await performSyncOp({
                url: `${BACKEND_BASE}/api/stock_adjust.php`,
                method: 'POST',
                table: 'stockAdjustments',
                storeId: user.storeId,
                data: {
                    storeId: user.storeId,
                    userId: user.id,
                    reason: adjustGlobalReason || '',
                    adjustments: computedLines.map((line) => ({
                        productId: line.productId,
                        delta: line.delta,
                        reason: line.reason || '',
                    }))
                },
                notifyOnSuccess: {
                    kind: 'stockAdjustment',
                    payload: notificationPayload,
                }
            });
            if (syncResult.success && !syncResult.queued) {
                try {
                    await sendStockAdjustmentNotifications(notificationPayload);
                }
                catch {
                }
                toast.success('Ajustements synchronisés avec succès.');
            }
            else {
                toast.success('Ajustements appliqués localement. Synchronisation en attente.');
            }
            setAdjustments([]);
            setAdjustGlobalReason('');
            setDraftProductId('');
            setDraftPhysicalQty('');
            setDraftReason('');
            if (syncResult.success && !syncResult.queued) {
                void loadData();
            }
        }
        catch (err) {
            toast.error('Erreur lors de l\'envoi des ajustements');
        }
        finally {
            setAdjustSubmitting(false);
        }
    };
    const addDraftLine = () => {
        const physical = parseWholeQuantity(draftPhysicalQty);
        if (!draftProductId || physical === null) {
            toast.error('Sélectionnez un produit et saisissez la quantité présente en physique.');
            return;
        }
        // Prevent duplicate product lines
        if (adjustments.some(a => a.productId === draftProductId)) {
            toast.error('Ce produit est déjà dans la liste d\'ajustement.');
            return;
        }
        const prod = products.find(p => p.id === draftProductId);
        const currentStock = normalizeStockForAdjustment(prod?.stock?.[user.storeId] ?? 0);
        const delta = physical - currentStock.normalized;
        if (delta === 0) {
            toast.error('Aucun écart détecté entre quantité physique et quantité dans l\'app.');
            return;
        }
        setAdjustments((prev) => [
            ...prev,
            {
                productId: draftProductId,
                delta: String(delta),
                deltaPreview: String(delta),
                physical: String(physical),
                oldStock: currentStock.normalized,
                oldStockPreview: currentStock.normalized,
                oldStockRaw: currentStock.raw,
                roundedPreview: currentStock.wasRounded,
                reason: draftReason
            }
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
    const categoryNameById = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach((category) => map.set(category.id, category.name));
        return map;
    }, [categories]);
    const productById = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach((product) => map.set(product.id, product));
        return map;
    }, [products]);
    const getCategoryName = (categoryId: string) => categoryNameById.get(categoryId) || '';
    const getProductLabel = (productId: string) => {
        const product = productById.get(productId);
        if (!product)
            return productId;
        return `${product.name}${product.sku ? ` (${product.sku})` : ''}`;
    };
    const selectedAdjustmentProductIds = useMemo(() => new Set(adjustments.map((adjustment) => adjustment.productId)), [adjustments]);
    // Exclude already-selected products from the adjustments product picker
    const availableTrackedProducts = useMemo(() => trackedProducts.filter((product) => !selectedAdjustmentProductIds.has(product.id)), [trackedProducts, selectedAdjustmentProductIds]);
    const filteredProducts = useMemo(() => {
        const q = deferredProductsSearch.trim().toLowerCase();
        if (!q)
            return products;
        return products.filter(p => {
            if (p.name.toLowerCase().includes(q))
                return true;
            if (p.sku && p.sku.toLowerCase().includes(q))
                return true;
            const catName = (categoryNameById.get(p.categoryId || '') || '').toLowerCase();
            if (catName.includes(q))
                return true;
            try {
                if (p.salePrice && String(p.salePrice).toLowerCase().includes(q))
                    return true;
                if (p.costPrice && String(p.costPrice).toLowerCase().includes(q))
                    return true;
                // allow formatted search with spaces
                if (p.salePrice && p.salePrice.toLocaleString().toLowerCase().includes(q))
                    return true;
            }
            catch (e) { }
            return false;
        });
    }, [products, deferredProductsSearch, categoryNameById]);
    const productStockValueInfoById = useMemo(() => {
        const validSignalsByExpenseId = new Map<string, StockSignalRecord>();
        const latestSignalEndByProductId = new Map<string, number>();
        for (const signal of stockSignals) {
            if (!signal?.expenseId || !signal?.productId || !Number.isFinite(Number(signal.endDate))) {
                continue;
            }
            validSignalsByExpenseId.set(signal.expenseId, signal);
            const currentLatest = latestSignalEndByProductId.get(signal.productId) ?? 0;
            const signalEnd = Number(signal.endDate) || 0;
            if (signalEnd > currentLatest) {
                latestSignalEndByProductId.set(signal.productId, signalEnd);
            }
        }
        const salesByProductId = new Map<string, Array<{ createdAt: number; total: number }>>();
        for (const sale of sales) {
            if (sale.refunded || sale.draft) {
                continue;
            }
            for (const item of sale.items || []) {
                if (!item?.productId) {
                    continue;
                }
                const itemTotal = Number(item.total);
                const fallbackTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);
                const total = Number.isFinite(itemTotal) && itemTotal > 0 ? itemTotal : fallbackTotal;
                if (!Number.isFinite(total) || total <= 0) {
                    continue;
                }
                const existing = salesByProductId.get(item.productId) || [];
                existing.push({ createdAt: Number(sale.createdAt) || 0, total });
                salesByProductId.set(item.productId, existing);
            }
        }
        const infoById = new Map<string, ProductStockValueInfo>();
        for (const product of products) {
            const hasTrackedStock = Boolean(product.trackStock || (product.stock && Object.keys(product.stock).length > 0));
            if (hasTrackedStock) {
                const stockQty = Number(product.stock?.[user.storeId] ?? 0);
                if (stockQty < 0) {
                    infoById.set(product.id, { label: 'Stock négatif', amount: null, tone: 'danger' });
                    continue;
                }
                const salePrice = Number(product.salePrice);
                if (!Number.isFinite(salePrice) || salePrice <= 0) {
                    infoById.set(product.id, { label: 'Prix de vente manquant', amount: null, tone: 'warning' });
                    continue;
                }
                const amount = stockQty * salePrice;
                infoById.set(product.id, {
                    label: `${amount.toLocaleString('fr-FR')} FCFA`,
                    amount,
                    tone: 'success',
                });
                continue;
            }
            const activeDirectExpenses = directExpenses.filter((expense) => {
                if (expense.directProduct?.productId !== product.id) {
                    return false;
                }
                if (expense.directProduct?.endDate) {
                    return false;
                }
                return !validSignalsByExpenseId.has(expense.id);
            });
            if (activeDirectExpenses.length === 0) {
                infoById.set(product.id, { label: 'Aucune dépense active', amount: null, tone: 'muted' });
                continue;
            }
            const targetMarginRaw = Number(product.targetMargin);
            let targetMargin = Number.isFinite(targetMarginRaw) ? targetMarginRaw : null;
            if (targetMargin === null) {
                const salePrice = Number(product.salePrice);
                const costPrice = Number(product.costPrice);
                if (Number.isFinite(salePrice) && salePrice > 0 && Number.isFinite(costPrice) && costPrice > 0 && costPrice < salePrice) {
                    targetMargin = ((salePrice - costPrice) / salePrice) * 100;
                }
            }
            if (targetMargin === null || targetMargin < 0 || targetMargin >= 100) {
                infoById.set(product.id, { label: 'Données de calcul manquantes', amount: null, tone: 'warning' });
                continue;
            }
            const purchaseAmount = activeDirectExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
            if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
                infoById.set(product.id, { label: 'Montant de dépense manquant', amount: null, tone: 'warning' });
                continue;
            }
            const earliestActiveStartDate = activeDirectExpenses.reduce((minStart, expense) => {
                const nextStart = Number(expense.directProduct?.startDate) || 0;
                if (minStart === 0) {
                    return nextStart;
                }
                return nextStart > 0 ? Math.min(minStart, nextStart) : minStart;
            }, 0);
            const latestSignalEnd = latestSignalEndByProductId.get(product.id) ?? 0;
            const effectiveStartDate = Math.max(earliestActiveStartDate, latestSignalEnd);
            const soldAmount = (salesByProductId.get(product.id) || []).reduce((sum, entry) => {
                if (entry.createdAt < effectiveStartDate) {
                    return sum;
                }
                return sum + entry.total;
            }, 0);
            const expectedRevenue = purchaseAmount / (1 - targetMargin / 100);
            if (!Number.isFinite(expectedRevenue) || expectedRevenue <= 0) {
                infoById.set(product.id, { label: 'Estimation impossible', amount: null, tone: 'warning' });
                continue;
            }
            const estimatedRemainingValue = Math.max(expectedRevenue - soldAmount, 0);
            infoById.set(product.id, {
                label: `${estimatedRemainingValue.toLocaleString('fr-FR')} FCFA`,
                amount: estimatedRemainingValue,
                tone: estimatedRemainingValue > 0 ? 'success' : 'muted',
            });
        }
        return infoById;
    }, [directExpenses, products, sales, stockSignals, user.storeId]);
    const getPotentialStockValueInfo = (product: Product) => {
        return productStockValueInfoById.get(product.id) || {
            label: 'Non calculable',
            amount: null,
            tone: 'muted',
        };
    };
    const getPotentialStockValueLabel = (product: Product) => {
        return getPotentialStockValueInfo(product).label;
    };
    const getPotentialStockValueToneClass = (product: Product) => {
        const tone = getPotentialStockValueInfo(product).tone;
        if (tone === 'success') {
            return 'text-emerald-700 dark:text-emerald-300';
        }
        if (tone === 'danger') {
            return 'text-red-600 dark:text-red-400';
        }
        if (tone === 'warning') {
            return 'text-amber-700 dark:text-amber-300';
        }
        return 'text-muted-foreground';
    };
    const totalPotentialStockValue = useMemo(() => {
        return products.reduce((total, product) => {
            const amount = getPotentialStockValueInfo(product).amount;
            return total + (amount && amount > 0 ? amount : 0);
        }, 0);
    }, [products, productStockValueInfoById]);
    return (<div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Produits</h1>
          <p className="text-muted-foreground mt-1 text-sm">{'G\u00e9rez votre inventaire'}</p>
        </div>
        <div className="flex flex-row flex-wrap gap-2 w-full sm:w-auto">
          {canManageStockAdjustments && (<Button variant="outline" size="sm" className="flex-1 sm:flex-none h-9 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300" onClick={() => setAdjustDialogOpen(true)}>
              <Package className="w-4 h-4 mr-1.5"/>
              Ajustement
            </Button>)}
          {(user.role === 'admin' || user.role === 'super_admin') && (<Button variant="outline" size="sm" className="flex-1 sm:flex-none h-9 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300 hover:text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300" onClick={() => navigate('/stock-adjustments')}>
              <History className="w-4 h-4 mr-1.5"/>
              Historique
            </Button>)}
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open)
                resetImportState();
        }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Upload className="w-4 h-4 mr-1.5"/>
                Importer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl [&>button]:hidden">
              <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <DialogTitle>Importer des produits</DialogTitle>
                <Button type="button" variant="outline" onClick={exportProducts} className="h-9 rounded-lg border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:bg-slate-950/40 dark:text-blue-300 dark:hover:bg-blue-950/30">
                  <FileOutput className="mr-2 h-4 w-4"/>
                  Exporter mes produits
                </Button>
              </DialogHeader>
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-sm dark:border-emerald-900 dark:from-emerald-950/60 dark:via-emerald-950/40 dark:to-slate-950">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
                        <FileSpreadsheet className="h-5 w-5"/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
                          Télécharger le modèle d'exemple
                        </p>
                        <p className="mt-1 text-sm leading-6 text-emerald-800/90 dark:text-emerald-100/85">
                          Ouvrez ce fichier pour voir directement les bonnes colonnes et des exemples de produits avant votre import.
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button asChild type="button" className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 focus-visible:ring-emerald-500">
                        <a href="/produits_import.xlsx" download="produits_import.xlsx">
                          <Download className="mr-2 h-4 w-4"/>
                          Télécharger l'exemple
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Fichier CSV ou Excel</Label>
                  <input ref={importFileInputRef} type="file" accept=".csv,text/csv,.txt,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        void handleImportFile(file);
                    }
                    e.currentTarget.value = '';
                }}/>
                  <Button type="button" variant="outline" className="h-11 w-full justify-start rounded-xl border-dashed border-emerald-300 bg-emerald-50/40 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100/70 hover:text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100 dark:hover:bg-emerald-950/40" onClick={() => void openImportFilePicker()}>
                    <Upload className="w-4 h-4 mr-2"/>
                    Choisir un fichier (CSV ou Excel)
                  </Button>
                  {importFileName ? <p className="text-xs text-muted-foreground">Fichier chargé: {importFileName}</p> : null}
                </div>

                {importErrors.length > 0 ? (<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-medium">Lignes ignorées</p>
                    <div className="mt-2 space-y-1 text-xs">
                      {importErrors.slice(0, 8).map((error) => <p key={error}>{error}</p>)}
                    </div>
                  </div>) : null}

                <div className="rounded-lg border">
                  <div className="border-b px-3 py-2 text-sm font-medium">
                    Aperçu {importRows.length > 0 ? `(${importRows.length} ligne(s))` : ''}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                          <TableHead className="w-[72px]">Image</TableHead>
                          <TableHead>Nom</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead>Prix</TableHead>
                          <TableHead>Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.length === 0 ? (<TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              Aucun fichier analysé
                            </TableCell>
                          </TableRow>) : (importRows.slice(0, 12).map((row, index) => (<TableRow key={`${row.name}-${index}`}>
                              <TableCell>
                                {row.imageUrl ? (<div className="h-11 w-11 overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm">
                                    <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (fallback)
                        fallback.style.display = 'flex';
                }}/>
                                    <div className="hidden h-full w-full items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground">
                                      No img
                                    </div>
                                  </div>) : (<div className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-[10px] font-medium text-muted-foreground">
                                    Aucune
                                  </div>)}
                              </TableCell>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{row.sku || 'Auto'}</TableCell>
                              <TableCell>{row.categoryName || '—'}</TableCell>
                              <TableCell>{row.salePrice != null ? `${row.salePrice} FCFA` : 'Variable / vide'}</TableCell>
                              <TableCell>{row.trackStock ? `${row.stock ?? 0}` : 'Non suivi'}</TableCell>
                            </TableRow>)))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="w-1/2" onClick={() => setImportDialogOpen(false)} disabled={importSubmitting}>
                    Annuler
                  </Button>
                  <Button type="button" className="w-1/2" onClick={submitImport} disabled={importSubmitting || importRows.length === 0}>
                    {importSubmitting ? 'Import en cours...' : `Importer ${importRows.length || ''}`.trim()}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open)
                resetForm();
            setCurrentStep(0);
        }}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex-1 sm:flex-none h-9 bg-primary hover:bg-primary/90 shadow-sm">
                <Plus className="w-4 h-4 mr-1.5"/>
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
                  {stepLabels.map((label, index) => (<div key={label} className={`h-2 flex-1 rounded-full transition-colors ${index <= currentStep ? 'bg-primary' : 'bg-muted/60'}`}/>))}
                </div>
              </div>
            <form onSubmit={(e) => {
            e.preventDefault();
            if (!isLastStep && canGoNext)
                goNext();
        }} className="space-y-6">
              {currentStep === 0 && (<div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4 ring-1 ring-border/40">
                <div>
                  <h3 className="text-sm font-semibold">Informations produit</h3>
                  <p className="text-xs text-muted-foreground">Identité, catégorie et unité</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Image du produit (optionnel)</Label>
                  <div className="flex flex-row items-center gap-3">
                    <Input type="file" accept="image/*" className="h-10 flex-1" onChange={async (e) => {
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
                                        }
                                        else {
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
                                    }
                                    catch (err) {
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
                    }
                    catch (error) {
                        toast.error('Erreur lors du traitement de l\'image');
                    }
                }
            }}/>
                    {(formData.pendingImage || formData.imageUrl) && (<div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-border/60">
                        <img src={formData.pendingImage || normalizeImageUrl(formData.imageUrl)} alt="Aperçu" className="w-full h-full object-cover"/>
                        <button type="button" onClick={async () => {
                    // Si l'image est seulement en pending (non uploadée), on la supprime localement
                    if (formData.pendingImage) {
                        setFormData(f => ({ ...f, pendingImage: '' }));
                        return;
                    }
                    // Sinon supprimer l'image du backend si elle existe
                    if (formData.imageUrl) {
                        try {
                            await fetch(`${BACKEND_BASE}/api/upload_image.php`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: formData.imageUrl })
                            });
                        }
                        catch (e) {
                            toast.error("Erreur lors de la suppression de l'image sur le serveur");
                        }
                    }
                    setFormData(f => ({ ...f, imageUrl: '', pendingImage: '' }));
                }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600" title="Supprimer l'image">
                          ×
                        </button>
                      </div>)}
                  </div>
                  <p className="text-xs text-muted-foreground">Format carré conseillé, max 1MB.</p>
                </div>
                  <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Nom du produit</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required/>
                </div>
                  <div className="space-y-2">
                  <Label>Catégorie (saisie ou sélection)</Label>
                  <Input list="categories-list" value={formData.categoryName} onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, categoryName: val });
                const exists = categories.some(c => c.name.toLowerCase() === val.trim().toLowerCase());
                setCategoryExists(exists);
                setShowAddCategory(!exists && val.trim().length > 0);
                setCategoryAddStatus('idle');
            }} placeholder="Tapez ou sélectionnez une catégorie"/>
                  <datalist id="categories-list">
                    {categories.map((cat) => (<option key={cat.id} value={cat.name}/>))}
                  </datalist>
                  {!categoryExists && formData.categoryName.trim().length > 0 && (<div className="mt-2">
                      <span className="text-sm text-red-500">Catégorie non trouvée, elle sera créée automatiquement.</span>
                    </div>)}
                  {showAddCategory && (<div className="mt-2 space-y-2">
                      <Label>Description (optionnel)</Label>
                      <Input value={newCategoryDesc} onChange={e => setNewCategoryDesc(e.target.value)} placeholder="Description de la catégorie"/>
                    </div>)}
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
              </div>)}

              {currentStep === 1 && (<div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Prix</h3>
                  <p className="text-xs text-muted-foreground">Valeurs principales et marge</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                  <Label>Prix de vente (optionnel)</Label>
                  <Input type="text" inputMode="numeric" value={formatNumberWithSpaces(formData.salePrice)} onChange={e => {
                const raw = e.target.value.replace(/\s/g, "");
                setFormData({ ...formData, salePrice: raw });
                // Calcul automatique de la marge quand on change le prix de vente
                if (raw && formData.costPrice) {
                    const margin = calculateMargin(raw, formData.costPrice);
                    if (margin) {
                        setFormData(prev => ({ ...prev, salePrice: raw, targetMargin: margin }));
                    }
                }
            }} placeholder="Définir lors de la vente si vide"/>
                </div>

                <div className="space-y-2">
                  <Label>Prix de revient (optionnel)</Label>
                  <Input type="text" inputMode="numeric" value={formatNumberWithSpaces(formData.costPrice)} onChange={e => {
                const raw = e.target.value.replace(/\s/g, "");
                setFormData({ ...formData, costPrice: raw });
                // Calcul automatique de la marge quand on change le prix de revient
                if (raw && formData.salePrice) {
                    const margin = calculateMargin(formData.salePrice, raw);
                    if (margin) {
                        setFormData(prev => ({ ...prev, costPrice: raw, targetMargin: margin }));
                    }
                }
            }} placeholder="Pour calcul de marge"/>
                </div>

                <div className="space-y-2">
                  <Label>Pourcentage de gain cible (%)</Label>
                  <Input type="number" step="0.01" value={formData.targetMargin} onChange={(e) => setFormData({ ...formData, targetMargin: e.target.value })} placeholder="Calculé auto ou saisissez manuellement"/>
                  <p className="text-xs text-muted-foreground">
                    Calculé sur le prix de vente (gain / prix de vente)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>TVA % (optionnel)</Label>
                  <Input type="number" step="0.01" value={formData.taxRate} onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })} placeholder="Ex: 18"/>
                </div>
                </div>
              </div>)}

              {currentStep === 2 && (<div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Variantes de prix</h3>
                  <p className="text-xs text-muted-foreground">Plusieurs prix par format</p>
                </div>
                <div className="space-y-2">
                  {formData.variablePrices.map((vp, index) => (<div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input placeholder="Label (ex: Petit)" value={vp.label} onChange={e => {
                    const newPrices = [...formData.variablePrices];
                    newPrices[index].label = e.target.value;
                    setFormData({ ...formData, variablePrices: newPrices });
                }}/>
                      </div>
                      <div className="flex-1">
                        <Input type="text" inputMode="numeric" placeholder="Prix" value={formatNumberWithSpaces(vp.price)} onChange={e => {
                    const newPrices = [...formData.variablePrices];
                    newPrices[index].price = e.target.value.replace(/\s/g, "");
                    setFormData({ ...formData, variablePrices: newPrices });
                }}/>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={() => {
                    const newPrices = formData.variablePrices.filter((_, i) => i !== index);
                    setFormData({ ...formData, variablePrices: newPrices });
                }}>
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>))}
                  <Button type="button" variant="outline" onClick={() => {
                setFormData({
                    ...formData,
                    variablePrices: [...formData.variablePrices, { label: '', price: '' }]
                });
            }}>
                    <Plus className="w-4 h-4 mr-2"/>
                    Ajouter un prix
                  </Button>
                </div>
              </div>)}

              {currentStep === 3 && (<div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Stock</h3>
                  <p className="text-xs text-muted-foreground">Activer le suivi et définir les seuils</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div>
                    <Label>Suivi de stock</Label>
                    <p className="text-xs text-muted-foreground">Activer pour gérer le stock de ce produit</p>
                  </div>
                  <input type="checkbox" checked={formData.trackStock} onChange={e => setFormData({ ...formData, trackStock: e.target.checked })} className="w-5 h-5 accent-green-600"/>
                </div>
                {formData.trackStock && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stock initial (optionnel)</Label>
                      <Input type="number" step="0.01" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="0 par défaut"/>
                    </div>
                    <div className="space-y-2">
                      <Label>Stock minimal (optionnel)</Label>
                      <Input type="number" step="0.01" value={formData.minStock} onChange={(e) => setFormData({ ...formData, minStock: e.target.value })} placeholder="Alerte de réapprovisionnement"/>
                    </div>
                  </div>)}
              </div>)}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-1/3" onClick={() => setIsDialogOpen(false)} disabled={productSubmitting}>
                  Annuler
                </Button>
                <Button type="button" variant="outline" className="w-1/3" onClick={goPrev} disabled={currentStep === 0}>
                  Précédent
                </Button>
                {!isLastStep ? (<Button type="button" className="w-1/3" onClick={goNext} disabled={!canGoNext}>
                    Suivant
                  </Button>) : (<Button type="button" className="w-1/3" disabled={productSubmitting} onClick={submitNow}>
                    {productSubmitting ? 'Traitement...' : (editingProduct ? 'Mettre à jour' : 'Créer')}
                  </Button>)}
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="space-y-4">
        {canViewStockValueAmounts ? (<Card className="border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 shadow-sm dark:border-emerald-900 dark:from-emerald-950/40 dark:via-background dark:to-slate-950">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
                  <Package className="h-5 w-5"/>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                    Valeur globale du magasin
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {totalPotentialStockValue.toLocaleString('fr-FR')} FCFA
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Somme de la vente totale potentielle des produits en stock et calculables.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>) : null}
        <Card className="border-muted/60">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rechercher les produits</Label>
                <div className="relative">
                  <Input placeholder={'Nom, SKU, cat\u00e9gorie, prix...'} value={productsSearch} onChange={e => setProductsSearch(e.target.value)} className="w-full pl-3 h-10"/>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manager/Admin: trigger dialog for adjustments */}
        {canManageStockAdjustments && (<Dialog open={adjustDialogOpen} onOpenChange={(open) => setAdjustDialogOpen(open)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader className="pb-2 border-b">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50">
                    <Package className="w-5 h-5 text-blue-600 dark:text-blue-400"/>
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Ajustement de stock</DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Corrigez les écarts entre l'inventaire physique et l'application</p>
                  </div>
                </div>
              </DialogHeader>
              <div className="pt-2">
                  <form onSubmit={submitAdjust} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Motif global (optionnel)</Label>
                      <Input value={adjustGlobalReason} onChange={(e) => setAdjustGlobalReason(e.target.value)} placeholder="Ex: Inventaire de fin de journée"/>
                    </div>

                    <div className="rounded-xl border border-dashed bg-muted/30 p-3 md:p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-7 space-y-1.5">
                          <Label>Produit</Label>
                          <Select value={draftProductId} onValueChange={setDraftProductId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner un produit"/>
                            </SelectTrigger>
                            <SelectContent>
                              {availableTrackedProducts.map((product) => (<SelectItem key={product.id} value={product.id}>
                                  {product.name} ({product.sku || 'Sans SKU'})
                                </SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-3 space-y-1.5">
                          <Label>Quantité physique</Label>
                          <Input type="number" min="0" step="1" value={draftPhysicalQty} onChange={(e) => setDraftPhysicalQty(e.target.value)} placeholder="Ex: 12"/>
                        </div>
                        <div className="md:col-span-2 flex md:justify-end">
                          <Button type="button" variant="outline" onClick={addDraftLine} className="w-full md:w-auto">
                            Ajouter
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Motif ligne</Label>
                        <Input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} placeholder="Optionnel"/>
                      </div>
                      <p className="text-xs text-muted-foreground">Le stock est recalculé juste avant l'envoi pour rester cohérent, même hors ligne.</p>
                    </div>

                    {adjustments.length > 0 && (<div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produit</TableHead>
                              {canViewStockDelta ? (<TableHead>Delta</TableHead>) : null}
                              <TableHead>Motif</TableHead>
                              <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {adjustments.map((line, index) => (<TableRow key={`${line.productId}-${index}`}>
                                <TableCell>
                                  {getProductLabel(line.productId)}
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {'phys: '}{line.physical ?? '-'}{' • app: '}{canViewExactStock ? (line.oldStock ?? '-') : 'masqué'}
                                  </div>
                                </TableCell>
                                {canViewStockDelta ? (<TableCell>
                                    {(() => {
                        const n = parseInt(line.delta || '0', 10);
                        const sign = n > 0 ? '+' : '';
                        return (<span className={`font-semibold ${n > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {sign}{n}
                                      </span>);
                    })()}
                                  </TableCell>) : null}
                                <TableCell>{line.reason || '-'}</TableCell>
                                <TableCell>
                                  <Button type="button" variant="ghost" size="icon" onClick={() => removeAdjustmentLine(index)} title="Supprimer">
                                    <Trash2 className="w-4 h-4"/>
                                  </Button>
                                </TableCell>
                              </TableRow>))}
                          </TableBody>
                        </Table>
                      </div>)}

                    <div className="border-t pt-4 space-y-3">
                      {trackedProducts.length === 0 && (<p className="text-sm text-muted-foreground">Aucun produit avec suivi de stock disponible pour ajustement.</p>)}
                      <div className="flex justify-stretch sm:justify-center">
                        <Button type="submit" disabled={adjustSubmitting || trackedProducts.length === 0} className="w-full gap-2 sm:min-w-[240px] sm:w-auto">
                          <Package className="w-4 h-4"/>
                          {adjustSubmitting ? 'Envoi en cours...' : 'Envoyer les ajustements'}
                        </Button>
                      </div>
                    </div>
                  </form>
              </div>
            </DialogContent>
          </Dialog>)}

        {/* MOBILE : liste de cartes */}
        <div className="sm:hidden space-y-2">
          {isLoading ? (Array.from({ length: 4 }).map((_, i) => (<div key={i} className="animate-pulse flex items-center gap-3 bg-card border rounded-xl p-3">
                <div className="w-12 h-12 bg-muted rounded-lg flex-shrink-0"/>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-28"/>
                  <div className="h-3 bg-muted rounded w-20"/>
                  <div className="h-3 bg-muted rounded w-16"/>
                </div>
              </div>))) : filteredProducts.length === 0 ? (<div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-40"/>
              {productsSearch ? (<p className="text-sm">{'Aucun r\u00e9sultat pour \u00ab '}{productsSearch}{' \u00bb'}</p>) : (<p className="text-sm">Aucun produit</p>)}
            </div>) : (filteredProducts.map((product) => {
            const stockQty = product.stock?.[user.storeId] ?? 0;
            const hasStock = product.stock && Object.keys(product.stock).length > 0;
            const isLow = hasStock && product.minStock != null && stockQty <= product.minStock;
            const catName = getCategoryName(product.categoryId || '');
            const potentialStockValueLabel = getPotentialStockValueLabel(product);
            const potentialStockValueToneClass = getPotentialStockValueToneClass(product);
            return (<div key={product.id} className="flex items-center gap-3 bg-card border rounded-xl p-3 shadow-sm">
                  {/* Image */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                    {product.imageUrl ? (<img src={normalizeImageUrl(product.imageUrl)} alt="" className="w-full h-full object-cover"/>) : (<Package className="w-5 h-5 text-muted-foreground/50"/>)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold text-sm leading-tight truncate">{product.name}</span>
                      {/* Actions */}
                      {user.role !== 'manager' ? (<div className="flex gap-0.5 flex-shrink-0 ml-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(product)}>
                            <Edit className="w-3.5 h-3.5"/>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                            <Trash2 className="w-3.5 h-3.5"/>
                          </Button>
                        </div>) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span className="text-[11px] text-muted-foreground font-mono">{product.sku}</span>
                      {catName && (<span className="text-[11px] text-primary font-medium">{catName}</span>)}
                      {product.salePrice ? (<span className="text-[11px] font-semibold">{product.salePrice} FCFA</span>) : (<span className="text-[11px] text-muted-foreground italic">Prix variable</span>)}
                    </div>
                    <div className="mt-1">
                      {hasStock ? (<div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${stockQty <= 0 ? 'text-red-500' : 'text-foreground'}`}>
                            {canViewExactStock ? `${stockQty} ${product.unit}` : (stockQty > 0 ? 'Disponible' : 'Rupture')}
                          </span>
                          {isLow && (<span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              {'\u26a0 stock bas'}
                            </span>)}
                        </div>) : (<span className="text-muted-foreground text-xs">Via ajustement</span>)}
                      {canViewStockValueAmounts ? (<div className="mt-1 text-[11px] font-medium text-foreground">
                          Vente totale possible:{' '}
                          <span className={potentialStockValueToneClass}>{potentialStockValueLabel}</span>
                        </div>) : null}
                    </div>
                  </div>
                </div>);
        }))}
        </div>

        {/* DESKTOP : tableau */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold text-foreground">Produit</TableHead>
                  <TableHead className="font-semibold text-foreground">SKU</TableHead>
                  <TableHead className="hidden md:table-cell font-semibold text-foreground">{'Cat\u00e9gorie'}</TableHead>
                  <TableHead className="hidden lg:table-cell font-semibold text-foreground">Prix</TableHead>
                  <TableHead className="font-semibold text-foreground">Stock</TableHead>
                  <TableHead className="w-[100px] font-semibold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (Array.from({ length: 6 }).map((_, i) => (<TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={6} className="py-8">
                        <div className="flex items-center gap-3 animate-pulse">
                          <div className="w-10 h-10 bg-gray-200 rounded-md"/>
                          <div className="h-5 bg-gray-200 rounded w-32"/>
                          <div className="h-5 bg-gray-200 rounded w-16"/>
                          <div className="h-5 bg-gray-200 rounded w-20"/>
                        </div>
                      </TableCell>
                    </TableRow>))) : filteredProducts.length === 0 ? (<TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-2 opacity-50"/>
                      {productsSearch ? (<p>{'Aucun r\u00e9sultat pour la recherche \u00ab '}{productsSearch}{' \u00bb'}</p>) : (<p>Aucun produit</p>)}
                    </TableCell>
                  </TableRow>) : (filteredProducts.map((product) => {
            const stockQty = product.stock?.[user.storeId] ?? 0;
            const hasStock = product.stock && Object.keys(product.stock).length > 0;
            const isLow = hasStock && product.minStock != null && stockQty <= product.minStock;
            const potentialStockValueLabel = getPotentialStockValueLabel(product);
            const potentialStockValueToneClass = getPotentialStockValueToneClass(product);
            return (<TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {product.imageUrl ? (<div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                                <img src={normalizeImageUrl(product.imageUrl)} alt="" className="w-full h-full object-cover"/>
                              </div>) : (<div className="w-9 h-9 rounded-md flex-shrink-0 bg-muted flex items-center justify-center">
                                <Package className="w-4 h-4 text-muted-foreground/50"/>
                              </div>)}
                            <span className="text-sm font-medium truncate max-w-[160px]">{product.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{product.sku}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {product.categoryId ? (<span className="text-xs text-primary font-medium">{getCategoryName(product.categoryId)}</span>) : (<span className="text-xs text-muted-foreground">—</span>)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {product.salePrice ? `${product.salePrice} FCFA` : (<span className="text-muted-foreground text-xs italic">Variable</span>)}
                        </TableCell>
                        <TableCell>
                          {hasStock ? (<div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-semibold text-sm ${stockQty <= 0 ? 'text-red-500' : ''}`}>
                                  {canViewExactStock ? stockQty : (stockQty > 0 ? 'Disponible' : 'Rupture')}
                                </span>
                                {canViewExactStock ? (<span className="text-muted-foreground text-xs">{product.unit}</span>) : null}
                                {isLow && (<span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                                    {'\u26a0 stock bas'}
                                  </span>)}
                              </div>
                              {canViewStockValueAmounts ? (<div className="text-xs font-medium text-foreground">
                                  Valeur totale:{' '}
                                  <span className={potentialStockValueToneClass}>{potentialStockValueLabel}</span>
                                </div>) : null}
                            </div>) : (<div className="space-y-1">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Non suivi
                              </span>
                              {canViewStockValueAmounts ? (<div className="text-xs font-medium text-foreground">
                                  Valeur totale:{' '}
                                  <span className={potentialStockValueToneClass}>{potentialStockValueLabel}</span>
                                </div>) : null}
                            </div>)}
                        </TableCell>
                        <TableCell>
                          {user.role !== 'manager' ? (<div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} title="Modifier">
                                <Edit className="w-4 h-4"/>
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} title="Supprimer">
                                <Trash2 className="w-4 h-4"/>
                              </Button>
                            </div>) : (<span className="text-muted-foreground text-xs">Via ajustement</span>)}
                        </TableCell>
                      </TableRow>);
        }))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>);
}
