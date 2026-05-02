import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from './registerServiceWorker';
import * as NativePrinter from '@/lib/nativePrinter';
import { toast } from 'sonner';
import * as secureStorage from '@/lib/secureStorage';
import '@/lib/versionDebug';
import { installAuthenticatedFetch } from '@/lib/apiAuth';

// Early back button handler: register before React mounts so we intercept native back immediately
(async function registerEarlyBackHandler() {
    try {
        const importer: any = new Function("return import('@capacitor/app')");
        const mod = await importer();
        let lastPress = 0;
        mod.App.addListener('backButton', (ev: any) => {
            try {
                if (ev && typeof ev.preventDefault === 'function')
                    ev.preventDefault();
            }
            catch (e) { }
            try {
                // If there's a history entry, go back
                if (window.history && window.history.length > 1) {
                    try {
                        window.history.back();
                    }
                    catch (e) { }
                    return;
                }
            }
            catch (e) { }
            const now = Date.now();
            if (!lastPress || now - lastPress > 2000) {
                lastPress = now;
                try {
                    window.dispatchEvent(new CustomEvent('app:back-first-press'));
                }
                catch (e) { }
                return;
            }
            try {
                if (mod && typeof mod.App !== 'undefined' && typeof mod.App.exitApp === 'function')
                    mod.App.exitApp();
                else if ((navigator as any).app && typeof (navigator as any).app.exitApp === 'function')
                    (navigator as any).app.exitApp();
                else
                    window.close();
            }
            catch (e) { }
        });
    }
    catch (e) {
        // ignore: Capacitor App not available in web dev
    }
})();

function renderApp() {
    createRoot(document.getElementById("root")!).render(<App />);
}

function isIgnorableGlobalError(errorLike: any) {
    const name = String(errorLike?.name || '').trim();
    const message = String(errorLike?.message || errorLike || '').trim();
    const combined = `${name} ${message}`.toLowerCase();
    return combined.includes('aborterror') ||
        combined.includes('the user aborted a request') ||
        combined.includes('signal is aborted') ||
        combined.includes('timeout');
}

// Gestion d'erreurs globales
window.onerror = function (message, source, lineno, colno, error) {
    if (isIgnorableGlobalError(error || message)) {
        return true;
    }
    showGlobalError(message);
    return false;
};

window.onunhandledrejection = function (event) {
    if (isIgnorableGlobalError(event.reason)) {
        event.preventDefault();
        return;
    }
    showGlobalError(event.reason || 'Erreur inconnue');
};

function showGlobalError(errorMsg: any) {
    const root = document.getElementById("root");
    if (root) {
        root.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#fff;color:#d32f2f;font-size:1.2rem;text-align:center;">
			<h1>Une erreur critique est survenue</h1>
			<pre style="white-space:pre-wrap;word-break:break-all;max-width:90vw;">${(errorMsg && errorMsg.toString()) || 'Erreur inconnue'}</pre>
			<button onclick="window.location.reload()" style="margin-top:2rem;padding:0.5rem 1.5rem;font-size:1rem;">Recharger l'application</button>
		</div>`;
    }
}

installAuthenticatedFetch();
renderApp();
registerServiceWorker();

// Delay printer auto-connect to avoid blocking app startup on slower Android devices.
// Only reconnect the previously selected printer automatically.
(async function autoConnectPrinterOnStartup() {
    try {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        if (NativePrinter && typeof NativePrinter.isConnected === 'function' && NativePrinter.isConnected()) {
            return;
        }

        let storedId: string | null = null;
        try {
            storedId = await secureStorage.getItem('printer_mac');
            if (!storedId)
                storedId = localStorage.getItem('printer_mac');
        }
        catch (e) {
            storedId = localStorage.getItem('printer_mac');
        }

        if (!storedId) {
            return;
        }

        const res = await NativePrinter.connect(storedId);
        if (res && res.ok) {
            try {
                toast.success('Imprimante connectee');
            }
            catch (e) { }
        }
    }
    catch (err) {
    }
})();
