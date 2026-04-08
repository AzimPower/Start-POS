// Module de synchronisation hors-ligne avec IndexedDB
import { openDB } from 'idb';
import { backendAvailable } from './backend';
export const SYNC_DB_NAME = 'pos_sync_db';
export const SYNC_STORE = 'pending_ops';
// État de connexion et de synchronisation
export const connectionState = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastCheck: Date.now(),
};
const listeners = [];
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
            id: crypto.randomUUID(),
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
export async function getPendingSyncOps() {
    const db = await getSyncDB();
    return db.getAll(SYNC_STORE);
}
// Compter les opérations en attente
export async function getPendingSyncCount() {
    const db = await getSyncDB();
    return db.count(SYNC_STORE);
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
    if (!navigator.onLine) {
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
        // 1. Traiter les opérations de pending_ops (pos_sync_db)
        const ops = await getPendingSyncOps();
        for (const op of ops) {
            if (networkErrorOccurred)
                break;
            try {
                const res = await fetch(op.url, {
                    method: op.method || 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(op.data),
                });
                if (res.ok) {
                    await removeSyncOp(op.id);
                    successCount++;
                    writeSyncLog({ level: 'info', message: 'Op synchronisée (pending_ops)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                }
                else {
                    writeSyncLog({ level: 'warn', message: `Erreur serveur ${res.status} (pending_ops)`, entity: op.table, details: { url: op.url, status: res.status } });
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
                const { getDB } = await import('./db');
                const mainDb = await getDB();
                const queueOps = await mainDb.getAll('syncQueue');
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
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(op.data),
                        });
                        if (res.ok) {
                            await mainDb.delete('syncQueue', op.id);
                            successCount++;
                            writeSyncLog({ level: 'info', message: 'Op synchronisée (syncQueue)', entity: op.table, details: { id: op.data?.id, url: op.url } });
                        }
                        else {
                            writeSyncLog({ level: 'warn', message: `Erreur serveur ${res.status} (syncQueue)`, entity: op.table, details: { url: op.url, status: res.status } });
                        }
                    }
                    catch (e) {
                        networkErrorOccurred = true;
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
    if (options?.syncWithBackend && storeId && navigator.onLine) {
        const backendUp = await backendAvailable().catch(() => false);
        if (backendUp) {
            try {
                const url = new URL('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php');
                url.searchParams.set('storeId', String(storeId));
                const response = await fetch(url.toString(), { cache: 'no-store' });
                if (response.ok) {
                    const backendShifts = await response.json();
                    if (Array.isArray(backendShifts)) {
                        await mergeBackendShifts(backendShifts);
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
        const staleOpenShifts = openShifts.filter((shift: any) => String(shift.id) === String(closedMarker.id) ||
            Number(shift.openedAt || 0) <= Number(closedMarker.closedAt || 0));
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
            openShifts = openShifts.filter((shift: any) => !staleOpenShifts.some((stale: any) => String(stale.id) === String(shift.id)));
        }
    }
    if (openShifts.length > 1) {
        const [latestShift, ...duplicates] = openShifts;
        const tx = db.transaction('shifts', 'readwrite');
        await Promise.all([
            ...duplicates.map((shift: any) => tx.store.put({
                ...shift,
                status: 'closed',
                closedAt: Date.now(),
                closingAmount: shift.openingAmount || 0,
                expectedAmount: shift.openingAmount || 0,
                difference: 0,
            })),
            tx.done,
        ]);
        return latestShift;
    }
    return openShifts[0] || null;
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
// Réconcilier les ventes "orphelines" vers le dernier shift fermé par utilisateur + magasin.
// Règle: si une vente n'a pas de shiftId, ou son shiftId n'existe pas localement,
// ou si la vente a un timestamp > closedAt du shift (shift fermé),
// alors on la rattache au dernier shift fermé du même user/store.
// Le closedAt du shift devient le max entre son closedAt actuel et la vente la plus récente rattachée.
export async function reconcileSalesToLastClosedShift(storeId?: string) {
    try {
        const { getDB } = await import('./db');
        const db = await getDB();
        let shifts = await db.getAll('shifts');
        let sales = await db.getAll('sales');
        if (storeId) {
            shifts = shifts.filter((s: any) => s.storeId === storeId);
            sales = sales.filter((s: any) => s.storeId === storeId);
        }
        if (!shifts.length || !sales.length)
            return;
        const shiftById = new Map<string, any>(shifts.map((s: any) => [String(s.id), s]));
        // Index last closed shift per user+store
        const lastClosedByUserStore = new Map<string, any>();
        for (const s of shifts) {
            if (s.status !== 'closed' || !s.closedAt)
                continue;
            const key = `${s.userId}__${s.storeId}`;
            const prev = lastClosedByUserStore.get(key);
            if (!prev || (s.closedAt > prev.closedAt)) {
                lastClosedByUserStore.set(key, s);
            }
        }
        const salesToUpdate: any[] = [];
        const shiftsToUpdate = new Map<string, any>();
        for (const sale of sales) {
            const saleTime = sale.createdAt || 0;
            const saleShiftId = sale.shiftId ? String(sale.shiftId) : '';
            const shift = saleShiftId ? shiftById.get(saleShiftId) : null;
            const isShiftMissing = !shift;
            const isShiftClosedPastSale = Boolean(shift && shift.status === 'closed' && shift.closedAt && saleTime > shift.closedAt);
            const needsReattach = !saleShiftId || isShiftMissing || isShiftClosedPastSale;
            if (!needsReattach)
                continue;
            const key = `${sale.userId}__${sale.storeId}`;
            const lastClosed = lastClosedByUserStore.get(key);
            if (!lastClosed)
                continue;
            // Re-rattacher la vente
            if (String(lastClosed.id) !== String(sale.shiftId)) {
                salesToUpdate.push({ ...sale, shiftId: lastClosed.id });
            }
            // Étendre openedAt / closedAt si besoin
            const updatedShift = shiftsToUpdate.get(String(lastClosed.id)) || { ...lastClosed };
            if (!updatedShift.openedAt || saleTime < updatedShift.openedAt) {
                updatedShift.openedAt = saleTime;
            }
            if (!updatedShift.closedAt || saleTime > updatedShift.closedAt) {
                updatedShift.closedAt = saleTime;
            }
            shiftsToUpdate.set(String(lastClosed.id), updatedShift);
        }
        if (salesToUpdate.length === 0 && shiftsToUpdate.size === 0)
            return;
        const tx = db.transaction(['sales', 'shifts'], 'readwrite');
        for (const s of salesToUpdate) {
            await tx.objectStore('sales').put(s);
        }
        for (const sh of shiftsToUpdate.values()) {
            await tx.objectStore('shifts').put(sh);
        }
        await tx.done;
        // Propager les corrections vers le backend — tente direct, met en queue si échec
        if (navigator.onLine) {
            try {
                const salesFetches = salesToUpdate.map((s: any) => fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(s),
                }));
                const shiftFetches = Array.from(shiftsToUpdate.values()).map((sh: any) => fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sh),
                }));
                await Promise.all([...salesFetches, ...shiftFetches]);
            }
            catch (e) {
                // Si échec réseau: mettre en syncQueue pour être retenté lors de la prochaine sync
                try {
                    const { getDB } = await import('./db');
                    const mainDb = await getDB();
                    const now = Date.now();
                    for (const s of salesToUpdate) {
                        try {
                            await mainDb.add('syncQueue', {
                                id: crypto.randomUUID(), table: 'sales', operation: 'update' as const,
                                data: s, url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php', createdAt: now, attempts: 0,
                            });
                        }
                        catch (_) { }
                    }
                    for (const sh of shiftsToUpdate.values()) {
                        try {
                            await mainDb.add('syncQueue', {
                                id: crypto.randomUUID(), table: 'shifts', operation: 'update' as const,
                                data: sh, url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', createdAt: now, attempts: 0,
                            });
                        }
                        catch (_) { }
                    }
                }
                catch (queueErr) {
                }
            }
        }
    }
    catch (e) {
    }
}
export async function refreshAllFromBackend(storeId?: string) {
    if (!navigator.onLine)
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
    const BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api';
    // Batch 1 : données de référence (toutes indépendantes, téléchargées en parallèle)
    await Promise.all([
        fetchAndMerge(`${BASE}/products.php`, 'products', 'products', (p: any) => ({ ...p, stock: p.stock || {} }), params),
        fetchAndMerge(`${BASE}/customers.php`, 'customers', 'customers', undefined, params),
        fetchAndMerge(`${BASE}/categories.php`, 'categories', 'categories', undefined, params),
        fetchAndMerge(`${BASE}/expense_categories.php`, 'expenseCategories', 'expenseCategories', undefined, params),
        fetchAndMerge(`${BASE}/stores.php`, 'stores', 'stores', undefined, params),
        fetchAndMerge(`${BASE}/users.php`, 'users', 'users', undefined, params),
    ]);
    // Batch 2 : shifts et sales (en parallèle, doivent être terminés avant la réconciliation)
    await Promise.all([
        fetchAndMerge(`${BASE}/shifts.php`, 'shifts', 'shifts', undefined, params),
        fetchAndMerge(`${BASE}/sales.php`, 'sales', 'sales', undefined, params),
    ]);
    await reconcileSalesToLastClosedShift(storeId);
    // Batch 3 : autres données (en parallèle)
    await Promise.all([
        fetchAndMerge(`${BASE}/expenses_advanced.php`, 'expensesAdvanced', 'expensesAdvanced', undefined, params),
        fetchAndMerge(`${BASE}/stock_signals.php`, 'stockSignals', 'stockSignals', undefined, params),
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
