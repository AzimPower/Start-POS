import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { BACKEND_BASE } from '@/lib/backend';
import { getDB } from '@/lib/db';
import { resolveUserOpenShift } from '@/lib/sync';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SalesChart from '@/components/SalesChart';
import ProductSalesChart from '@/components/ProductSalesChart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, BarChart3, TrendingUp as TrendingUpIcon, Download, FileSpreadsheet, FileText, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Package, RefreshCcw, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatReceiptNumber } from '@/lib/receiptNumber';
import { buildBypassUrl } from '@/lib/salesSync';
import { cn } from '@/lib/utils';
import { DollarSign, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';

type DashboardViewSnapshot = {
    chartData: any[];
    salesByProduct: any[];
    recapStats: any;
    stats: {
        todaySales: number;
        todayTransactions: number;
        balance: number;
        activeShift: any;
    };
    cashierStats: {
        backendSales: number;
        pendingLocalSales: number;
        combinedSales: number;
        pendingOpsCount: number;
    };
    cashierLocalStats: {
        totalSales: number;
        transactions: number;
        refunds: number;
        pendingLocalSales: number;
        pendingOpsCount: number;
        activeShift: any;
    };
};

let lastDashboardViewSnapshot: DashboardViewSnapshot | null = null;
function percentChange(delta: number, previous: number) {
    if (previous === 0) {
        return delta === 0 ? 0 : 100;
    }
    return (delta / previous) * 100;
}
export default function Dashboard() {
    const [calendarMonthCount, setCalendarMonthCount] = useState<number>(() => typeof window !== 'undefined' && window.innerWidth >= 1280 ? 2 : 1);
    // Sélection de période
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [startTime, setStartTime] = useState<string>('00:00');
    const [endTime, setEndTime] = useState<string>('23:59');
    const [showPeriodSelector, setShowPeriodSelector] = useState(false);
    const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
    const [productChartType, setProductChartType] = useState<'bar' | 'pie'>('bar');
    const [groupBy, setGroupBy] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>('hours');
    // Données dynamiques filtrées par période
    const [chartData, setChartData] = useState<any[]>(() => lastDashboardViewSnapshot?.chartData || []);
    const [salesByProduct, setSalesByProduct] = useState<any[]>(() => lastDashboardViewSnapshot?.salesByProduct || []);
    const [recapStats, setRecapStats] = useState<any>(() => lastDashboardViewSnapshot?.recapStats || {
        ventesBrutes: 0,
        remboursements: 0,
        surplus: 0,
        manque: 0,
        ventesNettes: 0,
        margeBrute: 0,
        evolVentes: 0,
        evolRemboursements: 0,
        evolSurplus: 0,
        evolManque: 0,
        evolNettes: 0,
        evolMarge: 0,
    });
    useEffect(() => {
        filterDataByPeriod();
        // eslint-disable-next-line
    }, [startDate, endDate, startTime, endTime, groupBy]);
    useEffect(() => {
        const handleResize = () => {
            setCalendarMonthCount(window.innerWidth >= 1280 ? 2 : 1);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Raccourcis de période
    const setPeriodShortcut = (shortcut: string) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const nowYear = today.getFullYear();
        switch (shortcut) {
            case 'today':
                setStartDate(today);
                setEndDate(today);
                setStartTime('00:00');
                setEndTime('23:59');
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                setStartDate(yesterday);
                setEndDate(yesterday);
                setStartTime('00:00');
                setEndTime('23:59');
                break;
            case 'thisWeek':
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Lundi
                setStartDate(startOfWeek);
                setEndDate(today);
                setStartTime('00:00');
                setEndTime('23:59');
                break;
            case 'thisMonth':
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                setStartDate(startOfMonth);
                setEndDate(today);
                setStartTime('08:00'); // Heure d'ouverture par défaut
                setEndTime('18:00'); // Heure de fermeture par défaut
                break;
            case 'last7days':
                const last7 = new Date(today);
                last7.setDate(today.getDate() - 7);
                setStartDate(last7);
                setEndDate(today);
                setStartTime('00:00');
                setEndTime('23:59');
                break;
            case 'last30days':
                const last30 = new Date(today);
                last30.setDate(today.getDate() - 30);
                setStartDate(last30);
                setEndDate(today);
                setStartTime('00:00');
                setEndTime('23:59');
                break;
        }
        setShowPeriodSelector(false);
    };
    // Fonction pour calculer le nombre de jours dans la période actuelle
    const getPeriodDurationInDays = () => {
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 pour inclure le dernier jour
    };
    // Fonction pour naviguer vers la période précédente
    const goToPreviousPeriod = () => {
        const durationDays = getPeriodDurationInDays();
        const newEndDate = new Date(startDate);
        newEndDate.setDate(startDate.getDate() - 1);
        const newStartDate = new Date(newEndDate);
        newStartDate.setDate(newEndDate.getDate() - durationDays + 1);
        setStartDate(newStartDate);
        setEndDate(newEndDate);
    };
    // Fonction pour naviguer vers la période suivante
    const goToNextPeriod = () => {
        const durationDays = getPeriodDurationInDays();
        const newStartDate = new Date(endDate);
        newStartDate.setDate(endDate.getDate() + 1);
        const newEndDate = new Date(newStartDate);
        newEndDate.setDate(newStartDate.getDate() + durationDays - 1);
        // Ne pas aller au-delà d'aujourd'hui
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (newEndDate > today) {
            return; // Ne rien faire si la période suivante dépasse aujourd'hui
        }
        setStartDate(newStartDate);
        setEndDate(newEndDate);
    };
    async function computeLocalDashboardMetrics(startTs: number, endTs: number, previous?: { start: number; end: number; }) {
        const db = await getDB();
        const [allSales, allShifts, allProducts] = await Promise.all([
            db.getAll('sales'),
            db.getAll('shifts'),
            db.getAll('products'),
        ]);
        const startMinutes = user?.role === 'cashier' ? 0 : (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]));
        const endMinutes = user?.role === 'cashier' ? (23 * 60 + 59) : (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]));
        const withinScope = (record: any) => {
            if (user?.role === 'cashier') {
                return String(record?.userId || '') === String(user.id || '');
            }
            if (user?.storeId) {
                return String(record?.storeId || '') === String(user.storeId || '');
            }
            return true;
        };
        const withinHourRange = (timestamp: number) => {
            const date = new Date(timestamp);
            const minutes = date.getHours() * 60 + date.getMinutes();
            return minutes >= startMinutes && minutes <= endMinutes;
        };
        const periodSales = allSales.filter((sale: any) => {
            const createdAt = Number(sale?.createdAt || 0);
            return createdAt >= startTs && createdAt <= endTs && withinHourRange(createdAt) && withinScope(sale);
        });
        const confirmedSales = periodSales.filter((sale: any) => !sale.refunded);
        const refundedSales = periodSales.filter((sale: any) => !!sale.refunded);
        const ventesBrutes = confirmedSales.reduce((sum: number, sale: any) => sum + (Number(sale?.total) || 0), 0);
        const remboursements = refundedSales.reduce((sum: number, sale: any) => sum + (Number(sale?.total) || 0), 0);
        const productById = new Map<string, any>(allProducts.map((product: any) => [String(product?.id || ''), product]));
        const productTotals = new Map<string, { name: string; quantity: number; total: number; }>();
        let margeBrute = 0;
        for (const sale of confirmedSales) {
            const saleItems = Array.isArray(sale?.items) ? sale.items : [];
            for (const item of saleItems) {
                const quantity = Number(item?.quantity) || 0;
                const price = Number(item?.price) || 0;
                const total = price * quantity;
                const product = productById.get(String(item?.productId || ''));
                const targetMargin = Number(product?.targetMargin);
                const costPrice = Number(product?.costPrice);
                const unitMargin = Number.isFinite(targetMargin) && targetMargin !== 0
                    ? price * (targetMargin / 100)
                    : (Number.isFinite(costPrice) && costPrice !== 0 ? price - costPrice : price - (Number.isFinite(costPrice) ? costPrice : 0));
                margeBrute += unitMargin * quantity;
                const key = String(item?.productId || item?.name || 'unknown');
                const current = productTotals.get(key) || { name: String(item?.name || product?.name || 'Unknown'), quantity: 0, total: 0 };
                current.quantity += quantity;
                current.total += total;
                productTotals.set(key, current);
            }
        }
        const closedShifts = allShifts.filter((shift: any) => String(shift?.status || '') === 'closed' && Number(shift?.closedAt || 0) >= startTs && Number(shift?.closedAt || 0) <= endTs && withinScope(shift));
        let surplus = 0;
        let manque = 0;
        for (const shift of closedShifts) {
            const difference = Number(shift?.difference);
            if (!Number.isFinite(difference))
                continue;
            if (difference > 0)
                surplus += difference;
            if (difference < 0)
                manque += Math.abs(difference);
        }
        const bucketLabel = (timestamp: number) => {
            const date = new Date(timestamp);
            switch (groupBy) {
                case 'minutes': return format(date, 'dd MMM yy, HH:mm', { locale: fr });
                case 'hours': return format(date, "dd MMM yy, HH'h'", { locale: fr });
                case 'weeks': {
                    const startOfWeek = new Date(date);
                    startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
                    startOfWeek.setHours(0, 0, 0, 0);
                    return format(startOfWeek, 'dd MMM yy', { locale: fr });
                }
                case 'months': return format(date, 'MMM yyyy', { locale: fr });
                case 'days':
                default: return format(date, 'dd MMM yy', { locale: fr });
            }
        };
        const bucketKey = (timestamp: number) => {
            const date = new Date(timestamp);
            switch (groupBy) {
                case 'minutes': return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
                case 'hours': return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
                case 'weeks': {
                    const startOfWeek = new Date(date);
                    startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
                    startOfWeek.setHours(0, 0, 0, 0);
                    return String(startOfWeek.getTime());
                }
                case 'months': return `${date.getFullYear()}-${date.getMonth()}`;
                case 'days':
                default: return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            }
        };
        const grouped = new Map<string, { date: string; ventes: number; sortValue: number; }>();
        for (const sale of confirmedSales) {
            const createdAt = Number(sale?.createdAt || 0);
            const key = bucketKey(createdAt);
            const current = grouped.get(key) || { date: bucketLabel(createdAt), ventes: 0, sortValue: createdAt };
            current.ventes += Number(sale?.total) || 0;
            current.sortValue = Math.min(current.sortValue, createdAt);
            grouped.set(key, current);
        }
        let previousMetrics = { ventesBrutes: 0, remboursements: 0, surplus: 0, manque: 0, margeBrute: 0 };
        if (previous) {
            previousMetrics = await computeLocalDashboardMetrics(previous.start, previous.end);
        }
        const evolVentes = ventesBrutes - previousMetrics.ventesBrutes;
        const evolRemboursements = remboursements - previousMetrics.remboursements;
        const evolSurplus = surplus - previousMetrics.surplus;
        const evolManque = manque - previousMetrics.manque;
        const evolMarge = margeBrute - previousMetrics.margeBrute;
        return {
            chartData: Array.from(grouped.values()).sort((a, b) => a.sortValue - b.sortValue).map(({ date, ventes }) => ({ date, ventes })),
            salesByProduct: Array.from(productTotals.values()).sort((a, b) => b.total - a.total).slice(0, 10),
            recapStats: {
                ventesBrutes,
                remboursements,
                surplus,
                manque,
                ventesNettes: ventesBrutes,
                margeBrute,
                margeBrutePourcent: ventesBrutes !== 0 ? (margeBrute / ventesBrutes) * 100 : 0,
                evolVentes,
                evolVentesPercent: percentChange(evolVentes, previousMetrics.ventesBrutes),
                evolRemboursements,
                evolRemboursementsPercent: percentChange(evolRemboursements, previousMetrics.remboursements),
                evolSurplus,
                evolSurplusPercent: percentChange(evolSurplus, previousMetrics.surplus),
                evolManque,
                evolManquePercent: percentChange(evolManque, previousMetrics.manque),
                evolNettes: evolVentes,
                evolMarge,
                evolMargePercent: percentChange(evolMarge, previousMetrics.margeBrute),
            },
            ventesBrutes,
            remboursements,
            surplus,
            manque,
            margeBrute,
        };
    }
    async function filterDataByPeriod() {
        // Call backend for stats/chart data so charts source from server-side
        let start, end;
        if (user?.role === 'cashier') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            start = today.getTime();
            end = new Date().getTime();
        }
        else {
            start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), parseInt(startTime.split(':')[0]), parseInt(startTime.split(':')[1])).getTime();
            end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), parseInt(endTime.split(':')[0]), parseInt(endTime.split(':')[1])).getTime();
        }
        const periodLength = end - start;
        const prevStart = start - periodLength - 1;
        const prevEnd = start - 1;
        if (!isBackendReachable && user?.role !== 'cashier') {
            try {
                const local = await computeLocalDashboardMetrics(start, end, { start: prevStart, end: prevEnd });
                setChartData(local.chartData);
                setSalesByProduct(local.salesByProduct);
                setRecapStats(local.recapStats);
            }
            catch (e) {
            }
            return;
        }
        try {
            const params = new URLSearchParams();
            params.set('start', String(start));
            params.set('end', String(end));
            params.set('groupBy', groupBy);
            // Ajouter les paramètres d'heure pour filtrer par heures de la journée
            if (user?.role !== 'cashier') {
                params.set('startHour', startTime);
                params.set('endHour', endTime);
            }
            if (user?.role === 'cashier')
                params.set('userId', String(user.id));
            else if (user?.storeId)
                params.set('storeId', String(user.storeId));
            const resp = await fetch(buildBypassUrl(`${BACKEND_BASE}/api/sales_stats.php`, params), { cache: 'no-store' });
            if (!resp.ok)
                throw new Error('API error');
            const json = await resp.json();
            if (json.chartData)
                setChartData(json.chartData);
            if (json.salesByProduct)
                setSalesByProduct(json.salesByProduct);
            if (json.recapStats) {
                // Calculer surplus/manque localement (période courante + précédente) pour overrider le backend
                try {
                    const periodLength = end - start;
                    const prevStart = start - periodLength - 1;
                    const prevEnd = start - 1;
                    const [local, localPrev] = await Promise.all([
                        computeSurplusManqueForRange(start, end),
                        computeSurplusManqueForRange(prevStart, prevEnd),
                    ]);
                    const evolSurplusVal = local.surplus - localPrev.surplus;
                    const evolManqueVal = local.manque - localPrev.manque;
                    const pct = (delta: number, prev: number) => prev === 0 ? (delta === 0 ? 0 : 100) : (delta / prev) * 100;
                    setRecapStats({
                        ...json.recapStats,
                        surplus: local.surplus,
                        manque: local.manque,
                        evolSurplus: evolSurplusVal,
                        evolManque: evolManqueVal,
                        evolSurplusPercent: pct(evolSurplusVal, localPrev.surplus),
                        evolManquePercent: pct(evolManqueVal, localPrev.manque),
                    });
                }
                catch (e) {
                    setRecapStats((prev: any) => ({
                        ...json.recapStats,
                        surplus: prev.surplus,
                        manque: prev.manque,
                        evolSurplus: prev.evolSurplus,
                        evolManque: prev.evolManque,
                        evolSurplusPercent: prev.evolSurplusPercent,
                        evolManquePercent: prev.evolManquePercent,
                    }));
                }
            }
        }
        catch (err) {
            // Fallback: compute surplus/manque locally pour la période courante + précédente
            try {
                const periodLength = end - start;
                const prevStart = start - periodLength - 1;
                const prevEnd = start - 1;
                const local = await computeLocalDashboardMetrics(start, end, { start: prevStart, end: prevEnd });
                setChartData(local.chartData);
                setSalesByProduct(local.salesByProduct);
                setRecapStats(local.recapStats);
            }
            catch (e) {
            }
        }
    }
    // Calcule surplus et manque pour une plage donnée en interrogeant la DB locale.
    // On filtre les shifts fermés dont `closedAt` est dans l'intervalle [start, end].
    async function computeSurplusManqueForRange(startTs: number, endTs: number) {
        const db = await getDB();
        let allShifts = await db.getAll('shifts');
        let closedShifts = allShifts.filter((s: any) => s.status === 'closed' && s.closedAt && s.closedAt >= startTs && s.closedAt <= endTs);
        if (user?.role === 'cashier') {
            closedShifts = closedShifts.filter((s: any) => s.userId === user.id);
        }
        else if (user?.storeId) {
            closedShifts = closedShifts.filter((s: any) => s.storeId === user.storeId);
        }
        let surplus = 0, manque = 0;
        for (const shift of closedShifts) {
            let difference: number | null = null;
            // Lire shift.difference tel que stocké à la fermeture (sans dépenses)
            // Formule de Shifts.tsx : expectedAmount = opening + encaisseNet (dépenses exclues)
            if (shift.difference !== null && shift.difference !== undefined && !isNaN(Number(shift.difference))) {
                difference = Number(shift.difference);
            }
            else if (shift.closingAmount !== null && shift.closingAmount !== undefined) {
                // Fallback pour anciens shifts sans difference stocké
                const opening = shift.openingAmount ? Number(shift.openingAmount) : 0;
                let encaisseNet = 0;
                try {
                    const db2 = await getDB();
                    const sales = await db2.getAllFromIndex('sales', 'by-shift', shift.id);
                    for (const sale of sales) {
                        const t = Number(sale.total) || 0;
                        if (sale.refunded) {
                            encaisseNet -= t;
                        }
                        else {
                            encaisseNet += t;
                        }
                    }
                }
                catch (e) {
                    // ignore per-shift read errors
                }
                const expected = opening + encaisseNet;
                difference = Number(shift.closingAmount) - expected;
            }
            if (typeof difference === 'number' && !isNaN(difference)) {
                if (difference > 0)
                    surplus += difference;
                if (difference < 0)
                    manque += Math.abs(difference);
            }
        }
        return { surplus, manque };
    }
    const { user } = useAuth();
    const [stats, setStats] = useState(() => lastDashboardViewSnapshot?.stats || {
        todaySales: 0,
        todayTransactions: 0,
        balance: 0,
        activeShift: null as any,
    });
    const { isBackendReachable } = useNetwork();
    const [cashierStats, setCashierStats] = useState(() => lastDashboardViewSnapshot?.cashierStats || {
        backendSales: 0,
        pendingLocalSales: 0,
        combinedSales: 0,
        pendingOpsCount: 0,
    });
    const [cashierLocalStats, setCashierLocalStats] = useState(() => lastDashboardViewSnapshot?.cashierLocalStats || {
        totalSales: 0,
        transactions: 0,
        refunds: 0,
        pendingLocalSales: 0,
        pendingOpsCount: 0,
        activeShift: null as any,
    });
    // Fonctions d'exportation
    const exportToExcel = async () => {
        const db = await getDB();
        // Récupérer les ventes de la période pour le tableau détaillé
        const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), parseInt(startTime.split(':')[0]), parseInt(startTime.split(':')[1])).getTime();
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), parseInt(endTime.split(':')[0]), parseInt(endTime.split(':')[1])).getTime();
        let filteredSales = (await db.getAll('sales')).filter(sale => sale.createdAt >= start && sale.createdAt <= end);
        if (user?.role === 'cashier') {
            filteredSales = filteredSales.filter(sale => sale.userId === user.id);
        }
        else if (user?.storeId) {
            // If the user is scoped to a store, export only receipts for that store
            filteredSales = filteredSales.filter(sale => sale.storeId === user.storeId);
        }
        // Try to obtain store metadata (name/logo) for filename and PDF header
        let storeNameForFile = '';
        try {
            if (user?.storeId) {
                const rec = await db.get('stores', user.storeId);
                if (rec && rec.name)
                    storeNameForFile = String(rec.name);
                // also persist storeLogo into localStorage if present
                if (rec && (rec as any).logo) {
                    try {
                        localStorage.setItem('storeLogo', (rec as any).logo);
                    }
                    catch (e) { }
                }
            }
        }
        catch (e) {
        }
        // Créer le contenu CSV avec séparateur point-virgule pour Excel français
        const headers = ['N° Reçu', 'Date', 'Heure', 'Montant', 'Mode paiement', 'Articles', 'Statut'];
        const csvRows = [
            headers.join(';'), // Utiliser point-virgule comme séparateur pour Excel français
            ...filteredSales.map(sale => [
              formatReceiptNumber(sale, filteredSales),
                new Date(sale.createdAt).toLocaleDateString('fr-FR'),
                new Date(sale.createdAt).toLocaleTimeString('fr-FR'),
                sale.total,
                sale.paymentMethod === 'cash' ? 'Espèces' : sale.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Mixte',
                sale.items.map(item => `${item.name} (${item.quantity})`).join(' | '), // Utiliser | pour séparer les articles
                sale.refunded ? 'Remboursé' : 'Validé'
            ].map(cell => {
                // Nettoyer les cellules et éviter les caractères problématiques
                const cellStr = String(cell).replace(/;/g, ',').replace(/"/g, ''); // Remplacer ; par , dans le contenu
                return cellStr;
            }).join(';')) // Joindre avec point-virgule
        ];
        const csvContent = csvRows.join('\r\n'); // Utiliser CRLF pour Windows/Excel
        // Ajouter BOM UTF-8 pour Excel
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], {
            type: 'text/csv;charset=utf-8;'
        });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        // sanitize store name for filename
        const sanitize = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
        const fileStorePart = storeNameForFile ? `${sanitize(storeNameForFile)}` : (user?.storeId ? `store-${user.storeId}` : 'all_stores');
        link.setAttribute('download', `recus_${fileStorePart}_${format(startDate, 'dd-MM-yyyy')}_${format(endDate, 'dd-MM-yyyy')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const exportToPDF = async () => {
        const db = await getDB();
        // Récupérer les ventes de la période
        const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), parseInt(startTime.split(':')[0]), parseInt(startTime.split(':')[1])).getTime();
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), parseInt(endTime.split(':')[0]), parseInt(endTime.split(':')[1])).getTime();
        let filteredSales = (await db.getAll('sales')).filter(sale => sale.createdAt >= start && sale.createdAt <= end);
        if (user?.role === 'cashier') {
            filteredSales = filteredSales.filter(sale => sale.userId === user.id);
        }
        else if (user?.storeId) {
            // Ensure PDF export respects the user's store scope
            filteredSales = filteredSales.filter(sale => sale.storeId === user.storeId);
        }
        // Try to obtain store metadata (name/logo) for header and filename
        let storeName = '';
        let storeLogo = '';
        try {
            if (user?.storeId) {
                const rec = await db.get('stores', user.storeId);
                if (rec && rec.name)
                    storeName = String(rec.name);
                if (rec && (rec as any).logo)
                    storeLogo = String((rec as any).logo);
            }
            // fallback to localStorage
            if (!storeLogo)
                storeLogo = localStorage.getItem('storeLogo') || '';
        }
        catch (e) {
        }
        // Normalize logo URL if it's a backend-relative path
        try {
            if (storeLogo && !storeLogo.startsWith('http') && storeLogo.includes('/img_products/')) {
                storeLogo = storeLogo.startsWith('/') ? `${BACKEND_BASE}${storeLogo}` : `${BACKEND_BASE}/${storeLogo}`;
            }
        }
        catch (e) { }
        // Créer une page HTML pour impression/PDF avec tableau des reçus
        const printContent = `
      <html>
        <head>
          <title>Rapport des reçus${storeName ? ' - ' + storeName : ''}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .header { text-align: center; margin-bottom: 20px; }
            .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
            .summary-card { border: 1px solid #ddd; padding: 8px; border-radius: 5px; text-align: center; }
            .amount { text-align: right; }
            .status-remburse { color: #dc2626; font-weight: bold; }
            .status-valide { color: #16a34a; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            ${storeLogo ? `<div><img src="${storeLogo}" alt="logo" style="max-height:60px; max-width:180px; display:block; margin:0 auto 8px;"/></div>` : ''}
            ${storeName ? `<div style="font-weight:700; margin-bottom:4px;">${storeName}</div>` : ''}
            <h1>Rapport des reçus</h1>
            <p>Période: ${format(startDate, 'dd/MM/yyyy', { locale: fr })} - ${format(endDate, 'dd/MM/yyyy', { locale: fr })}</p>
            <p>Total des reçus: ${filteredSales.length}</p>
          </div>
          
          <div class="summary">
            <div class="summary-card">
              <h3>Total ventes</h3>
              <p>${filteredSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA</p>
            </div>
            <div class="summary-card">
              <h3>Reçus validés</h3>
              <p>${filteredSales.filter(s => !s.refunded).length}</p>
            </div>
            <div class="summary-card">
              <h3>Reçus remboursés</h3>
              <p>${filteredSales.filter(s => s.refunded).length}</p>
            </div>
            <div class="summary-card">
              <h3>Espèces</h3>
              <p>${filteredSales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + (Number(s.total) || 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA</p>
            </div>
            <div class="summary-card">
              <h3>Mobile Money</h3>
              <p>${filteredSales.filter(s => s.paymentMethod === 'mobile_money').reduce((sum, s) => sum + (Number(s.total) || 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>N° Reçu</th>
                <th>Date</th>
                <th>Heure</th>
                <th>Montant</th>
                <th>Mode paiement</th>
                <th>Articles</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.map(sale => `
                <tr>
                  <td>${formatReceiptNumber(sale, filteredSales)}</td>
                  <td>${new Date(sale.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td>${new Date(sale.createdAt).toLocaleTimeString('fr-FR')}</td>
                  <td class="amount">${(Number(sale.total) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA</td>
                  <td>${sale.paymentMethod === 'cash' ? 'Espèces' : sale.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Mixte'}</td>
                  <td>${sale.items.map(item => `${item.name} (${item.quantity})`).join(', ')}</td>
                  <td class="${sale.refunded ? 'status-remburse' : 'status-valide'}">${sale.refunded ? 'Remboursé' : 'Validé'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
        const printWindow = window.open('', '_blank');
        printWindow?.document.write(printContent);
        printWindow?.document.close();
        printWindow?.print();
    };
    useEffect(() => {
        loadStats();
        filterDataByPeriod();
        // load cashier stats initially and when connection goes offline
        loadCashierStats();
    }, []);
    // Recompute local cashier stats whenever connection status changes to offline
    useEffect(() => {
        if (!isBackendReachable && user?.role === 'cashier') {
            loadCashierStats();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBackendReachable]);
    useEffect(() => {
        lastDashboardViewSnapshot = {
            chartData,
            salesByProduct,
            recapStats,
            stats,
            cashierStats,
            cashierLocalStats,
        };
    }, [chartData, salesByProduct, recapStats, stats, cashierStats, cashierLocalStats]);
    const loadStats = async () => {
        const db = await getDB();
        // Get today's sales
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const allSales = await db.getAll('sales');
        // Filtrer les ventes selon le rôle de l'utilisateur
        let todaySalesData = allSales.filter(sale => sale.createdAt >= todayTimestamp);
        // Si caissier, afficher uniquement ses propres ventes
        if (user?.role === 'cashier') {
            todaySalesData = todaySalesData.filter(sale => sale.userId === user.id);
        }
        // Si admin, filtrer par magasin
        else if (user?.storeId) {
            todaySalesData = todaySalesData.filter(sale => sale.storeId === user.storeId);
        }
        const todaySalesTotal = todaySalesData.reduce((sum, sale) => sum + sale.total, 0);
        // Calculer la balance à partir des shifts fermés d'aujourd'hui uniquement
        const allShifts = await db.getAll('shifts');
        let closedShifts = allShifts.filter(s => s.status === 'closed' && s.closedAt && s.closedAt >= todayTimestamp);
        if (user?.role === 'cashier') {
            closedShifts = closedShifts.filter(s => s.userId === user.id);
        }
        else if (user?.storeId) {
            closedShifts = closedShifts.filter(s => s.storeId === user.storeId);
        }
        let balance = 0;
        for (const shift of closedShifts) {
            // Utiliser shift.difference directement (valeur stockée à la fermeture, sans dépenses)
            if (shift.difference !== null && shift.difference !== undefined && !isNaN(Number(shift.difference))) {
                balance += Number(shift.difference);
            }
        }
        // Get active shift
        const userShift = await resolveUserOpenShift(user?.id, user?.storeId, { syncWithBackend: isBackendReachable });
        setStats({
            todaySales: todaySalesTotal,
            todayTransactions: todaySalesData.length,
            balance: balance,
            activeShift: userShift,
        });
        // Ne pas mettre à jour surplus/manque ici, c'est géré par filterDataByPeriod()
    };
    // Compute cashier stats purely from local DB: ventes, transactions, remboursements, pending ops, shifts
    const loadCashierStats = async () => {
        const db = await getDB();
        try {
            const allSales = await db.getAll('sales');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let localTodaySales = allSales.filter(s => s.createdAt >= today.getTime());
            if (user?.role === 'cashier')
                localTodaySales = localTodaySales.filter(s => s.userId === user.id);
            else if (user?.storeId)
                localTodaySales = localTodaySales.filter(s => s.storeId === user.storeId);
            // total sales (exclude refunded from total amount calculation)
            const refundedSales = localTodaySales.filter(s => s.refunded);
            const refundsAmount = refundedSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            const confirmedSales = localTodaySales.filter(s => !s.refunded);
            const totalSales = confirmedSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            const transactions = localTodaySales.length;
            // Pending local sales from syncQueue (created offline, not yet synced)
            const syncQueue = await db.getAll('syncQueue');
            const pendingSalesOps = syncQueue.filter((op: any) => op.table === 'sales' && (!op.processed));
            const pendingOpsCount = pendingSalesOps.filter((op: any) => {
                if (user?.role === 'cashier')
                    return op.data?.userId === user.id;
                if (user?.storeId)
                    return op.data?.storeId === user.storeId;
                return true;
            }).length;
            const pendingLocalSales = pendingSalesOps.reduce((sum: number, op: any) => {
                if (user?.role === 'cashier' && op.data?.userId !== user.id)
                    return sum;
                if (user?.storeId && op.data?.storeId !== user.storeId)
                    return sum;
                const dataTotal = op.data?.total ? Number(op.data.total) : 0;
                return sum + dataTotal;
            }, 0);
            // Active shift
            const activeShift = await resolveUserOpenShift(user?.id, user?.storeId, { syncWithBackend: isBackendReachable });
            setCashierLocalStats({
                totalSales,
                transactions,
                refunds: refundsAmount,
                pendingLocalSales,
                pendingOpsCount,
                activeShift,
            });
        }
        catch (err) {
        }
    };
    // Helpers for safe formatting
    const formatCurrency = (value: any) => {
        const n = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
    };
    const formatPercent = (part: any, total: any) => {
        const p = typeof part === 'number' ? part : parseFloat(String(part)) || 0;
        const t = typeof total === 'number' ? total : parseFloat(String(total)) || 0;
        if (!isFinite(p) || !isFinite(t) || t === 0)
            return '0%';
        return `${((p / t) * 100).toFixed(2)}%`;
    };
    const statCards = [
        // Ensure numeric values are parsed/sanitized before calling toFixed (avoid runtime errors when value is not a number)
        {
            title: "Ventes du jour",
            value: ` ${formatCurrency(stats.todaySales)} F`,
            icon: DollarSign,
            color: "text-success",
        },
        {
            title: "Transactions",
            value: stats.todayTransactions.toString(),
            icon: ShoppingCart,
            color: "text-primary",
        },
        {
            title: "Balance",
            value: `${(typeof stats.balance === 'number' ? stats.balance : parseFloat(String(stats.balance)) || 0) >= 0 ? '+' : ''} ${formatCurrency(stats.balance)} F`,
            icon: Wallet,
            color: (typeof stats.balance === 'number' ? stats.balance : parseFloat(String(stats.balance)) || 0) >= 0 ? "text-success" : "text-destructive",
        },
        {
            title: "Shift",
            value: stats.activeShift ? "En cours" : "Fermé",
            icon: TrendingUp,
            color: stats.activeShift ? "text-success" : "text-muted-foreground",
        },
    ];
    return (<div className="p-4 sm:p-6 space-y-5 min-h-screen max-h-screen overflow-y-auto bg-background">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Bienvenue, <span className="font-semibold text-foreground">{user?.username}</span>
          </p>
        </div>
        <span className="self-start sm:self-auto text-xs text-muted-foreground bg-muted/60 border px-3 py-1.5 rounded-full">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        </span>
      </div>

      {/* KPI admin */}
      {user?.role !== 'cashier' && (<div className="grid gap-3 grid-cols-2 lg:grid-cols-3">

          {/* Ventes brutes */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
            <div className="h-1 bg-emerald-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ventes brutes</CardTitle>
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
                {formatCurrency(recapStats.ventesBrutes)} <span className="text-sm font-normal text-muted-foreground">F</span>
              </div>
              <div className={`flex items-center gap-0.5 mt-1 text-[11px] ${(Number(recapStats.evolVentes) || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {(Number(recapStats.evolVentes) || 0) >= 0 ? (<ArrowUpRight className="w-3 h-3 shrink-0"/>) : (<ArrowDownRight className="w-3 h-3 shrink-0"/>)}
                {`${(Number(recapStats.evolVentes) || 0) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(Number(recapStats.evolVentes) || 0))} F (${((Number(recapStats.evolVentesPercent) || 0)).toFixed(2)}%)`}
              </div>
            </CardContent>
          </Card>

          {/* Remboursements */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
            <div className="h-1 bg-orange-400 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Remboursements</CardTitle>
                <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <RefreshCcw className="w-3.5 h-3.5 text-orange-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-orange-700 dark:text-orange-400 leading-tight">
                {formatCurrency(recapStats.remboursements)} <span className="text-sm font-normal text-muted-foreground">F</span>
              </div>
              <div className="flex items-center gap-0.5 mt-1 text-[11px] text-success">
                <ArrowUpRight className="w-3 h-3 shrink-0"/>
                {formatCurrency(recapStats.evolRemboursements)} F ({(recapStats.evolRemboursementsPercent ?? 0).toFixed(2)}%)
              </div>
            </CardContent>
          </Card>

          {/* Surplus */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
            <div className="h-1 bg-blue-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Surplus</CardTitle>
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400 leading-tight">
                {formatCurrency(recapStats.surplus)} <span className="text-sm font-normal text-muted-foreground">F</span>
              </div>
              <div className="flex items-center gap-0.5 mt-1 text-[11px] text-success">
                <ArrowUpRight className="w-3 h-3 shrink-0"/>
                {formatCurrency(recapStats.evolSurplus)} F ({(recapStats.evolSurplusPercent ?? 0).toFixed(2)}%)
              </div>
            </CardContent>
          </Card>

          {/* Manque */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background">
            <div className="h-1 bg-red-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Manque</CardTitle>
                <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-3.5 h-3.5 text-red-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-red-700 dark:text-red-400 leading-tight">
                {formatCurrency(recapStats.manque)} <span className="text-sm font-normal text-muted-foreground">F</span>
              </div>
              <div className="flex items-center gap-0.5 mt-1 text-[11px] text-destructive">
                <ArrowDownRight className="w-3 h-3 shrink-0"/>
                {formatCurrency(recapStats.evolManque)} F ({(recapStats.evolManquePercent ?? 0).toFixed(2)}%)
              </div>
            </CardContent>
          </Card>

          {/* Marchandises */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
            <div className="h-1 bg-purple-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Marchandises</CardTitle>
                <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-purple-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {(() => {
                const ventes = Number(recapStats.ventesBrutes) || 0;
                const marge = Number(recapStats.margeBrute) || 0;
                const cost = ventes - marge;
                const percent = ventes > 0 ? ((cost / ventes) * 100).toFixed(2) : '0.00';
                return (<>
                    <div className="text-xl font-bold text-purple-700 dark:text-purple-400 leading-tight">
                      {formatCurrency(cost)} <span className="text-sm font-normal text-muted-foreground">F</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{percent}% des ventes nettes</div>
                  </>);
            })()}
            </CardContent>
          </Card>

          {/* Marge brute */}
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-background">
            <div className="h-1 bg-teal-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Marge brute</CardTitle>
                <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-3.5 h-3.5 text-teal-600"/>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-teal-700 dark:text-teal-400 leading-tight">
                {formatCurrency(recapStats.margeBrute)} <span className="text-sm font-normal text-muted-foreground">F</span>
              </div>
              <div className={`mt-1 text-[11px] ${recapStats.margeBrutePourcent > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                {recapStats.margeBrutePourcent > 0 ? `${(typeof recapStats.margeBrutePourcent === 'number' ? recapStats.margeBrutePourcent : parseFloat(String(recapStats.margeBrutePourcent)) || 0).toFixed(2)}%` : '0%'} de marge
              </div>
            </CardContent>
          </Card>

        </div>)}

      {/* KPI caissier hors-ligne */}
      {user?.role === 'cashier' && !isBackendReachable && (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-emerald-50 to-white">
            <div className="h-1 bg-emerald-500 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ventes (local)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-emerald-700">{formatCurrency(cashierLocalStats.totalSales)} <span className="text-sm font-normal text-muted-foreground">F</span></div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{cashierLocalStats.transactions} transactions</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-orange-50 to-white">
            <div className="h-1 bg-orange-400 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Remboursements</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-orange-700">{formatCurrency(cashierLocalStats.refunds)} <span className="text-sm font-normal text-muted-foreground">F</span></div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Montant remboursé aujourd'hui</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-yellow-50 to-white">
            <div className="h-1 bg-yellow-400 w-full"/>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">En attente (local)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-bold text-yellow-700">{formatCurrency(cashierLocalStats.pendingLocalSales)} <span className="text-sm font-normal text-muted-foreground">F</span></div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{cashierLocalStats.pendingOpsCount} ops en file</div>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm overflow-hidden bg-gradient-to-br ${cashierLocalStats.activeShift ? 'from-green-50 to-white' : 'from-gray-50 to-white'}`}>
            <div className={`h-1 w-full ${cashierLocalStats.activeShift ? 'bg-green-500' : 'bg-gray-300'}`}/>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Shift</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-xl font-bold ${cashierLocalStats.activeShift ? 'text-green-700' : 'text-muted-foreground'}`}>
                {cashierLocalStats.activeShift ? 'En cours' : 'Aucun'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Etat du shift courant</div>
            </CardContent>
          </Card>
        </div>)}

      {/* Section admin : période + graphiques */}
      {user?.role === 'admin' && (<>
          {/* Sélecteur de période */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarIcon className="w-4 h-4 text-primary"/>
                  </div>
                  <CardTitle className="text-base font-semibold">Période d'analyse</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportToExcel} className="flex items-center gap-1.5 text-xs">
                    <FileSpreadsheet className="w-3.5 h-3.5"/>
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportToPDF} className="flex items-center gap-1.5 text-xs">
                    <FileText className="w-3.5 h-3.5"/>
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Navigation + sélecteur de date */}
                <div className="flex gap-2 items-center">
                  <Button variant="outline" size="icon" onClick={goToPreviousPeriod} title="Période précédente" className="shrink-0">
                    <ChevronLeft className="h-4 w-4"/>
                  </Button>
                  <Popover open={showPeriodSelector} onOpenChange={setShowPeriodSelector}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground"/>
                        {startDate && endDate ? (<span className="font-medium">
                            {format(startDate, 'dd/MM/yyyy', { locale: fr })} — {format(endDate, 'dd/MM/yyyy', { locale: fr })}
                          </span>) : (<span>Sélectionner une période</span>)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 flex flex-col xl:flex-row max-w-none" align="start">
                      {/* Raccourcis à gauche - optimisé pour desktop */}
                      <div className="xl:border-r p-2 space-y-1 w-full xl:min-w-[220px]">
                        <p className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wide">Raccourcis</p>
                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1">
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('today')}>Aujourd'hui</Button>
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('yesterday')}>Hier</Button>
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('thisWeek')}>Cette semaine</Button>
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('thisMonth')}>Ce mois</Button>
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('last7days')}>Il y a 7 jours</Button>
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('last30days')}>Il y a 30 jours</Button>
                        </div>
                      </div>
                      {/* Calendrier à droite - optimisé pour desktop */}
                      <div className="p-3">
                        <Calendar mode="range" selected={{ from: startDate, to: endDate }} onSelect={(range) => {
                if (range?.from)
                    setStartDate(range.from);
                if (range?.to)
                    setEndDate(range.to);
            }} locale={fr} numberOfMonths={calendarMonthCount} // 2 mois sur desktop, 1 sur mobile
         disabled={(date) => date > new Date() || date < new Date('1900-01-01')} defaultMonth={endDate} toDate={new Date()} className="xl:border-0"/>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="icon" onClick={goToNextPeriod} title="Période suivante" className="shrink-0" disabled={(() => {
                const durationDays = getPeriodDurationInDays();
                const newStartDate = new Date(endDate);
                newStartDate.setDate(endDate.getDate() + 1);
                const newEndDate = new Date(newStartDate);
                newEndDate.setDate(newStartDate.getDate() + durationDays - 1);
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                return newEndDate > today;
            })()}>
                    <ChevronRight className="h-4 w-4"/>
                  </Button>
                </div>
                {/* Sélection des heures */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Heure de début</Label>
                    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="max-w-[130px]"/>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Heure de fin</Label>
                    <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="max-w-[130px]"/>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Graphique des ventes par produit */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 text-orange-600"/>
                  </div>
                  <CardTitle className="text-base font-semibold">Ventes par produit</CardTitle>
                </div>
                <Select value={productChartType} onValueChange={(value: 'bar' | 'pie') => setProductChartType(value)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">
                      <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/><span>Barres</span></div>
                    </SelectItem>
                    <SelectItem value="pie">
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-orange-500 inline-block"/><span>Circulaire</span></div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {salesByProduct && salesByProduct.length > 0 ? (<ProductSalesChart data={salesByProduct} chartType={productChartType}/>) : (<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="w-10 h-10 mb-2 opacity-25"/>
                  <p className="text-sm">Aucune donnée disponible</p>
                </div>)}
            </CardContent>
          </Card>

          {/* Graphique ventes brutes */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <TrendingUpIcon className="w-4 h-4 text-emerald-600"/>
                  </div>
                  <CardTitle className="text-base font-semibold">Ventes brutes</CardTitle>
                </div>
                <div className="flex gap-2">
                  {/* Sélecteur de type de graphique */}
                  <Select value={chartType} onValueChange={(value: 'line' | 'bar') => setChartType(value)}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">
                        <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/><span>Colonnes</span></div>
                      </SelectItem>
                      <SelectItem value="line">
                        <div className="flex items-center gap-2"><TrendingUpIcon className="w-4 h-4"/><span>Courbe</span></div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Sélecteur de regroupement */}
                  <Select value={groupBy} onValueChange={(value: 'minutes' | 'hours' | 'days' | 'weeks' | 'months') => setGroupBy(value)}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Heures</SelectItem>
                      <SelectItem value="days">Jours</SelectItem>
                      <SelectItem value="weeks">Semaines</SelectItem>
                      <SelectItem value="months">Mois</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SalesChart data={chartData} xKey="date" yKey="ventes" chartType={chartType} color="#4ade80"/>
            </CardContent>
          </Card>
        </>)}
    </div>);
}
