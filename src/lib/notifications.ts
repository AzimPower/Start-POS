import { BACKEND_BASE, backendAvailable } from '@/lib/backend';
import { getDB } from '@/lib/db';
import { connectionState } from '@/lib/sync';
import { hasAuthToken, requiresBackendAuth } from '@/lib/apiAuth';
import { generateId } from '@/lib/id';
export type NotificationKind = 'info' | 'success' | 'warning' | 'critical';
export type NotificationTargetType = 'all' | 'role' | 'store' | 'user';
export type UserRole = 'super_admin' | 'admin' | 'cashier' | 'manager';
export interface NotificationViewer {
    id: string;
    role: UserRole;
    storeId?: string;
    storeIds?: string[];
}
export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: NotificationKind;
    targetType: NotificationTargetType;
    targetRole?: UserRole | null;
    targetStoreId?: string | null;
    targetUserId?: string | null;
    senderUserId: string;
    senderUsername?: string | null;
    senderRole?: UserRole | null;
    active?: boolean | number;
    createdAt: number;
    expiresAt?: number | null;
    readAt?: number | null;
    dismissedAt?: number | null;
    isRead: boolean;
    readCount?: number;
}
export interface CreateNotificationPayload {
    id?: string;
    createdAt?: number;
    senderUserId: string;
    senderUsername?: string;
    senderRole?: UserRole;
    title: string;
    message: string;
    type: NotificationKind;
    targetType: NotificationTargetType;
    targetRole?: UserRole;
    targetStoreId?: string;
    targetUserId?: string;
    expiresAt?: number | null;
}
export interface NotificationMutationResult {
    id?: string;
    queued: boolean;
}
const NOTIFICATIONS_API = `${BACKEND_BASE}/api/notifications.php`;
const NOTIFICATIONS_TABLE = 'notifications';
interface NotificationInboxCacheRecord {
    cacheKey: string;
    viewerId: string;
    notificationId: string;
    notification: AppNotification;
    updatedAt: number;
}
interface NotificationSentCacheRecord {
    cacheKey: string;
    senderUserId: string;
    notificationId: string;
    notification: AppNotification;
    updatedAt: number;
}
type NotificationSyncOperation = 'create' | 'update' | 'delete';

interface NotificationSyncQueueEntry {
    id: string;
    table: string;
    url: string;
    method?: string;
    operation: NotificationSyncOperation;
    data: any;
    createdAt: number;
    attempts: number;
    lastError?: string;
}

type NotificationSyncQueueEntryInput = Omit<NotificationSyncQueueEntry, 'id' | 'createdAt' | 'attempts'>;
function normalizeNotification(raw: any): AppNotification {
    return {
        ...raw,
        id: String(raw.id || ''),
        title: String(raw.title || ''),
        message: String(raw.message || ''),
        senderUserId: String(raw.senderUserId || ''),
        active: raw.active == null ? 1 : raw.active,
        createdAt: Number(raw.createdAt || 0),
        expiresAt: raw.expiresAt == null ? null : Number(raw.expiresAt),
        readAt: raw.readAt == null ? null : Number(raw.readAt),
        dismissedAt: raw.dismissedAt == null ? null : Number(raw.dismissedAt),
        readCount: raw.readCount == null ? undefined : Number(raw.readCount),
        isRead: Boolean(raw.isRead || raw.readAt),
    };
}
function buildInboxCacheKey(viewerId: string, notificationId: string) {
    return `${viewerId}:${notificationId}`;
}
function buildSentCacheKey(senderUserId: string, notificationId: string) {
    return `${senderUserId}:${notificationId}`;
}
function getViewerStoreIds(viewer: NotificationViewer) {
    const ids = new Set<string>();
    if (viewer.storeId) {
        ids.add(String(viewer.storeId));
    }
    for (const storeId of viewer.storeIds || []) {
        if (storeId) {
            ids.add(String(storeId));
        }
    }
    return ids;
}
function isNotificationActive(notification: Pick<AppNotification, 'active'>) {
    return notification.active !== false && notification.active !== 0;
}
function isNotificationVisibleToViewer(notification: AppNotification, viewer: NotificationViewer, now = Date.now()) {
    if (!isNotificationActive(notification) || isNotificationExpired(notification, now)) {
        return false;
    }
    switch (notification.targetType) {
        case 'role':
            return notification.targetRole === viewer.role;
        case 'store':
            return Boolean(notification.targetStoreId) && getViewerStoreIds(viewer).has(String(notification.targetStoreId));
        case 'user':
            return String(notification.targetUserId || '') === String(viewer.id);
        default:
            return true;
    }
}
function sortNotifications(items: AppNotification[]) {
    return [...items].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}
