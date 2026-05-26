// Module de synchronisation hors-ligne avec IndexedDB
import { openDB } from 'idb';
import { BACKEND_BASE, backendAvailable } from './backend';
import { addNativeNetworkListener, getNativeNetworkStatus } from './nativeNetwork';
import { buildAuthenticatedHeaders, hasAuthToken, requiresBackendAuth } from './apiAuth';
import { generateId } from './id';
export const SYNC_DB_NAME = 'pos_sync_db';
export const SYNC_STORE = 'pending_ops';
const API_BASE = `${BACKEND_BASE}/api`;
// État de connexion et de synchronisation
export const connectionState = {
    isOnline: true,
    isSyncing: false,
    lastCheck: Date.now(),
};
const listeners = [];
async function hasUsableNetworkConnection(forceBackendCheck = false) {
    const nativeStatus = await getNativeNetworkStatus().catch(() => null);
    if (nativeStatus?.connected) {
        connectionState.isOnline = true;
        return true;
    }
    if (navigator.onLine) {
        connectionState.isOnline = true;
        return true;
    }
    try {
        const backendUp = await backendAvailable(5000, forceBackendCheck);
        if (backendUp) {
            connectionState.isOnline = true;
            return true;
        }
    }
    catch (e) {
    }
    connectionState.isOnline = false;
    return false;
}

export async function canReachBackendForWrite() {
    const hasNetwork = await hasUsableNetworkConnection(true);
    if (!hasNetwork) {
        return false;
    }

    try {
        const backendUp = await backendAvailable(5000, true);
        connectionState.isOnline = backendUp;
        return backendUp;
    }
    catch (e) {
        connectionState.isOnline = false;
        return false;
    }
}

function emitConnectionStateChange() {
    connectionState.lastCheck = Date.now();
    listeners.forEach((listener) => listener({ ...connectionState }));
}
// Cache de la connexion IndexedDB pour éviter de la rouvrir à chaque appel
let _syncDBPromise: Promise<any> | null = null;
// Ouvrir la base IndexedDB pour les opérations en attente
async function getSyncDB() {
    if (!_syncDBPromise) {
        _syncDBPromise = openDB(SYNC_DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(SYNC_STORE)) {
                    db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
                }
            },
        });
    }
    return _syncDBPromise;
}
// Ajouter une opération à la file d’attente
export async function queueSyncOp(op) {
    const db = await getSyncDB();
    await db.add(SYNC_STORE, { ...op, createdAt: Date.now() });
}
async function processDeferredSyncSuccess(op: any) {
    if (op?.notifyOnSuccess?.kind !== 'stockAdjustment') {
        return;
    }
    try {
        const { sendStockAdjustmentNotifications } = await import('./storeAdminNotifications');
        await sendStockAdjustmentNotifications(op.notifyOnSuccess.payload);
    }
    catch (e) {
        writeSyncLog({
            level: 'warn',
            message: 'Impossible d\'envoyer les notifications différées d\'ajustement',
            entity: op?.table,
            details: { error: String(e), url: op?.url },
        });
    }
}
async function writeSyncLog(entry: {
    level: 'info' | 'warn' | 'error';
    message: string;
    entity?: string;
    details?: any;
}) {
    try {
        const { getDB } = await import('./db');
        const db = await getDB();
        await db.add('syncLogs' as any, {
            id: generateId(),
            level: entry.level,
            message: entry.message,
            entity: entry.entity,
            details: entry.details,
            createdAt: Date.now(),
        } as any);
    }
    catch (e) {
    }
}
// Récupérer toutes les opérations en attente
async function readErrorResponse(res: Response) {
    try {
        const text = await res.text();
        return text.slice(0, 500);
    }
    catch {
        return '';
    }
}
function formatSyncError(status: number, responseText?: string) {
    return responseText ? `HTTP ${status}: ${responseText}` : `HTTP ${status}`;
}
export async function getPendingSyncOps() {
    const db = await getSyncDB();
    return db.getAll(SYNC_STORE);
}
// Compter les opérations en attente
export async function getPendingSyncCount() {
    const db = await getSyncDB();
    const directCount = await db.count(SYNC_STORE);

    try {
        const { getDB } = await import('./db');
        const mainDb = await getDB();
        const queueCount = await mainDb.count('syncQueue');
        return directCount + queueCount;
    }
    catch (e) {
        return directCount;
    }
}

export interface PendingSyncEntrySnapshot {
    source: 'pending_ops' | 'syncQueue';
    id: string | number;
    table?: string;
    method?: string;
    operation?: string;
    url?: string;
    storeId?: string;
    createdAt?: number;
    attempts?: number;
    data?: any;
    lastError?: string;
}

export interface SyncLogSnapshot {
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    entity?: string;
    details?: any;
    createdAt: number;
}

