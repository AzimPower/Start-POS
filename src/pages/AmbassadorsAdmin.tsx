import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BACKEND_BASE } from '@/lib/backend';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Gift, RefreshCw, Wallet, ArrowDownToLine, BadgePercent, Store, CheckCircle2, XCircle, Clock3 } from 'lucide-react';

type AdminWithdrawal = {
  id: string;
  ambassadorUserId: string;
  ambassadorUsername: string;
  ambassadorPhone?: string | null;
  ambassadorPromoCode?: string | null;
  amount: number;
  phone?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  note?: string | null;
  requestedAt: number;
  processedAt?: number | null;
};

type AdminAmbassador = {
  id: string;
  username: string;
  phone: string;
  email?: string | null;
  promoCode?: string | null;
  commissionRate?: number | null;
  withdrawalPhone?: string | null;
  stats: {
    totalRevenue: number;
    pendingWithdrawals: number;
    paidWithdrawals: number;
    availableBalance: number;
    storesCount: number;
    commissionsCount: number;
  };
};

type AdminResponse = {
  success: boolean;
  summary: {
    ambassadorsCount: number;
    storesLinkedCount: number;
    commissionsTotal: number;
    pendingWithdrawalsTotal: number;
    paidWithdrawalsTotal: number;
    availableBalancesTotal: number;
    pendingWithdrawalsCount: number;
  };
  ambassadors: AdminAmbassador[];
  withdrawals: AdminWithdrawal[];
};

