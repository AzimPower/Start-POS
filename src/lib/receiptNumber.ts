type ReceiptSaleLike = {
    id?: string | null;
    storeId?: string | null;
    createdAt?: number | string | Date | null;
    draft?: boolean | number | string | null;
    receiptSequence?: number | string | null;
    receiptNumber?: string | null;
};

function toTimestamp(value: ReceiptSaleLike['createdAt']): number {
    if (value instanceof Date) {
        return value.getTime();
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.floor(parsed);
}

function isDraftSale(sale: ReceiptSaleLike | null | undefined) {
    if (!sale) {
        return false;
    }

    return sale.draft === true || sale.draft === 1 || sale.draft === '1' || sale.draft === 'true';
}

function getComparableId(value: ReceiptSaleLike['id']) {
    return String(value || '');
}

function compareSalesByCreation(first: ReceiptSaleLike, second: ReceiptSaleLike) {
    const createdAtDiff = toTimestamp(first.createdAt) - toTimestamp(second.createdAt);
    if (createdAtDiff !== 0) {
        return createdAtDiff;
    }

    return getComparableId(first.id).localeCompare(getComparableId(second.id));
}

function fnv1a(input: string) {
    let hash = 0x811c9dc5;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash >>> 0;
}

export function getReceiptDayKey(createdAt: ReceiptSaleLike['createdAt']) {
    const timestamp = toTimestamp(createdAt);
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}${month}${day}`;
}

export function getReceiptPrefix(sale: ReceiptSaleLike) {
    const storeKey = String(sale.storeId || 'global');
    const dayKey = getReceiptDayKey(sale.createdAt);
    const hash = fnv1a(`${storeKey}:${dayKey}`)
        .toString(16)
        .toUpperCase()
        .padStart(8, '0');

    return hash.slice(0, 7);
}

export function getReceiptSequence(sale: ReceiptSaleLike, sales?: ReceiptSaleLike[]) {
    const storedSequence = toPositiveInteger(sale.receiptSequence);
    if (storedSequence) {
        return storedSequence;
    }

    if (!Array.isArray(sales) || !sale?.id || isDraftSale(sale)) {
        return null;
    }

    const saleId = getComparableId(sale.id);
    const saleStoreId = String(sale.storeId || '');
    const saleDayKey = getReceiptDayKey(sale.createdAt);
    const daySales = sales
        .filter((candidate) => !isDraftSale(candidate)
            && String(candidate.storeId || '') === saleStoreId
            && getReceiptDayKey(candidate.createdAt) === saleDayKey)
        .sort(compareSalesByCreation);

    const saleIndex = daySales.findIndex((candidate) => getComparableId(candidate.id) === saleId);
    return saleIndex >= 0 ? saleIndex + 1 : null;
}

export function formatReceiptNumber(sale: ReceiptSaleLike, sales?: ReceiptSaleLike[]) {
    const storedNumber = typeof sale.receiptNumber === 'string' ? sale.receiptNumber.trim() : '';
    if (storedNumber) {
        return storedNumber;
    }

    const storedSequence = toPositiveInteger(sale.receiptSequence);
    const prefix = getReceiptPrefix(sale);
    if (storedSequence) {
        return `REC${prefix}-${storedSequence}`;
    }

    const fallbackId = getComparableId(sale.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return fallbackId ? `REC${fallbackId.slice(-6)}` : `REC${prefix}`;
}

export async function assignReceiptMetadata<T extends ReceiptSaleLike>(db: { getAll: (storeName: string) => Promise<ReceiptSaleLike[]>; }, sale: T) {
    if (isDraftSale(sale)) {
        return sale;
    }

    const storedSequence = toPositiveInteger(sale.receiptSequence);
    const storedNumber = typeof sale.receiptNumber === 'string' ? sale.receiptNumber.trim() : '';
    if (storedSequence && storedNumber) {
        return sale;
    }

    if (storedSequence) {
        return {
            ...sale,
            receiptSequence: storedSequence,
            receiptNumber: `REC${getReceiptPrefix(sale)}-${storedSequence}`,
        };
    }

    const dayKey = getReceiptDayKey(sale.createdAt);
    const storeId = String(sale.storeId || '');
    const allSales = await db.getAll('sales');
    const sameDaySales = allSales.filter((existingSale) => !isDraftSale(existingSale)
        && getComparableId(existingSale.id) !== getComparableId(sale.id)
        && String(existingSale.storeId || '') === storeId
        && getReceiptDayKey(existingSale.createdAt) === dayKey);

    const highestStoredSequence = sameDaySales.reduce((maxSequence, existingSale) => {
        const sequence = toPositiveInteger(existingSale.receiptSequence);
        return sequence && sequence > maxSequence ? sequence : maxSequence;
    }, 0);
    const nextSequence = Math.max(highestStoredSequence, sameDaySales.length) + 1;

    return {
        ...sale,
        receiptSequence: nextSequence,
        receiptNumber: `REC${getReceiptPrefix(sale)}-${nextSequence}`,
    };
}