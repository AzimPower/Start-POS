import * as NativePrinter from '@/lib/nativePrinter';
import { getReceiptPaperLayout, getStoredReceiptPaper, type ReceiptPaper } from '@/lib/receiptPaper';

export type SaleReceiptLineItem = {
    name: string;
    quantity: number;
    unitPrice: number;
    displayTotal: number;
    discountAmount?: number;
};

export type SaleReceiptPaymentDetail = {
    label: string;
    amount: number;
};

export type SaleReceiptDocumentData = {
    storeName: string;
    storeAddress?: string;
    receiptNumber: string;
    dateText: string;
    items: SaleReceiptLineItem[];
    subtotal: number;
    tax: number;
    total: number;
    discountTotal?: number;
    paymentMethod: string;
    paymentDetails?: SaleReceiptPaymentDetail[];
    cashReceived?: number;
    change?: number;
    footerLines?: string[];
    paper?: ReceiptPaper;
    logoSource?: string;
};

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toRoundedAmount(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function getSaleReceiptPaymentMethodText(method: string) {
    switch (method) {
        case 'cash':
            return 'Espèces';
        case 'mobile_money':
            return 'Mobile Money';
        case 'mixed':
            return 'Mixte';
        default:
            return method || '';
    }
}

function splitReceiptDateTimeText(dateText: string) {
    const normalized = String(dateText || '')
        .replace(/\u00A0|\u202F/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return { datePart: '', timePart: '' };
    }

    const match = normalized.match(/^(.*?)(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (!match) {
        return { datePart: normalized, timePart: '' };
    }

    return {
        datePart: match[1].replace(/[,\-:]\s*$/, '').trim(),
        timePart: match[2].trim(),
    };
}

export function buildSaleReceiptHeaderLines(data: Pick<SaleReceiptDocumentData, 'receiptNumber' | 'dateText' | 'paper'>) {
    const paper = data.paper || getStoredReceiptPaper();
    const width = paper === '58' ? 32 : 48;

    if (paper === '58') {
        const { datePart, timePart } = splitReceiptDateTimeText(data.dateText);
        const lines = [
            NativePrinter.formatColumns(datePart || data.dateText || '', `N° : ${data.receiptNumber}`, width),
        ];

        if (timePart) {
            lines.push(timePart);
        }

        return lines;
    }

    return [
        NativePrinter.formatColumns(data.dateText, `Recu N°: ${data.receiptNumber}`, width),
    ];
}

export function buildSaleReceiptItemLines(item: SaleReceiptLineItem, paper?: ReceiptPaper) {
    const resolvedPaper = paper || getStoredReceiptPaper();
    const width = resolvedPaper === '58' ? 32 : 48;
    const itemName = String(item.name || '');
    const quantityText = `${toRoundedAmount(item.quantity)} x ${toRoundedAmount(item.unitPrice)} FCFA`;
    const totalText = `${toRoundedAmount(item.displayTotal)} FCFA`;

    if (resolvedPaper === '58') {
        const lines = [
            NativePrinter.formatColumns(itemName, '', width),
            NativePrinter.formatColumns(quantityText, totalText, width),
        ];
        if (Number(item.discountAmount || 0) > 0) {
            lines.push(NativePrinter.formatColumns('  Remise', `-${toRoundedAmount(item.discountAmount)} FCFA`, width));
        }
        return lines;
    }

    const leftFull = `${itemName} ${quantityText}`.trim();

    if (leftFull.length + 1 + totalText.length <= width) {
        const lines = [NativePrinter.formatColumns(leftFull, totalText, width)];
        if (Number(item.discountAmount || 0) > 0) {
            lines.push(NativePrinter.formatColumns('Remise', `-${toRoundedAmount(item.discountAmount)} FCFA`, width));
        }
        return lines;
    }

    const lines = [
        NativePrinter.formatColumns(itemName, totalText, width),
        NativePrinter.formatColumns(quantityText, '', width),
    ];
    if (Number(item.discountAmount || 0) > 0) {
        lines.push(NativePrinter.formatColumns('Remise', `-${toRoundedAmount(item.discountAmount)} FCFA`, width));
    }
    return lines;
}

export function buildSaleReceiptLines(data: SaleReceiptDocumentData) {
    const paper = data.paper || getStoredReceiptPaper();
    const width = paper === '58' ? 32 : 48;
    const separator = '-'.repeat(width);
    const centerText = (value: string) => {
        const normalized = String(value || '');
        if (normalized.length >= width) {
            return normalized;
        }
        const left = Math.floor((width - normalized.length) / 2);
        return ' '.repeat(left) + normalized;
    };

    const lines: string[] = [];
    lines.push(centerText(data.storeName || 'Magasin'));

    if (data.storeAddress) {
        for (const line of String(data.storeAddress).split(/\r?\n/).filter(Boolean)) {
            lines.push(centerText(line));
        }
    }

    lines.push('');
    const compactHeaderLines = paper === '58' ? buildSaleReceiptHeaderLines(data) : null;
    lines.push(NativePrinter.formatColumns(data.dateText, `Recu N°: ${data.receiptNumber}`, width));
    if (compactHeaderLines) {
        lines.pop();
        lines.push(...compactHeaderLines);
    }
    lines.push(separator);

    for (const item of data.items) {
        lines.push(...buildSaleReceiptItemLines(item, paper));
    }

    lines.push(separator);
    lines.push(NativePrinter.formatColumns('Sous-total:', `${toRoundedAmount(data.subtotal)} FCFA`, width));
    if (Number(data.discountTotal || 0) > 0) {
        lines.push(NativePrinter.formatColumns('Remise:', `-${toRoundedAmount(data.discountTotal)} FCFA`, width));
    }
    lines.push(NativePrinter.formatColumns('TVA:', `${toRoundedAmount(data.tax)} FCFA`, width));
    lines.push(NativePrinter.formatColumns('TOTAL:', `${toRoundedAmount(data.total)} FCFA`, width));
    lines.push('');
    lines.push(NativePrinter.formatColumns('Mode de paiement:', getSaleReceiptPaymentMethodText(data.paymentMethod), width));

    if (data.paymentDetails && data.paymentDetails.length > 0) {
        for (const payment of data.paymentDetails) {
            lines.push(NativePrinter.formatColumns(`${payment.label}:`, `${toRoundedAmount(payment.amount)} FCFA`, width));
        }
        if (data.change !== undefined && data.change !== null && Number(data.change) > 0) {
            lines.push(NativePrinter.formatColumns('Rendu:', `${toRoundedAmount(data.change)} FCFA`, width));
        }
    }
    else {
        if (data.cashReceived !== undefined && data.cashReceived !== null) {
            lines.push(NativePrinter.formatColumns('Espèces:', `${toRoundedAmount(data.cashReceived)} FCFA`, width));
        }
        if (data.change !== undefined && data.change !== null && Number(data.change) > 0) {
            lines.push(NativePrinter.formatColumns('Rendu:', `${toRoundedAmount(data.change)} FCFA`, width));
        }
    }

    const footerLines = (data.footerLines || []).filter(Boolean);
    if (footerLines.length > 0) {
        lines.push('');
        for (const line of footerLines) {
            lines.push(centerText(line));
        }
    }

    return lines;
}

export function buildSaleReceiptHtml(data: SaleReceiptDocumentData, title = 'Recu') {
    const paper = data.paper || getStoredReceiptPaper();
    return buildPlainTextReceiptHtml({
        lines: buildSaleReceiptLines({ ...data, paper }),
        title,
        paper,
        logoSource: data.logoSource,
    });
}

export function buildPlainTextReceiptHtml({
    lines,
    title = 'Recu',
    paper,
    logoSource,
}: {
    lines: string[];
    title?: string;
    paper?: ReceiptPaper;
    logoSource?: string;
}) {
    const selectedPaper = paper || getStoredReceiptPaper();
    const layout = getReceiptPaperLayout(selectedPaper);
    const preContent = escapeHtml((lines || []).join('\n'));
    const logoMarkup = logoSource
        ? `<div class="logo-wrap"><img src="${escapeHtml(logoSource)}" alt="Logo magasin" class="logo" /></div>`
        : '';
    const targetWidthPx = selectedPaper === '58' ? 384 : 576;
    const scriptConfig = JSON.stringify({
        paper: selectedPaper,
        targetWidthPx,
        charsPerLine: selectedPaper === '58' ? 32 : 48,
        paddingX: selectedPaper === '58' ? 8 : 14,
        paddingTop: selectedPaper === '58' ? 8 : 12,
        paddingBottom: selectedPaper === '58' ? 10 : 14,
        logoGap: selectedPaper === '58' ? 8 : 12,
        logoMaxHeight: selectedPaper === '58' ? 170 : 240,
        lines: lines || [],
        logoSource: logoSource || null,
    }).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: ${layout.pageWidthMm}mm auto; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; }
        body {
          width: ${layout.pageWidthMm}mm;
          margin: 0;
          font-family: "Lucida Console", "Courier New", Courier, monospace;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .ticket-canvas {
          display: block;
          width: 100%;
          height: auto;
        }
        .logo-wrap {
          display: flex;
          justify-content: center;
          margin: 0 0 6px;
        }
        .logo {
          max-width: 100%;
          width: ${selectedPaper === '58' ? '118px' : '160px'};
          max-height: ${selectedPaper === '58' ? '62px' : '92px'};
          object-fit: contain;
        }
        pre {
          margin: 0;
          width: 100%;
          white-space: pre;
          overflow-wrap: normal;
          word-break: normal;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <canvas id="ticket-canvas" class="ticket-canvas"></canvas>
        <noscript>
          ${logoMarkup}
          <pre>${preContent}</pre>
        </noscript>
      </div>
      <script>
        window.__START_POS_RENDER_DONE = false;
        const CONFIG = ${scriptConfig};

        function thresholdCanvas(ctx, width, height) {
          const image = ctx.getImageData(0, 0, width, height);
          const pixels = image.data;
          for (let index = 0; index < pixels.length; index += 4) {
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const alpha = pixels[index + 3];
            const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
            const value = alpha < 32 ? 255 : (luminance < 190 ? 0 : 255);
            pixels[index] = value;
            pixels[index + 1] = value;
            pixels[index + 2] = value;
            pixels[index + 3] = 255;
          }
          ctx.putImageData(image, 0, 0);
        }

        function fitFontSize() {
          const measureCanvas = document.createElement('canvas');
          const measureContext = measureCanvas.getContext('2d');
          const fontFamily = '"Lucida Console", "Courier New", Courier, monospace';
          const sample = '0'.repeat(CONFIG.charsPerLine);
          let fontSize = CONFIG.paper === '58' ? 22 : 24;
          const availableWidth = CONFIG.targetWidthPx - (CONFIG.paddingX * 2);

          while (fontSize > 10) {
            measureContext.font = '700 ' + fontSize + 'px ' + fontFamily;
            if (measureContext.measureText(sample).width <= availableWidth) {
              break;
            }
            fontSize -= 0.5;
          }

          return fontSize;
        }

        function loadLogo() {
          return new Promise((resolve) => {
            if (!CONFIG.logoSource) {
              resolve(null);
              return;
            }
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = CONFIG.logoSource;
          });
        }

        async function renderTicket() {
          const canvas = document.getElementById('ticket-canvas');
          const context = canvas.getContext('2d');
          const fontFamily = '"Lucida Console", "Courier New", Courier, monospace';
          const fontSize = fitFontSize();
          const lineHeight = Math.round(fontSize * (CONFIG.paper === '58' ? 1.34 : 1.3));
          const logoImage = await loadLogo();
          let logoWidth = 0;
          let logoHeight = 0;

          if (logoImage && logoImage.naturalWidth && logoImage.naturalHeight) {
            const maxLogoWidth = CONFIG.targetWidthPx - (CONFIG.paddingX * 2);
            const scale = Math.min(maxLogoWidth / logoImage.naturalWidth, CONFIG.logoMaxHeight / logoImage.naturalHeight, 1);
            logoWidth = Math.max(1, Math.round(logoImage.naturalWidth * scale));
            logoHeight = Math.max(1, Math.round(logoImage.naturalHeight * scale));
          }

          const totalHeight = CONFIG.paddingTop
            + (logoHeight > 0 ? logoHeight + CONFIG.logoGap : 0)
            + (CONFIG.lines.length * lineHeight)
            + CONFIG.paddingBottom;

          canvas.width = CONFIG.targetWidthPx;
          canvas.height = Math.max(totalHeight, lineHeight + CONFIG.paddingTop + CONFIG.paddingBottom);

          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);

          let cursorY = CONFIG.paddingTop;

          if (logoImage && logoWidth > 0 && logoHeight > 0) {
            const logoX = Math.round((CONFIG.targetWidthPx - logoWidth) / 2);
            context.drawImage(logoImage, logoX, cursorY, logoWidth, logoHeight);
            cursorY += logoHeight + CONFIG.logoGap;
          }

          context.fillStyle = '#000000';
          context.textBaseline = 'top';
          context.font = '700 ' + fontSize + 'px ' + fontFamily;

          for (const line of CONFIG.lines) {
            context.fillText(String(line || ''), CONFIG.paddingX, cursorY);
            cursorY += lineHeight;
          }

          thresholdCanvas(context, canvas.width, canvas.height);
          window.__START_POS_RENDER_DONE = true;
        }

        window.addEventListener('load', () => {
          void renderTicket().catch(() => {
            window.__START_POS_RENDER_DONE = true;
          });
        }, { once: true });
      </script>
    </body>
  </html>`;
}
