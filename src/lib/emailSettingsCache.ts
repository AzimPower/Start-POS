/**
 * Helper centralisé pour lire les paramètres d'email notification.
 * Priorité : backend → cache local (IndexedDB) → valeurs par défaut (tout activé).
 * Le résultat est mis en cache mémoire pendant 60 secondes pour éviter
 * trop d'appels réseau au sein d'une même session.
 */
import { getDB } from '@/lib/db';
const BACKEND_URL = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/email_settings.php';
const CACHE_TTL_MS = 60000; // 60 secondes
interface EmailSettings {
    shifts: boolean;
    stockSignals: boolean;
    expenses: boolean;
    logins: boolean;
    refunds: boolean;
}
const DEFAULT_SETTINGS: EmailSettings = {
    shifts: true,
    stockSignals: true,
    expenses: true,
    logins: true,
    refunds: true,
};
// Cache mémoire par storeId
const memoryCache: Map<string, {
    settings: EmailSettings;
    fetchedAt: number;
}> = new Map();
/**
 * Renvoie les paramètres d'email pour un magasin donné.
 * Rafraîchit depuis le backend si le cache mémoire est expiré.
 */
export async function getEmailSettings(storeId: string): Promise<EmailSettings> {
    if (!storeId)
        return { ...DEFAULT_SETTINGS };
    // 1. Cache mémoire récent ?
    const cached = memoryCache.get(storeId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.settings;
    }
    // 2. Essayer le backend (source de vérité partagée entre appareils)
    if (navigator.onLine) {
        try {
            const res = await fetch(`${BACKEND_URL}?storeId=${encodeURIComponent(storeId)}`, {
                cache: 'no-store',
            });
            if (res.ok) {
                const data = await res.json();
                const settings: EmailSettings = {
                    shifts: data.shifts !== false && data.shifts !== 0,
                    stockSignals: data.stockSignals !== false && data.stockSignals !== 0,
                    expenses: data.expenses !== false && data.expenses !== 0,
                    logins: data.logins !== false && data.logins !== 0,
                    refunds: data.refunds !== false && data.refunds !== 0,
                };
                // Mettre à jour le cache mémoire et la DB locale
                memoryCache.set(storeId, { settings, fetchedAt: Date.now() });
                try {
                    const db = await getDB();
                    await db.put('emailSettings', {
                        id: storeId,
                        storeId,
                        ...settings,
                        updatedAt: Date.now(),
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
    try {
        const db = await getDB();
        const local = await db.get('emailSettings', storeId);
        if (local) {
            const settings: EmailSettings = {
                shifts: local.shifts !== false,
                stockSignals: local.stockSignals !== false,
                expenses: local.expenses !== false,
                logins: local.logins !== false,
                refunds: local.refunds !== false,
            };
            memoryCache.set(storeId, { settings, fetchedAt: Date.now() });
            return settings;
        }
    }
    catch {
        // Ignore
    }
    return { ...DEFAULT_SETTINGS };
}
/** Invalide le cache mémoire d'un magasin (à appeler après un changement de paramètres). */
export function invalidateEmailSettingsCache(storeId: string) {
    memoryCache.delete(storeId);
}
