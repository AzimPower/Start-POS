import { useEffect, useRef, useState } from 'react';
import { tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
import { getStoredReceiptPaper } from '@/lib/receiptPaper';
import { getReceiptItemDisplayTotal } from '@/lib/receiptAmounts';
import { DEFAULT_STORE_RECEIPT_SETTINGS, getReceiptFooterLines, getStoreReceiptSettings, type StoreReceiptSettings } from '@/lib/storeReceiptSettings';
import { buildSaleReceiptHtml, buildSaleReceiptLines, getSaleReceiptPaymentMethodText } from '@/lib/saleReceiptDocument';
import { showAppAlert } from '@/contexts/AppDialogContext';
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

    const handlePrint = async () => {
        const printContent = receiptRef.current;
        if (!printContent) {
            return;
        }

        let html = '';
        try {
            const paper = getStoredReceiptPaper();
            const storedLogoSource = effectivePrintLogo ? await NativePrinter.resolvePrintableLogoSource(storeId) : null;
            const printableLogo = storedLogoSource
                ? (await NativePrinter.cachePrintableLogo(storedLogoSource).catch(() => storedLogoSource)) || storedLogoSource
                : undefined;
            const receiptDocument = {
                storeName,
                storeAddress,
                receiptNumber,
                dateText: formatDate(date),
                items: items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: Number.isNaN(item.price) ? 0 : Number(item.price),
                    displayTotal: getReceiptItemDisplayTotal(item, { subtotal, tax, total }),
                })),
                subtotal,
                tax,
                total,
                paymentMethod,
                paymentDetails,
                cashReceived,
                change,
                footerLines,
                paper: paper === '58' ? '58' : '80',
                logoSource: printableLogo,
            } as const;
            const lines = buildSaleReceiptLines(receiptDocument);
            html = buildSaleReceiptHtml(receiptDocument, `Recu-${receiptNumber}`);

            const printed = await NativePrinter.printText(lines, undefined, {
                logoSource: receiptDocument.logoSource,
                paper: paper === '58' ? '58' : '80',
                title: 'Recu',
            });

            if (!printed) {
                const usedNative = await tryNativePrint(html, `Recu-${receiptNumber}`);
                if (!usedNative) {
                    await showAppAlert("Impossible d'imprimer: utilisez Android ou l'application desktop avec une imprimante native configurée.");
                }
            }
        }
        catch (error) {
            const usedNative = await tryNativePrint(html, `Recu-${receiptNumber}`);
            if (!usedNative) {
                await showAppAlert("Impossible d'imprimer: utilisez Android ou l'application desktop avec une imprimante native configurée.");
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
                            <span>{getSaleReceiptPaymentMethodText(paymentMethod)}</span>
                        </div>
                        {paymentDetails && paymentDetails.length > 0 ? paymentDetails.map((payment, index) => (
                            <div className="flex justify-between mb-2" key={index}>
                                <span>{payment.label}:</span>
                                <span>{payment.amount.toFixed(0)} FCFA</span>
                            </div>
                        )) : null}
                        {!paymentDetails?.length && cashReceived !== undefined && cashReceived !== null ? (
                            <div className="flex justify-between mb-2">
                                <span>Espèces:</span>
                                <span>{cashReceived.toFixed(0)} FCFA</span>
                            </div>
                        ) : null}
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
