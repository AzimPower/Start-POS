export type ReceiptPaper = '58' | '80';

export type ReceiptPaperLayout = {
    paper: ReceiptPaper;
    pageWidthMm: number;
    contentWidthMm: number;
    paddingMm: number;
    charsPerLine: number;
};

export function getStoredReceiptPaper(): ReceiptPaper {
    try {
        const stored = localStorage.getItem('printer_paper');
        if (stored === '58' || stored === '80') {
            return stored;
        }
        const printerHint = (localStorage.getItem('printer_mac') || '').toLowerCase();
        if (printerHint.includes('58')) {
            return '58';
        }
        if (printerHint.includes('80')) {
            return '80';
        }
    }
    catch (e) {
    }
    return '80';
}

export function getReceiptPaperLayout(paper: ReceiptPaper = getStoredReceiptPaper()): ReceiptPaperLayout {
    if (paper === '58') {
        return {
            paper,
            pageWidthMm: 58,
            contentWidthMm: 48,
            paddingMm: 5,
            charsPerLine: 32
        };
    }
    return {
        paper,
        pageWidthMm: 80,
        contentWidthMm: 72,
        paddingMm: 4,
        charsPerLine: 48
    };
}
