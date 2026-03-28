<?php
/**
 * SCRIPT DE NETTOYAGE CACHE - À UTILISER UNE SEULE FOIS
 * 
 * Ce script vide :
 * 1. OpCache PHP (si disponible)
 * 2. Cache fichiers (backend/cache/)
 * 3. Sessions PHP (optionnel)
 * 
 * IMPORTANT: SUPPRIMEZ CE FICHIER après utilisation (sécurité)
 */

header('Content-Type: text/plain; charset=utf-8');

echo "=================================================\n";
echo "NETTOYAGE DES CACHES - POS v2\n";
echo "=================================================\n\n";

$totalCleared = 0;

// ============================================================
// 1. VIDER OpCache PHP
// ============================================================
echo "1. OpCache PHP...\n";
if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "   ✅ OpCache vidé avec succès\n";
        $totalCleared++;
    } else {
        echo "   ⚠️ Impossible de vider OpCache\n";
    }
    
    // Afficher les stats OpCache
    if (function_exists('opcache_get_status')) {
        $status = opcache_get_status(false);
        if ($status) {
            echo "   📊 Mémoire OpCache: " . round($status['memory_usage']['used_memory'] / 1048576, 2) . " MB\n";
            echo "   📊 Scripts en cache: " . $status['opcache_statistics']['num_cached_scripts'] . "\n";
        }
    }
} else {
    echo "   ℹ️ OpCache non disponible (normal sur certains hébergements)\n";
}
echo "\n";

// ============================================================
// 2. VIDER CACHE FICHIERS (backend/cache/)
// ============================================================
echo "2. Cache fichiers (backend/cache/)...\n";
$cacheDir = __DIR__ . '/cache';

if (is_dir($cacheDir)) {
    $files = glob($cacheDir . '/*');
    $fileCount = 0;
    $totalSize = 0;
    
    foreach ($files as $file) {
        if (is_file($file) && basename($file) !== '.gitkeep') {
            $size = filesize($file);
            $totalSize += $size;
            
            if (unlink($file)) {
                $fileCount++;
            }
        }
    }
    
    if ($fileCount > 0) {
        echo "   ✅ $fileCount fichiers supprimés\n";
        echo "   📊 Espace libéré: " . round($totalSize / 1024, 2) . " KB\n";
        $totalCleared++;
    } else {
        echo "   ℹ️ Aucun fichier de cache à supprimer\n";
    }
} else {
    echo "   ⚠️ Dossier cache/ non trouvé\n";
}
echo "\n";

// ============================================================
// 3. VIDER APCu (si disponible)
// ============================================================
echo "3. APCu Cache...\n";
if (function_exists('apcu_clear_cache')) {
    if (apcu_clear_cache()) {
        echo "   ✅ APCu vidé avec succès\n";
        $totalCleared++;
        
        // Stats APCu
        if (function_exists('apcu_cache_info')) {
            $info = apcu_cache_info();
            echo "   📊 Entrées APCu: " . $info['num_entries'] . "\n";
            echo "   📊 Mémoire APCu: " . round($info['mem_size'] / 1048576, 2) . " MB\n";
        }
    } else {
        echo "   ⚠️ Impossible de vider APCu\n";
    }
} else {
    echo "   ℹ️ APCu non disponible (normal sur hébergement mutualisé)\n";
}
echo "\n";

// ============================================================
// 4. STATISTIQUES FINALES
// ============================================================
echo "=================================================\n";
echo "RÉSUMÉ\n";
echo "=================================================\n";
echo "Caches vidés: $totalCleared\n";
echo "Status: " . ($totalCleared > 0 ? "✅ Succès" : "ℹ️ Rien à vider") . "\n";
echo "\n";

// ============================================================
// 5. VÉRIFICATION config.php
// ============================================================
echo "=================================================\n";
echo "VÉRIFICATION config.php\n";
echo "=================================================\n";

if (file_exists(__DIR__ . '/config.php')) {
    $configContent = file_get_contents(__DIR__ . '/config.php');
    
    // Vérifier si persistent = false
    if (strpos($configContent, '$persistent = false') !== false) {
        echo "✅ config.php: Connexions NON-persistantes activées\n";
        echo "   (fix de fuite de connexions appliqué)\n";
    } elseif (strpos($configContent, '$persistent = true') !== false) {
        echo "⚠️ config.php: Connexions persistantes ENCORE ACTIVES\n";
        echo "   ACTION REQUISE: Re-uploader config.php avec persistent = false\n";
    } else {
        echo "ℹ️ config.php: Configuration personnalisée détectée\n";
    }
} else {
    echo "⚠️ config.php non trouvé\n";
}
echo "\n";

// ============================================================
// 6. TEST CONNEXION DB
// ============================================================
echo "=================================================\n";
echo "TEST CONNEXION DB\n";
echo "=================================================\n";

try {
    require_once __DIR__ . '/config.php';
    
    $stmt = $pdo->query('SELECT 1');
    echo "✅ Connexion DB: OK\n";
    
    // Vérifier le nombre de connexions actuelles
    $stmt = $pdo->query("SHOW STATUS LIKE 'Threads_connected'");
    $result = $stmt->fetch();
    $connections = $result['Value'];
    
    echo "📊 Connexions DB actuelles: $connections\n";
    
    if ($connections < 15) {
        echo "✅ Nombre de connexions: Normal\n";
    } elseif ($connections < 30) {
        echo "⚠️ Nombre de connexions: Élevé mais acceptable\n";
    } else {
        echo "❌ Nombre de connexions: CRITIQUE (> 30)\n";
        echo "   Attendez 5 minutes puis ré-exécutez ce script\n";
    }
    
} catch (Exception $e) {
    echo "❌ Erreur connexion DB: " . $e->getMessage() . "\n";
}
echo "\n";

// ============================================================
// 7. INSTRUCTIONS FINALES
// ============================================================
echo "=================================================\n";
echo "PROCHAINES ÉTAPES\n";
echo "=================================================\n";
echo "1. ⚠️ SUPPRIMEZ CE FICHIER (clear_cache.php) pour sécurité\n";
echo "2. Actualisez votre application 5 fois\n";
echo "3. Consultez: /backend/monitoring/check.php\n";
echo "4. Vérifiez que connexions DB < 15\n";
echo "\n";
echo "Si connexions encore élevées (> 30):\n";
echo "- Attendez 5-10 minutes (timeout connexions)\n";
echo "- Contactez support Hostinger pour redémarrer PHP-FPM\n";
echo "- Vérifiez que config.php a bien persistent = false\n";
echo "\n";

echo "=================================================\n";
echo "Script exécuté le: " . date('Y-m-d H:i:s') . "\n";
echo "=================================================\n";
?>
