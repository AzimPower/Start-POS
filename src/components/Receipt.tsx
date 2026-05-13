import { useEffect, useRef, useState } from 'react';
import { tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { getReceiptPaperLayout, getStoredReceiptPaper } from '@/lib/receiptPaper';
import { getReceiptItemDisplayTotal } from '@/lib/receiptAmounts';
import { DEFAULT_STORE_RECEIPT_SETTINGS, getReceiptFooterLines, getStoreReceiptSettings, type StoreReceiptSettings } from '@/lib/storeReceiptSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface ReceiptItem {
    name: string;
    quantity: number;
    price: number;
    total: number;
}

interface ReceiptProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storeName: string;
    storeAddress: string;
    items: ReceiptItem[];
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: string;
    cashReceived?: number;
    change?: number;
    receiptNumber: string;
    date: Date;
    paymentDetails?: {
        label: string;
        amount: number;
    }[];
    storeId?: string;
    printLogo?: boolean;
    thankYouMessage?: string;
}

export default function Receipt({
    open,
    onOpenChange,
    storeName,
    storeAddress,
    items,
    subtotal,
    tax,
    total,
    paymentMethod,
    cashReceived,
    change,
    receiptNumber,
    date,
    paymentDetails,
    storeId,
    printLogo,
    thankYouMessage,
}: ReceiptProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [storeReceiptSettings, setStoreReceiptSettings] = useState<StoreReceiptSettings>(DEFAULT_STORE_RECEIPT_SETTINGS);

    useEffect(() => {
        let cancelled = false;

        const fallbackSettings: StoreReceiptSettings = {
            printLogo: printLogo ?? DEFAULT_STORE_RECEIPT_SETTINGS.printLogo,
            thankYouMessage: thankYouMessage ?? DEFAULT_STORE_RECEIPT_SETTINGS.thankYouMessage,
        };

        if (!storeId) {
            setStoreReceiptSettings(fallbackSettings);
            return () => {
                cancelled = true;
            };
        }

        void getStoreReceiptSettings(storeId)
            .then((settings) => {
                if (cancelled) {
                    return;
                }
                setStoreReceiptSettings({
                    printLogo: printLogo ?? settings.printLogo,
                    thankYouMessage: thankYouMessage ?? settings.thankYouMessage,
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setStoreReceiptSettings(fallbackSettings);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [storeId, printLogo, thankYouMessage]);

    const effectivePrintLogo = printLogo ?? storeReceiptSettings.printLogo;
    const footerLines = getReceiptFooterLines(thankYouMessage ?? storeReceiptSettings.thankYouMessage);

    const formatDate = (value: Date) => {
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(value);
    };

    const getPaymentMethodText = (method: string) => {
        switch (method) {
            case 'cash':
                return 'Especes';
            case 'mobile_money':
                return 'Mobile Money';
            case 'mixed':
                return 'Mixte';
            default:
                return method;
        }
    };

    const handlePrint = async () => {
        const printContent = receiptRef.current;
        if (!printContent) {
            return;
        }

        const paperLayout = getReceiptPaperLayout();
        const html = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Recu #${receiptNumber}</title>
          <style>
            @page { size: ${paperLayout.pageWidthMm}mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: ${paperLayout.pageWidthMm}mm; padding: ${paperLayout.paddingMm}mm; font-size: 11px; }
            .receipt { width: 100%; }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .store-name { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .store-address { font-size: 10px; }
            .receipt-info { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; font-size: 10px; }
            .items { margin-bottom: 10px; }
            .item { margin-bottom: 5px; }
            .item-name { font-weight: bold; }
            .item-details { display: flex; justify-content: space-between; font-size: 10px; }
            .totals { border-top: 1px dashed #000; padding-top: 10px; margin-bottom: 10px; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .total-row.grand-total { font-weight: bold; font-size: 13px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #000; }
            .payment-info { border-top: 1px dashed #000; padding-top: 10px; margin-bottom: 10px; }
            .footer { text-align: center; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; font-size: 10px; }
            @media print { body { width: ${paperLayout.pageWidthMm}mm; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>`;

        try {
            const lines: string[] = [];
            const centerText = (value: string, width: number) => {
                const normalized = (value || '').toString();
                if (normalized.length >= width) {
                    return normalized;
                }
                const left = Math.floor((width - normalized.length) / 2);
                return ' '.repeat(left) + normalized;
            };

            const paper = getStoredReceiptPaper();
            const width = paper === '58' ? 32 : 48;

            lines.push(centerText(storeName || 'Magasin', width));
            if (storeAddress) {
                lines.push(centerText(storeAddress, width));
            }
            lines.push('');
            lines.push(NativePrinter.formatColumns(formatDate(date), `Recu N°: ${receiptNumber}`, width));
            lines.push('--------------------------------');

            for (const item of items) {
                const name = item.name;
                const quantity = item.quantity;
                const price = Number.isNaN(item.price) ? 0 : Math.round(item.price);
                const totalItem = Math.round(getReceiptItemDisplayTotal(item, { subtotal, tax, total }));
                const quantityText = `${quantity} x ${price} FCFA`;
                const totalText = `${totalItem} FCFA`;
                const leftFull = `${name} ${quantityText}`.trim();

                if (leftFull.length + 1 + totalText.length <= width) {
                    lines.push(NativePrinter.formatColumns(leftFull, totalText, width));
                }
                else if (name.length + 1 + totalText.length <= width) {
                    lines.push(NativePrinter.formatColumns(name, totalText, width));
                    lines.push(NativePrinter.formatColumns(quantityText, '', width));
                }
                else {
                    lines.push(NativePrinter.formatColumns(name, totalText, width));
                    lines.push(NativePrinter.formatColumns(quantityText, '', width));
                }
            }

            lines.push('--------------------------------');
            lines.push(NativePrinter.formatColumns('Sous-total:', `${Math.round(subtotal)} FCFA`, width));
            lines.push(NativePrinter.formatColumns('TVA:', `${Math.round(tax)} FCFA`, width));
            lines.push(NativePrinter.formatColumns('TOTAL:', `${Math.round(total)} FCFA`, width));
            lines.push('');
            lines.push(NativePrinter.formatColumns('Mode de paiement:', getPaymentMethodText(paymentMethod), width));

            if (paymentDetails && paymentDetails.length > 0) {
                for (const payment of paymentDetails) {
                    lines.push(NativePrinter.formatColumns(`${payment.label}:`, `${Math.round(payment.amount)} FCFA`, width));
                }
            }
            else {
                if (cashReceived !== undefined && cashReceived !== null) {
                    lines.push(NativePrinter.formatColumns('Especes:', `${Math.round(cashReceived)} FCFA`, width));
                }
                if (change !== undefined && change !== null) {
                    lines.push(NativePrinter.formatColumns('Rendu:', `${Math.round(change)} FCFA`, width));
                }
            }

            if (footerLines.length > 0) {
                lines.push('');
                for (const line of footerLines) {
                    lines.push(centerText(line, width));
                }
            }

            const printed = await NativePrinter.printText(lines, undefined, {
                logoSource: effectivePrintLogo ? NativePrinter.getStoredPrintableLogo() : undefined,
                paper: paper === '58' ? '58' : '80',
                title: 'Recu',
            });

            if (!printed) {
                const usedNative = await tryNativePrint(html, `Recu-${receiptNumber}`);
                if (!usedNative) {
                    alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
                }
            }
        }
        catch (error) {
            const usedNative = await tryNativePrint(html, `Recu-${receiptNumber}`);
            if (!usedNative) {
                alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Recu de vente</DialogTitle>
                </DialogHeader>

                <div ref={receiptRef} className="receipt bg-white p-6 font-mono text-sm" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    <div className="header text-center mb-4 border-b border-dashed border-gray-400 pb-4">
                        <div className="store-name text-lg font-bold mb-1">{storeName}</div>
                        {storeAddress ? <div className="store-address text-xs">{storeAddress}</div> : null}
                    </div>

                    <div className="receipt-info text-xs mb-4 border-b border-dashed border-gray-400 pb-4">
                        <div>Recu N°: {receiptNumber}</div>
                        <div>Date: {formatDate(date)}</div>
                    </div>

                    <div className="items mb-4">
                        {items.map((item, index) => (
                            <div key={index} className="item mb-3">
                                <div className="item-name font-bold">{item.name}</div>
                                <div className="item-details flex justify-between text-xs">
                                    <span>{item.quantity} x {Number.isNaN(item.price) ? 0 : item.price.toFixed(0)} FCFA</span>
                                    <span>{getReceiptItemDisplayTotal(item, { subtotal, tax, total }).toFixed(0)} FCFA</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="totals border-t border-dashed border-gray-400 pt-4 mb-4">
                        <div className="total-row flex justify-between mb-2">
                            <span>Sous-total:</span>
                            <span>{subtotal.toFixed(0)} FCFA</span>
                        </div>
                        <div className="total-row flex justify-between mb-2">
                            <span>TVA:</span>
                            <span>{tax.toFixed(0)} FCFA</span>
                        </div>
                        <div className="total-row grand-total flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-800">
                            <span>TOTAL:</span>
                            <span>{total.toFixed(0)} FCFA</span>
                        </div>
                    </div>

                    <div className="payment-info border-t border-dashed border-gray-400 pt-4 mb-4">
                        <div className="flex justify-between mb-2">
                            <span>Mode de paiement:</span>
                            <span>{getPaymentMethodText(paymentMethod)}</span>
                        </div>
                        {paymentDetails && paymentDetails.length > 0 ? paymentDetails.map((payment, index) => (
                            <div className="flex justify-between mb-2" key={index}>
                                <span>{payment.label}:</span>
                                <span>{payment.amount.toFixed(0)} FCFA</span>
                            </div>
                        )) : null}
                        {change !== undefined && change > 0 ? (
                            <div className="flex justify-between font-bold">
                                <span>Rendu:</span>
                                <span>{change.toFixed(0)} FCFA</span>
                            </div>
                        ) : null}
                    </div>

                    {footerLines.length > 0 ? (
                        <div className="footer text-center mt-6 border-t border-dashed border-gray-400 pt-4 text-xs">
                            {footerLines.map((line, index) => (
                                <div key={`${index}-${line}`} className={index < footerLines.length - 1 ? 'mb-1' : undefined}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="flex gap-2">
                    <Button onClick={handlePrint} className="flex-1">
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimer
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                        Fermer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
