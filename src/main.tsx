import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from './registerServiceWorker';
import { refreshAllFromBackend } from '@/lib/sync';
import * as NativePrinter from '@/lib/nativePrinter';
import { toast } from 'sonner';
import * as secureStorage from '@/lib/secureStorage';
// Early back button handler: register before React mounts so we intercept native back immediately
(async function registerEarlyBackHandler(){
	try {
		const importer: any = new Function("return import('@capacitor/app')");
		const mod = await importer();
		let lastPress = 0;
		mod.App.addListener('backButton', (ev: any) => {
			try {
				if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
			} catch (e) {}
			try {
				// If there's a history entry, go back
				if (window.history && window.history.length > 1) {
					try { window.history.back(); } catch(e) {}
					return;
				}
			} catch (e) {}

			const now = Date.now();
			if (!lastPress || now - lastPress > 2000) {
				lastPress = now;
				// Notify React so it can show a toast
				try { window.dispatchEvent(new CustomEvent('app:back-first-press')); } catch(e) {}
				return;
			}

			// second press -> exit
			try {
				if (mod && typeof mod.App !== 'undefined' && typeof mod.App.exitApp === 'function') mod.App.exitApp();
				else if ((navigator as any).app && typeof (navigator as any).app.exitApp === 'function') (navigator as any).app.exitApp();
				else window.close();
			} catch (e) {}
		});
	} catch (e) {
		// ignore: Capacitor App not available in web dev
	}
})();

createRoot(document.getElementById("root")!).render(<App />);

// register the service worker for PWA behavior (no-op in browsers that don't support it)
registerServiceWorker();

// On startup, if online, try to refresh core data from backend (stores, users, products...)
if (navigator.onLine) {
	// don't block rendering
	(async () => {
		try {
			const maybeFn = await refreshAllFromBackend();
			if (typeof maybeFn === 'function') {
				await maybeFn();
			}
		} catch (e) {
			console.warn('refreshAllFromBackend error', e);
		}
	})();
}

// Attempt to auto-connect to stored printer on every app start so the app stays
// connected to the thermal printer when possible. Non-blocking and tolerant to
// environments where native plugins are not available.
(async function autoConnectPrinterOnStartup() {
	try {
		// If plugin already reports a connection, skip work
		if (NativePrinter && typeof NativePrinter.isConnected === 'function' && NativePrinter.isConnected()) {
			console.log('[printer] already connected (native state)');
			return;
		}

		// Try stored printer first (last used)
		let storedId: string | null = null;
		try {
			storedId = await secureStorage.getItem('printer_mac');
			// Mirror fallback to localStorage for environments where secureStorage isn't available
			if (!storedId) storedId = localStorage.getItem('printer_mac');
		} catch (e) {
			storedId = localStorage.getItem('printer_mac');
		}
		if (storedId) {
			console.log('[printer] attempting auto-connect to stored', storedId);
			const res = await NativePrinter.connect(storedId);
			if (res && res.ok) {
				console.log('[printer] auto-connect success', storedId);
				try { toast.success('Imprimante connectée'); } catch (e) { /* ignore if toast not ready */ }
				return;
			}
			console.warn('[printer] stored auto-connect failed', res);
		}

		// No stored printer or connecting to it failed -> look at paired devices
		let paired: Array<{ name: string; id: string }> = [];
		try {
			paired = await NativePrinter.listPaired();
		} catch (e) {
			console.warn('[printer] listPaired failed', e);
		}
		if (!paired || paired.length === 0) {
			console.log('[printer] no paired devices found');
			return;
		}

		// Prioritize devices whose name looks like a receipt printer
		const keywords = ['printer','tm','pos','thermal','receipt','epson','star','zebra'];
		const prioritized = paired.slice().sort((a, b) => {
			const an = (a.name || '').toLowerCase();
			const bn = (b.name || '').toLowerCase();
			const aScore = keywords.reduce((s, k) => s + (an.includes(k) ? 1 : 0), 0);
			const bScore = keywords.reduce((s, k) => s + (bn.includes(k) ? 1 : 0), 0);
			return bScore - aScore;
		});

		for (const dev of prioritized) {
			try {
				console.log('[printer] probing paired device', dev.name || dev.id);
				let available = false;
				if (typeof NativePrinter.probeDevice === 'function') {
					const p = await NativePrinter.probeDevice(dev.id, 2500);
					available = !!(p && p.available);
				} else {
					// Fallback: try a quick connect/disconnect
					const c = await NativePrinter.connect(dev.id);
					available = !!(c && c.ok);
					if (available) await NativePrinter.disconnect();
				}

				if (!available) {
					console.log('[printer] device not reachable', dev.name || dev.id);
					continue;
				}

				// Attempt to connect for real and persist the selection
				const cRes = await NativePrinter.connect(dev.id);
				if (cRes && cRes.ok) {
					try {
						await secureStorage.setItem('printer_mac', dev.id);
						try { localStorage.setItem('printer_mac', dev.id); } catch (e) {}
					} catch (e) {
						console.warn('secureStorage set printer_mac failed', e);
						try { localStorage.setItem('printer_mac', dev.id); } catch (ee) {}
					}
					console.log('[printer] auto-connected to', dev);
					try { toast.success('Imprimante connectée: ' + (dev.name || dev.id)); } catch (e) {}
					return;
				} else {
					console.warn('[printer] connect attempt failed', cRes);
				}
			} catch (e) {
				console.warn('[printer] probe/connect error for', dev, e);
			}
		}

		console.log('[printer] no auto-connectable device found');
	} catch (err) {
		console.warn('[printer] autoConnect error', err);
	}
})();
