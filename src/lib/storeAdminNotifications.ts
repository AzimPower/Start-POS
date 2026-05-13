import { BACKEND_BASE } from '@/lib/backend';
import { getDB, performSyncOp } from '@/lib/db';
import { getEmailSettings, type StoreAlertSettings } from '@/lib/emailSettingsCache';
import { generateId } from '@/lib/id';
import { pendingEmailService } from '@/lib/pendingEmailService';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface StockAdjustmentThresholdTransition {
    productId: string;
    productName: string;
    unit?: string;
    minStock?: number | null;
    previousStock: number;
    nextStock: number;
}

export interface StockAdjustmentNotificationPayload {
    senderUserId: string;
    storeId: string;
    actorName?: string;
    storeName?: string;
    adjustmentCount: number;
    previewText: string;
    reason?: string;
    lines: StockAdjustmentThresholdTransition[];
}

export type AutomatedStoreAdminEvent =
    | 'shift'
    | 'stockSignal'
    | 'stockAdjustment'
    | 'expense'
    | 'login'
    | 'refund'
    | 'lowStock'
    | 'outOfStock';

type InboxSettingKey =
    | 'inboxShifts'
    | 'inboxStockSignals'
    | 'inboxStockAdjustments'
    | 'inboxExpenses'
    | 'inboxLogins'
    | 'inboxRefunds'
    | 'inboxLowStock'
    | 'inboxOutOfStock';

const AUTOMATED_NOTIFICATIONS_API = `${BACKEND_BASE}/api/notifications.php`;

const EVENT_TO_SETTING_KEY: Record<AutomatedStoreAdminEvent, InboxSettingKey> = {
    shift: 'inboxShifts',
    stockSignal: 'inboxStockSignals',
    stockAdjustment: 'inboxStockAdjustments',
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
    return `auton_${generateId().replace(/-/g, '').slice(0, 30)}`;
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

async function sendStockThresholdEmail(options: {
        senderUserId: string;
        storeId: string;
        productName: string;
        unit?: string;
        minStock?: number | null;
        previousStock: number;
        nextStock: number;
        actorName?: string;
        contextLabel?: string;
}) {
        const settings = await getEmailSettings(options.storeId);
        const eventKey = options.nextStock <= 0 ? 'outOfStockEmails' : 'lowStockEmails';
        if (settings[eventKey] === false) {
                return { sent: false, queued: false, skipped: true, reason: 'disabled' };
        }

        const db = await getDB();
        const store = await db.get('stores', options.storeId);
        const storeName = store?.name || options.storeId || 'Magasin';
        const thresholdLabel = options.nextStock <= 0 ? 'Rupture de stock' : 'Stock faible';
        const actorLabel = options.actorName || 'Un utilisateur';
        const contextLine = options.contextLabel ? `<div class="info-row"><span class="info-label">Contexte :&nbsp;</span><span class="info-value">${options.contextLabel}</span></div>` : '';
        const thresholdLine = options.nextStock <= 0
                ? ''
                : `<div class="info-row"><span class="info-label">Seuil minimum :&nbsp;</span><span class="info-value">${formatQuantity(Number(options.minStock || 0), options.unit)}</span></div>`;
        const resume = `
<div style="margin: 20px 0;">
    <div class="info-block">
        <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">${options.nextStock <= 0 ? '🚨' : '⚠️'} ${thresholdLabel}</h3>
        <div class="info-row">
            <span class="info-label">Magasin :&nbsp;</span>
            <span class="info-value">${storeName}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Produit :&nbsp;</span>
            <span class="info-value" style="font-weight: 600;">${options.productName}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Action par :&nbsp;</span>
            <span class="info-value">${actorLabel}</span>
        </div>
        ${contextLine}
        <div class="info-row">
            <span class="info-label">Stock précédent :&nbsp;</span>
            <span class="info-value">${formatQuantity(options.previousStock, options.unit)}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Stock actuel :&nbsp;</span>
            <span class="info-value" style="font-weight: 600; color: ${options.nextStock <= 0 ? '#dc2626' : '#d97706'};">${formatQuantity(options.nextStock, options.unit)}</span>
        </div>
        ${thresholdLine}
    </div>
</div>
`;

        return pendingEmailService.sendToAllAdmins({
                message: resume,
                storeName,
                type: 'stock',
                relatedId: options.productName,
                storeId: options.storeId,
                userId: options.senderUserId,
        });
}

export async function sendStockAdjustmentEmail(options: {
        senderUserId: string;
        storeId: string;
        actorName?: string;
        storeName?: string;
        adjustmentCount: number;
        previewText: string;
        reason?: string;
}) {
        const settings = await getEmailSettings(options.storeId);
        if (settings.stockAdjustments === false) {
                return { sent: false, queued: false, skipped: true, reason: 'disabled' };
        }

        const db = await getDB();
        const store = await db.get('stores', options.storeId);
        const storeName = options.storeName || store?.name || options.storeId || 'Magasin';
        const resume = `
<div style="margin: 20px 0;">
    <div class="info-block">
        <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📦 Ajustement de stock</h3>
        <div class="info-row">
            <span class="info-label">Magasin :&nbsp;</span>
            <span class="info-value">${storeName}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Action par :&nbsp;</span>
            <span class="info-value">${options.actorName || 'Un utilisateur'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Produits ajustés :&nbsp;</span>
            <span class="info-value">${options.adjustmentCount}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Résumé :&nbsp;</span>
            <span class="info-value">${options.previewText}</span>
        </div>
        ${options.reason ? `<div class="info-row"><span class="info-label">Motif :&nbsp;</span><span class="info-value">${options.reason}</span></div>` : ''}
    </div>
</div>
`;

        return pendingEmailService.sendToAllAdmins({
                message: resume,
                storeName,
                type: 'stock',
                relatedId: `stock-adjustment-${Date.now()}`,
                storeId: options.storeId,
                userId: options.senderUserId,
        });
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
        const result = await sendStoreAdminNotification({
            event: 'outOfStock',
            senderUserId: options.senderUserId,
            storeId: options.storeId,
            relatedId: options.productId,
            type: 'critical',
            title: `Rupture de stock: ${options.productName}`,
            message: `${options.productName} est maintenant en rupture de stock.${contextSuffix} Stock précédent: ${formatQuantity(options.previousStock, options.unit)}. Stock actuel: ${formatQuantity(options.nextStock, options.unit)}.${actorSuffix}`.trim(),
        });

        try {
            await sendStockThresholdEmail(options);
        }
        catch {
        }

        return result;
    }

    const result = await sendStoreAdminNotification({
        event: 'lowStock',
        senderUserId: options.senderUserId,
        storeId: options.storeId,
        relatedId: options.productId,
        type: 'warning',
        title: `Stock faible: ${options.productName}`,
        message: `${options.productName} est passé en stock faible.${contextSuffix} Stock actuel: ${formatQuantity(options.nextStock, options.unit)}. Seuil configuré: ${formatQuantity(Number(options.minStock || 0), options.unit)}. Stock précédent: ${formatQuantity(options.previousStock, options.unit)}.${actorSuffix}`.trim(),
    });

    try {
        await sendStockThresholdEmail(options);
    }
    catch {
    }

    return result;
}

