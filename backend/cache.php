<?php
/**
 * Système de cache simple pour améliorer les performances
 * - Utilise APCu si disponible (recommandé pour production)
 * - Fallback sur cache en fichier si APCu n'est pas disponible
 * - Cache automatique des requêtes fréquentes (produits, catégories, magasins)
 */

class SimpleCache {
    private $useApcu;
    private $cacheDir;
    private $defaultTtl = 300; // 5 minutes par défaut
    
    public function __construct($cacheDir = null) {
        // Vérifier si APCu est disponible
        $this->useApcu = function_exists('apcu_fetch') && apcu_enabled();
        
        // Dossier de cache pour le fallback fichier
        $this->cacheDir = $cacheDir ?? __DIR__ . '/cache';
        if (!$this->useApcu && !is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }
    }
    
    /**
     * Récupérer une valeur du cache
     * @param string $key Clé du cache
     * @return mixed|false Valeur ou false si non trouvée ou expirée
     */
    public function get($key) {
        if ($this->useApcu) {
            return apcu_fetch($key);
        }
        
        // Fallback fichier
        $filename = $this->getCacheFilename($key);
        if (!file_exists($filename)) {
            return false;
        }
        
        $data = @file_get_contents($filename);
        if ($data === false) {
            return false;
        }
        
        $cached = @unserialize($data);
        if ($cached === false || !isset($cached['expires']) || !isset($cached['data'])) {
            return false;
        }
        
        // Vérifier l'expiration
        if ($cached['expires'] < time()) {
            @unlink($filename);
            return false;
        }
        
        return $cached['data'];
    }
    
    /**
     * Stocker une valeur dans le cache
     * @param string $key Clé du cache
     * @param mixed $value Valeur à stocker
     * @param int $ttl Durée de vie en secondes (0 = infini)
     * @return bool Succès ou échec
     */
    public function set($key, $value, $ttl = null) {
        $ttl = $ttl ?? $this->defaultTtl;
        
        if ($this->useApcu) {
            return apcu_store($key, $value, $ttl);
        }
        
        // Fallback fichier
        $filename = $this->getCacheFilename($key);
        $data = serialize([
            'expires' => $ttl > 0 ? time() + $ttl : PHP_INT_MAX,
            'data' => $value
        ]);
        
        return @file_put_contents($filename, $data, LOCK_EX) !== false;
    }
    
    /**
     * Supprimer une valeur du cache
     * @param string $key Clé du cache
     * @return bool Succès ou échec
     */
    public function delete($key) {
        if ($this->useApcu) {
            return apcu_delete($key);
        }
        
        $filename = $this->getCacheFilename($key);
        return @unlink($filename);
    }
    
    /**
     * Vider tout le cache
     * @return bool Succès ou échec
     */
    public function clear() {
        if ($this->useApcu) {
            return apcu_clear_cache();
        }
        
        // Supprimer tous les fichiers de cache
        if (!is_dir($this->cacheDir)) {
            return true;
        }
        
        $files = glob($this->cacheDir . '/cache_*.dat');
        foreach ($files as $file) {
            @unlink($file);
        }
        
        return true;
    }
    
    /**
     * Récupérer une valeur ou l'exécuter et la mettre en cache
     * @param string $key Clé du cache
     * @param callable $callback Fonction à exécuter si pas en cache
     * @param int $ttl Durée de vie en secondes
     * @return mixed Valeur du cache ou résultat du callback
     */
    public function remember($key, $callback, $ttl = null) {
        $value = $this->get($key);
        
        if ($value !== false) {
            return $value;
        }
        
        $value = $callback();
        $this->set($key, $value, $ttl);
        
        return $value;
    }
    
    /**
     * Générer le nom de fichier pour une clé
     */
    private function getCacheFilename($key) {
        return $this->cacheDir . '/cache_' . md5($key) . '.dat';
    }
    
    /**
     * Obtenir des informations sur le système de cache
     */
    public function getInfo() {
        return [
            'driver' => $this->useApcu ? 'APCu' : 'File',
            'apcu_available' => function_exists('apcu_fetch') && apcu_enabled(),
            'cache_dir' => $this->cacheDir,
            'default_ttl' => $this->defaultTtl
        ];
    }
}

// Instance globale du cache
$cache = new SimpleCache();

/**
 * Helpers pour l'utilisation dans les API
 */

/**
 * Générer une clé de cache pour une requête
 * @param string $endpoint Nom de l'endpoint (ex: 'products', 'categories')
 * @param array $params Paramètres de la requête
 * @return string Clé de cache
 */
function generateCacheKey($endpoint, $params = []) {
    ksort($params); // Trier pour avoir une clé cohérente
    return 'api_' . $endpoint . '_' . md5(json_encode($params));
}

function getCacheNamespaceVersion($namespace) {
    global $cache;
    $key = 'cache_ns_version_' . md5((string)$namespace);
    $version = $cache->get($key);
    if ($version === false) {
        $version = 1;
        $cache->set($key, $version, 0);
    }

    return (int)$version;
}

function generateNamespacedCacheKey($namespace, $params = []) {
    ksort($params);
    $version = getCacheNamespaceVersion($namespace);
    $safeNamespace = preg_replace('/[^a-zA-Z0-9_\-]/', '_', (string)$namespace);
    return 'ns_' . $safeNamespace . '_v' . $version . '_' . md5(json_encode($params));
}

function invalidateCacheNamespace($namespace) {
    global $cache;
    $key = 'cache_ns_version_' . md5((string)$namespace);
    $cache->set($key, getCacheNamespaceVersion($namespace) + 1, 0);
}

/**
 * Invalider le cache pour un endpoint
 * @param string $endpoint Nom de l'endpoint
 */
function invalidateEndpointCache($endpoint) {
    global $cache;
    // Pour une invalidation simple, on pourrait utiliser des patterns
    // Ici on se contente de supprimer tout le cache (simple mais efficace)
    // En production, utilisez des tags ou des patterns pour une invalidation ciblée
    $cache->clear();
}