function formatMoney(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString('fr-FR')} F`;
}

function getWithdrawalStatusLabel(status: AdminWithdrawal['status']) {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'approved':
      return 'Paye';
    case 'rejected':
      return 'Rejete';
    case 'paid':
      return 'Paye';
    default:
      return status;
  }
}

export default function AmbassadorsAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [payload, setPayload] = useState<AdminResponse | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawal | null>(null);
  const [nextStatus, setNextStatus] = useState<'rejected' | 'paid'>('paid');
  const [adminNote, setAdminNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/ambassador_admin.php?_ts=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Chargement impossible');
      }
      setPayload(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    void loadData();
  }, [user?.role, navigate]);

  const filteredAmbassadors = useMemo(() => {
    const list = payload?.ambassadors || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter((item) => {
      return (item.username || '').toLowerCase().includes(q)
        || (item.phone || '').toLowerCase().includes(q)
        || (item.promoCode || '').toLowerCase().includes(q);
    });
  }, [payload?.ambassadors, searchQuery]);

  const pendingWithdrawals = useMemo(() => {
    return (payload?.withdrawals || []).filter((item) => item.status === 'pending');
  }, [payload?.withdrawals]);

  const updateWithdrawalStatus = async () => {
    if (!selectedWithdrawal) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/ambassador_admin.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedWithdrawal.id,
          status: nextStatus,
          note: adminNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Mise a jour impossible');
      }
      toast.success('Retrait mis a jour');
      setSelectedWithdrawal(null);
      setAdminNote('');
      setNextStatus('paid');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la mise a jour');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const summary = payload?.summary;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 px-4 pb-8 pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
                <Gift className="h-7 w-7" />
                Ambassadeurs
              </h1>
              <p className="mt-1 text-sm text-blue-100 sm:text-base">
                Gérez les ambassadeurs, leurs commissions et les demandes de retrait.
              </p>
            </div>
            <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25" onClick={() => void loadData()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-7xl space-y-6 px-4 pb-10">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Ambassadeurs</p><p className="mt-1 text-2xl font-bold">{summary?.ambassadorsCount || 0}</p></div><Gift className="h-5 w-5 text-cyan-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Magasins liés</p><p className="mt-1 text-2xl font-bold">{summary?.storesLinkedCount || 0}</p></div><Store className="h-5 w-5 text-violet-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Commissions</p><p className="mt-1 text-2xl font-bold">{formatMoney(summary?.commissionsTotal || 0)}</p></div><BadgePercent className="h-5 w-5 text-emerald-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Solde total</p><p className="mt-1 text-2xl font-bold">{formatMoney(summary?.availableBalancesTotal || 0)}</p></div><Wallet className="h-5 w-5 text-blue-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Retraits en attente</p><p className="mt-1 text-2xl font-bold">{summary?.pendingWithdrawalsCount || 0}</p></div><Clock3 className="h-5 w-5 text-amber-600" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Retraits payés</p><p className="mt-1 text-2xl font-bold">{formatMoney(summary?.paidWithdrawalsTotal || 0)}</p></div><ArrowDownToLine className="h-5 w-5 text-rose-600" /></div></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Ambassadeurs</CardTitle>
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher nom, téléphone ou code promo..." className="sm:max-w-xs" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredAmbassadors.length === 0 ? <p className="text-sm text-muted-foreground">Aucun ambassadeur trouvé.</p> : filteredAmbassadors.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{item.username}</div>
                        <Badge className="bg-cyan-600 text-white hover:bg-cyan-600">{item.promoCode || 'Sans code'}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.phone} {item.withdrawalPhone ? `· Retrait: ${item.withdrawalPhone}` : ''}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                      <div className="rounded-xl bg-muted/40 px-3 py-2"><div className="text-xs text-muted-foreground">Revenus</div><div className="font-semibold">{formatMoney(item.stats.totalRevenue)}</div></div>
                      <div className="rounded-xl bg-muted/40 px-3 py-2"><div className="text-xs text-muted-foreground">Disponible</div><div className="font-semibold">{formatMoney(item.stats.availableBalance)}</div></div>
                      <div className="rounded-xl bg-muted/40 px-3 py-2"><div className="text-xs text-muted-foreground">En attente</div><div className="font-semibold">{formatMoney(item.stats.pendingWithdrawals)}</div></div>
                      <div className="rounded-xl bg-muted/40 px-3 py-2"><div className="text-xs text-muted-foreground">Magasins</div><div className="font-semibold">{item.stats.storesCount}</div></div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Retraits à traiter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingWithdrawals.length === 0 ? <p className="text-sm text-muted-foreground">Aucun retrait en attente.</p> : pendingWithdrawals.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.ambassadorUsername}</div>
                      <div className="text-sm text-muted-foreground">{item.ambassadorPromoCode || 'Sans code promo'} · {item.phone || item.ambassadorPhone || 'Sans numéro'}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{new Date(item.requestedAt).toLocaleString('fr-FR')}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-700">{formatMoney(item.amount)}</div>
                      <Badge variant="outline">{getWithdrawalStatusLabel(item.status)}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setSelectedWithdrawal(item); setNextStatus('paid'); setAdminNote(item.note || ''); }}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Marquer payé
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => { setSelectedWithdrawal(item); setNextStatus('rejected'); setAdminNote(item.note || ''); }}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Historique des retraits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(payload?.withdrawals || []).length === 0 ? <p className="text-sm text-muted-foreground">Aucun retrait enregistré.</p> : (payload?.withdrawals || []).map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/60 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold">{item.ambassadorUsername} · {formatMoney(item.amount)}</div>
                    <div className="text-sm text-muted-foreground">{item.ambassadorPromoCode || 'Sans code promo'} · {item.phone || item.ambassadorPhone || 'Sans numéro'} · {new Date(item.requestedAt).toLocaleString('fr-FR')}</div>
                    {item.note ? <div className="mt-1 text-sm text-muted-foreground">{item.note}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === 'paid' || item.status === 'approved' ? 'default' : 'outline'}>{getWithdrawalStatusLabel(item.status)}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => { if (!open) { setSelectedWithdrawal(null); setAdminNote(''); setNextStatus('paid'); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traiter le retrait</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              {selectedWithdrawal ? (
                <>
                  <div><strong>{selectedWithdrawal.ambassadorUsername}</strong></div>
                  <div>Montant: <strong>{formatMoney(selectedWithdrawal.amount)}</strong></div>
                  <div>Téléphone: {selectedWithdrawal.phone || selectedWithdrawal.ambassadorPhone || 'Non renseigné'}</div>
                </>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-note">Note admin</Label>
              <Textarea id="admin-note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={4} placeholder="Optionnel" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedWithdrawal(null)}>Annuler</Button>
              <Button className="flex-1" onClick={() => void updateWithdrawalStatus()} disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement...' : nextStatus === 'rejected' ? 'Rejeter' : 'Marquer payé'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
