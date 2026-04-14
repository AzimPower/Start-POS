import { getPendingSyncOps } from './sync';
const SALES_API_PATH = '/backend/api/sales.php';
type QueryParams = URLSearchParams | Record<string, string | number | boolean | null | undefined>;
export function buildBypassUrl(baseUrl: string, params?: QueryParams) {
    const url = new URL(baseUrl);
    if (params instanceof URLSearchParams) {
        params.forEach((value, key) => {
            if (value != null) {
                url.searchParams.set(key, value);
            }
        });
    }
    else if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value != null) {
                url.searchParams.set(key, String(value));
            }
        }
    }
    url.searchParams.set('_bypass_sw', '1');
    url.searchParams.set('_ts', String(Date.now()));
    return url.toString();
}
export function isSaleRefunded(sale: any) {
    return sale?.refunded === true || sale?.refunded === 1 || sale?.refunded === '1';
}
function toTimestamp(value: any) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function mergeLocalSale(localSale: any, backendSale: any) {
    const mergedSale = {
        ...backendSale,
        ...localSale,
    };
    if (Array.isArray(localSale?.items) && localSale.items.length > 0) {
        mergedSale.items = localSale.items;
    }
    return mergedSale;
}
async function getPendingSaleIds(db: any) {
    const pendingSaleIds = new Set<string>();
    try {
        const syncQueue = await db.getAll('syncQueue');
        for (const op of syncQueue) {
            const url = String(op?.url || '');
            const table = String(op?.table || '');
            if ((table === 'sales' || url.includes(SALES_API_PATH)) && op?.data?.id) {
                pendingSaleIds.add(String(op.data.id));
            }
        }
    }
    catch (error) {
    }
    try {
        const pendingOps = await getPendingSyncOps();
        for (const op of pendingOps) {
            if (String(op?.url || '').includes(SALES_API_PATH) && op?.data?.id) {
                pendingSaleIds.add(String(op.data.id));
            }
        }
    }
    catch (error) {
    }
    return pendingSaleIds;
}
export function shouldPreferLocalSale(localSale: any, backendSale: any, pendingSaleIds: Set<string>) {
    const saleId = String(backendSale?.id || localSale?.id || '');
    if (!saleId)
        return false;
    if (pendingSaleIds.has(saleId)) {
        return true;
    }
    const localRefunded = isSaleRefunded(localSale);
    const backendRefunded = isSaleRefunded(backendSale);
    if (localRefunded && !backendRefunded) {
        return true;
    }
    return toTimestamp(localSale?.refundedAt) > toTimestamp(backendSale?.refundedAt);
}
export async function mergeBackendSalesIntoLocalDb(db: any, backendSales: any[], options?: { restrictToBackendIds?: boolean; }) {
    let localSales: any[];
    if (options?.restrictToBackendIds) {
        const backendIds = Array.from(new Set((backendSales || [])
            .map((sale: any) => sale?.id)
            .filter((id: any) => id != null)
            .map((id: any) => String(id))));
        localSales = (await Promise.all(backendIds.map((id) => db.get('sales', id))))
            .filter((sale: any) => sale?.id != null);
    }
    else {
        localSales = await db.getAll('sales');
    }
    const localSalesById = new Map<string, any>(localSales
        .filter((sale: any) => sale?.id != null)
        .map((sale: any) => [String(sale.id), sale]));
    const pendingSaleIds = await getPendingSaleIds(db);
    const mergedSales = (backendSales || []).map((backendSale: any) => {
        const localSale = localSalesById.get(String(backendSale?.id || ''));
        if (!localSale || !shouldPreferLocalSale(localSale, backendSale, pendingSaleIds)) {
            return backendSale;
        }
        return mergeLocalSale(localSale, backendSale);
    });
    const tx = db.transaction('sales', 'readwrite');
    await Promise.all([
        ...mergedSales.map((sale: any) => tx.store.put(sale)),
        tx.done,
    ]);
    return mergedSales;
}

function isSalesQueueEntry(entry: any) {
    const url = String(entry?.url || '');
    const table = String(entry?.table || '');

    return table === 'sales' || url.includes(SALES_API_PATH);
}

function getQueueEntryMethod(entry: any) {
    const explicitMethod = String(entry?.method || '').toUpperCase();
    if (explicitMethod) {
        return explicitMethod;
    }

    const operation = String(entry?.operation || '').toLowerCase();
    if (operation === 'create') {
        return 'POST';
    }
    if (operation === 'update') {
        return 'PUT';
    }
    if (operation === 'delete') {
        return 'DELETE';
    }

    return 'POST';
}

function shouldIncludeSaleForStore(sale: any, storeId?: string) {
    if (!sale?.id) {
        return false;
    }

    if (!storeId) {
        return true;
    }

    return String(sale.storeId || '') === String(storeId);
}

export async function buildProjectedLocalSales(db: any, options?: { storeId?: string; }) {
    const localSales = await db.getAll('sales');
    const salesById = new Map<string, any>(localSales
        .filter((sale: any) => shouldIncludeSaleForStore(sale, options?.storeId))
        .map((sale: any) => [String(sale.id), sale]));

    const queueEntries: any[] = [];

    try {
        queueEntries.push(...await getPendingSyncOps());
    }
    catch (error) {
    }

    try {
        queueEntries.push(...await db.getAll('syncQueue'));
    }
    catch (error) {
    }

    for (const entry of queueEntries) {
        if (!isSalesQueueEntry(entry)) {
            continue;
        }

        const sale = entry?.data;
        if (!shouldIncludeSaleForStore(sale, options?.storeId)) {
            continue;
        }

        const saleId = String(sale.id || '');
        if (!saleId) {
            continue;
        }

        const method = getQueueEntryMethod(entry);
        if (method === 'DELETE') {
            salesById.delete(saleId);
            continue;
        }

        const currentSale = salesById.get(saleId);
        salesById.set(saleId, currentSale ? mergeLocalSale(sale, currentSale) : sale);
    }

    return Array.from(salesById.values()).sort((a: any, b: any) => toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt));
}