function mapQueueMethod(entry: NotificationSyncQueueEntry) {
    const rawMethod = String(entry.method || entry.operation || 'POST').toUpperCase();
    if (rawMethod === 'CREATE') {
        return 'POST';
    }
    if (rawMethod === 'UPDATE') {
        return 'PUT';
    }
    return rawMethod;
}
function isQueuedCreate(entry: NotificationSyncQueueEntry) {
    return mapQueueMethod(entry) === 'POST' && String(entry.data?.senderUserId || '') !== '';
}
function isQueuedDelete(entry: NotificationSyncQueueEntry) {
    return mapQueueMethod(entry) === 'PUT' && entry.data?.action === 'delete';
}
function isQueuedRead(entry: NotificationSyncQueueEntry) {
    return mapQueueMethod(entry) === 'PUT' && entry.data?.action === 'mark_read';
}
function isQueuedDismiss(entry: NotificationSyncQueueEntry) {
    return mapQueueMethod(entry) === 'PUT' && entry.data?.action === 'dismiss';
}
function notificationFromCreatePayload(payload: CreateNotificationPayload): AppNotification {
    return normalizeNotification({
        ...payload,
        id: payload.id || `notif_${generateId()}`,
        createdAt: payload.createdAt || Date.now(),
        active: 1,
        isRead: false,
        readAt: null,
        readCount: 0,
    });
}
async function parseJsonSafely(response: Response) {
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function toErrorMessage(payload: any, status: number) {
    if (typeof payload === 'string' && payload.trim()) {
        return payload;
    }
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
    }
    return `Erreur HTTP ${status}`;
}
async function getNotificationQueueEntries() {
    const db = await getDB();
    const queue = await db.getAll('syncQueue');
    return queue.filter((entry) => String(entry.table || '') === NOTIFICATIONS_TABLE || String(entry.url || '').includes('/notifications.php')) as NotificationSyncQueueEntry[];
}
async function addNotificationQueueEntry(entry: NotificationSyncQueueEntryInput) {
    const db = await getDB();
    const queue = await getNotificationQueueEntries();
    const duplicate = queue.find((queuedEntry) => {
        if (mapQueueMethod(queuedEntry) !== String(entry.method || entry.operation || 'POST').toUpperCase()) {
            return false;
        }
        if (isQueuedCreate(queuedEntry) && isQueuedCreate(entry as NotificationSyncQueueEntry)) {
            return String(queuedEntry.data?.id || '') === String(entry.data?.id || '');
        }
        if (isQueuedDelete(queuedEntry) && isQueuedDelete(entry as NotificationSyncQueueEntry)) {
            return (String(queuedEntry.data?.senderUserId || '') === String(entry.data?.senderUserId || '') &&
                String(queuedEntry.data?.notificationId || '') === String(entry.data?.notificationId || ''));
        }
        if (isQueuedRead(queuedEntry) && isQueuedRead(entry as NotificationSyncQueueEntry)) {
            return (String(queuedEntry.data?.userId || '') === String(entry.data?.userId || '') &&
                String(queuedEntry.data?.notificationId || '') === String(entry.data?.notificationId || ''));
        }
        if (isQueuedDismiss(queuedEntry) && isQueuedDismiss(entry as NotificationSyncQueueEntry)) {
            return (String(queuedEntry.data?.userId || '') === String(entry.data?.userId || '') &&
                String(queuedEntry.data?.notificationId || '') === String(entry.data?.notificationId || ''));
        }
        return false;
    });
    if (duplicate) {
        return duplicate.id;
    }
    const id = generateId();
    await db.put('syncQueue', {
        id,
        table: NOTIFICATIONS_TABLE,
        url: NOTIFICATIONS_API,
        method: entry.method,
        operation: entry.operation,
        data: entry.data,
        createdAt: Date.now(),
        attempts: 0,
    });
    return id;
}
async function removeQueuedNotificationEntries(predicate: (entry: NotificationSyncQueueEntry) => boolean) {
    const db = await getDB();
    const queue = await getNotificationQueueEntries();
    await Promise.all(queue.filter(predicate).map((entry) => db.delete('syncQueue', entry.id)));
}
async function executeOrQueueMutation(method: 'POST' | 'PUT', data: any, queueEntry: {
    method: 'POST' | 'PUT';
    operation: 'create' | 'update';
    data: any;
}) {
    const backendUp = await backendAvailable().catch(() => false);
    if (backendUp && (!requiresBackendAuth(NOTIFICATIONS_API) || await hasAuthToken())) {
        let response: Response;
            try {
                response = await fetch(NOTIFICATIONS_API, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
            }
            catch {
                await addNotificationQueueEntry({
                    table: NOTIFICATIONS_TABLE,
                    url: NOTIFICATIONS_API,
                    method: queueEntry.method,
                    operation: queueEntry.operation,
                    data: queueEntry.data,
                });
                return { queued: true, body: null };
            }
            if (response.ok) {
                return { queued: false, body: await parseJsonSafely(response) };
            }
            const payload = await parseJsonSafely(response);
            if (response.status >= 500) {
                await addNotificationQueueEntry({
                    table: NOTIFICATIONS_TABLE,
                    url: NOTIFICATIONS_API,
                    method: queueEntry.method,
                    operation: queueEntry.operation,
                    data: queueEntry.data,
                });
                return { queued: true, body: payload };
            }
            throw new Error(toErrorMessage(payload, response.status));
    }
    await addNotificationQueueEntry({
        table: NOTIFICATIONS_TABLE,
        url: NOTIFICATIONS_API,
        method: queueEntry.method,
        operation: queueEntry.operation,
        data: queueEntry.data,
    });
    return { queued: true, body: null };
}
async function readInboxCache(viewerId: string) {
    const db = await getDB();
    const entries = await db.getAllFromIndex('notificationInbox', 'by-viewer', viewerId);
    return entries as NotificationInboxCacheRecord[];
}
async function readSentCache(senderUserId: string) {
    const db = await getDB();
    const entries = await db.getAllFromIndex('notificationSent', 'by-sender', senderUserId);
    return entries as NotificationSentCacheRecord[];
}
async function replaceInboxCache(viewerId: string, notifications: AppNotification[]) {
    const db = await getDB();
    const existing = await db.getAllFromIndex('notificationInbox', 'by-viewer', viewerId);
    const timestamp = Date.now();
    const tx = db.transaction('notificationInbox', 'readwrite');
    for (const entry of existing) {
        await tx.store.delete(entry.cacheKey);
    }
    for (const notification of notifications) {
        await tx.store.put({
            cacheKey: buildInboxCacheKey(viewerId, notification.id),
            viewerId,
            notificationId: notification.id,
            notification,
            updatedAt: timestamp,
        });
    }
    await tx.done;
}
async function replaceSentCache(senderUserId: string, notifications: AppNotification[]) {
    const db = await getDB();
    const existing = await db.getAllFromIndex('notificationSent', 'by-sender', senderUserId);
    const timestamp = Date.now();
    const tx = db.transaction('notificationSent', 'readwrite');
    for (const entry of existing) {
        await tx.store.delete(entry.cacheKey);
    }
    for (const notification of notifications) {
        await tx.store.put({
            cacheKey: buildSentCacheKey(senderUserId, notification.id),
            senderUserId,
            notificationId: notification.id,
            notification,
            updatedAt: timestamp,
        });
    }
    await tx.done;
}
async function upsertInboxNotification(viewerId: string, notification: AppNotification) {
    const db = await getDB();
    await db.put('notificationInbox', {
        cacheKey: buildInboxCacheKey(viewerId, notification.id),
        viewerId,
        notificationId: notification.id,
        notification,
        updatedAt: Date.now(),
    });
}
async function upsertSentNotification(senderUserId: string, notification: AppNotification) {
    const db = await getDB();
    await db.put('notificationSent', {
        cacheKey: buildSentCacheKey(senderUserId, notification.id),
        senderUserId,
        notificationId: notification.id,
        notification,
        updatedAt: Date.now(),
    });
}
async function removeInboxNotificationForViewer(viewerId: string, notificationId: string) {
    const db = await getDB();
    await db.delete('notificationInbox', buildInboxCacheKey(viewerId, notificationId));
}
async function removeInboxNotificationEverywhere(notificationId: string) {
    const db = await getDB();
    const entries = await db.getAllFromIndex('notificationInbox', 'by-notification', notificationId);
    await Promise.all(entries.map((entry) => db.delete('notificationInbox', entry.cacheKey)));
}
async function removeSentNotification(senderUserId: string, notificationId: string) {
    const db = await getDB();
    await db.delete('notificationSent', buildSentCacheKey(senderUserId, notificationId));
}
function buildProjectedInboxNotifications(baseItems: AppNotification[], cachedItems: AppNotification[], queueEntries: NotificationSyncQueueEntry[], viewer: NotificationViewer) {
    const now = Date.now();
    const cachedById = new Map(cachedItems.map((notification) => [String(notification.id), notification]));
    const pendingDeleteIds = new Set(queueEntries.filter(isQueuedDelete).map((entry) => String(entry.data?.notificationId || '')).filter(Boolean));
    const pendingDismissIds = new Set(queueEntries
        .filter((entry) => isQueuedDismiss(entry) && String(entry.data?.userId || '') === String(viewer.id))
        .map((entry) => String(entry.data?.notificationId || ''))
        .filter(Boolean));
    const pendingReadIds = new Set(queueEntries
        .filter((entry) => isQueuedRead(entry) && String(entry.data?.userId || '') === String(viewer.id))
        .map((entry) => String(entry.data?.notificationId || ''))
        .filter(Boolean));
    const projected = new Map<string, AppNotification>();
    for (const notification of baseItems) {
        const normalized = normalizeNotification(notification);
        if (!pendingDeleteIds.has(normalized.id) && !pendingDismissIds.has(normalized.id) && isNotificationVisibleToViewer(normalized, viewer, now)) {
            projected.set(normalized.id, normalized);
        }
    }
    for (const entry of queueEntries.filter(isQueuedCreate)) {
        const queuedNotification = notificationFromCreatePayload(entry.data || {});
        if (pendingDeleteIds.has(queuedNotification.id) || pendingDismissIds.has(queuedNotification.id) || !isNotificationVisibleToViewer(queuedNotification, viewer, now)) {
            continue;
        }
        projected.set(queuedNotification.id, cachedById.get(queuedNotification.id) || queuedNotification);
    }
    for (const notificationId of pendingReadIds) {
        const current = projected.get(notificationId);
        if (!current) {
            continue;
        }
        const cached = cachedById.get(notificationId);
        projected.set(notificationId, {
            ...current,
            isRead: true,
            readAt: cached?.readAt || current.readAt || Date.now(),
        });
    }
    return sortNotifications(Array.from(projected.values()));
}
function buildProjectedSentNotifications(baseItems: AppNotification[], cachedItems: AppNotification[], queueEntries: NotificationSyncQueueEntry[], senderUserId: string) {
    const cachedById = new Map(cachedItems.map((notification) => [String(notification.id), notification]));
    const pendingDeleteIds = new Set(queueEntries
        .filter((entry) => isQueuedDelete(entry) && String(entry.data?.senderUserId || '') === String(senderUserId))
        .map((entry) => String(entry.data?.notificationId || ''))
        .filter(Boolean));
    const projected = new Map<string, AppNotification>();
    for (const notification of baseItems) {
        const normalized = normalizeNotification(notification);
        if (!pendingDeleteIds.has(normalized.id) && isNotificationActive(normalized)) {
            projected.set(normalized.id, normalized);
        }
    }
    for (const entry of queueEntries.filter(isQueuedCreate)) {
        if (String(entry.data?.senderUserId || '') !== String(senderUserId)) {
            continue;
        }
        const queuedNotification = notificationFromCreatePayload(entry.data || {});
        if (pendingDeleteIds.has(queuedNotification.id) || !isNotificationActive(queuedNotification)) {
            continue;
        }
        projected.set(queuedNotification.id, cachedById.get(queuedNotification.id) || queuedNotification);
    }
    return sortNotifications(Array.from(projected.values()));
}
async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Erreur HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
}
export async function fetchInboxNotifications(viewer: NotificationViewer): Promise<AppNotification[]> {
    const queueEntries = await getNotificationQueueEntries();
    const cachedItems = (await readInboxCache(viewer.id)).map((entry) => normalizeNotification(entry.notification));
    const localProjection = buildProjectedInboxNotifications(cachedItems, cachedItems, queueEntries, viewer);
    if (!await backendAvailable().catch(() => false)) {
        return localProjection;
    }
    const url = new URL(NOTIFICATIONS_API);
    url.searchParams.set('userId', viewer.id);
    url.searchParams.set('role', viewer.role);
    if (viewer.storeId) {
        url.searchParams.set('storeId', viewer.storeId);
    }
    if (viewer.storeIds?.length) {
        url.searchParams.set('storeIds', JSON.stringify(viewer.storeIds));
    }
    try {
        const response = await fetch(url.toString(), { cache: 'no-store' });
        const notifications = await readJson<any[]>(response);
        const merged = buildProjectedInboxNotifications(notifications.map(normalizeNotification), cachedItems, queueEntries, viewer);
        await replaceInboxCache(viewer.id, merged);
        return merged;
    }
    catch {
        return localProjection;
    }
}
export async function fetchSentNotifications(senderUserId: string): Promise<AppNotification[]> {
    const queueEntries = await getNotificationQueueEntries();
    const cachedItems = (await readSentCache(senderUserId)).map((entry) => normalizeNotification(entry.notification));
    const localProjection = buildProjectedSentNotifications(cachedItems, cachedItems, queueEntries, senderUserId);
    if (!await backendAvailable().catch(() => false)) {
        return localProjection;
    }
    const url = new URL(NOTIFICATIONS_API);
    url.searchParams.set('view', 'created');
    url.searchParams.set('senderUserId', senderUserId);
    try {
        const response = await fetch(url.toString(), { cache: 'no-store' });
        const notifications = await readJson<any[]>(response);
        const merged = buildProjectedSentNotifications(notifications.map(normalizeNotification), cachedItems, queueEntries, senderUserId);
        await replaceSentCache(senderUserId, merged);
        return merged;
    }
    catch {
        return localProjection;
    }
}
export async function createNotification(payload: CreateNotificationPayload, options?: {
    viewer?: NotificationViewer;
}): Promise<NotificationMutationResult> {
    const localNotification = notificationFromCreatePayload(payload);
    const localPayload: CreateNotificationPayload = {
        ...payload,
        id: localNotification.id,
        createdAt: localNotification.createdAt,
    };
    await upsertSentNotification(localNotification.senderUserId, localNotification);
    if (options?.viewer && isNotificationVisibleToViewer(localNotification, options.viewer)) {
        await upsertInboxNotification(options.viewer.id, localNotification);
    }
    try {
        const result = await executeOrQueueMutation('POST', localPayload, {
            method: 'POST',
            operation: 'create',
            data: localPayload,
        });
        return {
            id: String(result.body?.id || localNotification.id),
            queued: result.queued,
        };
    }
    catch (error) {
        await Promise.all([
            removeSentNotification(localNotification.senderUserId, localNotification.id),
            options?.viewer ? removeInboxNotificationForViewer(options.viewer.id, localNotification.id) : Promise.resolve(),
        ]);
        throw error;
    }
}
export async function deleteNotification(senderUserId: string, notificationId: string): Promise<NotificationMutationResult> {
    await Promise.all([
        removeSentNotification(senderUserId, notificationId),
        removeInboxNotificationEverywhere(notificationId),
    ]);
    const queueEntries = await getNotificationQueueEntries();
    const pendingCreate = queueEntries.find((entry) => isQueuedCreate(entry) && String(entry.data?.id || '') === String(notificationId));
    if (pendingCreate) {
        await removeQueuedNotificationEntries((entry) => {
            if (isQueuedCreate(entry) && String(entry.data?.id || '') === String(notificationId)) {
                return true;
            }
            if (isQueuedRead(entry) && String(entry.data?.notificationId || '') === String(notificationId)) {
                return true;
            }
            if (isQueuedDismiss(entry) && String(entry.data?.notificationId || '') === String(notificationId)) {
                return true;
            }
            return false;
        });
        return { queued: false };
    }
    const data = { action: 'delete', senderUserId, notificationId };
    const result = await executeOrQueueMutation('PUT', data, {
        method: 'PUT',
        operation: 'update',
        data,
    });
    return { queued: result.queued };
}
export async function markNotificationRead(userId: string, notificationId: string): Promise<NotificationMutationResult> {
    const cacheEntries = await readInboxCache(userId);
    const currentEntry = cacheEntries.find((entry) => String(entry.notificationId) === String(notificationId));
    if (currentEntry) {
        await upsertInboxNotification(userId, {
            ...currentEntry.notification,
            isRead: true,
            readAt: currentEntry.notification.readAt || Date.now(),
        });
    }
    const data = { action: 'mark_read', userId, notificationId };
    const result = await executeOrQueueMutation('PUT', data, {
        method: 'PUT',
        operation: 'update',
        data,
    });
    return { queued: result.queued };
}
export async function dismissNotificationForUser(userId: string, notificationId: string): Promise<NotificationMutationResult> {
    await removeInboxNotificationForViewer(userId, notificationId);
    await removeQueuedNotificationEntries((entry) => isQueuedRead(entry)
        && String(entry.data?.userId || '') === String(userId)
        && String(entry.data?.notificationId || '') === String(notificationId));
    const data = { action: 'dismiss', userId, notificationId };
    const result = await executeOrQueueMutation('PUT', data, {
        method: 'PUT',
        operation: 'update',
        data,
    });
    return { queued: result.queued };
}
export function formatNotificationTimestamp(value: number): string {
    if (!value) {
        return 'Maintenant';
    }
    return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value));
}
export function formatNotificationExpiry(value?: number | null): string {
    if (!value) {
        return 'Sans expiration';
    }
    return `Expire le ${formatNotificationTimestamp(value)}`;
}
export function isNotificationExpired(notification: Pick<AppNotification, 'expiresAt'>, now = Date.now()): boolean {
    return typeof notification.expiresAt === 'number' && notification.expiresAt > 0 && notification.expiresAt < now;
}
export function getNotificationTypeLabel(type: NotificationKind): string {
    switch (type) {
        case 'success':
            return 'Succès';
        case 'warning':
            return 'Alerte';
        case 'critical':
            return 'Critique';
        default:
            return 'Info';
    }
}
export function getNotificationBadgeClassName(type: NotificationKind): string {
    switch (type) {
        case 'success':
            return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'warning':
            return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'critical':
            return 'bg-rose-100 text-rose-800 border-rose-200';
        default:
            return 'bg-blue-100 text-blue-800 border-blue-200';
    }
}
export function getNotificationTargetSummary(notification: Pick<AppNotification, 'targetType' | 'targetRole' | 'targetStoreId' | 'targetUserId'>, options?: {
    storesById?: Record<string, string>;
    usersById?: Record<string, string>;
}): string {
    switch (notification.targetType) {
        case 'role':
            return `Rôle: ${notification.targetRole || 'Inconnu'}`;
        case 'store': {
            const name = notification.targetStoreId ? options?.storesById?.[notification.targetStoreId] : null;
            return `Magasin: ${name || notification.targetStoreId || 'Inconnu'}`;
        }
        case 'user': {
            const name = notification.targetUserId ? options?.usersById?.[notification.targetUserId] : null;
            return `Utilisateur: ${name || notification.targetUserId || 'Inconnu'}`;
        }
        default:
            return 'Tous les utilisateurs';
    }
}
