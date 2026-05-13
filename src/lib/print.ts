import { getReceiptPaperLayout } from './receiptPaper';

export function buildReceiptHtml(contentElement: HTMLElement, title = 'ReÃ§u') {
    const layout = getReceiptPaperLayout();
    const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: ${layout.pageWidthMm}mm auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; width: ${layout.pageWidthMm}mm; padding: ${layout.paddingMm}mm; font-size: 11px; }
        .receipt { width: 100%; }
      </style>
    </head>
    <body>
      ${contentElement.innerHTML}
    </body>
  </html>`;
    return html;
}
export async function tryNativePrint(html: string, fileName?: string): Promise<boolean> {
    const { isNativePrinterAvailable, nativePrint } = await import('./nativePrinter.ts');
    if (await isNativePrinterAvailable()) {
        return await nativePrint(html, fileName);
    }
    return false;
}
