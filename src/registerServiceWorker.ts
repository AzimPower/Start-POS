import { versionManager } from './lib/versionManager'

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined

// Service worker registration using vite-plugin-pwa
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    // Try to use vite-plugin-pwa's built-in registration
    try {
      // Dynamic import to handle cases where the virtual module isn't available
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          updateSW = registerSW({
            onNeedRefresh() {
              console.log('Nouvelle version disponible')
              
              // Ne notifier que si ce n'est pas en développement
              if (versionManager.getCurrentVersion().environment === 'production') {
                window.dispatchEvent(new CustomEvent('app:update-available', {
                  detail: { 
                    type: 'service-worker',
                    version: versionManager.getCurrentVersion()
                  }
                }))
              }
            },
            onOfflineReady() {
              console.log('Application prête pour utilisation hors ligne')
              window.dispatchEvent(new CustomEvent('app:offline-ready'))
            },
            onRegistered(registration) {
              if (registration) {
                console.log('ServiceWorker enregistré:', registration.scope);
                
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
                    const hasChanged = versionManager.hasVersionChanged()
                    if (hasChanged) {
                      window.dispatchEvent(new CustomEvent('app:version-changed'))
                    }
                  }
                })
              }
            },
            onRegisterError(error) {
              console.error('Erreur d\'enregistrement du Service Worker:', error);
            }
          });
        })
        .catch((error) => {
          console.warn('Virtual PWA register module not available, using fallback registration:', error);
          // Fallback to manual registration for development
          registerServiceWorkerFallback();
        });
    } catch (error) {
      console.warn('PWA registration failed, using fallback:', error);
      registerServiceWorkerFallback();
    }
  }
}

// Fallback service worker registration for development
function registerServiceWorkerFallback() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        // In development, there might not be a service worker
        const swUrl = import.meta.env.PROD ? '/sw.js' : null;
        
        if (!swUrl) {
          console.log('No service worker in development mode');
          return;
        }

        const registration = await navigator.serviceWorker.register(swUrl);
        console.log('ServiceWorker registration successful with scope: ', registration.scope);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                console.log('Nouvelle version disponible');
                window.dispatchEvent(new CustomEvent('app:update-available', {
                  detail: { type: 'fallback-sw' }
                }));
              } else {
                console.log('Contenu mis en cache pour utilisation hors ligne');
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

      } catch (err) {
        console.error('ServiceWorker registration failed: ', err);
      }
    });
  }
}

// Fonction utilitaire pour forcer une mise à jour
export const forceUpdateApp = () => {
  // Nettoyer le cache
  versionManager.clearApplicationCache()
  
  // Déclencher la mise à jour du service worker
  if (updateSW) {
    updateSW(true)
  } else {
    // Fallback: rechargement simple
    versionManager.forceRefresh()
  }
}

// Fonction pour vérifier manuellement les mises à jour
export const checkForUpdates = async () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'CHECK_FOR_UPDATES'
      })
      
      // Vérifier aussi côté version manager
      const hasChanged = versionManager.hasVersionChanged()
      if (hasChanged) {
        window.dispatchEvent(new CustomEvent('app:update-available', {
          detail: { 
            type: 'version-manager',
            version: versionManager.getCurrentVersion()
          }
        }))
      }
    } catch (error) {
      console.warn('Erreur lors de la vérification des mises à jour:', error)
    }
  }
}
