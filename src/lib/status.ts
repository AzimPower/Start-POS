export function isActiveFlag(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
        return true;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no';
    }

    return value !== false && value !== 0;
}

export type StoreAccessReason = 'inactive' | 'expired' | null;

function readSubscriptionEnd(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function isStoreSubscriptionExpired(store: { subscriptionEnd?: unknown } | null | undefined, now = Date.now()): boolean {
    const subscriptionEnd = readSubscriptionEnd(store?.subscriptionEnd);
    return subscriptionEnd !== null && subscriptionEnd <= now;
}

export function getStoreAccessState(store: { active?: unknown; subscriptionEnd?: unknown } | null | undefined, now = Date.now()): {
    active: boolean;
    expired: boolean;
    reason: StoreAccessReason;
} {
    const expired = isStoreSubscriptionExpired(store, now);
    const flaggedActive = isActiveFlag(store?.active);

    if (expired) {
        return { active: false, expired: true, reason: 'expired' };
    }

    if (!flaggedActive) {
        return { active: false, expired: false, reason: 'inactive' };
    }

    return { active: true, expired: false, reason: null };
}
