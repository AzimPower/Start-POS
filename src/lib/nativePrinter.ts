// Minimal native printer helper using common Cordova/Capacitor plugin interfaces.
// This file provides a best-effort native ESC/POS print implementation for
// Bluetooth thermal printers (58mm/80mm). It detects common plugins and
// attempts to send raw ESC/POS bytes. If no native plugin is present, the
// functions will indicate unavailability.
import { getReceiptPaperLayout, getStoredReceiptPaper } from './receiptPaper';
import { getDB } from './db';
import { BACKEND_BASE } from './backend';
type DesktopPrinterInfo = {
    id: string;
    name: string;
    isDefault?: boolean;
    status?: number | null;
};
type PrintTextOptions = {
    logoSource?: string | null;
    paper?: '58' | '80';
    title?: string;
};
const STORE_LOGO_KEY = 'storeLogo';
const STORE_LOGO_PRINT_DATA_KEY = 'storeLogo_print_data';
const STORE_LOGO_PRINT_SOURCE_KEY = 'storeLogo_print_source';
function safeLocalStorageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    }
    catch (err) {
        return null;
    }
}
function safeLocalStorageSet(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    }
    catch (err) {
    }
}
function safeLocalStorageRemove(key: string) {
    try {
        localStorage.removeItem(key);
    }
    catch (err) {
    }
}
function getDesktopPrinterBridge() {
    try {
        return window.__START_POS_DESKTOP__?.printers;
    }
    catch (err) {
        return undefined;
    }
}
function isDesktopPrinterRuntimeAvailable() {
    const bridge = getDesktopPrinterBridge();
    return !!(bridge && typeof bridge.list === 'function' && typeof bridge.printHtml === 'function');
}
async function normalizePrintableLogoDataUrl(dataUrl: string, maxWidth = 576): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
        return dataUrl;
    }
    return await new Promise<string>((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    const width = img.naturalWidth || img.width || 0;
                    const height = img.naturalHeight || img.height || 0;
                    if (!width || !height) {
                        resolve(dataUrl);
                        return;
                    }
                    const scale = width > maxWidth ? (maxWidth / width) : 1;
                    const targetWidth = Math.max(1, Math.round(width * scale));
                    const targetHeight = Math.max(1, Math.round(height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(dataUrl);
                        return;
                    }
                    ctx.clearRect(0, 0, targetWidth, targetHeight);
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    resolve(canvas.toDataURL('image/png'));
                }
                catch (err) {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        }
        catch (err) {
            resolve(dataUrl);
        }
    });
}
async function fetchImageSourceToDataUrl(source: string): Promise<string> {
    if (!source) {
        throw new Error('empty_image_source');
    }
    if (source.startsWith('data:')) {
        return source;
    }
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`image_fetch_failed_${response.status}`);
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('image_read_failed'));
        };
        reader.onerror = () => reject(new Error('image_read_failed'));
        reader.readAsDataURL(blob);
    });
}
async function fetchPrintableLogoDataFromApi(storeId: string): Promise<{ dataUrl: string; source?: string | null; } | null> {
    if (!storeId) {
        return null;
    }

    try {
        const url = new URL(`${BACKEND_BASE}/api/store_logo.php`);
        url.searchParams.set('storeId', storeId);
        url.searchParams.set('_ts', String(Date.now()));
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        const dataUrl = String(payload?.dataUrl || '').trim();
        const source = payload?.source ? String(payload.source).trim() : null;
        if (!dataUrl.startsWith('data:')) {
            return null;
        }

        return { dataUrl, source };
    }
    catch (err) {
        return null;
    }
}
export function getStoredPrintableLogo(preferredSource?: string | null): string | null {
    const cachedData = safeLocalStorageGet(STORE_LOGO_PRINT_DATA_KEY);
    const cachedSource = safeLocalStorageGet(STORE_LOGO_PRINT_SOURCE_KEY);
    const storedLogo = safeLocalStorageGet(STORE_LOGO_KEY);
    if (cachedData && cachedData.startsWith('data:')) {
        if (!preferredSource || !cachedSource || cachedSource === preferredSource || storedLogo === preferredSource) {
            return cachedData;
        }
    }
    return preferredSource || storedLogo;
}

function normalizeLogoSource(source?: string | null): string | null {
    if (!source) {
        return null;
    }

    const trimmed = String(source).trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }

    return trimmed.startsWith('/')
        ? `${BACKEND_BASE}${trimmed}`
        : `${BACKEND_BASE}/${trimmed}`;
}

