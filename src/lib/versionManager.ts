/**
 * Gestionnaire de versions pour éviter les conflits de cache entre navigateurs
 */

export interface AppVersion {
  version: string;
  buildTime: number;
  hash: string;
  environment: 'development' | 'production';
}

export class VersionManager {
  private static instance: VersionManager;
  private currentVersion: AppVersion;
  private storageKey = 'app_version_info';
  private versionCheckInterval: number | null = null;

  private constructor() {
    this.currentVersion = this.generateCurrentVersion();
    this.initializeVersionCheck();
  }

  public static getInstance(): VersionManager {
    if (!VersionManager.instance) {
      VersionManager.instance = new VersionManager();
    }
    return VersionManager.instance;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private generateCurrentVersion(): AppVersion {
    const version = import.meta.env.VITE_APP_VERSION || '1.0.0';
    const environment = import.meta.env.DEV ? 'development' : 'production';
    
    // En développement, utiliser une version stable
    if (environment === 'development') {
      return {
        version: `${version}-dev`,
        buildTime: 0, // Stable en dev
        hash: 'dev-build',
        environment
      };
    }
    
    // En production, utiliser des variables définies au build
    let buildTime: number;
    try {
      buildTime = typeof __BUILD_TIME__ !== 'undefined' ? 
        new Date(__BUILD_TIME__).getTime() : 0;
    } catch {
      buildTime = 0;
    }
    
    // Hash basé uniquement sur la version et l'environnement (stable)
    const hashInput = `${version}-${environment}`;
    const hash = this.simpleHash(hashInput);

    return {
      version,
      buildTime,
      hash,
      environment
    };
  }

  public getCurrentVersion(): AppVersion {
    return this.currentVersion;
  }

  public getStoredVersion(): AppVersion | null {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Erreur lors de la lecture de la version stockée:', error);
      return null;
    }
  }

  public saveCurrentVersion(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.currentVersion));
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde de la version:', error);
    }
  }

  public hasVersionChanged(): boolean {
    const stored = this.getStoredVersion();
    if (!stored) {
      // Première visite, sauvegarder sans déclencher de mise à jour
      this.saveCurrentVersion();
      return false;
    }

    // En développement, ne pas déclencher de mise à jour automatique
    if (this.currentVersion.environment === 'development') {
      return false;
    }

    return (
      stored.version !== this.currentVersion.version ||
      stored.environment !== this.currentVersion.environment
    );
  }

  public forceRefresh(): void {
    // Nettoyer le cache du navigateur
    this.clearApplicationCache();
    
    // Sauvegarder la nouvelle version
    this.saveCurrentVersion();
    
    // Recharger la page avec cache bypass
    window.location.reload();
  }

  public clearApplicationCache(): void {
    try {
      // Nettoyer localStorage (sauf les données importantes)
      const keysToKeep = [
        'auth_token',
        'user_data',
        'printer_mac',
        'secure_storage_keys'
      ];
      
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!keysToKeep.some(keepKey => key.includes(keepKey))) {
          localStorage.removeItem(key);
        }
      });

      // Nettoyer sessionStorage
      sessionStorage.clear();

      // Nettoyer le cache des requêtes si disponible
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.includes('static-assets') || name.includes('workbox')) {
              caches.delete(name);
            }
          });
        });
      }
    } catch (error) {
      console.warn('Erreur lors du nettoyage du cache:', error);
    }
  }

  private initializeVersionCheck(): void {
    // Vérifier la version au démarrage seulement en production
    if (this.currentVersion.environment === 'production' && this.hasVersionChanged()) {
      console.log('Nouvelle version détectée:', this.currentVersion);
      this.handleVersionChange();
    } else {
      console.log('Version actuelle:', this.currentVersion);
      // Sauvegarder la version courante si pas encore fait
      if (!this.getStoredVersion()) {
        this.saveCurrentVersion();
      }
    }

    // Vérifier périodiquement les mises à jour seulement en production (toutes les 30 minutes)
    if (this.currentVersion.environment === 'production') {
      this.versionCheckInterval = window.setInterval(() => {
        this.checkForUpdates();
      }, 30 * 60 * 1000);
    }
  }

  private handleVersionChange(): void {
    const stored = this.getStoredVersion();
    
    // Émettre un événement pour notifier les composants
    window.dispatchEvent(new CustomEvent('app:version-changed', {
      detail: {
        current: this.currentVersion,
        previous: stored
      }
    }));
  }

  private async checkForUpdates(): Promise<void> {
    try {
      // Vérifier s'il y a une nouvelle version du service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CHECK_FOR_UPDATES'
        });
      }

      // Vérifier si le manifest a changé
      await this.checkManifestVersion();
    } catch (error) {
      console.warn('Erreur lors de la vérification des mises à jour:', error);
    }
  }

  private async checkManifestVersion(): Promise<void> {
    try {
      const response = await fetch('/manifest.webmanifest?' + Date.now(), {
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const manifest = await response.json();
        const manifestHash = this.simpleHash(JSON.stringify(manifest));
        
        const storedManifestHash = localStorage.getItem('manifest_hash');
        if (storedManifestHash && storedManifestHash !== manifestHash) {
          window.dispatchEvent(new CustomEvent('app:update-available'));
        }
        
        localStorage.setItem('manifest_hash', manifestHash);
      }
    } catch (error) {
      console.warn('Erreur lors de la vérification du manifest:', error);
    }
  }

  public destroy(): void {
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
  }

  // Méthodes utilitaires pour les composants
  public getVersionString(): string {
    return `${this.currentVersion.version} (${this.currentVersion.hash})`;
  }

  public isOutdated(): boolean {
    const stored = this.getStoredVersion();
    if (!stored) return false;
    
    // Considérer comme obsolète si plus de 24h
    const oneDayMs = 24 * 60 * 60 * 1000;
    return (Date.now() - stored.buildTime) > oneDayMs;
  }
}

// Export de l'instance singleton
export const versionManager = VersionManager.getInstance();