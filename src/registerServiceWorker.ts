import { versionManager } from './lib/versionManager';
import { isDesktopApp } from './lib/runtime';
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

async function cleanupDevelopmentServiceWorkers() {
    if (!('serviceWorker' in navigator) || !import.meta.env.DEV) {
        return;
    }

    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    catch {
    }

    if (!('caches' in window)) {
        return;
    }

    try {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
    }
    catch {
    }
}
// Service worker registration using vite-plugin-pwa
export function registerServiceWorker() {
    if (isDesktopApp()) {
        return;
    }

    if ('serviceWorker' in navigator) {
        if (import.meta.env.DEV) {
            void cleanupDevelopmentServiceWorkers();
            return;
        }

        // Try to use vite-plugin-pwa's built-in registration
        try {
            // Dynamic import to handle cases where the virtual module isn't available
            import('virtual:pwa-register')
                .then(({ registerSW }) => {
                updateSW = registerSW({
                    immediate: true,
                    onNeedRefresh() {
                        // Ne notifier que si ce n'est pas en développement
                        if (versionManager.getCurrentVersion().environment === 'production') {
                            window.dispatchEvent(new CustomEvent('app:update-available', {
                                detail: {
                                    type: 'service-worker',
                                    version: versionManager.getCurrentVersion()
                                }
                            }));
                        }
                    },
                    onOfflineReady() {
                        window.dispatchEvent(new CustomEvent('app:offline-ready'));
                    },
                    onRegistered(registration) {
                        if (registration) {
                            // Vérifier les mises à jour seulement en production et moins fréquemment
                            if (versionManager.getCurrentVersion().environment === 'production') {
                                setInterval(async () => {
                                    if (registration) {
                                        await registration.update();
                                    }
                                }, 15 * 60 * 1000); // Vérifier toutes les 15 minutes
                            }
                            // Écouter les messages du service worker
                            navigator.serviceWorker.addEventListener('message', (event) => {
                                if (event.data && event.data.type === 'VERSION_CHECK') {
                                    const hasChanged = versionManager.hasVersionChanged();
                                    if (hasChanged) {
                                        window.dispatchEvent(new CustomEvent('app:version-changed'));
                                    }
                                }
                            });
                        }
                    },
                    onRegisterError(error) {
                    }
                });
            })
                .catch((error) => {
                // Fallback to manual registration for development
                registerServiceWorkerFallback();
            });
        }
        catch (error) {
            registerServiceWorkerFallback();
        }
    }
}
// Fallback service worker registration for development
function registerServiceWorkerFallback() {
    if (isDesktopApp()) {
        return;
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                // In development, there might not be a service worker
                const swUrl = import.meta.env.PROD ? '/sw.js' : null;
                if (!swUrl) {
                    return;
                }
                const registration = await navigator.serviceWorker.register(swUrl);
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker)
                        return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                window.dispatchEvent(new CustomEvent('app:update-available', {
                                    detail: { type: 'fallback-sw' }
                                }));
                            }
                            else {
                            }
                        }
                    });
                });
                // Check for updates only in production
                if (!import.meta.env.DEV) {
                    setInterval(async () => {
                        if (registration) {
                            await registration.update();
                        }
                    }, 30 * 60 * 1000); // Check every 30 minutes
                }
            }
            catch (err) {
            }
        });
    }
}
// Fonction utilitaire pour forcer une mise à jour
export const forceUpdateApp = () => {
    // Nettoyer le cache
    versionManager.clearApplicationCache();
    // Déclencher la mise à jour du service worker
    if (updateSW) {
        updateSW(true);
    }
    else {
        // Fallback: rechargement simple
        versionManager.forceRefresh();
    }
};
// Fonction pour vérifier manuellement les mises à jour
export const checkForUpdates = async () => {
    if (isDesktopApp()) {
        return;
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
            navigator.serviceWorker.controller.postMessage({
                type: 'CHECK_FOR_UPDATES'
            });
            // Vérifier aussi côté version manager
            const hasChanged = versionManager.hasVersionChanged();
            if (hasChanged) {
                window.dispatchEvent(new CustomEvent('app:update-available', {
                    detail: {
                        type: 'version-manager',
                        version: versionManager.getCurrentVersion()
                    }
                }));
            }
        }
        catch (error) {
        }
    }
};
