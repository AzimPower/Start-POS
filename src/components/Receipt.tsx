import { useEffect, useRef } from 'react';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';
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
}
export default function Receipt({ open, onOpenChange, storeName, storeAddress, items, subtotal, tax, total, paymentMethod, cashReceived, change, receiptNumber, date, paymentDetails }: ReceiptProps & {
    paymentDetails?: {
        label: string;
        amount: number;
    }[];
}) {
    const receiptRef = useRef<HTMLDivElement>(null);
    // Helper to read the effective auto_print setting from storage at render time
    const getAutoPrintEnabled = (): boolean => {
        try {
            const s = localStorage.getItem('auto_print');
            return s === null ? true : s === 'true';
        }
        catch (e) {
            return true;
        }
    };
    const handlePrint = async () => {
        const printContent = receiptRef.current;
        if (!printContent)
            return;
        // Build HTML for automatic/native flows that expect HTML
        const html = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reçu #${receiptNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 5mm; font-size: 11px; }
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
            @media print { body { width: 80mm; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>`;
        // For manual print button we prefer a plain-text ESC/POS print so CSS
        // styles don't get included as literal text. Build a concise text representation
        // and send via NativePrinter.printText. If that fails, fall back to tryNativePrint.
        try {
            // If a store logo is saved (data URL or URL) print it first (centered)
            const savedLogo = localStorage.getItem('storeLogo');
            if (savedLogo) {
                try {
                    const paper = localStorage.getItem('printer_paper') || '80';
                    await NativePrinter.printImage(savedLogo, undefined, paper === '58' ? '58' : '80');
                }
                catch (e) {
                }
            }
            const lines: string[] = [];
            // small helper to center text for plain-text ESC/POS receipts
            const centerText = (s: string, w: number) => {
                const str = (s || '').toString();
                if (str.length >= w)
                    return str;
                const left = Math.floor((w - str.length) / 2);
                return ' '.repeat(left) + str;
            };
            const paper = localStorage.getItem('printer_paper') || '80';
            const width = paper === '58' ? 32 : 48;
            // Center store name and address
            lines.push(centerText(storeName || 'Magasin', width));
            if (storeAddress)
                lines.push(centerText(storeAddress, width));
            lines.push('');
            // Date on the left, receipt number on the right (same line)
            lines.push(NativePrinter.formatColumns(formatDate(date), `Reçu N°: ${receiptNumber}`, width));
            lines.push('--------------------------------');
            for (const it of items) {
                const name = it.name;
                const qty = it.quantity;
                const price = isNaN(it.price) ? 0 : Math.round(it.price);
                const totalItem = isNaN(it.total) ? qty * price : Math.round(it.total);
                const qtyText = `${qty} x ${price} FCFA`;
                const totalText = `${totalItem} FCFA`;
                const leftFull = (name + ' ' + qtyText).trim();
                // If name + qty + total fits on one line, print them together (name+qty on left, total on right)
                if (leftFull.length + 1 + totalText.length <= width) {
                    lines.push(NativePrinter.formatColumns(leftFull, totalText, width));
                }
                else {
                    // Otherwise, prefer name on first line with total on right, and qty on the next line
                    const firstLineLeft = name;
                    if (firstLineLeft.length + 1 + totalText.length <= width) {
                        lines.push(NativePrinter.formatColumns(firstLineLeft, totalText, width));
                        lines.push(NativePrinter.formatColumns(qtyText, '', width));
                    }
                    else {
                        // As a last resort use the formatter which will wrap the left text and keep right on first line
                        lines.push(NativePrinter.formatColumns(name, totalText, width));
                        lines.push(NativePrinter.formatColumns(qtyText, '', width));
                    }
                }
            }
            lines.push('-------------------------------------------------');
            lines.push(NativePrinter.formatColumns('Sous-total:', `${Math.round(subtotal)} FCFA`, width));
            lines.push(NativePrinter.formatColumns('TVA:', `${Math.round(tax)} FCFA`, width));
            lines.push(NativePrinter.formatColumns('TOTAL:', `${Math.round(total)} FCFA`, width));
            lines.push('');
            // Payment section: show method and any detailed payment lines in columns
            lines.push(NativePrinter.formatColumns('Mode de paiement:', getPaymentMethodText(paymentMethod), width));
            if (paymentDetails && paymentDetails.length > 0) {
                for (const p of paymentDetails) {
                    lines.push(NativePrinter.formatColumns(p.label + ':', `${Math.round(p.amount)} FCFA`, width));
                }
            }
            else {
                if (cashReceived !== undefined && cashReceived !== null) {
                    lines.push(NativePrinter.formatColumns('Espèces:', `${Math.round(cashReceived)} FCFA`, width));
                }
                if (change !== undefined && change !== null) {
                    lines.push(NativePrinter.formatColumns('Rendu:', `${Math.round(change)} FCFA`, width));
                }
            }
            lines.push('');
            lines.push('Merci pour votre visite !');
            const printed = await NativePrinter.printText(lines);
            if (!printed) {
                // fallback: try native print with HTML as older path
                const usedNative = await tryNativePrint(html, `Reçu-${receiptNumber}`);
                if (!usedNative)
                    alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
            }
        }
        catch (e) {
            const usedNative = await tryNativePrint(html, `Reçu-${receiptNumber}`);
            if (!usedNative)
                alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
        }
    };
    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };
    const getPaymentMethodText = (method: string) => {
        switch (method) {
            case 'cash': return 'Espèces';
            case 'mobile_money': return 'Mobile Money';
            case 'mixed': return 'Mixte';
            default: return method;
        }
    };
    // ...existing code...
    // Ajout récupération des montants par mode si mixte
    let cashPayment = undefined;
    let mobilePayment = undefined;
    if (paymentMethod === 'mixed' && (typeof (window as any).lastSale !== 'undefined' || typeof (window as any).lastSale !== 'undefined')) {
        // On tente de récupérer les montants depuis props si possible
        // Mais Receipt ne reçoit pas payments, donc on va utiliser cashReceived/mobileAmount si transmis
        if ((window as any).lastSale && Array.isArray((window as any).lastSale.payments)) {
            for (const p of (window as any).lastSale.payments) {
                if (p.method === 'cash')
                    cashPayment = p.amount;
                if (p.method === 'mobile_money')
                    mobilePayment = p.amount;
            }
        }
    }
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reçu de vente</DialogTitle>
        </DialogHeader>
        
  <div ref={receiptRef} className="receipt bg-white p-6 font-mono text-sm" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="header text-center mb-4 border-b border-dashed border-gray-400 pb-4">
            <div className="store-name text-lg font-bold mb-1">{storeName}</div>
            {storeAddress && <div className="store-address text-xs">{storeAddress}</div>}
          </div>

          <div className="receipt-info text-xs mb-4 border-b border-dashed border-gray-400 pb-4">
            <div>Reçu N°: {receiptNumber}</div>
            <div>Date: {formatDate(date)}</div>
          </div>

          <div className="items mb-4">
            {items.map((item, index) => (<div key={index} className="item mb-3">
                <div className="item-name font-bold">{item.name}</div>
                <div className="item-details flex justify-between text-xs">
                  <span>{item.quantity} x {isNaN(item.price) ? 0 : item.price.toFixed(0)} FCFA</span>
                  <span>{isNaN(item.total) ? (item.quantity * (isNaN(item.price) ? 0 : item.price)).toFixed(0) : item.total.toFixed(0)} FCFA</span>
                </div>
              </div>))}
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
            {paymentDetails && paymentDetails.length > 0 && paymentDetails.map((p, idx) => (<div className="flex justify-between mb-2" key={idx}>
                <span>{p.label}:</span>
                <span>{p.amount.toFixed(0)} FCFA</span>
              </div>))}
            {change !== undefined && change > 0 && (<div className="flex justify-between font-bold">
                <span>Rendu:</span>
                <span>{change.toFixed(0)} FCFA</span>
              </div>)}
          </div>

          <div className="footer text-center mt-6 border-t border-dashed border-gray-400 pt-4 text-xs">
            <div className="mb-1">Merci pour votre visite !</div>
            <div>À bientôt</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1">
            <Printer className="w-4 h-4 mr-2"/>
            Imprimer
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>);
}