function isCrossOriginSource(source?: string | null): boolean {
    if (!source) {
        return false;
    }

    try {
        const parsed = new URL(source, window.location.origin);
        return parsed.origin !== window.location.origin;
    }
    catch (err) {
        return false;
    }
}

export async function resolvePrintableLogoSource(storeId?: string | null): Promise<string | null> {
    const cachedLogo = getStoredPrintableLogo();
    if (cachedLogo && cachedLogo.startsWith('data:')) {
        return cachedLogo;
    }

    let candidateSource = normalizeLogoSource(cachedLogo);

    if (!candidateSource && storeId) {
        try {
            const db = await getDB();
            const storeRecord = await db.get('stores', storeId);
            candidateSource = normalizeLogoSource((storeRecord as any)?.logo || null);
        }
        catch (err) {
        }
    }

    if (candidateSource) {
        safeLocalStorageSet(STORE_LOGO_KEY, candidateSource);
        try {
            if (candidateSource.startsWith('data:')) {
                await cachePrintableLogo(candidateSource, candidateSource);
            } else if (storeId && isCrossOriginSource(candidateSource)) {
                const apiLogo = await fetchPrintableLogoDataFromApi(storeId);
                if (apiLogo?.dataUrl) {
                    const normalizedSource = normalizeLogoSource(apiLogo.source) || candidateSource;
                    safeLocalStorageSet(STORE_LOGO_KEY, normalizedSource);
                    await cachePrintableLogo(normalizedSource, apiLogo.dataUrl).catch(() => {
                    });
                    return getStoredPrintableLogo(normalizedSource) || apiLogo.dataUrl;
                }
            } else {
                await cachePrintableLogo(candidateSource);
            }
            return getStoredPrintableLogo(candidateSource) || candidateSource;
        }
        catch (err) {
        }
    }

    if (storeId) {
        const apiLogo = await fetchPrintableLogoDataFromApi(storeId);
        if (apiLogo?.dataUrl) {
            const normalizedSource = normalizeLogoSource(apiLogo.source) || candidateSource || apiLogo.dataUrl;
            safeLocalStorageSet(STORE_LOGO_KEY, normalizedSource);
            await cachePrintableLogo(normalizedSource, apiLogo.dataUrl).catch(() => {
            });
            return getStoredPrintableLogo(normalizedSource) || apiLogo.dataUrl;
        }
    }

    return candidateSource || null;
}
export function clearPrintableLogoCache() {
    safeLocalStorageRemove(STORE_LOGO_PRINT_DATA_KEY);
    safeLocalStorageRemove(STORE_LOGO_PRINT_SOURCE_KEY);
}
export async function cachePrintableLogo(source: string, rawDataUrl?: string): Promise<string | null> {
    const cacheSource = source || rawDataUrl || '';
    if (!cacheSource) {
        return null;
    }
    const cachedData = safeLocalStorageGet(STORE_LOGO_PRINT_DATA_KEY);
    const cachedSource = safeLocalStorageGet(STORE_LOGO_PRINT_SOURCE_KEY);
    if (cachedData && cachedData.startsWith('data:') && cachedSource === cacheSource) {
        return cachedData;
    }
    const dataUrl = rawDataUrl || await fetchImageSourceToDataUrl(source);
    const normalizedDataUrl = await normalizePrintableLogoDataUrl(dataUrl);
    safeLocalStorageSet(STORE_LOGO_PRINT_DATA_KEY, normalizedDataUrl);
    safeLocalStorageSet(STORE_LOGO_PRINT_SOURCE_KEY, cacheSource);
    return normalizedDataUrl;
}
async function imageSourceToDataUrl(source: string): Promise<string> {
    if (!source) {
        throw new Error('empty_image_source');
    }
    if (source.startsWith('data:')) {
        return await cachePrintableLogo(source, source) || source;
    }
    const cachedLogo = getStoredPrintableLogo(source);
    if (cachedLogo && cachedLogo.startsWith('data:')) {
        return cachedLogo;
    }
    return await cachePrintableLogo(source) || await fetchImageSourceToDataUrl(source);
}
async function sendToDesktopRaw(dataBase64: string, title?: string): Promise<boolean> {
    try {
        const bridge = getDesktopPrinterBridge();
        if (!bridge || typeof bridge.printRaw !== 'function') {
            return false;
        }
        const result = await bridge.printRaw({
            dataBase64,
            deviceName: _connectedMac || undefined,
            title
        });
        return !!result?.ok;
    }
    catch (err) {
        return false;
    }
}
function toBase64(bytes: number[]) {
    const chunkSize = 0x8000;
    let index = 0;
    const length = bytes.length;
    let result = '';
    let slice;
    while (index < length) {
        slice = bytes.slice(index, Math.min(index + chunkSize, length));
        result += String.fromCharCode.apply(null, slice as any);
        index += chunkSize;
    }
    return btoa(result);
}
async function buildLogoPayload(dataUrl: string, paper: '58' | '80'): Promise<number[]> {
    const resolvedDataUrl = await imageSourceToDataUrl(dataUrl);
    const targetWidth = paper === '58' ? 384 : 576;
    const raster = await imageDataUrlToRaster(resolvedDataUrl, targetWidth);
    const w = raster[0] | (raster[1] << 8);
    const h = raster[2] | (raster[3] << 8);
    const bitmap = raster.slice(4);
    const payload: number[] = [];
    payload.push(0x1b, 0x61, 0x01);
    payload.push(0x1d, 0x76, 0x30, 0x00, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
    payload.push(...bitmap);
    payload.push(0x1b, 0x61, 0x00);
    payload.push(0x0a);
    payload.push(0x0a);
    return payload;
}
export function textToEscPos(text: string) {
    // Try to encode to Windows-1252 (CP1252) which covers Western Europe
    // accented letters and is commonly supported by ESC/POS printers' codepages.
    // Fallback: unknown chars become '?'.
    const cp1252Map: {
        [code: number]: number;
    } = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
        0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
        0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
        0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
        0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
        0x017E: 0x9E, 0x0178: 0x9F
    };
    // Some environments may pass characters like non-breaking spaces or other
    // unicode punctuation; normalize common ones early.
    text = text.replace(/\u00A0|\u202F/g, ' ');
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code <= 0x7f) {
            bytes.push(code);
        }
        else if (code >= 0xa0 && code <= 0xff) {
            // direct mapping for ISO-8859-1 subset
            bytes.push(code & 0xff);
        }
        else if (cp1252Map[code]) {
            bytes.push(cp1252Map[code]);
        }
        else {
            // try to decompose accented characters (basic heuristic)
            try {
                const n = text[i].normalize ? text[i].normalize('NFD') : text[i];
                // remove combining diacritics (Unicode range 0300-036F)
                const stripped = n.replace(/[\u0300-\u036f]/g, '');
                if (stripped && stripped.length === 1 && stripped.charCodeAt(0) <= 0x7f) {
                    bytes.push(stripped.charCodeAt(0));
                    continue;
                }
            }
            catch (e) {
                // ignore
            }
            // As a last attempt, map some common Latin-1 Supplement letters to their
            // CP1252 byte values if possible (covers é, è, ç, à, ô, etc.)
            const latin1Map: {
                [code: number]: number;
            } = {
                0x00E9: 0xE9, // é
                0x00E8: 0xE8, // è
                0x00EA: 0xEA, // ê
                0x00EB: 0xEB, // ë
                0x00E0: 0xE0, // à
                0x00E2: 0xE2, // â
                0x00E4: 0xE4, // ä
                0x00F4: 0xF4, // ô
                0x00F2: 0xF2, // ò
                0x00F9: 0xF9, // ù
                0x00FB: 0xFB, // û
                0x00FC: 0xFC, // ü
                0x00E7: 0xE7, // ç
                0x00C9: 0xC9, // É
                0x00C8: 0xC8, // È
                0x00C0: 0xC0, // À
                0x00C7: 0xC7 // Ç
            };
            if (latin1Map[code]) {
                bytes.push(latin1Map[code]);
            }
            else {
                // unknown char -> fallback to '?'
                bytes.push(0x3f);
            }
        }
    }
    return bytes;
}
export async function isNativePrinterAvailable(): Promise<boolean> {
    try {
        const win = window as any;
        if (isDesktopPrinterRuntimeAvailable()) {
            return true;
        }
        // Check for common Cordova/Capacitor bluetooth serial plugin (no printer plugin fallback)
        if (win.bluetoothSerial || (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial)) {
            return true;
        }
    }
    catch (err) {
    }
    return false;
}
let _connectedMac: string | null = null;
export function isConnected(): boolean {
    return !!_connectedMac;
}
export async function listPaired(): Promise<Array<{
    name: string;
    id: string;
}>> {
    try {
        const desktopBridge = getDesktopPrinterBridge();
        if (desktopBridge && typeof desktopBridge.list === 'function') {
            const printers = await desktopBridge.list();
            return (printers || []).map((printer: DesktopPrinterInfo) => ({
                name: printer.isDefault ? `${printer.name} (par défaut)` : printer.name,
                id: printer.id
            }));
        }
        const win = window as any;
        if (win.bluetoothSerial && typeof win.bluetoothSerial.list === 'function') {
            return await new Promise((resolve, reject) => {
                win.bluetoothSerial.list((devices: any[]) => {
                    const mapped = (devices || []).map(d => ({ name: d.name || d.id || 'Unknown', id: d.id || d.address || d.bluetoothAddress || d }));
                    resolve(mapped);
                }, (err: any) => reject(err));
            });
        }
        if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.list === 'function') {
            return await new Promise((resolve, reject) => {
                win.cordova.plugins.BluetoothSerial.list((devices: any[]) => {
                    const mapped = (devices || []).map(d => ({ name: d.name || d.id || 'Unknown', id: d.id || d.address || d.bluetoothAddress || d }));
                    resolve(mapped);
                }, (err: any) => reject(err));
            });
        }
    }
    catch (err) {
    }
    return [];
}
export async function connect(deviceId: string): Promise<{
    ok: boolean;
    error?: string;
}> {
    try {
        const desktopBridge = getDesktopPrinterBridge();
        if (desktopBridge && typeof desktopBridge.list === 'function') {
            const printers = await desktopBridge.list();
            const match = (printers || []).find((printer: DesktopPrinterInfo) => printer.id === deviceId || printer.name === deviceId);
            if (!match) {
                return { ok: false, error: 'printer_not_found' };
            }
            _connectedMac = match.id;
            return { ok: true };
        }
        const win = window as any;
        // If already connected to this device, resolve
        if (_connectedMac === deviceId)
            return { ok: true };
        if (win.bluetoothSerial && typeof win.bluetoothSerial.connect === 'function') {
            // Helper to attempt a plugin connect and capture plugin error
            const attempt = (fnName: 'connect' | 'connectInsecure', id: string) => new Promise<{
                ok: boolean;
                error?: string;
            }>((resolve) => {
                try {
                    const fn = (win.bluetoothSerial as any)[fnName];
                    if (typeof fn !== 'function')
                        return resolve({ ok: false, error: 'no_method' });
                    fn.call(win.bluetoothSerial, id, () => {
                        _connectedMac = id;
                        resolve({ ok: true });
                    }, (err: any) => {
                        const em = err && (err.message || err) ? String(err.message || err) : 'error';
                        resolve({ ok: false, error: em });
                    });
                }
                catch (e) {
                    resolve({ ok: false, error: String(e) });
                }
            });
            // Try multiple id formats: original, no-colons, last 12 chars
            const variants = [deviceId, deviceId.replace(/:/g, ''), deviceId.replace(/:/g, '').slice(-12)];
            for (const vid of variants) {
                if (!vid)
                    continue;
                const res = await attempt('connect', vid);
                if (res.ok)
                    return { ok: true };
                // try insecure if available
                const res2 = await attempt('connectInsecure', vid);
                if (res2.ok)
                    return { ok: true };
                // if we have an error message, keep it for returning later
                if (res.error)
                    return { ok: false, error: res.error };
                if (res2.error)
                    return { ok: false, error: res2.error };
            }
            return { ok: false, error: 'connect_failed' };
        }
        if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.connect === 'function') {
            // cordova.plugins.BluetoothSerial - similar strategy
            const plugin = win.cordova.plugins.BluetoothSerial;
            const attempt = (fnName: 'connect' | 'connectInsecure', id: string) => new Promise<{
                ok: boolean;
                error?: string;
            }>((resolve) => {
                try {
                    const fn = (plugin as any)[fnName];
                    if (typeof fn !== 'function')
                        return resolve({ ok: false, error: 'no_method' });
                    fn.call(plugin, id, () => {
                        _connectedMac = id;
                        resolve({ ok: true });
                    }, (err: any) => {
                        const em = err && (err.message || err) ? String(err.message || err) : 'error';
                        resolve({ ok: false, error: em });
                    });
                }
                catch (e) {
                    resolve({ ok: false, error: String(e) });
                }
            });
            const variants = [deviceId, deviceId.replace(/:/g, ''), deviceId.replace(/:/g, '').slice(-12)];
            for (const vid of variants) {
                if (!vid)
                    continue;
                const r = await attempt('connect', vid);
                if (r.ok)
                    return { ok: true };
                const r2 = await attempt('connectInsecure', vid);
                if (r2.ok)
                    return { ok: true };
                if (r.error)
                    return { ok: false, error: r.error };
                if (r2.error)
                    return { ok: false, error: r2.error };
            }
            return { ok: false, error: 'connect_failed' };
        }
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}
export async function disconnect(): Promise<boolean> {
    try {
        if (isDesktopPrinterRuntimeAvailable()) {
            _connectedMac = null;
            return true;
        }
        const win = window as any;
        if (win.bluetoothSerial && typeof win.bluetoothSerial.disconnect === 'function') {
            return await new Promise((resolve) => {
                try {
                    win.bluetoothSerial.disconnect(() => {
                        _connectedMac = null;
                        resolve(true);
                    }, (err: any) => { _connectedMac = null; resolve(false); });
                }
                catch (e) {
                    _connectedMac = null;
                    resolve(false);
                }
            });
        }
        if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.disconnect === 'function') {
            return await new Promise((resolve) => {
                try {
                    win.cordova.plugins.BluetoothSerial.disconnect(() => { _connectedMac = null; resolve(true); }, (err: any) => { _connectedMac = null; resolve(false); });
                }
                catch (e) {
                    _connectedMac = null;
                    resolve(false);
                }
            });
        }
    }
    catch (err) {
    }
    _connectedMac = null;
    return false;
}
async function sendToBluetoothSerial(deviceId: string | null, base64Data: string): Promise<boolean> {
    const win = window as any;
    return new Promise<boolean>(async (resolve) => {
        try {
            // If not connected and deviceId provided, attempt connect
            if (!_connectedMac && deviceId) {
                const okc = await connect(deviceId);
                if (!okc) {
                }
            }
            const rawBytes = (() => {
                try {
                    return atob(base64Data).split('').map(c => c.charCodeAt(0));
                }
                catch (e) {
                    return null;
                }
            })();
            // Helper to attempt a write with callback-style plugin
            const tryWriteWithPlugin = (pluginWrite: any, data: any) => new Promise<boolean>((res) => {
                try {
                    pluginWrite(data, () => res(true), (err: any) => { res(false); });
                }
                catch (e) {
                    res(false);
                }
            });
            // Prefer ArrayBuffer write
            if (rawBytes && (win.bluetoothSerial && typeof win.bluetoothSerial.write === 'function')) {
                const buffer = new Uint8Array(rawBytes).buffer;
                const ok = await tryWriteWithPlugin(win.bluetoothSerial.write.bind(win.bluetoothSerial), buffer);
                if (ok)
                    return resolve(true);
            }
            if (rawBytes && (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.write === 'function')) {
                const buffer = new Uint8Array(rawBytes).buffer;
                const ok = await tryWriteWithPlugin(win.cordova.plugins.BluetoothSerial.write.bind(win.cordova.plugins.BluetoothSerial), buffer);
                if (ok)
                    return resolve(true);
            }
            // Some environments accept a binary string
            try {
                const binaryStr = rawBytes ? rawBytes.map((b: number) => String.fromCharCode(b)).join('') : atob(base64Data);
                if (win.bluetoothSerial && typeof win.bluetoothSerial.write === 'function') {
                    const ok = await tryWriteWithPlugin(win.bluetoothSerial.write.bind(win.bluetoothSerial), binaryStr);
                    if (ok)
                        return resolve(true);
                }
                if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.write === 'function') {
                    const ok = await tryWriteWithPlugin(win.cordova.plugins.BluetoothSerial.write.bind(win.cordova.plugins.BluetoothSerial), binaryStr);
                    if (ok)
                        return resolve(true);
                }
            }
            catch (e) {
                // ignore
            }
            // Some plugins accept base64 directly (rare). Try it as last resort.
            if (win.bluetoothSerial && typeof win.bluetoothSerial.write === 'function') {
                const ok = await tryWriteWithPlugin(win.bluetoothSerial.write.bind(win.bluetoothSerial), base64Data);
                if (ok)
                    return resolve(true);
            }
            if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial && typeof win.cordova.plugins.BluetoothSerial.write === 'function') {
                const ok = await tryWriteWithPlugin(win.cordova.plugins.BluetoothSerial.write.bind(win.cordova.plugins.BluetoothSerial), base64Data);
                if (ok)
                    return resolve(true);
            }
            // No success
            resolve(false);
        }
        catch (err) {
            resolve(false);
        }
    });
}
export async function nativePrint(html: string, fileName?: string): Promise<boolean> {
    try {
        const win = window as any;
        const desktopBridge = getDesktopPrinterBridge();
        if (desktopBridge && typeof desktopBridge.printHtml === 'function') {
            const result = await desktopBridge.printHtml({
                html,
                deviceName: _connectedMac || undefined,
                title: fileName
            });
            return !!result?.ok;
        }
        // Build a simple ESC/POS document: initialize, print text lines, feed and cut
        const INIT = [0x1b, 0x40]; // ESC @
        const FEED_AND_CUT = [0x1d, 0x56, 0x41, 0x10]; // GS V A n (partial cut)
        const LINE_FEED = [0x0a];
        // Convert HTML to printable plain text.
        // We must strip out <style>, <script> and other non-visible tags so the CSS
        // doesn't end up printed (that produced the raw-css output the user saw).
        let text = '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Remove style/script/link tags entirely so CSS doesn't appear as text
            doc.querySelectorAll('style,script,link').forEach(n => n.remove());
            const body = doc.body || doc.documentElement || null;
            if (body) {
                // innerText gives a human-readable representation; normalize whitespace
                text = body.innerText || body.textContent || '';
            }
        }
        catch (e) {
            // Fallback: very small sanitization if DOMParser isn't available
            const tmp = document.createElement('div');
            tmp.innerHTML = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
            text = tmp.innerText || tmp.textContent || '';
        }
        // Normalize whitespace and trim empty lines
        text = text.replace(/\u00a0/g, ' ').replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n');
        text = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
        // Ensure width handling: for 58mm vs 80mm we generally just use monospaced text
        const payload: number[] = [];
        payload.push(...INIT);
        payload.push(...textToEscPos(text));
        payload.push(...LINE_FEED);
        payload.push(...LINE_FEED);
        payload.push(...FEED_AND_CUT);
        const base64 = toBase64(payload);
        // If a bluetoothSerial plugin exists, try to send to the last connected device or broadcast
        if (win.bluetoothSerial || (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial)) {
            // If fileName contains a device id, it's not ideal; prefer connecting beforehand via connect(mac)
            const ok = await sendToBluetoothSerial(null, base64);
            return ok;
        }
        // No native plugin available -> cannot print on this platform
    }
    catch (err) {
    }
    return false;
}
export async function printHtml(html: string, deviceId?: string): Promise<boolean> {
    try {
        // If a deviceId is provided, try to connect first
        if (deviceId) {
            const res = await connect(deviceId);
            if (!res || !res.ok) {
                return false;
            }
        }
        return await nativePrint(html, undefined);
    }
    catch (err) {
        return false;
    }
}
/**
 * Print a pre-formatted plain-text receipt. This avoids sending raw HTML/CSS
 * to the printer which can appear as literal CSS text. The function builds a
 * simple ESC/POS payload with columns for item and price and sends it.
 */
