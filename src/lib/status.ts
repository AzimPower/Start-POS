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