import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { getDB } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SalesChart from '@/components/SalesChart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, BarChart3, TrendingUp as TrendingUpIcon, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DollarSign, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';

export default function Dashboard() {
  // Sélection de période
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
  const [groupBy, setGroupBy] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>('hours');
  // Données dynamiques filtrées par période
  const [chartData, setChartData] = useState<any[]>([]);
  const [recapStats, setRecapStats] = useState<any>({
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

  // Raccourcis de période
  const setPeriodShortcut = (shortcut: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const nowYear = today.getFullYear();
    switch(shortcut) {
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
      case 'thisYear':
        const startOfYear = new Date(nowYear, 0, 1);
        setStartDate(startOfYear);
        setEndDate(today);
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
      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 6);
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(today.getDate() - today.getDay());
        setStartDate(lastWeekStart);
        setEndDate(lastWeekEnd);
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'thisMonth':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        setStartDate(startOfMonth);
        setEndDate(today);
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        setStartDate(lastMonthStart);
        setEndDate(lastMonthEnd);
        setStartTime('00:00');
        setEndTime('23:59');
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

  async function filterDataByPeriod() {
    // Call backend for stats/chart data so charts source from server-side
    let start, end;
    if (user?.role === 'cashier') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      start = today.getTime();
      end = new Date().getTime();
    } else {
      start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), parseInt(startTime.split(':')[0]), parseInt(startTime.split(':')[1])).getTime();
      end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), parseInt(endTime.split(':')[0]), parseInt(endTime.split(':')[1])).getTime();
    }

    try {
      const params = new URLSearchParams();
      params.set('start', String(start));
      params.set('end', String(end));
      params.set('groupBy', groupBy);
      if (user?.role === 'cashier') params.set('userId', String(user.id));
      else if (user?.storeId) params.set('storeId', String(user.storeId));

      const resp = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales_stats.php?${params.toString()}`);
      if (!resp.ok) throw new Error('API error');
      const json = await resp.json();
      if (json.chartData) setChartData(json.chartData);
      if (json.recapStats) {
        // Fusionne les valeurs locales de surplus/manque si elles existent
        setRecapStats((prev: any) => ({
          ...json.recapStats,
          surplus: prev.surplus,
          manque: prev.manque,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch server stats, falling back to local DB aggregation', err);
      // Fallback: keep previous local aggregation behavior (not reimplemented here)
    }
  }
  const { user } = useAuth();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayTransactions: 0,
    balance: 0,
    activeShift: null as any,
  });

  const { isOnline } = useNetwork();

  const [cashierStats, setCashierStats] = useState({
    backendSales: 0,
    pendingLocalSales: 0,
    combinedSales: 0,
    pendingOpsCount: 0,
  });

  const [cashierLocalStats, setCashierLocalStats] = useState({
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
    } else if (user?.storeId) {
      // If the user is scoped to a store, export only receipts for that store
      filteredSales = filteredSales.filter(sale => sale.storeId === user.storeId);
    }

    // Try to obtain store metadata (name/logo) for filename and PDF header
    let storeNameForFile = '';
    try {
      if (user?.storeId) {
        const rec = await db.get('stores', user.storeId);
        if (rec && rec.name) storeNameForFile = String(rec.name);
        // also persist storeLogo into localStorage if present
        if (rec && (rec as any).logo) {
          try { localStorage.setItem('storeLogo', (rec as any).logo); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('failed to read store metadata for export', e);
    }

    // Créer le contenu CSV avec séparateur point-virgule pour Excel français
    const headers = ['N° Reçu', 'Date', 'Heure', 'Montant', 'Mode paiement', 'Articles', 'Statut'];
    
    const csvRows = [
      headers.join(';'), // Utiliser point-virgule comme séparateur pour Excel français
      ...filteredSales.map(sale => [
        sale.id.substring(0, 8).toUpperCase(),
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
    } else if (user?.storeId) {
      // Ensure PDF export respects the user's store scope
      filteredSales = filteredSales.filter(sale => sale.storeId === user.storeId);
    }

    // Try to obtain store metadata (name/logo) for header and filename
    let storeName = '';
    let storeLogo = '';
    try {
      if (user?.storeId) {
        const rec = await db.get('stores', user.storeId);
  if (rec && rec.name) storeName = String(rec.name);
  if (rec && (rec as any).logo) storeLogo = String((rec as any).logo);
      }
      // fallback to localStorage
      if (!storeLogo) storeLogo = localStorage.getItem('storeLogo') || '';
    } catch (e) {
      console.warn('failed to read store metadata for pdf export', e);
    }

    // Normalize logo URL if it's a backend-relative path
    try {
      if (storeLogo && !storeLogo.startsWith('http') && storeLogo.includes('/img_products/')) {
        const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
        storeLogo = storeLogo.startsWith('/') ? `${API_BASE}${storeLogo}` : `${API_BASE}/${storeLogo}`;
      }
    } catch (e) {}

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
                  <td>${sale.id.substring(0, 8).toUpperCase()}</td>
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
    // load cashier stats initially and when connection goes offline
    loadCashierStats();
  }, []);

  // Recompute local cashier stats whenever connection status changes to offline
  useEffect(() => {
    if (!isOnline && user?.role === 'cashier') {
      loadCashierStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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
    
    // Calculer surplus et manque à partir des shifts fermés en recalculant l'écart comme dans ShiftReceiptDetails
    const allShifts = await db.getAll('shifts');
    let closedShifts = allShifts.filter(s => s.status === 'closed');
    if (user?.role === 'cashier') {
      closedShifts = closedShifts.filter(s => s.userId === user.id);
    } else if (user?.storeId) {
      closedShifts = closedShifts.filter(s => s.storeId === user.storeId);
    }
    let surplus = 0, manque = 0, balance = 0;
    for (const shift of closedShifts) {
      // Recalcule l'écart comme dans ShiftReceiptDetails
      const opening = shift.openingAmount ? Number(shift.openingAmount) : 0;
      let salesTotal = 0;
      let expensesTotal = 0;
      try {
        const db2 = await getDB();
        const sales = await db2.getAllFromIndex('sales', 'by-shift', shift.id);
        for (const sale of sales) {
          salesTotal += (typeof sale.total === 'number' && !isNaN(sale.total)) ? Number(sale.total) : (Number(sale.total) || 0);
        }
        const expenses = await db2.getAllFromIndex('expenses', 'by-shift', shift.id);
        for (const ex of expenses) {
          expensesTotal += (typeof ex.amount === 'number' && !isNaN(ex.amount)) ? Number(ex.amount) : (Number(ex.amount) || 0);
        }
      } catch {}
      const expected = opening + salesTotal - expensesTotal;
      let difference = null;
      if (shift.closingAmount !== null && shift.closingAmount !== undefined) {
        difference = Number(shift.closingAmount) - expected;
      }
      if (typeof difference === 'number' && !isNaN(difference)) {
        balance += difference;
        if (difference > 0) surplus += difference;
        if (difference < 0) manque += Math.abs(difference);
      }
    }
    // Get active shift
    const shifts = await db.getAllFromIndex('shifts', 'by-status', 'open');
    const userShift = shifts.find(s => s.userId === user?.id);

    setStats({
      todaySales: todaySalesTotal,
      todayTransactions: todaySalesData.length,
      balance: balance,
      activeShift: userShift,
    });
    setRecapStats((prev: any) => ({
      ...prev,
      surplus,
      manque,
    }));
  };

  // Compute cashier stats purely from local DB: ventes, transactions, remboursements, pending ops, shifts
  const loadCashierStats = async () => {
    const db = await getDB();
    try {
      const allSales = await db.getAll('sales');
      const today = new Date();
      today.setHours(0,0,0,0);
      let localTodaySales = allSales.filter(s => s.createdAt >= today.getTime());
      if (user?.role === 'cashier') localTodaySales = localTodaySales.filter(s => s.userId === user.id);
      else if (user?.storeId) localTodaySales = localTodaySales.filter(s => s.storeId === user.storeId);

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
        if (user?.role === 'cashier') return op.data?.userId === user.id;
        if (user?.storeId) return op.data?.storeId === user.storeId;
        return true;
      }).length;
      const pendingLocalSales = pendingSalesOps.reduce((sum: number, op: any) => {
        if (user?.role === 'cashier' && op.data?.userId !== user.id) return sum;
        if (user?.storeId && op.data?.storeId !== user.storeId) return sum;
        const dataTotal = op.data?.total ? Number(op.data.total) : 0;
        return sum + dataTotal;
      }, 0);

      // Active shift
      const openShifts = await db.getAllFromIndex('shifts', 'by-status', 'open');
      const activeShift = openShifts.find((s: any) => s.userId === user?.id) || null;

      setCashierLocalStats({
        totalSales,
        transactions,
        refunds: refundsAmount,
        pendingLocalSales,
        pendingOpsCount,
        activeShift,
      });
    } catch (err) {
      console.error('Erreur lors du calcul des stats locales du caissier', err);
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
      if (!isFinite(p) || !isFinite(t) || t === 0) return '0%';
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

  return (
    <div className="p-6 space-y-6 min-h-screen max-h-screen overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">Bienvenue, {user?.username}</p>
      </div>

      {/* Récapitulatif des ventes admin (affiché uniquement en ligne) */}
  {isOnline && (
  <div className="grid gap-2 grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
        {/* Optimisé mobile : moins de padding, texte plus petit, chiffres plus compacts */}
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Ventes brutes</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
            <div className="text-lg font-bold leading-tight"> {formatCurrency(recapStats.ventesBrutes)} F</div>
            <div className="text-[11px] text-destructive"> - {formatCurrency(Math.abs(recapStats.evolVentes))} F ({(recapStats.evolVentesPercent ?? 0).toFixed(2)}%)</div>
          </CardContent>
        </Card>
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Remboursements</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
            <div className="text-lg font-bold leading-tight"> {formatCurrency(recapStats.remboursements)} F</div>
            <div className="text-[11px] text-success"> {formatCurrency(recapStats.evolRemboursements)} F ({(recapStats.evolRemboursementsPercent ?? 0).toFixed(2)}%)</div>
          </CardContent>
        </Card>
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Surplus</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
            <div className="text-lg font-bold leading-tight"> {formatCurrency(recapStats.surplus)} F</div>
            <div className="text-[11px] text-success"> {formatCurrency(recapStats.evolSurplus)} F ({(recapStats.evolSurplusPercent ?? 0).toFixed(2)}%)</div>
          </CardContent>
        </Card>
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Manque</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
            <div className="text-lg font-bold leading-tight"> {formatCurrency(recapStats.manque)} F</div>
            <div className="text-[11px] text-destructive"> {formatCurrency(recapStats.evolManque)} F ({(recapStats.evolManquePercent ?? 0).toFixed(2)}%)</div>
          </CardContent>
        </Card>
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Marchandises</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
              {(() => {
                const ventes = Number(recapStats.ventesBrutes) || 0;
                const marge = Number(recapStats.margeBrute) || 0;
                const cost = ventes - marge;
                // Calcul du pourcentage du coût des marchandises par rapport aux ventes brutes
                const percent = ventes > 0 ? ((cost / ventes) * 100).toFixed(2) : '0.00';
                return (
                  <>
                    <div className="text-lg font-bold leading-tight"> {formatCurrency(cost)} F</div>
                    <div className="text-[11px] text-success">{percent}%</div>
                  </>
                );
              })()}
          </CardContent>
        </Card>
        <Card className="p-2 sm:p-4">
          <CardHeader className="pb-1 px-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Marge brute</CardTitle>
          </CardHeader>
          <CardContent className="px-2 py-1">
            <div className="text-lg font-bold leading-tight"> {formatCurrency(recapStats.margeBrute)} F</div>
            <div className={`text-[11px] ${recapStats.margeBrutePourcent > 0 ? 'text-success' : 'text-muted-foreground'}`}>{recapStats.margeBrutePourcent > 0 ? `+${(typeof recapStats.margeBrutePourcent === 'number' ? recapStats.margeBrutePourcent : parseFloat(String(recapStats.margeBrutePourcent)) || 0).toFixed(2)}%` : '0%'}</div>
          </CardContent>
        </Card>
    </div>
  )}

  {user?.role === 'cashier' && !isOnline && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Card className="p-2">
            <CardHeader className="pb-1 px-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Ventes (local)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-1">
              <div className="text-lg font-bold"> {formatCurrency(cashierLocalStats.totalSales)} F</div>
              <div className="text-[11px] text-muted-foreground">{cashierLocalStats.transactions} transactions</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardHeader className="pb-1 px-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Remboursements</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-1">
              <div className="text-lg font-bold"> {formatCurrency(cashierLocalStats.refunds)} F</div>
              <div className="text-[11px] text-muted-foreground">Montant remboursé aujourd'hui</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardHeader className="pb-1 px-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">En attente (local)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-1">
              <div className="text-lg font-bold"> {formatCurrency(cashierLocalStats.pendingLocalSales)} F</div>
              <div className="text-[11px] text-muted-foreground">{cashierLocalStats.pendingOpsCount} ops en file</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardHeader className="pb-1 px-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Shift</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-1">
              <div className="text-lg font-bold">{cashierLocalStats.activeShift ? 'En cours' : 'Aucun'}</div>
              <div className="text-[11px] text-muted-foreground">Etat du shift courant</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sélecteur de période et graphique - uniquement pour admin */}
      {user?.role === 'admin' && (
        <>
          {/* Sélecteur de période */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-base font-semibold">Sélectionner la période</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportToExcel} className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                 Export Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportToPDF} className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                 Export PDF
                  </Button>
                </div>
              </div>

            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Affichage de la période sélectionnée */}
                <Popover open={showPeriodSelector} onOpenChange={setShowPeriodSelector}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate && endDate ? (
                        `${format(startDate, 'dd/MM/yyyy', { locale: fr })} - ${format(endDate, 'dd/MM/yyyy', { locale: fr })}`
                      ) : (
                        <span>Sélectionner une période</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 flex flex-col xl:flex-row max-w-none" align="start">
                    {/* Raccourcis à gauche - optimisé pour desktop */}
                    <div className="xl:border-r p-2 space-y-1 w-full xl:min-w-[220px]">
                      <p className="text-xs font-medium text-muted-foreground px-2 py-1">Raccourcis</p>
                      <div className="grid grid-cols-2 xl:grid-cols-1 gap-1">
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('today')}>
                          Aujourd'hui
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('yesterday')}>
                          Hier
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('thisWeek')}>
                          Cette semaine
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('lastWeek')}>
                          La semaine dernière
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('thisMonth')}>
                          Ce mois
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('lastMonth')}>
                          Le mois dernier
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('last7days')}>
                          Il y a 7 jours
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('last30days')}>
                          Il y a 30 jours
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs xl:text-sm" onClick={() => setPeriodShortcut('thisYear')}>
                          Cette année
                        </Button>
                      </div>
                    </div>
                    {/* Calendrier à droite - optimisé pour desktop */}
                    <div className="p-3">
                      <Calendar
                        mode="range"
                        selected={{ from: startDate, to: endDate }}
                        onSelect={(range) => {
                          if (range?.from) setStartDate(range.from);
                          if (range?.to) setEndDate(range.to);
                        }}
                        locale={fr}
                        numberOfMonths={window.innerWidth >= 1280 ? 2 : 1} // 2 mois sur desktop, 1 sur mobile
                        disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                        defaultMonth={endDate}
                        toDate={new Date()}
                        className="xl:border-0"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
                
                {/* Sélection des heures */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Heure de début</Label>
                    <div className="relative">
                      <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="pr-10 max-w-[120px] w-full sm:w-auto" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Heure de fin</Label>
                    <div className="relative">
                      <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="pr-10 max-w-[120px] w-full sm:w-auto" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chart des ventes brutes */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-base font-semibold">Ventes brutes</CardTitle>
                <div className="flex gap-2">
                  {/* Sélecteur de type de graphique */}
                  <Select value={chartType} onValueChange={(value: 'line' | 'bar') => setChartType(value)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          <span>Colonnes</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="line">
                        <div className="flex items-center gap-2">
                          <TrendingUpIcon className="w-4 h-4" />
                          <span>Courbe</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Sélecteur de regroupement */}
                  <Select value={groupBy} onValueChange={(value: 'minutes' | 'hours' | 'days' | 'weeks' | 'months') => setGroupBy(value)}>
                    <SelectTrigger className="w-[140px]">
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
              <SalesChart data={chartData} xKey="date" yKey="ventes" chartType={chartType} color="#4ade80" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
