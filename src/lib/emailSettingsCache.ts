/**
 * Helper centralisé pour lire les paramètres d'email notification.
 * Priorité : backend → cache local (IndexedDB) → valeurs par défaut (tout activé).
 * Le résultat est mis en cache mémoire pendant 60 secondes pour éviter
 * trop d'appels réseau au sein d'une même session.
 */
import { getDB } from '@/lib/db';
const BACKEND_URL = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/email_settings.php';
const CACHE_TTL_MS = 60000; // 60 secondes
export interface StoreAlertSettings {
    shifts: boolean;
    stockSignals: boolean;
    stockAdjustments: boolean;
    expenses: boolean;
    logins: boolean;
    refunds: boolean;
    lowStockEmails: boolean;
    outOfStockEmails: boolean;
    inboxShifts: boolean;
    inboxStockSignals: boolean;
    inboxStockAdjustments: boolean;
    inboxExpenses: boolean;
    inboxLogins: boolean;
    inboxRefunds: boolean;
    inboxLowStock: boolean;
    inboxOutOfStock: boolean;
}
export const DEFAULT_STORE_ALERT_SETTINGS: StoreAlertSettings = {
    shifts: true,
    stockSignals: true,
    stockAdjustments: true,
    expenses: true,
    logins: true,
    refunds: true,
    lowStockEmails: true,
    outOfStockEmails: true,
    inboxShifts: true,
    inboxStockSignals: true,
    inboxStockAdjustments: true,
    inboxExpenses: true,
    inboxLogins: true,
    inboxRefunds: true,
    inboxLowStock: true,
    inboxOutOfStock: true,
};

function hasOwnSetting(data: any, key: keyof StoreAlertSettings) {
    return Object.prototype.hasOwnProperty.call(data || {}, key);
}

function normalizeBooleanSetting(data: any, key: keyof StoreAlertSettings, fallback: boolean) {
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

function normalizeSettings(data: any, fallback: StoreAlertSettings = DEFAULT_STORE_ALERT_SETTINGS): StoreAlertSettings {
    return {
        shifts: normalizeBooleanSetting(data, 'shifts', fallback.shifts),
        stockSignals: normalizeBooleanSetting(data, 'stockSignals', fallback.stockSignals),
        stockAdjustments: normalizeBooleanSetting(data, 'stockAdjustments', fallback.stockAdjustments),
        expenses: normalizeBooleanSetting(data, 'expenses', fallback.expenses),
        logins: normalizeBooleanSetting(data, 'logins', fallback.logins),
        refunds: normalizeBooleanSetting(data, 'refunds', fallback.refunds),
        lowStockEmails: normalizeBooleanSetting(data, 'lowStockEmails', fallback.lowStockEmails),
        outOfStockEmails: normalizeBooleanSetting(data, 'outOfStockEmails', fallback.outOfStockEmails),
        inboxShifts: normalizeBooleanSetting(data, 'inboxShifts', fallback.inboxShifts),
        inboxStockSignals: normalizeBooleanSetting(data, 'inboxStockSignals', fallback.inboxStockSignals),
        inboxStockAdjustments: normalizeBooleanSetting(data, 'inboxStockAdjustments', fallback.inboxStockAdjustments),
        inboxExpenses: normalizeBooleanSetting(data, 'inboxExpenses', fallback.inboxExpenses),
        inboxLogins: normalizeBooleanSetting(data, 'inboxLogins', fallback.inboxLogins),
        inboxRefunds: normalizeBooleanSetting(data, 'inboxRefunds', fallback.inboxRefunds),
        inboxLowStock: normalizeBooleanSetting(data, 'inboxLowStock', fallback.inboxLowStock),
        inboxOutOfStock: normalizeBooleanSetting(data, 'inboxOutOfStock', fallback.inboxOutOfStock),
    };
}

function hasPersistedRemoteSettings(data: any) {
    return String(data?.id || '').trim().length > 0;
}
// Cache mémoire par storeId
const memoryCache: Map<string, {
    settings: StoreAlertSettings;
    fetchedAt: number;
}> = new Map();
/**
 * Renvoie les paramètres d'email pour un magasin donné.
 * Rafraîchit depuis le backend si le cache mémoire est expiré.
 */
export async function getEmailSettings(storeId: string): Promise<StoreAlertSettings> {
    if (!storeId)
        return { ...DEFAULT_STORE_ALERT_SETTINGS };
    // 1. Cache mémoire récent ?
    const cached = memoryCache.get(storeId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.settings;
    }
    let db: Awaited<ReturnType<typeof getDB>> | null = null;
    let localRecord: any = null;
    let localSettings: StoreAlertSettings | null = null;

    try {
        db = await getDB();
        localRecord = await db.get('emailSettings', storeId);
        if (localRecord) {
            localSettings = normalizeSettings(localRecord);
        }
    }
    catch {
        // Ignore local cache read errors and continue with remote/default.
    }

    // 2. Essayer le backend (source de vérité partagée entre appareils)
    if (navigator.onLine) {
        try {
            const res = await fetch(`${BACKEND_URL}?storeId=${encodeURIComponent(storeId)}`, {
                cache: 'no-store',
            });
            if (res.ok) {
                const data = await res.json();
                const remoteExists = hasPersistedRemoteSettings(data);
                const remoteUpdatedAt = Number(data?.updatedAt || 0);
                const localUpdatedAt = Number(localRecord?.updatedAt || 0);
                const mergedRemoteSettings = normalizeSettings(data, localSettings || DEFAULT_STORE_ALERT_SETTINGS);
                const shouldPreferLocal = !!localSettings && (!remoteExists || (localUpdatedAt > 0 && localUpdatedAt > remoteUpdatedAt));
                const settings = shouldPreferLocal ? localSettings : mergedRemoteSettings;
                const effectiveUpdatedAt = shouldPreferLocal
                    ? (localUpdatedAt || Date.now())
                    : (remoteUpdatedAt || Date.now());
                // Mettre à jour le cache mémoire et la DB locale
                memoryCache.set(storeId, { settings, fetchedAt: Date.now() });
                try {
                    const activeDb = db || await getDB();
                    await activeDb.put('emailSettings', {
                        id: storeId,
                        storeId,
                        ...settings,
                        updatedAt: effectiveUpdatedAt,
                    });
                }
                catch {
                    // Ignore DB write error
                }
                return settings;
            }
        }
        catch {
            // Réseau indisponible, on tombe sur le fallback local
        }
    }
    // 3. Fallback : DB locale
    if (localSettings) {
        memoryCache.set(storeId, { settings: localSettings, fetchedAt: Date.now() });
        return localSettings;
    }
    return { ...DEFAULT_STORE_ALERT_SETTINGS };
}
/** Invalide le cache mémoire d'un magasin (à appeler après un changement de paramètres). */
export function invalidateEmailSettingsCache(storeId: string) {
    memoryCache.delete(storeId);
}
