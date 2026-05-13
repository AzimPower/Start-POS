import { getDB, performSyncOp } from '@/lib/db';
import { BACKEND_BASE, backendAvailable } from '@/lib/backend';

const BACKEND_URL = `${BACKEND_BASE}/api/receipt_settings.php`;
const CACHE_TTL_MS = 60_000;

export interface StoreReceiptSettings {
    printLogo: boolean;
    thankYouMessage: string;
}

type ReceiptSettingsCacheEntry = {
    settings: StoreReceiptSettings;
    fetchedAt: number;
};

export const DEFAULT_STORE_RECEIPT_SETTINGS: StoreReceiptSettings = {
    printLogo: true,
    thankYouMessage: 'Merci pour votre visite !\nA bientot',
};

function hasOwnSetting(data: any, key: keyof StoreReceiptSettings) {
    return Object.prototype.hasOwnProperty.call(data || {}, key);
}

function normalizeBooleanSetting(data: any, key: keyof StoreReceiptSettings, fallback: boolean) {
    if (!hasOwnSetting(data, key)) {
        return fallback;
    }

    const value = data?.[key];

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['0', 'false', 'off', 'no'].includes(normalized)) {
            return false;
        }
        if (['1', 'true', 'on', 'yes'].includes(normalized)) {
            return true;
        }
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    return fallback;
}

function normalizeThankYouMessage(value: unknown, fallback: string) {
    if (value === undefined) {
        return fallback;
    }

    if (value === null) {
        return '';
    }

    return String(value).replace(/\r\n?/g, '\n');
}

function normalizeSettings(data: any, fallback: StoreReceiptSettings = DEFAULT_STORE_RECEIPT_SETTINGS): StoreReceiptSettings {
    return {
        printLogo: normalizeBooleanSetting(data, 'printLogo', fallback.printLogo),
        thankYouMessage: normalizeThankYouMessage(data?.thankYouMessage, fallback.thankYouMessage),
    };
}

function hasPersistedRemoteSettings(data: any) {
    return String(data?.id || '').trim().length > 0;
}

const memoryCache = new Map<string, ReceiptSettingsCacheEntry>();

export async function getStoreReceiptSettings(storeId: string): Promise<StoreReceiptSettings> {
    if (!storeId) {
        return { ...DEFAULT_STORE_RECEIPT_SETTINGS };
    }

    const cached = memoryCache.get(storeId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.settings;
    }

    let db: Awaited<ReturnType<typeof getDB>> | null = null;
    let localRecord: any = null;
    let localSettings: StoreReceiptSettings | null = null;

    try {
        db = await getDB();
        localRecord = await db.get('receiptSettings', storeId);
        if (localRecord) {
            localSettings = normalizeSettings(localRecord);
        }
    }
    catch {
    }

    if (await backendAvailable().catch(() => false)) {
        try {
            const response = await fetch(`${BACKEND_URL}?storeId=${encodeURIComponent(storeId)}`, {
                cache: 'no-store',
            });
            if (response.ok) {
                const data = await response.json();
                const remoteExists = hasPersistedRemoteSettings(data);
                const remoteUpdatedAt = Number(data?.updatedAt || 0);
                const localUpdatedAt = Number(localRecord?.updatedAt || 0);
                const mergedRemoteSettings = normalizeSettings(data, localSettings || DEFAULT_STORE_RECEIPT_SETTINGS);
                const shouldPreferLocal = !!localSettings && (!remoteExists || (localUpdatedAt > 0 && localUpdatedAt > remoteUpdatedAt));
                const settings = shouldPreferLocal ? localSettings : mergedRemoteSettings;
                const effectiveUpdatedAt = shouldPreferLocal
                    ? (localUpdatedAt || Date.now())
                    : (remoteUpdatedAt || Date.now());

                memoryCache.set(storeId, { settings, fetchedAt: Date.now() });

                try {
                    const activeDb = db || await getDB();
                    await activeDb.put('receiptSettings', {
                        id: storeId,
                        storeId,
                        ...settings,
                        updatedAt: effectiveUpdatedAt,
                    });
                }
                catch {
                }

                return settings;
            }
        }
        catch {
        }
    }

    if (localSettings) {
        memoryCache.set(storeId, { settings: localSettings, fetchedAt: Date.now() });
        return localSettings;
    }

    return { ...DEFAULT_STORE_RECEIPT_SETTINGS };
}

export async function saveStoreReceiptSettings(storeId: string, nextSettings: StoreReceiptSettings) {
    const settings = normalizeSettings(nextSettings, DEFAULT_STORE_RECEIPT_SETTINGS);
    const updatedAt = Date.now();
    const record = {
        id: storeId,
        storeId,
        ...settings,
        updatedAt,
    };

    const db = await getDB();
    await db.put('receiptSettings', record);
    memoryCache.set(storeId, { settings, fetchedAt: Date.now() });

    const syncResult = await performSyncOp({
        url: BACKEND_URL,
        method: 'PUT',
        data: record,
    });

    return {
        settings,
        updatedAt,
        syncResult,
    };
}

export function invalidateStoreReceiptSettingsCache(storeId: string) {
    memoryCache.delete(storeId);
}

export function getReceiptFooterLines(message?: string | null) {
    const normalized = message === undefined
        ? DEFAULT_STORE_RECEIPT_SETTINGS.thankYouMessage
        : normalizeThankYouMessage(message, DEFAULT_STORE_RECEIPT_SETTINGS.thankYouMessage);

    return normalized
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