export async function getPendingSyncSnapshot() {
    const pendingOps = await getPendingSyncOps();
    let syncQueue: any[] = [];
    let syncLogs: any[] = [];

    try {
        const { getDB } = await import('./db');
        const mainDb = await getDB();
        syncQueue = await mainDb.getAll('syncQueue');
        syncLogs = await mainDb.getAll('syncLogs' as any);
    }
    catch (e) {
    }

    const pending = pendingOps.map((op: any) => ({
        source: 'pending_ops' as const,
        id: op.id,
        table: op.table || inferSyncTable(op.url),
        method: op.method || 'POST',
        operation: op.operation,
        url: op.url,
        storeId: op.storeId,
        createdAt: op.createdAt,
        attempts: op.attempts,
        data: op.data,
        lastError: op.lastError,
    }));

    const queued = syncQueue.map((op: any) => ({
        source: 'syncQueue' as const,
        id: op.id,
        table: op.table || inferSyncTable(op.url),
        method: op.method || op.operation || 'POST',
        operation: op.operation,
        url: op.url,
        storeId: op.storeId,
        createdAt: op.createdAt,
        attempts: op.attempts,
        data: op.data,
        lastError: op.lastError,
    }));

    const logs = syncLogs
        .sort((a: any, b: any) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
        .slice(0, 25)
        .map((entry: any) => ({
        id: String(entry.id || ''),
        level: entry.level || 'info',
        message: entry.message || '',
        entity: entry.entity,
        details: entry.details,
        createdAt: Number(entry.createdAt || 0),
    }));

    return {
        pending: [...pending, ...queued].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
        logs,
    };
}

function shiftOpenedAt(shift: any) {
    return Number(shift?.openedAt || 0);
}

function shiftClosedAt(shift: any) {
    const value = shift?.closedAt;
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function shiftIntervalEnd(shift: any) {
    if (String(shift?.status || '') === 'open') {
        return Number.POSITIVE_INFINITY;
    }
    const closedAt = shiftClosedAt(shift);
    return closedAt === null ? Number.POSITIVE_INFINITY : closedAt;
}

function shiftsOverlap(left: any, right: any) {
    return shiftOpenedAt(right) <= shiftIntervalEnd(left) && shiftOpenedAt(left) <= shiftIntervalEnd(right);
}

function buildShiftOverlapGroups(shifts: any[]) {
    const sorted = [...shifts].sort((a, b) => {
        const startDiff = shiftOpenedAt(a) - shiftOpenedAt(b);
        if (startDiff !== 0) {
            return startDiff;
        }
        return shiftIntervalEnd(a) - shiftIntervalEnd(b);
    });
    const groups: any[][] = [];
    let currentGroup: any[] = [];
    let currentGroupEnd = Number.NEGATIVE_INFINITY;

    for (const shift of sorted) {
        if (currentGroup.length === 0) {
            currentGroup = [shift];
            currentGroupEnd = shiftIntervalEnd(shift);
            continue;
        }
        if (shiftOpenedAt(shift) <= currentGroupEnd) {
            currentGroup.push(shift);
            currentGroupEnd = Math.max(currentGroupEnd, shiftIntervalEnd(shift));
            continue;
        }
        groups.push(currentGroup);
        currentGroup = [shift];
        currentGroupEnd = shiftIntervalEnd(shift);
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

function shiftGroupCanonical(group: any[], backendShiftIds?: Set<string>, queuedShiftIds?: Set<string>) {
    const sorted = [...group].sort((a, b) => {
        const aId = String(a?.id || '');
        const bId = String(b?.id || '');
        const aRank = backendShiftIds?.has(aId) ? 0 : (queuedShiftIds?.has(aId) ? 2 : 1);
        const bRank = backendShiftIds?.has(bId) ? 0 : (queuedShiftIds?.has(bId) ? 2 : 1);
        if (aRank !== bRank) {
            return aRank - bRank;
        }
        if (String(a?.status || '') !== String(b?.status || '')) {
            return String(a?.status || '') === 'open' ? -1 : 1;
        }
        const startDiff = shiftOpenedAt(a) - shiftOpenedAt(b);
        if (startDiff !== 0) {
            return startDiff;
        }
        return String(aId).localeCompare(String(bId));
    });
    return sorted[0];
}

function buildMergedShiftRecord(canonical: any, group: any[]) {
    const orderedByStart = [...group].sort((a, b) => shiftOpenedAt(a) - shiftOpenedAt(b));
    const earliestShift = orderedByStart[0];
    const latestClosedShift = [...group]
        .filter((shift) => shiftClosedAt(shift) !== null)
        .sort((a, b) => Number(shiftClosedAt(b) || 0) - Number(shiftClosedAt(a) || 0))[0];
    const hasOpenShift = group.some((shift) => String(shift?.status || '') === 'open' || shiftClosedAt(shift) === null);
    const mergedOpenedAt = Math.min(...group.map((shift) => shiftOpenedAt(shift)));
    const mergedClosedAt = hasOpenShift ? null : Math.max(...group.map((shift) => Number(shiftClosedAt(shift) || 0)));

    return {
        ...canonical,
        userId: canonical?.userId || earliestShift?.userId,
        storeId: canonical?.storeId || earliestShift?.storeId,
        openingAmount: Number(earliestShift?.openingAmount ?? canonical?.openingAmount ?? 0) || 0,
        openedAt: mergedOpenedAt,
        status: hasOpenShift ? 'open' : 'closed',
        closedAt: mergedClosedAt,
        closingAmount: hasOpenShift ? null : (latestClosedShift?.closingAmount ?? canonical?.closingAmount ?? null),
        expectedAmount: hasOpenShift ? null : (latestClosedShift?.expectedAmount ?? canonical?.expectedAmount ?? null),
        difference: hasOpenShift ? null : (latestClosedShift?.difference ?? canonical?.difference ?? null),
        cashAmount: hasOpenShift ? undefined : latestClosedShift?.cashAmount,
        mobileMoneyAmount: hasOpenShift ? undefined : latestClosedShift?.mobileMoneyAmount,
        otherAmount: hasOpenShift ? undefined : latestClosedShift?.otherAmount,
        mergedFromShiftIds: Array.from(new Set(group.map((shift) => String(shift?.id || '')).filter(Boolean))),
    };
}

function didShiftChangeForSync(previous: any, next: any) {
    const keys = ['status', 'openedAt', 'closedAt', 'openingAmount', 'closingAmount', 'expectedAmount', 'difference', 'cashAmount', 'mobileMoneyAmount', 'otherAmount'];
    return keys.some((key) => String(previous?.[key] ?? '') !== String(next?.[key] ?? ''));
}

function getShiftOpTargetId(op: any) {
    if (op?.data?.id) {
        return String(op.data.id);
    }
    try {
        const parsed = new URL(String(op?.url || ''), 'https://local.sync');
        const id = parsed.searchParams.get('id');
        return id ? String(id) : null;
    }
    catch {
        return null;
    }
}

async function rewriteShiftReferencesInQueuedOps(duplicateIds: Set<string>, canonicalId: string) {
    const syncDb = await getSyncDB();
    const pendingOps = await syncDb.getAll(SYNC_STORE);
    for (const op of pendingOps) {
        const opTargetId = getShiftOpTargetId(op);
        const touchesShifts = String(op?.table || '') === 'shifts' || String(op?.url || '').includes('shifts.php');
        if (touchesShifts && opTargetId && duplicateIds.has(opTargetId)) {
            await syncDb.delete(SYNC_STORE, op.id);
            continue;
        }
        if (duplicateIds.has(String(op?.data?.shiftId || ''))) {
            await syncDb.put(SYNC_STORE, {
                ...op,
                data: {
                    ...op.data,
                    shiftId: canonicalId,
                },
            });
        }
    }

    const { getDB } = await import('./db');
    const db = await getDB();
    const queueOps = await db.getAll('syncQueue');
    for (const op of queueOps) {
        const opTargetId = getShiftOpTargetId(op);
        const touchesShifts = String(op?.table || '') === 'shifts' || String(op?.url || '').includes('shifts.php');
        if (touchesShifts && opTargetId && duplicateIds.has(opTargetId)) {
            await db.delete('syncQueue', op.id);
            continue;
        }
        if (duplicateIds.has(String(op?.data?.shiftId || ''))) {
            await db.put('syncQueue', {
                ...op,
                data: {
                    ...op.data,
                    shiftId: canonicalId,
                },
            });
        }
    }
}

async function queueCanonicalShiftSync(shift: any, backendShiftIds?: Set<string>) {
    const { getDB } = await import('./db');
    const db = await getDB();
    const operation = backendShiftIds?.has(String(shift?.id || '')) ? 'update' : 'create';
    const shiftId = String(shift?.id || '');
    const queueOps = await db.getAll('syncQueue');
    const existingShiftOps = queueOps.filter((op: any) => {
        const touchesShifts = String(op?.table || '') === 'shifts' || String(op?.url || '').includes('shifts.php');
        return touchesShifts && String(op?.data?.id || '') === shiftId;
    });
    const [existingOp, ...duplicateOps] = existingShiftOps;
    for (const duplicateOp of duplicateOps) {
        await db.delete('syncQueue', duplicateOp.id);
    }
    await db.put('syncQueue', {
        id: existingOp?.id || generateId(),
        table: 'shifts',
        operation,
        method: operation === 'create' ? 'POST' : 'PUT',
        data: shift,
        url: `${API_BASE}/shifts.php`,
        createdAt: existingOp?.createdAt || Date.now(),
        attempts: 0,
        storeId: shift?.storeId,
    });
}

async function upsertSyncQueueOp(match: (op: any) => boolean, nextOp: any) {
    const { getDB } = await import('./db');
    const db = await getDB();
    const queueOps = await db.getAll('syncQueue');
    const existingOps = queueOps.filter(match);
    const [existingOp, ...duplicateOps] = existingOps;
    for (const duplicateOp of duplicateOps) {
        await db.delete('syncQueue', duplicateOp.id);
    }
    await db.put('syncQueue', {
        ...nextOp,
        id: existingOp?.id || nextOp.id || generateId(),
        createdAt: existingOp?.createdAt || nextOp.createdAt || Date.now(),
        attempts: 0,
    });
}

async function collapseSyncQueueDuplicates() {
    const { getDB } = await import('./db');
    const db = await getDB();
    const queueOps = await db.getAll('syncQueue');
    if (!Array.isArray(queueOps) || queueOps.length < 2) {
        return;
    }
    const grouped = new Map<string, any[]>();
    for (const op of queueOps) {
        const table = String(op?.table || '');
        const dataId = String(op?.data?.id || '');
        const opMethod = String(op?.method || op?.operation || '').toUpperCase();
        const url = String(op?.url || '');
        // Dédoublonnage ciblé: updates identiques par entité
        if (!dataId || !['UPDATE', 'PUT'].includes(opMethod)) {
            continue;
        }
        const key = `${table}::${dataId}::${url}`;
        const arr = grouped.get(key);
        if (arr) {
            arr.push(op);
        }
        else {
            grouped.set(key, [op]);
        }
    }
    for (const ops of grouped.values()) {
        if (ops.length < 2) {
            continue;
        }
        ops.sort((a: any, b: any) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
        const [keep, ...duplicates] = ops;
        const attempts = Math.max(...ops.map((op: any) => Number(op?.attempts || 0)));
        const merged = { ...keep, attempts };
        await db.put('syncQueue', merged);
        for (const duplicate of duplicates) {
            await db.delete('syncQueue', duplicate.id);
        }
    }
}

async function queueBackendDuplicateShiftCleanup(duplicateIds: Set<string>, canonicalId: string, salesToUpdate: any[], backendShiftIds?: Set<string>) {
    const backendDuplicateIds = Array.from(duplicateIds).filter((id) => backendShiftIds?.has(id));
    if (backendDuplicateIds.length === 0 && salesToUpdate.length === 0) {
        return;
    }

    for (const sale of salesToUpdate) {
        await upsertSyncQueueOp(
            (op: any) => String(op?.table || '') === 'sales' && String(op?.data?.id || '') === String(sale?.id || ''),
            {
                table: 'sales',
                operation: 'update',
                method: 'PUT',
                data: sale,
                url: `${API_BASE}/sales.php`,
                storeId: sale?.storeId,
            }
        );
    }

    for (const duplicateId of backendDuplicateIds) {
        await upsertSyncQueueOp(
            (op: any) => {
                const touchesShifts = String(op?.table || '') === 'shifts' || String(op?.url || '').includes('shifts.php');
                const isDelete = ['DELETE', 'delete'].includes(String(op?.method || op?.operation || '').toUpperCase());
                return touchesShifts && isDelete && getShiftOpTargetId(op) === duplicateId;
            },
            {
                table: 'shifts',
                operation: 'delete',
                method: 'DELETE',
                data: { id: duplicateId, mergedIntoShiftId: canonicalId },
                url: `${API_BASE}/shifts.php?id=${encodeURIComponent(duplicateId)}`,
            }
        );
    }
}

export async function mergeOverlappingShiftsForUserStore(userId?: string, storeId?: string, options?: {
    backendShiftIds?: Set<string>;
    rebuildShiftSyncOps?: boolean;
}) {
    if (!userId || !storeId) {
        return [];
    }
    const { getDB } = await import('./db');
    const db = await getDB();
    const allShifts = await db.getAll('shifts');
    const scopedShifts = allShifts.filter((shift: any) => String(shift?.userId || '') === String(userId) && String(shift?.storeId || '') === String(storeId));
    if (scopedShifts.length < 2) {
        return [];
    }

    const queuedShiftIds = await getQueuedShiftIds();
    const groups = buildShiftOverlapGroups(scopedShifts).filter((group) => group.length > 1);
    const mergedCanonicalIds: string[] = [];

    for (const group of groups) {
        const canonical = shiftGroupCanonical(group, options?.backendShiftIds, queuedShiftIds);
        const canonicalId = String(canonical?.id || '');
        const duplicateIds = new Set(group
            .map((shift) => String(shift?.id || ''))
            .filter((id) => id && id !== canonicalId));
        if (duplicateIds.size === 0) {
            continue;
        }

        const mergedShift = buildMergedShiftRecord(canonical, group);
        const sales = await db.getAll('sales');
        const expenses = await db.getAll('expenses');
        const salesToUpdate = sales
            .filter((sale: any) => duplicateIds.has(String(sale?.shiftId || '')))
            .map((sale: any) => ({ ...sale, shiftId: canonicalId }));
        const expensesToUpdate = expenses
            .filter((expense: any) => duplicateIds.has(String(expense?.shiftId || '')))
            .map((expense: any) => ({ ...expense, shiftId: canonicalId }));

        const tx = db.transaction(['shifts', 'sales', 'expenses'], 'readwrite');
        await tx.objectStore('shifts').put(mergedShift);
        for (const duplicateId of duplicateIds) {
            await tx.objectStore('shifts').delete(duplicateId);
        }
        for (const sale of salesToUpdate) {
            await tx.objectStore('sales').put(sale);
        }
        for (const expense of expensesToUpdate) {
            await tx.objectStore('expenses').put(expense);
        }
        await tx.done;

        await rewriteShiftReferencesInQueuedOps(duplicateIds, canonicalId);

        if (options?.rebuildShiftSyncOps) {
            const shouldQueueSync = !options?.backendShiftIds?.has(canonicalId) || didShiftChangeForSync(canonical, mergedShift);
            if (shouldQueueSync) {
                await queueCanonicalShiftSync(mergedShift, options?.backendShiftIds);
            }
            await queueBackendDuplicateShiftCleanup(duplicateIds, canonicalId, salesToUpdate, options?.backendShiftIds);
        }

        mergedCanonicalIds.push(canonicalId);
    }

    return mergedCanonicalIds;
}

function inferSyncTable(url?: string) {
    const rawUrl = String(url || '');
    if (!rawUrl) {
        return '';
    }
    try {
        const parsed = new URL(rawUrl, window.location.origin);
        const fileName = parsed.pathname.split('/').pop() || '';
        return fileName.replace(/\.php$/i, '');
    }
    catch {
        const matched = rawUrl.match(/\/([^/?#]+)\.php(?:[?#]|$)/i);
        return matched?.[1] || '';
    }
}

async function mergeOverlappingShiftsForStoreScope(storeId?: string, options?: {
    backendShiftIds?: Set<string>;
    rebuildShiftSyncOps?: boolean;
}) {
    const { getDB } = await import('./db');
    const db = await getDB();
    const allShifts = await db.getAll('shifts');
    const userStoreKeys = new Set<string>();

    for (const shift of allShifts) {
        const shiftUserId = String(shift?.userId || '');
        const shiftStoreId = String(shift?.storeId || '');
        if (!shiftUserId || !shiftStoreId) {
            continue;
        }
        if (storeId && shiftStoreId !== String(storeId)) {
            continue;
        }
        userStoreKeys.add(`${shiftUserId}__${shiftStoreId}`);
    }

    const mergedIds: string[] = [];
    for (const userStoreKey of userStoreKeys) {
        const [userId, scopedStoreId] = userStoreKey.split('__');
        const ids = await mergeOverlappingShiftsForUserStore(userId, scopedStoreId, options);
        mergedIds.push(...ids);
    }

    return mergedIds;
}

async function handleShiftCreateConflict(op: any) {
    const storeId = String(op?.data?.storeId || op?.storeId || '');
    const userId = String(op?.data?.userId || '');
    if (!storeId || !userId) {
        return false;
    }
    try {
        const url = new URL(`${API_BASE}/shifts.php`);
        url.searchParams.set('storeId', storeId);
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) {
            return false;
        }
        const backendShifts = await response.json();
        if (!Array.isArray(backendShifts)) {
            return false;
        }
        await mergeBackendShifts(backendShifts);
        await mergeOverlappingShiftsForUserStore(userId, storeId, {
            backendShiftIds: new Set(backendShifts.map((shift: any) => String(shift?.id || '')).filter(Boolean)),
            rebuildShiftSyncOps: true,
        });
        return true;
    }
    catch {
        return false;
    }
}

function isStockMutationOp(op: any, storeId?: string) {
    const url = String(op?.url || '');
    const table = String(op?.table || '');
    const targetStoreId = op?.storeId ?? op?.data?.storeId ?? op?.data?.store_id ?? null;

    const touchesStock = url.includes('sales.php')
        || url.includes('products.php')
        || url.includes('stock_adjust.php')
        || table === 'sales'
        || table === 'products'
        || table === 'stockAdjustments';

    if (!touchesStock) {
        return false;
    }

    if (!storeId || !targetStoreId) {
        return true;
    }

    return String(targetStoreId) === String(storeId);
}

export async function hasPendingStockOperations(storeId?: string) {
    const pendingOps = await getPendingSyncOps();
    if (pendingOps.some((op) => isStockMutationOp(op, storeId))) {
        return true;
    }

    try {
        const { getDB } = await import('./db');
        const db = await getDB();
        const queueOps = await db.getAll('syncQueue');

        return queueOps.some((op) => isStockMutationOp(op, storeId));
    }
    catch (error) {
        return false;
    }
}
// Supprimer une opération synchronisée
export async function removeSyncOp(id) {
    const db = await getSyncDB();
    await db.delete(SYNC_STORE, id);
}
// Synchroniser toutes les opérations en attente avec le serveur
export async function syncWithServer() {
    // Guard contre les appels concurrents
    if (connectionState.isSyncing) {
        return { success: false, reason: 'already_syncing' };
    }
    // Vérifier la connexion internet et le backend (ping)
    if (!await hasUsableNetworkConnection(true)) {
        return { success: false, reason: 'offline' };
    }
    const backendUp = await backendAvailable();
    if (!backendUp) {
        return { success: false, reason: 'backend_unreachable' };
    }
    // Traiter les emails en attente en premier
    try {
        const { pendingEmailService } = await import('./pendingEmailService');
        // Debug: Vérifier combien d'emails en attente
        const { getDB } = await import('./db');
        const db = await getDB();
        const pendingEmails = await db.getAll('pendingEmails');
        const pendingOnly = pendingEmails.filter(e => e.status === 'pending');
        if (pendingOnly.length > 0) {
        }
        const emailStats = await pendingEmailService.processPendingEmails();
        // Nettoyer les anciens emails
        await pendingEmailService.cleanupOldEmails();
    }
    catch (emailError) {
    }
    connectionState.isSyncing = true;
    emitConnectionStateChange();
    let successCount = 0;
    let networkErrorOccurred = false;
    try {
        const { getDB } = await import('./db');
        const mainDb = await getDB();
        await collapseSyncQueueDuplicates();
        const pendingOps = await getPendingSyncOps();
        const syncQueueOps = await mainDb.getAll('syncQueue');
        const hasProtectedPendingWrites = [...pendingOps, ...syncQueueOps]
            .some((op: any) => requiresBackendAuth(String(op?.url || '')));
        if (hasProtectedPendingWrites && !await hasAuthToken()) {
            await writeSyncLog({
                level: 'warn',
                message: 'Synchronisation reportee: authentification requise',
                details: { reason: 'missing_auth_token' },
            });
            return { success: false, reason: 'missing_auth_token' };
        }
        // 1. Traiter les opérations de pending_ops (pos_sync_db)
        for (const op of pendingOps) {
            if (networkErrorOccurred)
                break;
            try {
                const res = await fetch(op.url, {
                    method: op.method || 'POST',
                    headers: await buildAuthenticatedHeaders({ 'Content-Type': 'application/json' }, op.url),
                    body: JSON.stringify(op.data),
                });
                if (res.ok) {
                    await processDeferredSyncSuccess(op);
                    await removeSyncOp(op.id);
                    successCount++;
                    writeSyncLog({ level: 'info', message: 'Op synchronisée (pending_ops)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                }
                else if (res.status === 409 && String(op?.url || '').includes('shifts.php') && ['POST', 'PUT'].includes(String(op?.method || 'POST').toUpperCase()) && await handleShiftCreateConflict(op)) {
                    await removeSyncOp(op.id);
                    successCount++;
                    writeSyncLog({ level: 'info', message: 'Conflit shift résolu par fusion automatique (pending_ops)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                }
                else {
                    const responseText = await readErrorResponse(res);
                    const lastError = formatSyncError(res.status, responseText);
                    await (await getSyncDB()).put(SYNC_STORE, {
                        ...op,
                        attempts: Number(op.attempts || 0) + 1,
                        lastError,
                    });
                    writeSyncLog({ level: 'warn', message: `Erreur serveur ${res.status} (pending_ops)`, entity: op.table, details: { url: op.url, status: res.status, response: responseText } });
                }
            }
            catch (e) {
                networkErrorOccurred = true;
                writeSyncLog({ level: 'warn', message: 'Erreur réseau (pending_ops)', entity: op.table, details: { error: String(e) } });
            }
        }
        // 2. Traiter les opérations de syncQueue (pos_db) — seulement si pas d'erreur réseau
        if (!networkErrorOccurred) {
            try {
                const queueOps = syncQueueOps
                    .sort((a: any, b: any) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
                for (const op of queueOps) {
                    if (networkErrorOccurred)
                        break;
                    try {
                        const rawMethod = String(op.method || op.operation || 'POST').toUpperCase();
                        const mappedMethod = rawMethod === 'CREATE' ? 'POST' :
                            rawMethod === 'UPDATE' ? 'PUT' :
                                rawMethod === 'DELETE' ? 'DELETE' :
                                    rawMethod;
                        const res = await fetch(op.url, {
                            method: mappedMethod,
                            headers: await buildAuthenticatedHeaders({ 'Content-Type': 'application/json' }, op.url),
                            body: JSON.stringify(op.data),
                        });
                        if (res.ok) {
                            await processDeferredSyncSuccess(op);
                            await mainDb.delete('syncQueue', op.id);
                            successCount++;
                            writeSyncLog({ level: 'info', message: 'Op synchronisée (syncQueue)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                        }
                        else if (res.status === 409 && String(op?.url || '').includes('shifts.php') && ['POST', 'PUT'].includes(mappedMethod) && await handleShiftCreateConflict(op)) {
                            await mainDb.delete('syncQueue', op.id);
                            successCount++;
                            writeSyncLog({ level: 'info', message: 'Conflit shift résolu par fusion automatique (syncQueue)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                        }
                        else {
                            const responseText = await readErrorResponse(res);
                            const lastError = formatSyncError(res.status, responseText);
                            await mainDb.put('syncQueue', {
                                ...op,
                                attempts: Number(op.attempts || 0) + 1,
                                lastError,
                            });
                            writeSyncLog({ level: 'warn', message: `Erreur serveur ${res.status} (syncQueue)`, entity: op.table, details: { url: op.url, status: res.status, response: responseText } });
                        }
                    }
                    catch (e) {
                        networkErrorOccurred = true;
                        await mainDb.put('syncQueue', {
                            ...op,
                            attempts: Number(op.attempts || 0) + 1,
                            lastError: String(e),
                        });
                        writeSyncLog({ level: 'warn', message: 'Erreur réseau (syncQueue)', entity: op.table, details: { error: String(e) } });
                    }
                }
            }
            catch (e) {
            }
        }
    }
    finally {
        connectionState.isSyncing = false;
        emitConnectionStateChange();
    }
    return { success: true, itemsCount: successCount };
}
async function getQueuedShiftIds() {
    const queuedShiftIds = new Set<string>();
    try {
        const pendingOps = await getPendingSyncOps();
        for (const op of pendingOps) {
            if ((op.url || '').includes('shifts.php') && op.data?.id) {
                queuedShiftIds.add(String(op.data.id));
            }
        }
    }
    catch (e) {
    }
    try {
        const { getDB } = await import('./db');
        const db = await getDB();
        const syncQueue = await db.getAll('syncQueue');
        for (const op of syncQueue) {
            if ((op.table === 'shifts' || (op.url || '').includes('shifts')) && op.data?.id) {
                queuedShiftIds.add(String(op.data.id));
            }
        }
    }
    catch (e) {
    }
    return queuedShiftIds;
}
const closedShiftMarkerKey = (userId?: string, storeId?: string) => `closed_shift_marker_${String(userId || '')}_${String(storeId || '')}`;
const shiftStatusCacheKey = (userId?: string, storeId?: string) => `shift_status_cache_${String(userId || '')}_${String(storeId || '')}`;
function readClosedShiftMarker(userId?: string, storeId?: string) {
    if (!userId)
        return null;
    try {
        const raw = localStorage.getItem(closedShiftMarkerKey(userId, storeId));
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function clearClosedShiftMarker(userId?: string, storeId?: string) {
    if (!userId)
        return;
    try {
        localStorage.removeItem(closedShiftMarkerKey(userId, storeId));
    }
    catch {
        // ignore localStorage issues
    }
}
export function persistClosedShiftMarker(shift: {
    id: string;
    userId: string;
    storeId: string;
    openedAt?: number;
    closedAt?: number | null;
}) {
    try {
        localStorage.setItem(closedShiftMarkerKey(shift.userId, shift.storeId), JSON.stringify({
            id: shift.id,
            userId: shift.userId,
            storeId: shift.storeId,
            openedAt: Number(shift.openedAt || 0),
            closedAt: Number(shift.closedAt || Date.now()),
            storedAt: Date.now(),
        }));
    }
    catch {
        // ignore localStorage issues
    }
}
export function readShiftStatusCache(userId?: string, storeId?: string) {
    if (!userId) {
        return null;
    }
    try {
        const raw = localStorage.getItem(shiftStatusCacheKey(userId, storeId));
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function persistActiveShiftCache(shift: {
    id: string;
    userId: string;
    storeId: string;
    openedAt?: number;
    status?: string;
    [key: string]: any;
}) {
    if (!shift?.userId) {
        return;
    }
    try {
        localStorage.setItem(shiftStatusCacheKey(shift.userId, shift.storeId), JSON.stringify({
            userId: shift.userId,
            storeId: shift.storeId,
            status: 'open',
            shift: {
                ...shift,
                status: 'open',
            },
            updatedAt: Date.now(),
        }));
    }
    catch {
        // ignore localStorage issues
    }
}
export function persistInactiveShiftCache(userId?: string, storeId?: string, lastShift?: {
    id?: string;
    openedAt?: number;
    closedAt?: number | null;
}) {
    if (!userId) {
        return;
    }
    try {
        localStorage.setItem(shiftStatusCacheKey(userId, storeId), JSON.stringify({
            userId,
            storeId,
            status: 'closed',
            shift: null,
            lastShift: lastShift ? {
                id: lastShift.id,
                openedAt: Number(lastShift.openedAt || 0),
                closedAt: Number(lastShift.closedAt || Date.now()),
            } : null,
            updatedAt: Date.now(),
        }));
    }
    catch {
        // ignore localStorage issues
    }
}
function shouldKeepLocalShift(localShift: any, backendShift: any, queuedShiftIds: Set<string>) {
    if (!localShift)
        return false;
    if (queuedShiftIds.has(String(backendShift.id)))
        return true;
    if (localShift.status === 'closed' && backendShift.status === 'open')
        return true;
    const localClosedAt = Number(localShift.closedAt || 0);
    const backendClosedAt = Number(backendShift.closedAt || 0);
    if (localClosedAt && localClosedAt >= backendClosedAt && backendShift.status !== 'closed')
        return true;
    return false;
}
export async function mergeBackendShifts(backendShifts: any[]) {
    if (!Array.isArray(backendShifts) || backendShifts.length === 0)
        return;
    const { getDB } = await import('./db');
    const db = await getDB();
    const queuedShiftIds = await getQueuedShiftIds();
    const tx = db.transaction('shifts', 'readwrite');
    for (const backendShift of backendShifts) {
        const localShift = await tx.store.get(backendShift.id);
        if (shouldKeepLocalShift(localShift, backendShift, queuedShiftIds))
            continue;
        await tx.store.put(localShift ? { ...localShift, ...backendShift } : backendShift);
    }
    await tx.done;
}
export async function resolveUserOpenShift(userId?: string, storeId?: string, options?: {
    syncWithBackend?: boolean;
}) {
    if (!userId)
        return null;
    const { getDB } = await import('./db');
    const db = await getDB();
    let backendOpenShiftIds = new Set<string>();
    if (options?.syncWithBackend && storeId && await hasUsableNetworkConnection()) {
        const backendUp = await backendAvailable().catch(() => false);
        if (backendUp) {
            try {
                const url = new URL(`${API_BASE}/shifts.php`);
                url.searchParams.set('storeId', String(storeId));
                const response = await fetch(url.toString(), { cache: 'no-store' });
                if (response.ok) {
                    const backendShifts = await response.json();
                    if (Array.isArray(backendShifts)) {
                        backendOpenShiftIds = new Set(backendShifts
                            .filter((shift: any) => String(shift?.status || '') === 'open' &&
                            String(shift?.userId || '') === String(userId) &&
                            String(shift?.storeId || '') === String(storeId || ''))
                            .map((shift: any) => String(shift?.id || ''))
                            .filter(Boolean));
                        await mergeBackendShifts(backendShifts);
                        await mergeOverlappingShiftsForUserStore(userId, storeId, {
                            backendShiftIds: new Set(backendShifts.map((shift: any) => String(shift?.id || '')).filter(Boolean)),
                            rebuildShiftSyncOps: true,
                        });
                        const queuedShiftIds = await getQueuedShiftIds();
                        const backendIds = new Set(backendShifts.map((shift: any) => String(shift.id)));
                        const localShifts = await db.getAll('shifts');
                        const fiveMinutes = 5 * 60 * 1000;
                        const ghostOpenShifts = localShifts.filter((shift: any) => shift.status === 'open' &&
                            String(shift.userId) === String(userId) &&
                            String(shift.storeId || '') === String(storeId || '') &&
                            !backendIds.has(String(shift.id)) &&
                            !queuedShiftIds.has(String(shift.id)) &&
                            (Date.now() - Number(shift.openedAt || 0)) > fiveMinutes);
                        if (ghostOpenShifts.length > 0) {
                            const cleanupTx = db.transaction('shifts', 'readwrite');
                            await Promise.all([
                                ...ghostOpenShifts.map((shift: any) => cleanupTx.store.delete(shift.id)),
                                cleanupTx.done,
                            ]);
                        }
                    }
                }
            }
            catch (e) {
            }
        }
    }
    let openShifts = await db.getAllFromIndex('shifts', 'by-status', 'open');
    openShifts = openShifts
        .filter((shift: any) => String(shift.userId) === String(userId) &&
        (storeId ? String(shift.storeId || '') === String(storeId) : true))
        .sort((a: any, b: any) => Number(b.openedAt || 0) - Number(a.openedAt || 0));
    const closedMarker = readClosedShiftMarker(userId, storeId);
    if (closedMarker) {
        const markerTargetsBackendOpenShift = backendOpenShiftIds.has(String(closedMarker.id || ''));
        if (markerTargetsBackendOpenShift) {
            clearClosedShiftMarker(userId, storeId);
        }
        const staleOpenShifts = markerTargetsBackendOpenShift ? [] : openShifts.filter((shift: any) => String(shift.id) === String(closedMarker.id));
        if (staleOpenShifts.length > 0) {
            const tx = db.transaction('shifts', 'readwrite');
            await Promise.all([
                ...staleOpenShifts.map((shift: any) => tx.store.put({
                    ...shift,
                    status: 'closed',
                    closedAt: Number(closedMarker.closedAt || Date.now()),
                    closingAmount: shift.closingAmount ?? shift.openingAmount ?? 0,
                    expectedAmount: shift.expectedAmount ?? shift.openingAmount ?? 0,
                    difference: shift.difference ?? 0,
                })),
                tx.done,
            ]);
            clearClosedShiftMarker(userId, storeId);
            openShifts = openShifts.filter((shift: any) => !staleOpenShifts.some((stale: any) => String(stale.id) === String(shift.id)));
        }
    }
    if (openShifts.length > 1) {
        const [latestShift, ...duplicates] = openShifts;
        const duplicateIdsToDelete: string[] = [];
        for (const shift of duplicates) {
            try {
                const linkedSales = await db.getAllFromIndex('sales', 'by-shift', shift.id);
                if (!Array.isArray(linkedSales) || linkedSales.length === 0) {
                    duplicateIdsToDelete.push(String(shift.id));
                }
            }
            catch (e) {
            }
        }
        if (duplicateIdsToDelete.length > 0) {
            const tx = db.transaction('shifts', 'readwrite');
            await Promise.all([
                ...duplicateIdsToDelete.map((shiftId) => tx.store.delete(shiftId)),
                tx.done,
            ]);
        }
        persistActiveShiftCache(latestShift);
        return latestShift;
    }
    if (openShifts[0]) {
        persistActiveShiftCache(openShifts[0]);
        return openShifts[0];
    }
    persistInactiveShiftCache(userId, storeId, closedMarker || undefined);
    return null;
}
function isRefundedSale(item: any) {
    return item?.refunded === true || item?.refunded === 1 || item?.refunded === '1';
}
function refundedAtTimestamp(item: any) {
    const timestamp = Number(item?.refundedAt || 0);
    return Number.isFinite(timestamp) ? timestamp : 0;
}
// Helper générique pour récupérer et merger une entité depuis le backend
export async function fetchAndMerge(endpoint: string, storeName: string, tableName?: string, normalizeFn?: (item: any) => any, params?: Record<string, string>) {
    try {
        // Always bypass service-worker/runtime caches for sync reads.
        const urlObj = new URL(endpoint, window.location.origin);
        if (params && Object.keys(params).length > 0) {
            for (const [k, v] of Object.entries(params)) {
                if (v != null)
                    urlObj.searchParams.set(k, String(v));
            }
        }
        urlObj.searchParams.set('_bypass_sw', '1');
        urlObj.searchParams.set('_ts', String(Date.now()));
        const url = urlObj.toString();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok)
            return;
        let backendItems: any = await res.json();
        // If backend returned an object with a wrapper (e.g. { data: [...] })
        if (!Array.isArray(backendItems)) {
            // try common wrapper fields
            if (backendItems && Array.isArray(backendItems.data)) {
                backendItems = backendItems.data;
            }
            else if (backendItems && Array.isArray(backendItems.items)) {
                backendItems = backendItems.items;
            }
            else {
                writeSyncLog({ level: 'warn', message: `Unexpected response shape from ${endpoint}`, entity: storeName, details: { endpoint, responseType: typeof backendItems } });
                // Avoid throwing — treat as empty list to avoid crashing the whole refresh
                backendItems = [];
            }
        }
        // Filtrage côté client pour sécurité : si storeId est passé en paramètre, ne garder que les items de ce store
        // Exception: stores table n'a pas besoin d'être filtré (on veut tous les stores pour afficher les noms)
        if (params?.storeId && storeName !== 'stores') {
            backendItems = backendItems.filter((item: any) => {
                // Vérifier si l'item appartient au store demandé
                return item.storeId === params.storeId;
            });
        }
        const { getDB } = await import('./db');
        const db = await getDB();
        const pending = await db.getAll('syncQueue');
        const currentTable = tableName || storeName;
        let pendingDirectOps: any[] = [];
        if (currentTable === 'sales') {
            try {
                pendingDirectOps = await getPendingSyncOps();
            }
            catch (e) {
            }
        }
        const pendingForTable = pending.filter((op: any) => op.table === currentTable);
        const pendingIds = new Set([
            ...pendingForTable
                .map((op: any) => op?.data?.id)
                .filter((id: any) => id != null)
                .map((id: any) => String(id)),
            ...pendingDirectOps
                .filter((op: any) => String(op?.url || '').includes('/sales.php'))
                .map((op: any) => op?.data?.id)
                .filter((id: any) => id != null)
                .map((id: any) => String(id))
        ]);
        const normalized = (backendItems || []).map((it: any) => normalizeFn ? normalizeFn(it) : ({ ...it }));
        const allLocalItems = await db.getAll(storeName as any);
        const isScopedByStore = Boolean(params?.storeId && storeName !== 'stores');
        const localItems = isScopedByStore
            ? allLocalItems.filter((it: any) => String(it?.storeId) === String(params?.storeId))
            : allLocalItems;
        const localItemsOutsideScope = isScopedByStore
            ? allLocalItems.filter((it: any) => String(it?.storeId) !== String(params?.storeId))
            : [];
        // Build merged map: start with backend items
        const mergedMap = new Map<string, any>(normalized.map((it: any) => [String(it.id), it]));
        // Merge local items: if item exists on backend, choose latest by updatedAt, otherwise keep local
        for (const local of localItems) {
            const id = String(local.id);
            const backend = mergedMap.get(id);
            const localUpdated = typeof local.updatedAt === 'number' ? local.updatedAt : 0;
            const backendUpdated = backend && typeof backend.updatedAt === 'number' ? backend.updatedAt : 0;
            if (!backend) {
                // Not present on backend: preserve only if we have local pending operations for this id.
                // Otherwise, backend deletion wins and the local item is removed during merge.
                if (pendingIds.has(id)) {
                    mergedMap.set(id, local);
                }
                else if (currentTable === 'sales') {
                    mergedMap.set(id, local);
                    pendingIds.add(id);
                    await queueSyncOp({
                        url: `${API_BASE}/sales.php`,
                        method: 'POST',
                        table: 'sales',
                        storeId: local?.storeId,
                        data: local,
                    });
                    writeSyncLog({
                        level: 'warn',
                        message: 'Vente locale absente du serveur remise en file de synchronisation',
                        entity: 'sales',
                        details: { id, storeId: local?.storeId },
                    });
                }
            }
            else {
                if (currentTable === 'sales') {
                    const shouldKeepLocalSale = pendingIds.has(id) ||
                        (isRefundedSale(local) && !isRefundedSale(backend)) ||
                        refundedAtTimestamp(local) > refundedAtTimestamp(backend);
                    if (shouldKeepLocalSale) {
                        const mergedSale = { ...backend, ...local } as any;
                        if (Array.isArray(local.items) && local.items.length > 0) {
                            mergedSale.items = local.items;
                        }
                        mergedMap.set(id, mergedSale);
                        continue;
                    }
                }
                // Present on both: keep the most recent according to updatedAt
                if (localUpdated > backendUpdated) {
                    // For 'stores' be conservative: prefer backend logo unless the local change
                    // is a very recent local upload (marked by storeLogo_ts). This avoids
                    // an old local logo overwriting a newer backend upload during sync.
                    if (storeName === 'stores') {
                        try {
                            const localLogoTs = Number(localStorage.getItem('storeLogo_ts') || '0');
                            const RECENT_MS = 5 * 60 * 1000; // 5 minutes
                            if (!localLogoTs || (Date.now() - localLogoTs) > RECENT_MS) {
                                // local update is not recent — prefer backend instead
                                // do nothing here, backend remains in mergedMap
                            }
                            else {
                                mergedMap.set(id, local);
                                continue;
                            }
                        }
                        catch (e) {
                            // on error, fall back to previous behavior and keep local
                            mergedMap.set(id, local);
                            continue;
                        }
                    }
                    else {
                        mergedMap.set(id, local);
                    }
                }
                else {
                    // keep backend (already in mergedMap)
                    // Special-case for stores: if backend explicitly removed logo (null or missing),
                    // ensure we remove it locally even if local has newer updatedAt.
                    if (storeName === 'stores') {
                        const backendHasLogo = backend && ('logo' in backend) && backend.logo != null;
                        if (!backendHasLogo) {
                            // remove logo from local copy
                            const localCopy = { ...local } as any;
                            if ('logo' in localCopy)
                                delete localCopy.logo;
                            mergedMap.set(id, localCopy);
                            continue;
                        }
                    }
                }
            }
        }
        // Persist merged list
        const merged = Array.from(mergedMap.values());
        const finalItems = isScopedByStore ? [...localItemsOutsideScope, ...merged] : merged;
        const tx = db.transaction(storeName as any, 'readwrite');
        await tx.store.clear();
        for (const it of finalItems)
            await tx.store.put(it as any);
        await tx.done;
        writeSyncLog({
            level: 'info',
            message: `Merged ${storeName} from backend`,
            entity: storeName,
            details: {
                endpoint,
                scoped: isScopedByStore,
                mergedCount: merged.length,
                finalCount: finalItems.length,
            },
        });
    }
    catch (e) {
        writeSyncLog({ level: 'error', message: `Erreur merge ${storeName}`, entity: storeName, details: { error: String(e) } });
    }
}
function shiftContainsTimestamp(shift: any, timestamp: number) {
    if (!Number.isFinite(timestamp)) {
        return false;
    }
    const openedAt = shiftOpenedAt(shift);
    const intervalEnd = shiftIntervalEnd(shift);
    return openedAt <= timestamp && timestamp <= intervalEnd;
}

function pickBestShiftForSale(shifts: any[], sale: any) {
    const saleTime = Number(sale?.createdAt || 0);
    if (!Number.isFinite(saleTime) || saleTime <= 0) {
        return null;
    }

    const candidates = shifts
        .filter((shift: any) =>
            String(shift?.userId || '') === String(sale?.userId || '') &&
            String(shift?.storeId || '') === String(sale?.storeId || '') &&
            shiftContainsTimestamp(shift, saleTime))
        .sort((left: any, right: any) => {
            const leftOpen = String(left?.status || '') === 'open' ? 1 : 0;
            const rightOpen = String(right?.status || '') === 'open' ? 1 : 0;
            if (leftOpen !== rightOpen) {
                return rightOpen - leftOpen;
            }
            const leftSpan = shiftIntervalEnd(left) - shiftOpenedAt(left);
            const rightSpan = shiftIntervalEnd(right) - shiftOpenedAt(right);
            if (leftSpan !== rightSpan) {
                return leftSpan - rightSpan;
            }
            return shiftOpenedAt(right) - shiftOpenedAt(left);
        });

    return candidates[0] || null;
}

// Réconcilier uniquement les ventes dont le shiftId est manquant/invalide
// ou dont l'horodatage ne rentre pas dans le shift associé.
// Règle métier: on ne rattache une vente qu'à un shift du même user/store
// dont la plage horaire contient réellement l'heure de la vente.
export async function reconcileSalesToLastClosedShift(storeId?: string) {
    try {
        const { getDB } = await import('./db');
        const db = await getDB();
        await mergeOverlappingShiftsForStoreScope(storeId);
        let shifts = await db.getAll('shifts');
        let sales = await db.getAll('sales');
        if (storeId) {
            shifts = shifts.filter((s: any) => s.storeId === storeId);
            sales = sales.filter((s: any) => s.storeId === storeId);
        }
        if (!shifts.length || !sales.length)
            return;
        const shiftById = new Map<string, any>(shifts.map((s: any) => [String(s.id), s]));
        const salesToUpdate: any[] = [];
        for (const sale of sales) {
            const saleShiftId = sale.shiftId ? String(sale.shiftId) : '';
            const shift = saleShiftId ? shiftById.get(saleShiftId) : null;
            const saleTime = Number(sale.createdAt || 0);
            const hasValidAssignedShift = Boolean(shift && shiftContainsTimestamp(shift, saleTime));
            const needsReattach = !saleShiftId || !shift || !hasValidAssignedShift;
            if (!needsReattach)
                continue;

            const targetShift = pickBestShiftForSale(shifts, sale);
            if (!targetShift)
                continue;

            if (String(targetShift.id) !== String(sale.shiftId)) {
                salesToUpdate.push({ ...sale, shiftId: targetShift.id });
            }
        }
        if (salesToUpdate.length === 0)
            return;
        const tx = db.transaction(['sales'], 'readwrite');
        for (const s of salesToUpdate) {
            await tx.objectStore('sales').put(s);
        }
        await tx.done;
        // Propager les corrections vers le backend — queue uniquement les opérations qui échouent.
        // Important: éviter les doublons massifs dans syncQueue.
        if (await hasUsableNetworkConnection()) {
            const failedSales: any[] = [];
            const salesArray = salesToUpdate;
            const settled = await Promise.allSettled([
                ...salesArray.map((s: any) => fetch(`${API_BASE}/sales.php`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(s),
                })),
            ]);
            for (let i = 0; i < settled.length; i++) {
                const result = settled[i];
                if (result.status === 'rejected') {
                    failedSales.push(salesArray[i]);
                    continue;
                }
                if (!result.value.ok) {
                    failedSales.push(salesArray[i]);
                }
            }
            if (failedSales.length > 0) {
                for (const sale of failedSales) {
                    await upsertSyncQueueOp(
                        (op: any) => String(op?.table || '') === 'sales' && String(op?.data?.id || '') === String(sale?.id || ''),
                        {
                            table: 'sales',
                            operation: 'update',
                            method: 'PUT',
                            data: sale,
                            url: `${API_BASE}/sales.php`,
                            storeId: sale?.storeId,
                        }
                    );
                }
            }
        }
    }
    catch (e) {
    }
}
export async function refreshAllFromBackend(storeId?: string) {
    if (!await hasUsableNetworkConnection())
        return;
    // Double-check backend reachability before attempting the full refresh
    try {
        const backendUp = await backendAvailable();
        if (!backendUp) {
            return;
        }
    }
    catch (e) {
        return;
    }
    const params = storeId ? { storeId } : undefined;
    // Batch 1 : données de référence (toutes indépendantes, téléchargées en parallèle)
    await Promise.all([
        fetchAndMerge(`${API_BASE}/products.php`, 'products', 'products', (p: any) => ({ ...p, stock: p.stock || {} }), params),
        fetchAndMerge(`${API_BASE}/customers.php`, 'customers', 'customers', undefined, params),
        fetchAndMerge(`${API_BASE}/categories.php`, 'categories', 'categories', undefined, params),
        fetchAndMerge(`${API_BASE}/expense_categories.php`, 'expenseCategories', 'expenseCategories', undefined, params),
        fetchAndMerge(`${API_BASE}/stores.php?include_inactive=1`, 'stores', 'stores', undefined, params),
        fetchAndMerge(`${API_BASE}/users.php`, 'users', 'users', undefined, params),
    ]);
    // Batch 2 : shifts et sales (en parallèle, doivent être terminés avant la réconciliation)
    await Promise.all([
        fetchAndMerge(`${API_BASE}/shifts.php`, 'shifts', 'shifts', undefined, params),
        fetchAndMerge(`${API_BASE}/sales.php`, 'sales', 'sales', undefined, {
            ...(params || {}),
            all: '1',
        }),
    ]);
    await mergeOverlappingShiftsForStoreScope(storeId);
    await reconcileSalesToLastClosedShift(storeId);
    // Batch 3 : autres données (en parallèle)
    await Promise.all([
        fetchAndMerge(`${API_BASE}/expenses_advanced.php`, 'expensesAdvanced', 'expensesAdvanced', undefined, params),
        fetchAndMerge(`${API_BASE}/stock_signals.php`, 'stockSignals', 'stockSignals', undefined, params),
    ]);
}
// Forcer la synchronisation manuelle
export async function forceSyncNow() {
    return syncWithServer();
}
// S’abonner aux changements d’état réseau
export function onConnectionStateChange(cb) {
    listeners.push(cb);
    return () => {
        const idx = listeners.indexOf(cb);
        if (idx > -1)
            listeners.splice(idx, 1);
    };
}
// Écouteur global pour détecter la reconnexion et lancer la sync
window.addEventListener('online', async () => {
    connectionState.isOnline = true;
    emitConnectionStateChange();
    // Only attempt network sync if backend is reachable
    try {
        const backendUp = await backendAvailable();
        if (!backendUp) {
            return;
        }
        // First try to flush pending operations
        await syncWithServer();
        // Ne rafraîchit plus automatiquement les données locales depuis le backend
        // L'utilisateur doit cliquer sur un bouton ou déclencher manuellement refreshAllFromBackend
    }
    catch (e) {
    }
});
window.addEventListener('offline', () => {
    connectionState.isOnline = false;
    emitConnectionStateChange();
});

addNativeNetworkListener((status) => {
    connectionState.isOnline = !!status.connected;
    emitConnectionStateChange();
}).catch(() => { });
