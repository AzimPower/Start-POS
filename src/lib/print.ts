export function buildReceiptHtml(contentElement: HTMLElement, title = 'Reçu') {
    const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; width: 80mm; padding: 5mm; font-size: 11px; }
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
    // Force native ESC/POS printing only. This function will throw if native APIs are not available
    // to ensure the web fallback is removed as requested.
    const { isNativePrinterAvailable, nativePrint } = await import('./nativePrinter.ts');
    if (!(await isNativePrinterAvailable())) {
        return false;
    }
    return await nativePrint(html, fileName);
}
// browserPrint removed: printing is native-only now.
