import { useEffect, useMemo, useState } from 'react';
import { Gift, Wallet, Store, ArrowDownToLine, RefreshCw, Ticket, BadgePercent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { BACKEND_BASE } from '@/lib/backend';
import { toast } from 'sonner';

type AmbassadorPayload = {
  id: string;
  username: string;
  phone: string;
  promoCode?: string | null;
  commissionRate?: number | null;
  withdrawalPhone?: string | null;
};

type StoreItem = {
  id: string;
  name: string;
  address?: string;
  active?: boolean | number;
  subscriptionEnd?: number;
};

type CommissionItem = {
  id: string;
  storeName: string;
  commissionAmount: number;
  amountBase: number;
  createdAt: number;
};

type WithdrawalItem = {
  id: string;
  amount: number;
  phone?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  note?: string | null;
  requestedAt: number;
};

type DashboardResponse = {
  success: boolean;
  ambassador: AmbassadorPayload;
  stats: {
    totalRevenue: number;
    pendingWithdrawals: number;
    paidWithdrawals: number;
    availableBalance: number;
    storesCount: number;
    commissionsCount: number;
  };
  stores: StoreItem[];
  commissions: CommissionItem[];
  withdrawals: WithdrawalItem[];
};

function formatMoney(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString('fr-FR')} F`;
}

function getWithdrawalStatusLabel(status: WithdrawalItem['status']) {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'approved':
      return 'Approuve';
    case 'rejected':
      return 'Rejete';
    case 'paid':
      return 'Paye';
    default:
      return status;
  }
}

export default function AmbassadorDashboard() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [payload, setPayload] = useState<DashboardResponse | null>(null);
  const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalPhone, setWithdrawalPhone] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/ambassador_dashboard.php?_ts=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Chargement impossible');
      }
      setPayload(json);
      setWithdrawalPhone(json?.ambassador?.withdrawalPhone || json?.ambassador?.phone || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'ambassador') {
      return;
    }
    void loadDashboard();
  }, [user?.role]);

  const availableBalance = payload?.stats.availableBalance || 0;
  const pendingAmount = payload?.stats.pendingWithdrawals || 0;
  const paidAmount = payload?.stats.paidWithdrawals || 0;

  const recentStores = useMemo(() => payload?.stores || [], [payload]);
  const recentCommissions = useMemo(() => (payload?.commissions || []).slice(0, 8), [payload]);
  const recentWithdrawals = useMemo(() => (payload?.withdrawals || []).slice(0, 8), [payload]);

  const submitWithdrawal = async () => {
    const amount = Number(withdrawalAmount);
    if (!amount || amount <= 0) {
      toast.error('Saisissez un montant valide');
      return;
    }
    if (amount > availableBalance) {
      toast.error('Le montant dépasse votre solde disponible');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/ambassador_dashboard.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          phone: withdrawalPhone,
          note: withdrawalNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Demande refusée');
      }
      toast.success('Demande de retrait envoyée');
      setShowWithdrawalDialog(false);
      setWithdrawalAmount('');
      setWithdrawalNote('');
      await loadDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la demande');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.role !== 'ambassador') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Accès réservé aux ambassadeurs.</CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading && !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 px-4 pb-8 pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
                <Gift className="h-7 w-7" />
                Dashboard ambassadeur
              </h1>
              <p className="mt-1 text-sm text-blue-100 sm:text-base">
                Suivi de vos magasins parrainés et de votre commission unique sur premier abonnement.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25" onClick={() => void loadDashboard()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualiser
              </Button>
              <Button className="bg-white text-slate-900 hover:bg-blue-50" onClick={() => setShowWithdrawalDialog(true)} disabled={availableBalance <= 0}>
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Demander un retrait
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-7xl space-y-6 px-4 pb-10">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Solde disponible</p><p className="mt-1 text-2xl font-bold">{formatMoney(availableBalance)}</p></div><Wallet className="h-5 w-5 text-emerald-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Total revenus</p><p className="mt-1 text-2xl font-bold">{formatMoney(payload?.stats.totalRevenue || 0)}</p></div><BadgePercent className="h-5 w-5 text-blue-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Montants retirés</p><p className="mt-1 text-2xl font-bold">{formatMoney(paidAmount)}</p></div><ArrowDownToLine className="h-5 w-5 text-amber-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Magasins parrainés</p><p className="mt-1 text-2xl font-bold">{payload?.stats.storesCount || 0}</p></div><Store className="h-5 w-5 text-violet-600" /></div></CardContent></Card>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Code promo</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{payload?.ambassador?.promoCode || 'Non défini'}</Badge>
                <span className="text-sm text-muted-foreground">Commission: {Number(payload?.ambassador?.commissionRate || 50)}%</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div><strong className="text-foreground">{payload?.ambassador?.username}</strong></div>
              <div>{payload?.ambassador?.phone || 'Sans téléphone'}</div>
              <div>Retraits en attente: {formatMoney(pendingAmount)}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Magasins parrainés</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recentStores.length === 0 ? <p className="text-sm text-muted-foreground">Aucun magasin lié pour le moment.</p> : recentStores.map((storeItem) => (
                <div key={storeItem.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{storeItem.name}</div>
                      <div className="text-sm text-muted-foreground">{storeItem.address || 'Adresse non renseignée'}</div>
                    </div>
                    <Badge variant="outline">{storeItem.active ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Commissions encaissées</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recentCommissions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune commission pour le moment.</p> : recentCommissions.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.storeName}</div>
                      <div className="text-sm text-muted-foreground">
                        Premier abonnement: {formatMoney(item.amountBase)} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <div className="font-bold text-emerald-700">{formatMoney(item.commissionAmount)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Historique des retraits</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentWithdrawals.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande de retrait.</p> : recentWithdrawals.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">{formatMoney(item.amount)}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(item.requestedAt).toLocaleString('fr-FR')} · {item.phone || 'Téléphone non renseigné'}
                    </div>
                    {item.note ? <div className="mt-1 text-sm text-muted-foreground">{item.note}</div> : null}
                  </div>
                  <Badge variant={item.status === 'paid' ? 'default' : 'outline'}>{getWithdrawalStatusLabel(item.status)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showWithdrawalDialog} onOpenChange={setShowWithdrawalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander un retrait</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Solde disponible: <strong>{formatMoney(availableBalance)}</strong>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-amount">Montant</Label>
              <Input id="withdrawal-amount" inputMode="numeric" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Ex: 2500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-phone">Téléphone de retrait</Label>
              <Input id="withdrawal-phone" value={withdrawalPhone} onChange={(e) => setWithdrawalPhone(e.target.value)} placeholder="+226xxxxxxxx" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-note">Note</Label>
              <Textarea id="withdrawal-note" value={withdrawalNote} onChange={(e) => setWithdrawalNote(e.target.value)} placeholder="Optionnel" rows={3} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowWithdrawalDialog(false)}>Annuler</Button>
              <Button className="flex-1" onClick={() => void submitWithdrawal()} disabled={isSubmitting}>
                {isSubmitting ? 'Envoi...' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