export async function sendStockAdjustmentNotifications(options: StockAdjustmentNotificationPayload) {
    const db = await getDB();
    const store = await db.get('stores', options.storeId);
    const storeName = options.storeName || store?.name || options.storeId || 'Magasin';
    const reasonSuffix = options.reason?.trim()
        ? ` Motif: ${options.reason.trim()}.`
        : '';

    await Promise.all([
        sendStoreAdminNotification({
            event: 'stockAdjustment',
            senderUserId: options.senderUserId,
            storeId: options.storeId,
            type: 'info',
            title: `Ajustement de stock: ${options.adjustmentCount} produit${options.adjustmentCount > 1 ? 's' : ''}`,
            message: `${options.actorName || 'Un utilisateur'} a effectué ${options.adjustmentCount} ajustement${options.adjustmentCount > 1 ? 's' : ''} de stock dans ${storeName}. ${options.previewText}.${reasonSuffix}`,
        }),
        sendStockAdjustmentEmail({
            senderUserId: options.senderUserId,
            storeId: options.storeId,
            actorName: options.actorName,
            storeName,
            adjustmentCount: options.adjustmentCount,
            previewText: options.previewText,
            reason: options.reason?.trim() || undefined,
        }),
        ...options.lines.map((line) => notifyStockThresholdChange({
            senderUserId: options.senderUserId,
            storeId: options.storeId,
            productId: line.productId,
            productName: line.productName,
            unit: line.unit,
            minStock: line.minStock,
            previousStock: line.previousStock,
            nextStock: line.nextStock,
            actorName: options.actorName,
            contextLabel: 'Après un ajustement de stock',
        })),
    ]);
}
