/**
 * Utilitaire pour nettoyer les données de version et résoudre les boucles de mise à jour
 */
export const resetVersionData = () => {
    try {
        // Nettoyer toutes les données liées aux versions
        localStorage.removeItem('app_version_info');
        localStorage.removeItem('manifest_hash');
        sessionStorage.removeItem('app_version_refresh_marker');
        // Nettoyer les caches du service worker
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('workbox') ||
                        name.includes('sw-precache') ||
                        name.includes('precache') ||
                        name.includes('runtime') ||
                        name.includes('static-assets') ||
                        name.includes('api-cache') ||
                        name.includes('image-cache') ||
                        name.includes('external-api-cache') ||
                        name.includes('google-fonts')) {
                        caches.delete(name);
                    }
                });
            });
        }
    }
    catch (error) {
    }
};
// Fonction pour déboguer les informations de version
export const debugVersionInfo = () => {
    const stored = localStorage.getItem('app_version_info');
    const manifestHash = localStorage.getItem('manifest_hash');
};
// Ajouter les fonctions à window pour les utiliser dans la console
if (typeof window !== 'undefined') {
    (window as any).resetVersionData = resetVersionData;
    (window as any).debugVersionInfo = debugVersionInfo;
}
