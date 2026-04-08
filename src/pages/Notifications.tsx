import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { BACKEND_BASE } from '@/lib/backend';
import { getDB } from '@/lib/db';
import { onConnectionStateChange } from '@/lib/sync';
import { AppNotification, CreateNotificationPayload, NotificationKind, NotificationTargetType, UserRole, createNotification, deleteNotification, fetchSentNotifications, formatNotificationExpiry, formatNotificationTimestamp, getNotificationBadgeClassName, getNotificationTargetSummary, getNotificationTypeLabel, isNotificationExpired, } from '@/lib/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { BellRing, ChevronLeft, ChevronRight, Send, ShieldAlert, Trash2 } from 'lucide-react';
interface StoreOption {
    id: string;
    name: string;
}
interface UserOption {
    id: string;
    username: string;
    role: UserRole;
    active?: boolean | number;
}
function normalizeUserOption(raw: Partial<UserOption> & {
    id?: string;
    username?: string;
    role?: UserRole;
}): UserOption {
    return {
        id: String(raw.id || ''),
        username: String(raw.username || raw.id || 'Utilisateur inconnu'),
        role: (raw.role || 'cashier') as UserRole,
        active: raw.active ?? true,
    };
}
function mergeUsersById(currentUsers: UserOption[], incomingUsers: UserOption[]) {
    const usersById = new Map(currentUsers.map((item) => [item.id, item]));
    for (const item of incomingUsers) {
        usersById.set(item.id, item);
    }
    return Array.from(usersById.values());
}
function NotificationList({ title, description, notifications, emptyState, onMarkAsRead, storesById, usersById, showReadCount = false, canDelete = false, onDelete, paginate = false, pageSize = 5, }: {
    title: string;
    description: string;
    notifications: AppNotification[];
    emptyState: string;
    onMarkAsRead?: (notificationId: string) => void;
    storesById?: Record<string, string>;
    usersById?: Record<string, string>;
    showReadCount?: boolean;
    canDelete?: boolean;
    onDelete?: (notificationId: string) => void;
  paginate?: boolean;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = paginate ? Math.max(1, Math.ceil(notifications.length / safePageSize)) : 1;
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);
  const visibleNotifications = paginate
    ? notifications.slice((page - 1) * safePageSize, page * safePageSize)
    : notifications;
    return (<Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-blue-600"/>
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.length === 0 ? (<div className="rounded-xl border border-dashed bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyState}
          </div>) : (visibleNotifications.map((notification) => ((() => {
            const expired = isNotificationExpired(notification);
            return (<div key={notification.id} className={`rounded-xl border px-4 py-4 ${notification.isRead ? 'border-border bg-background' : 'border-blue-200 bg-blue-50/60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getNotificationBadgeClassName(notification.type)}`}>
                      {getNotificationTypeLabel(notification.type)}
                    </span>
                    {!notification.isRead && (<Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        Non lue
                      </Badge>)}
                    {showReadCount && typeof notification.readCount === 'number' && (<Badge variant="outline">{notification.readCount} lecture(s)</Badge>)}
                    {expired && (<Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        Expirée
                      </Badge>)}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{notification.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{notification.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatNotificationExpiry(notification.expiresAt)}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatNotificationTimestamp(notification.createdAt)}</p>
                  <p className="mt-1">{getNotificationTargetSummary(notification, { storesById, usersById })}</p>
                </div>
              </div>
              {(onMarkAsRead && !notification.isRead) || (canDelete && onDelete) ? (<div className="mt-3 flex flex-wrap justify-end gap-2">
                  {canDelete && onDelete && (<Button variant="destructive" size="sm" onClick={() => onDelete(notification.id)}>
                      <Trash2 className="mr-2 h-4 w-4"/>
                      Supprimer
                    </Button>)}
                  {onMarkAsRead && !notification.isRead && (<Button variant="outline" size="sm" onClick={() => onMarkAsRead(notification.id)}>
                    Marquer comme lue
                  </Button>)}
                </div>) : null}
            </div>);
        })()))) }
        {paginate && notifications.length > safePageSize && (<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page} sur {totalPages} · {notifications.length} notification{notifications.length > 1 ? 's' : ''}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>
                <ChevronLeft className="mr-1 h-4 w-4"/>
                
              </Button>
              <span className="min-w-[5.5rem] text-center text-sm font-medium text-foreground">
                {page} / {totalPages}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page === totalPages}>
                
                <ChevronRight className="ml-1 h-4 w-4"/>
              </Button>
            </div>
          </div>)}
      </CardContent>
    </Card>);
}
function toDateTimeLocalValue(timestamp?: number | null): string {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}
function fromDateTimeLocalValue(value: string): number | null {
    if (!value) {
        return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}
export default function Notifications() {
    const { user } = useAuth();
    const { notifications, unreadCount, isLoading, markAsRead, refresh } = useNotifications();
    const [stores, setStores] = useState<StoreOption[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [sentNotifications, setSentNotifications] = useState<AppNotification[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSent, setIsLoadingSent] = useState(false);
    const [form, setForm] = useState<{
        title: string;
        message: string;
        type: NotificationKind;
        targetType: NotificationTargetType;
        targetRole: UserRole;
        targetStoreId: string;
        targetUserId: string;
        expiresAt: string;
    }>({
        title: '',
        message: '',
        type: 'info',
        targetType: 'all',
        targetRole: 'cashier',
        targetStoreId: '',
        targetUserId: '',
        expiresAt: '',
    });
    const isSuperAdmin = user?.role === 'super_admin';
    const storesById = stores.reduce<Record<string, string>>((acc, store) => {
        acc[store.id] = store.name;
        return acc;
    }, {});
    const usersById = users.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.username;
        return acc;
    }, user ? { [user.id]: user.username } : {});
    const targetableUsers = users.filter((item) => item.role !== 'super_admin' && item.active !== false && item.active !== 0);
    const heroBadgeLabel = isSuperAdmin ? 'Centre de notifications' : 'Boîte de réception';
    const heroTitle = isSuperAdmin
        ? 'Diffusez vos annonces sans passer par l’email'
        : 'Consultez les notifications de votre compte';
    const heroDescription = isSuperAdmin
        ? 'Les messages envoyés ici apparaissent directement dans l’application pour les rôles, magasins ou utilisateurs visés.'
        : 'Retrouvez ici les annonces et alertes qui vous concernent dans l’application.';
    const loadSentNotifications = async () => {
        if (!isSuperAdmin || !user) {
            return;
        }
        setIsLoadingSent(true);
        try {
            const items = await fetchSentNotifications(user.id);
            setSentNotifications(items);
        }
        catch (error) {
        }
        finally {
            setIsLoadingSent(false);
        }
    };
    useEffect(() => {
        if (!user) {
            return;
        }
        const loadMeta = async () => {
            try {
                const db = await getDB();
                const localStores = (await db.getAll('stores')) as StoreOption[];
                const localUsers = (await db.getAll('users')) as Array<Partial<UserOption>>;
                if (localStores.length > 0) {
                    setStores(localStores.map((store) => ({ id: store.id, name: store.name })));
                }
                else {
                    const storesResponse = await fetch(`${BACKEND_BASE}/api/stores.php`, { cache: 'no-store' });
                    if (storesResponse.ok) {
                        const remoteStores = await storesResponse.json();
                        setStores(remoteStores.map((store: any) => ({ id: store.id, name: store.name })));
                    }
                }
                if (localUsers.length > 0) {
                    setUsers(localUsers.map(normalizeUserOption));
                }
                const usersResponse = await fetch(`${BACKEND_BASE}/api/users.php`, { cache: 'no-store' });
                if (usersResponse.ok) {
                    const remoteUsers = await usersResponse.json();
                    setUsers((currentUsers) => mergeUsersById(currentUsers, remoteUsers.map(normalizeUserOption)));
                }
            }
            catch (error) {
            }
        };
        void loadMeta();
    }, [user?.id]);
    useEffect(() => {
        if (!isSuperAdmin || !user) {
            setSentNotifications([]);
            return;
        }
        void loadSentNotifications();
    }, [isSuperAdmin, user]);
    useEffect(() => {
        if (!isSuperAdmin || !user) {
            return;
        }
        const unsubscribe = onConnectionStateChange((state) => {
            if (!state.isOnline || state.isSyncing) {
                return;
            }
            void loadSentNotifications();
        });
        return unsubscribe;
    }, [isSuperAdmin, user?.id]);
    if (!user) {
        return null;
    }
    const resetForm = () => {
        setForm({
            title: '',
            message: '',
            type: 'info',
            targetType: 'all',
            targetRole: 'cashier',
            targetStoreId: '',
            targetUserId: '',
            expiresAt: '',
        });
    };
    const handleSubmit = async () => {
        if (!isSuperAdmin) {
            toast.error('Seul le super admin peut envoyer des notifications');
            return;
        }
        if (!form.title.trim() || !form.message.trim()) {
            toast.error('Le titre et le message sont requis');
            return;
        }
        if (form.targetType === 'store' && !form.targetStoreId) {
            toast.error('Sélectionnez un magasin');
            return;
        }
        if (form.targetType === 'user' && !form.targetUserId) {
            toast.error('Sélectionnez un utilisateur');
            return;
        }
        const expiresAt = fromDateTimeLocalValue(form.expiresAt);
        if (form.expiresAt && (!expiresAt || expiresAt <= Date.now())) {
            toast.error('La date d\'expiration doit être dans le futur');
            return;
        }
        const payload: CreateNotificationPayload = {
            senderUserId: user.id,
            senderUsername: user.username,
            senderRole: user.role,
            title: form.title.trim(),
            message: form.message.trim(),
            type: form.type,
            targetType: form.targetType,
            targetRole: form.targetType === 'role' ? form.targetRole : undefined,
            targetStoreId: form.targetType === 'store' ? form.targetStoreId : undefined,
            targetUserId: form.targetType === 'user' ? form.targetUserId : undefined,
            expiresAt,
        };
        setIsSubmitting(true);
        try {
            const result = await createNotification(payload, { viewer: user });
            toast.success(result.queued ? 'Notification enregistrée hors ligne et mise en attente' : 'Notification envoyée');
            resetForm();
            await Promise.all([refresh(), loadSentNotifications()]);
        }
        catch (error) {
            toast.error('Impossible d\'envoyer la notification');
            await Promise.all([refresh(), loadSentNotifications()]);
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const handleDelete = async (notificationId: string) => {
        if (!isSuperAdmin) {
            return;
        }
        if (!window.confirm('Supprimer cette notification de la diffusion ?')) {
            return;
        }
        try {
            const result = await deleteNotification(user.id, notificationId);
            toast.success(result.queued ? 'Suppression enregistrée hors ligne et mise en attente' : 'Notification supprimée');
            await Promise.all([refresh(), loadSentNotifications()]);
        }
        catch (error) {
            toast.error('Impossible de supprimer la notification');
            await Promise.all([refresh(), loadSentNotifications()]);
        }
    };
    return (<div className="min-h-screen bg-slate-50/60 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 px-4 py-5 text-white shadow-xl md:block md:px-6 md:py-8">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-start">
            <div className="max-w-2xl space-y-2 md:space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100 md:gap-2 md:px-3 md:text-xs md:tracking-[0.2em]">
                <ShieldAlert className="h-3.5 w-3.5 md:h-4 md:w-4"/>
                {heroBadgeLabel}
              </div>
              <h1 className="text-xl font-bold leading-tight md:text-3xl">{heroTitle}</h1>
              <p className="max-w-xl text-xs leading-relaxed text-blue-100/90 md:text-base">{heroDescription}</p>
            </div>
            <div className="hidden rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm md:block md:px-4 md:py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-blue-100/80 md:text-xs md:tracking-[0.18em]">Non lues</p>
              <p className="mt-1 text-2xl font-bold leading-none md:text-3xl">{unreadCount}</p>
            </div>
          </div>
        </section>

        {isSuperAdmin && (<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="h-5 w-5 text-blue-600"/>
                  Nouvelle notification
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ciblez tous les utilisateurs, un rôle, un magasin ou une personne précise.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-title">Titre</Label>
                  <Input id="notification-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Maintenance prévue ce soir"/>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(value: NotificationKind) => setForm((current) => ({ ...current, type: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un type"/>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="success">Succès</SelectItem>
                        <SelectItem value="warning">Alerte</SelectItem>
                        <SelectItem value="critical">Critique</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cible</Label>
                    <Select value={form.targetType} onValueChange={(value: NotificationTargetType) => setForm((current) => ({
                ...current,
                targetType: value,
                targetStoreId: '',
                targetUserId: '',
            }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une cible"/>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les utilisateurs</SelectItem>
                        <SelectItem value="role">Un rôle</SelectItem>
                        <SelectItem value="store">Un magasin</SelectItem>
                        <SelectItem value="user">Un utilisateur</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.targetType === 'role' && (<div className="space-y-2">
                    <Label>Rôle ciblé</Label>
                    <Select value={form.targetRole} onValueChange={(value: UserRole) => setForm((current) => ({ ...current, targetRole: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un rôle"/>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrateurs</SelectItem>
                        <SelectItem value="manager">Gestionnaires</SelectItem>
                        <SelectItem value="cashier">Caissiers</SelectItem>
                        <SelectItem value="super_admin">Super admins</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>)}

                {form.targetType === 'store' && (<div className="space-y-2">
                    <Label>Magasin ciblé</Label>
                    <Select value={form.targetStoreId} onValueChange={(value) => setForm((current) => ({ ...current, targetStoreId: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un magasin"/>
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (<SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>)}

                {form.targetType === 'user' && (<div className="space-y-2">
                    <Label>Utilisateur ciblé</Label>
                    <Select value={form.targetUserId} onValueChange={(value) => setForm((current) => ({ ...current, targetUserId: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un utilisateur"/>
                      </SelectTrigger>
                      <SelectContent>
                        {targetableUsers.map((item) => (<SelectItem key={item.id} value={item.id}>
                            {item.username} ({item.role})
                          </SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>)}

                <div className="space-y-2">
                  <Label htmlFor="notification-message">Message</Label>
                  <Textarea id="notification-message" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Expliquez clairement l'action attendue ou l'information à transmettre." className="min-h-[140px]"/>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="notification-expiration">Expiration programmée</Label>
                    {form.expiresAt && (<button type="button" className="text-xs font-medium text-blue-700 hover:text-blue-900" onClick={() => setForm((current) => ({ ...current, expiresAt: '' }))}>
                        Retirer l'expiration
                      </button>)}
                  </div>
                  <Input id="notification-expiration" type="datetime-local" min={toDateTimeLocalValue(Date.now() + 60000)} value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}/>
                  <p className="text-xs text-muted-foreground">
                    Si une date est définie, la notification disparaît automatiquement de la boîte de réception après cette échéance.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="outline" onClick={resetForm} disabled={isSubmitting}>
                    Réinitialiser
                  </Button>
                  <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Envoi...' : 'Envoyer la notification'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <NotificationList title="Historique des envois" description={isLoadingSent ? 'Chargement des envois...' : 'Dernières notifications envoyées par le super admin.'} notifications={sentNotifications} emptyState="Aucune notification n'a encore été envoyée." storesById={storesById} usersById={usersById} showReadCount canDelete onDelete={(notificationId) => void handleDelete(notificationId)} paginate pageSize={3}/>
          </div>)}

        <NotificationList title="Boîte de réception" description={isLoading ? 'Chargement...' : 'Toutes les notifications visibles pour votre compte.'} notifications={notifications} emptyState="Aucune notification dans votre boîte de réception." onMarkAsRead={(notificationId) => void markAsRead(notificationId)} storesById={storesById} usersById={usersById} paginate pageSize={5}/>
      </div>
    </div>);
}
