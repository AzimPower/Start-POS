type ReceiptItemLike = {
    quantity?: unknown;
    price?: unknown;
    tax?: unknown;
    total?: unknown;
};

type ReceiptSummaryLike = {
    subtotal?: unknown;
    tax?: unknown;
    total?: unknown;
};

function toSafeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTaxRate(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateReceiptLineAmounts(unitPrice: unknown, quantity: unknown, taxRate: unknown) {
    const price = toSafeNumber(unitPrice);
    const qty = toSafeNumber(quantity);
    const rate = normalizeTaxRate(taxRate);
    const subtotal = price * qty;
    const tax = subtotal * (rate / 100);
    return {
        subtotal,
        tax,
        total: subtotal + tax,
    };
}

export function getReceiptItemDisplayTotal(item: ReceiptItemLike, receipt?: ReceiptSummaryLike): number {
    const baseTotal = calculateReceiptLineAmounts(item.price, item.quantity, 0).subtotal;
    const rawTax = toSafeNumber(item.tax);
    const rawTotal = (() => {
        const parsed = Number(item.total);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        return baseTotal + rawTax;
    })();

    if (!receipt) {
        return rawTotal > 0 ? rawTotal : baseTotal;
    }

    const receiptSubtotal = toSafeNumber(receipt.subtotal);
    const receiptTax = toSafeNumber(receipt.tax);
    const receiptTotal = toSafeNumber(receipt.total);
    const receiptHasNoTax = Math.abs(receiptTax) < 0.5 && Math.abs(receiptTotal - receiptSubtotal) < 0.5;

    if (receiptHasNoTax) {
        return rawTotal > 0 ? rawTotal : baseTotal;
    }

    return rawTotal > 0 ? rawTotal : baseTotal;
}