export async function printText(lines: string[], deviceId?: string, options: PrintTextOptions = {}): Promise<boolean> {
    try {
        const selectedPaper = options.paper || getStoredReceiptPaper();
        const selectedLogo = options.logoSource || null;
        if (isDesktopPrinterRuntimeAvailable()) {
            if (deviceId) {
                const res = await connect(deviceId);
                if (!res.ok) {
                    return false;
                }
            }
            const INIT = [0x1b, 0x40];
            const SELECT_CP1252 = [0x1b, 0x74, 0x10];
            const FEED_AND_CUT = [0x1d, 0x56, 0x41, 0x10];
            const LINE_FEED = [0x0a];
            const sanitize = (s: string) => String(s || '').replace(/\u00a0/g, ' ').replace(/\t/g, '    ');
            const payload: number[] = [];
            payload.push(...INIT);
            payload.push(...SELECT_CP1252);
            if (selectedLogo) {
                try {
                    payload.push(...await buildLogoPayload(selectedLogo, selectedPaper));
                }
                catch (err) {
                }
            }
            for (const l of lines) {
                payload.push(...textToEscPos(sanitize(l) + '\n'));
            }
            payload.push(...LINE_FEED);
            payload.push(...FEED_AND_CUT);
            return await sendToDesktopRaw(toBase64(payload), options.title || 'Ticket');
        }
        const INIT = [0x1b, 0x40]; // ESC @
        // Select codepage WPC1252 (ESC t 16)
        const SELECT_CP1252 = [0x1b, 0x74, 0x10];
        const FEED_AND_CUT = [0x1d, 0x56, 0x41, 0x10];
        const LINE_FEED = [0x0a];
        // Helper: ensure each line fits within typical 32-48 char width depending on paper size.
        const sanitize = (s: string) => String(s || '').replace(/\u00a0/g, ' ').replace(/\t/g, '    ');
        const payload: number[] = [];
        payload.push(...INIT);
        payload.push(...SELECT_CP1252);
        if (selectedLogo) {
            try {
                payload.push(...await buildLogoPayload(selectedLogo, selectedPaper));
            }
            catch (err) {
            }
        }
        for (const l of lines) {
            const t = sanitize(l) + '\n';
            payload.push(...textToEscPos(t));
        }
        payload.push(...LINE_FEED);
        payload.push(...FEED_AND_CUT);
        const base64 = toBase64(payload);
        const ok = await sendToBluetoothSerial(deviceId || null, base64);
        return ok;
    }
    catch (err) {
        return false;
    }
}
/**
 * Helper to format two-column lines for monospace thermal printers.
 * left: left column text; right: right column text; width: number of chars
 * Returns a single string where right is aligned to the right and left is
 * truncated if necessary.
 */
