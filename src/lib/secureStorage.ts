/**
 * Small abstraction for secure storage.
 * It tries to use a Capacitor Secure Storage plugin when available (several
 * plugin names exist across versions). If no native plugin is present, it
 * falls back to localStorage so the code remains usable in the web.
 */
export async function getItem(key: string): Promise<string | null> {
    try {
        // Try common Capacitor plugin location first
        const cap: any = (window as any).Capacitor || (globalThis as any).Capacitor;
        if (cap && cap.Plugins) {
            const p = cap.Plugins.SecureStoragePlugin || cap.Plugins.SecureStorage || cap.Plugins.SecureStorageWeb;
            if (p && typeof p.get === 'function') {
                try {
                    const res = await p.get({ key });
                    // Different plugins return different shapes
                    if (res && typeof res === 'object' && 'value' in res)
                        return res.value;
                    if (typeof res === 'string')
                        return res;
                }
                catch (e) {
                }
            }
        }
        // Try dynamic import of community plugin (if installed)
        try {
            // Use Function import to avoid bundling the plugin for web builds
            const mod = await new Function("return import('@capacitor-community/secure-storage')")();
            const ss = mod && (mod.SecureStorage || mod.SecureStoragePlugin);
            if (ss && typeof ss.get === 'function') {
                const r = await ss.get({ key });
                if (r && typeof r === 'object' && 'value' in r)
                    return r.value;
                if (typeof r === 'string')
                    return r;
            }
        }
        catch (e) {
            // not available or failed — ignore
        }
        // Try Cordova plugin (cordova-plugin-secure-storage-echo)
        try {
            const win: any = window as any;
            const SecureCtor = win.cordova && win.cordova.plugins && win.cordova.plugins.SecureStorage
                ? win.cordova.plugins.SecureStorage
                : (win.plugins && (win.plugins.SecureStorage || win.plugins.secureStorage)) || null;
            if (SecureCtor) {
                return await new Promise<string | null>((resolve) => {
                    try {
                        let instance: any = null;
                        const onInit = () => {
                            try {
                                instance.get((val: any) => resolve(String(val)), (err: any) => { resolve(null); }, key);
                            }
                            catch (e) {
                                resolve(null);
                            }
                        };
                        const onError = (err: any) => { resolve(null); };
                        // Some plugin implementations expect new ctor(success, error, namespace)
                        try {
                            instance = new SecureCtor(onInit, onError, 'pos-app');
                        }
                        catch (e) {
                            resolve(null);
                        }
                    }
                    catch (e) {
                        resolve(null);
                    }
                });
            }
        }
        catch (e) {
            // ignore cordova errors
        }
        // Fallback: localStorage
        try {
            return localStorage.getItem(key);
        }
        catch (e) {
            return null;
        }
    }
    catch (err) {
        return null;
    }
}
export async function setItem(key: string, value: string): Promise<void> {
    try {
        const cap: any = (window as any).Capacitor || (globalThis as any).Capacitor;
        if (cap && cap.Plugins) {
            const p = cap.Plugins.SecureStoragePlugin || cap.Plugins.SecureStorage || cap.Plugins.SecureStorageWeb;
            if (p && typeof p.set === 'function') {
                try {
                    await p.set({ key, value });
                    return;
                }
                catch (e) {
                }
            }
        }
        try {
            const mod = await new Function("return import('@capacitor-community/secure-storage')")();
            const ss = mod && (mod.SecureStorage || mod.SecureStoragePlugin);
            if (ss && typeof ss.set === 'function') {
                await ss.set({ key, value });
                return;
            }
        }
        catch (e) {
            // ignore
        }
        // fallback
        try {
            localStorage.setItem(key, value);
        }
        catch (e) {
        }
    }
    catch (err) {
        // ignore
    }
}
export async function removeItem(key: string): Promise<void> {
    try {
        const cap: any = (window as any).Capacitor || (globalThis as any).Capacitor;
        if (cap && cap.Plugins) {
            const p = cap.Plugins.SecureStoragePlugin || cap.Plugins.SecureStorage || cap.Plugins.SecureStorageWeb;
            if (p && typeof p.remove === 'function') {
                try {
                    await p.remove({ key });
                    return;
                }
                catch (e) {
                }
            }
        }
        try {
            const mod = await new Function("return import('@capacitor-community/secure-storage')")();
            const ss = mod && (mod.SecureStorage || mod.SecureStoragePlugin);
            if (ss && typeof ss.remove === 'function') {
                await ss.remove({ key });
                return;
            }
        }
        catch (e) {
            // ignore
        }
        try {
            localStorage.removeItem(key);
        }
        catch (e) {
        }
    }
    catch (err) {
        // ignore
    }
}
export default { getItem, setItem, removeItem };
