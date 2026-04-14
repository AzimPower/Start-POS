import { BACKEND_BASE } from '@/lib/backend';
import { performSyncOp } from '@/lib/db';
import { getEmailSettings, type StoreAlertSettings } from '@/lib/emailSettingsCache';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AutomatedStoreAdminEvent =
    | 'shift'
    | 'stockSignal'
    | 'expense'
    | 'login'
    | 'refund'
    | 'lowStock'
    | 'outOfStock';

type InboxSettingKey =
    | 'inboxShifts'
    | 'inboxStockSignals'
    | 'inboxExpenses'
    | 'inboxLogins'
    | 'inboxRefunds'
    | 'inboxLowStock'
    | 'inboxOutOfStock';

const AUTOMATED_NOTIFICATIONS_API = `${BACKEND_BASE}/api/notifications.php`;

const EVENT_TO_SETTING_KEY: Record<AutomatedStoreAdminEvent, InboxSettingKey> = {
    shift: 'inboxShifts',
    stockSignal: 'inboxStockSignals',
    expense: 'inboxExpenses',
    login: 'inboxLogins',
    refund: 'inboxRefunds',
    lowStock: 'inboxLowStock',
    outOfStock: 'inboxOutOfStock',
};

function isInboxNotificationEnabled(settings: StoreAlertSettings, event: AutomatedStoreAdminEvent) {
    return settings[EVENT_TO_SETTING_KEY[event]] !== false;
}

function buildAutomatedNotificationId() {
    return `auton_${crypto.randomUUID().replace(/-/g, '').slice(0, 30)}`;
}

function formatQuantity(value: number, unit?: string) {
    const quantity = Number.isFinite(value) ? value : 0;
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(quantity);
    return unit ? `${formatted} ${unit}` : formatted;
}

function getStockLevelState(stock: number, minStock?: number | null) {
    if (stock <= 0) {
        return 'out';
    }
    if (typeof minStock === 'number' && Number.isFinite(minStock) && stock <= minStock) {
        return 'low';
    }
    return 'ok';
}

export async function sendStoreAdminNotification(options: {
    event: AutomatedStoreAdminEvent;
    senderUserId: string;
    storeId: string;
    title: string;
    message: string;
    type?: NotificationSeverity;
    relatedId?: string;
    expiresAt?: number | null;
    createdAt?: number;
    id?: string;
}) {
    if (!options.senderUserId || !options.storeId) {
        return { sent: false, queued: false, skipped: true, reason: 'missing_sender_or_store' };
    }

    const settings = await getEmailSettings(options.storeId);
    if (!isInboxNotificationEnabled(settings, options.event)) {
        return { sent: false, queued: false, skipped: true, reason: 'disabled' };
    }

    const result = await performSyncOp({
        url: AUTOMATED_NOTIFICATIONS_API,
        method: 'POST',
        data: {
            id: options.id || buildAutomatedNotificationId(),
            senderUserId: options.senderUserId,
            title: options.title,
            message: options.message,
            type: options.type || 'info',
            targetType: 'store_admins',
            targetStoreId: options.storeId,
            createdAt: options.createdAt || Date.now(),
            expiresAt: options.expiresAt ?? null,
            eventKey: options.event,
            relatedId: options.relatedId,
        },
    });

    return {
        sent: !!result.success && !result.queued,
        queued: !!result.queued,
        skipped: false,
        reason: result.success ? undefined : result.reason,
    };
}

export async function notifyStockThresholdChange(options: {
    senderUserId: string;
    storeId: string;
    productId: string;
    productName: string;
    unit?: string;
    minStock?: number | null;
    previousStock: number;
    nextStock: number;
    actorName?: string;
    contextLabel?: string;
}) {
    const previousState = getStockLevelState(options.previousStock, options.minStock);
    const nextState = getStockLevelState(options.nextStock, options.minStock);

    if (previousState === nextState || nextState === 'ok') {
        return { sent: false, queued: false, skipped: true, reason: 'no_threshold_cross' };
    }

    const actorSuffix = options.actorName ? ` Action réalisée par ${options.actorName}.` : '';
    const contextSuffix = options.contextLabel ? ` ${options.contextLabel}.` : '';

    if (nextState === 'out') {
        return sendStoreAdminNotification({
            event: 'outOfStock',
            senderUserId: options.senderUserId,
            storeId: options.storeId,
            relatedId: options.productId,
            type: 'critical',
            title: `Rupture de stock: ${options.productName}`,
            message: `${options.productName} est maintenant en rupture de stock.${contextSuffix} Stock précédent: ${formatQuantity(options.previousStock, options.unit)}. Stock actuel: ${formatQuantity(options.nextStock, options.unit)}.${actorSuffix}`.trim(),
        });
    }

    return sendStoreAdminNotification({
        event: 'lowStock',
        senderUserId: options.senderUserId,
        storeId: options.storeId,
        relatedId: options.productId,
        type: 'warning',
        title: `Stock faible: ${options.productName}`,
        message: `${options.productName} est passé en stock faible.${contextSuffix} Stock actuel: ${formatQuantity(options.nextStock, options.unit)}. Seuil configuré: ${formatQuantity(Number(options.minStock || 0), options.unit)}. Stock précédent: ${formatQuantity(options.previousStock, options.unit)}.${actorSuffix}`.trim(),
    });
}