export function formatColumns(left: string, right: string, width = 42): string {
    const L = String(left || '');
    const R = String(right || '');
    // If right column longer than width, truncate it
    if (R.length >= width)
        return R.slice(0, width);
    const leftMax = Math.max(0, width - R.length - 1);
    // If left fits, simple case
    if (L.length <= leftMax) {
        const padding = width - L.length - R.length;
        return L + ' '.repeat(Math.max(1, padding)) + R;
    }
    // Left is too long -> keep the right column on the first line and wrap the left
    const parts: string[] = [];
    const leftHead = L.slice(0, leftMax);
    const padding = width - leftHead.length - R.length;
    parts.push(leftHead + ' '.repeat(Math.max(1, padding)) + R);
    // Remaining left text -> wrap into width-sized chunks (no right column)
    let rest = L.slice(leftMax);
    while (rest.length > 0) {
        parts.push(rest.slice(0, width));
        rest = rest.slice(width);
    }
    return parts.join('\n');
}
/**
 * Convert a dataURL (base64 image) into ESC/POS raster bytes using GS v 0.
 * targetWidthPx: desired output width in pixels (printer dots)
 * Returns [xL, xH, yL, yH, ...bitmap] where x = width in bytes.
 */
async function imageDataUrlToRaster(dataUrl: string, targetWidthPx: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    const ratio = img.width / img.height;
                    const w = targetWidthPx;
                    const h = Math.max(1, Math.round(w / ratio));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx)
                        return reject(new Error('canvas not supported'));
                    // Thermal printers need an opaque image. Transparent backgrounds
                    // are normalized to white before monochrome conversion.
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    const imgd = ctx.getImageData(0, 0, w, h);
                    const pixels = imgd.data;
                    // threshold to mono (simple luminance)
                    const mono = new Uint8Array(w * h);
                    for (let i = 0; i < w * h; i++) {
                        const r = pixels[i * 4];
                        const g = pixels[i * 4 + 1];
                        const b = pixels[i * 4 + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                        mono[i] = lum < 127 ? 1 : 0; // 1 = black dot
                    }
                    // build raster bytes: width in bytes = ceil(w/8)
                    const widthBytes = Math.ceil(w / 8);
                    const data: number[] = [];
                    // GS v 0 header will be added by caller; here we create the bitmap payload per row
                    for (let y = 0; y < h; y++) {
                        for (let bx = 0; bx < widthBytes; bx++) {
                            let byte = 0;
                            for (let bit = 0; bit < 8; bit++) {
                                const x = bx * 8 + bit;
                                if (x < w) {
                                    const idx = y * w + x;
                                    if (mono[idx]) {
                                        byte |= (0x80 >> bit);
                                    }
                                }
                            }
                            data.push(byte);
                        }
                    }
                    resolve([widthBytes & 0xff, (widthBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, ...data]);
                }
                catch (e) {
                    reject(e);
                }
            };
            img.onerror = (e) => reject(new Error('image load error'));
            // Ensure the image is loaded as CORS-enabled if it's a remote URL; data URLs are fine
            img.crossOrigin = 'Anonymous';
            img.src = dataUrl;
        }
        catch (err) {
            reject(err);
        }
    });
}
/**
 * Print an image (data URL) centered. paper '58' or '80' selects target width.
 */
