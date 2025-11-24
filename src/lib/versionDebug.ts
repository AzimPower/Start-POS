/**
 * Utilitaire pour nettoyer les données de version et résoudre les boucles de mise à jour
 */

export const resetVersionData = () => {
  try {
    // Nettoyer toutes les données liées aux versions
    localStorage.removeItem('app_version_info');
    localStorage.removeItem('manifest_hash');
    
    // Nettoyer les caches du service worker
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('workbox') || name.includes('sw-precache')) {
            caches.delete(name);
          }
        });
      });
    }
    
    console.log('Données de version nettoyées');
  } catch (error) {
    console.warn('Erreur lors du nettoyage des données de version:', error);
  }
};

// Fonction pour déboguer les informations de version
export const debugVersionInfo = () => {
  const stored = localStorage.getItem('app_version_info');
  const manifestHash = localStorage.getItem('manifest_hash');
  
  console.group('Debug Version Info');
  console.log('Version stockée:', stored ? JSON.parse(stored) : 'Aucune');
  console.log('Hash du manifest:', manifestHash || 'Aucun');
  console.log('Mode développement:', import.meta.env.DEV);
  console.log('Variables d\'environnement:', {
    VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD
  });
  console.groupEnd();
};

// Ajouter les fonctions à window pour les utiliser dans la console
if (typeof window !== 'undefined') {
  (window as any).resetVersionData = resetVersionData;
  (window as any).debugVersionInfo = debugVersionInfo;
}