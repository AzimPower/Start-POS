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
async function browserPrint(html: string, title = 'Impression'): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return false;
    }
    return await new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        let done = false;
        const finish = (value: boolean) => {
            if (done) {
                return;
            }
            done = true;
            window.setTimeout(() => {
                try {
                    iframe.remove();
                }
                catch (e) {
                }
            }, 1200);
            resolve(value);
        };
        iframe.setAttribute('title', title);
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.position = 'fixed';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        iframe.onload = () => {
            window.setTimeout(async () => {
                try {
                    const frameWindow = iframe.contentWindow;
                    const frameDocument = iframe.contentDocument;
                    if (!frameWindow) {
                        finish(false);
                        return;
                    }
                    if (frameDocument) {
                        const images = Array.from(frameDocument.images || []);
                        await Promise.all(images.map((image) => {
                            if (image.complete) {
                                return Promise.resolve();
                            }
                            return new Promise<void>((imageResolve) => {
                                const done = () => imageResolve();
                                image.addEventListener('load', done, { once: true });
                                image.addEventListener('error', done, { once: true });
                            });
                        }));
                        if (frameDocument.fonts?.ready) {
                            try {
                                await frameDocument.fonts.ready;
                            }
                            catch (e) {
                            }
                        }
                    }
                    if ((frameWindow as any).__START_POS_RENDER_DONE === false) {
                        const startedAt = Date.now();
                        while ((frameWindow as any).__START_POS_RENDER_DONE === false && (Date.now() - startedAt) < 2500) {
                            await new Promise((waitResolve) => window.setTimeout(waitResolve, 50));
                        }
                    }
                    await new Promise((frameResolve) => frameWindow.requestAnimationFrame(() => {
                        frameWindow.requestAnimationFrame(() => frameResolve(undefined));
                    }));
                    frameWindow.onafterprint = () => finish(true);
                    frameWindow.focus();
                    frameWindow.print();
                    window.setTimeout(() => finish(true), 1200);
                }
                catch (e) {
                    finish(false);
                }
            }, 100);
        };
        try {
            iframe.srcdoc = html;
            document.body.appendChild(iframe);
        }
        catch (e) {
            finish(false);
        }
    });
}
export async function tryNativePrint(html: string, fileName?: string): Promise<boolean> {
    // Prefer native printer integrations when available. On plain web, fall back
    // to the browser print dialog so Windows-installed printers stay usable.
    const { isNativePrinterAvailable, nativePrint } = await import('./nativePrinter.ts');
    if (await isNativePrinterAvailable()) {
        return await nativePrint(html, fileName);
    }
    return await browserPrint(html, fileName || 'Impression');
}