export async function printImage(dataUrl: string, deviceId?: string, paper: '58' | '80' = '80'): Promise<boolean> {
    try {
        const win = window as any;
        const resolvedDataUrl = await imageSourceToDataUrl(dataUrl);
        if (isDesktopPrinterRuntimeAvailable()) {
            if (deviceId) {
                const res = await connect(deviceId);
                if (!res.ok) {
                    return false;
                }
            }
            const INIT = [0x1b, 0x40];
            const LINE_FEED = [0x0a];
            const targetWidth = (paper || getStoredReceiptPaper()) === '58' ? 384 : 576;
            const raster = await imageDataUrlToRaster(resolvedDataUrl, targetWidth);
            const w = raster[0] | (raster[1] << 8);
            const h = raster[2] | (raster[3] << 8);
            const bitmap = raster.slice(4);
            const payload: number[] = [];
            payload.push(...INIT);
            payload.push(0x1b, 0x61, 0x01);
            payload.push(0x1d, 0x76, 0x30, 0x00, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
            payload.push(...bitmap);
            payload.push(0x1b, 0x61, 0x00);
            payload.push(...LINE_FEED);
            payload.push(...LINE_FEED);
            return await sendToDesktopRaw(toBase64(payload), 'Logo');
        }
        const INIT = [0x1b, 0x40]; // ESC @
        const LINE_FEED = [0x0a];
        // Set target width in pixels for typical printers
        const targetWidth = paper === '58' ? 384 : 576;
        const raster = await imageDataUrlToRaster(resolvedDataUrl, targetWidth);
        // raster returned as [w_lo,w_hi,h_lo,h_hi, ...bitmap]
        const w = raster[0] | (raster[1] << 8);
        const h = raster[2] | (raster[3] << 8);
        const bitmap = raster.slice(4);
        const payload: number[] = [];
        payload.push(...INIT);
        // center alignment
        payload.push(0x1b, 0x61, 0x01);
        // GS v 0 raster bit image: 1d 76 30 m xL xH yL yH d...
        const m = 0x00; // normal mode
        const xL = w & 0xff;
        const xH = (w >> 8) & 0xff;
        const yL = h & 0xff;
        const yH = (h >> 8) & 0xff;
        payload.push(0x1d, 0x76, 0x30, m, xL, xH, yL, yH);
        payload.push(...bitmap);
        // restore left alignment
        payload.push(0x1b, 0x61, 0x00);
        payload.push(...LINE_FEED);
        payload.push(...LINE_FEED);
        const base64 = toBase64(payload);
        const ok = await sendToBluetoothSerial(deviceId || null, base64);
        return ok;
    }
    catch (err) {
        return false;
    }
}
export function inspectPlugin() {
    try {
        const win = window as any;
        const info: any = { time: new Date().toISOString() };
        info.desktopPrinterRuntime = isDesktopPrinterRuntimeAvailable();
        info.desktopPrinterSelected = _connectedMac;
        info.bluetoothSerial = !!win.bluetoothSerial;
        if (win.bluetoothSerial) {
            info.bluetoothSerialMethods = Object.keys(win.bluetoothSerial).filter(k => typeof win.bluetoothSerial[k] === 'function');
        }
        info.cordovaBluetoothSerial = !!(win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial);
        if (win.cordova && win.cordova.plugins && win.cordova.plugins.BluetoothSerial) {
            const p = win.cordova.plugins.BluetoothSerial;
            info.cordovaBluetoothSerialMethods = Object.keys(p).filter(k => typeof p[k] === 'function');
        }
        // Only report native plugin availability (BluetoothSerial).
        return info;
    }
    catch (err) {
        return { error: String(err) };
    }
}
/**
 * Probe whether a device is currently reachable by attempting a short connect
 * followed by a disconnect. This may briefly open a connection to the device.
 * Returns an object with available boolean and optional error.
 */
export async function probeDevice(deviceId: string, timeout = 3000): Promise<{
    available: boolean;
    error?: string;
}> {
    try {
        const desktopBridge = getDesktopPrinterBridge();
        if (desktopBridge && typeof desktopBridge.list === 'function') {
            const printers = await desktopBridge.list();
            const found = (printers || []).some((printer: DesktopPrinterInfo) => printer.id === deviceId || printer.name === deviceId);
            return found ? { available: true } : { available: false, error: 'printer_not_found' };
        }
        // If already connected to this device, report available
        if (_connectedMac === deviceId)
            return { available: true };
        // Try to connect with a timeout
        const connectPromise = connect(deviceId);
        const res = await Promise.race([
            connectPromise,
            new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeout))
        ]) as any;
        if (!res || !res.ok) {
            return { available: false, error: res && res.error ? String(res.error) : 'connect_failed' };
        }
        // Successfully connected => immediately disconnect
        try {
            await disconnect();
        }
        catch (e) { /* ignore */ }
        return { available: true };
    }
    catch (err) {
        return { available: false, error: String(err) };
    }
}
export default {};
