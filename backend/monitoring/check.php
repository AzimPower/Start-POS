<?php
/**
 * HEALTH CHECK & MONITORING - POS v2
 * 
 * Ce script permet de surveiller l'état de votre application
 * Consultez-le régulièrement : https://votre-domaine.com/backend/monitoring/check.php
 * 
 * Indicateurs surveillés :
 * - Connexion base de données
 * - Nombre de connexions DB actives
 * - Nombre de boutiques actives
 * - Utilisation mémoire PHP
 * - Configuration PHP
 * - État des dossiers cache et logs
 */

require_once '../config.php';

header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');

// Tableau de santé global
$health = [
    'status' => 'ok',
    'plan' => 'Hostinger Premium',
    'timestamp' => date('Y-m-d H:i:s'),
    'checks' => [],
    'alerts' => []
];

// ============================================================
// TEST 1 : CONNEXION BASE DE DONNÉES
// ============================================================
try {
    $stmt = $pdo->query('SELECT 1');
    $health['checks']['database'] = [
        'status' => 'ok',
        'message' => 'Connexion réussie'
    ];
    
    // Récupérer les connexions actives
    try {
        $stmt = $pdo->query("SHOW STATUS LIKE 'Threads_connected'");
        $result = $stmt->fetch();
        $currentConnections = (int)$result['Value'];
        
        // Limites estimées pour Hostinger Premium
        $maxConnections = 40; // Conservative estimate
        $percentage = round(($currentConnections / $maxConnections) * 100, 1);
        
        // Déterminer le statut
        if ($currentConnections < 25) {
            $connectionStatus = 'ok';
        } elseif ($currentConnections < 35) {
            $connectionStatus = 'warning';
            $health['alerts'][] = 'Connexions DB élevées (' . $currentConnections . '/' . $maxConnections . ')';
        } else {
            $connectionStatus = 'critical';
            $health['status'] = 'warning';
            $health['alerts'][] = 'ALERTE : Connexions DB critiques ! Upgrade requis.';
        }
        
        $health['checks']['database_connections'] = [
            'status' => $connectionStatus,
            'current' => $currentConnections,
            'limit' => $maxConnections . ' (estimé Premium)',
            'percentage' => $percentage . '%',
            'recommendation' => $currentConnections > 30 
                ? 'Envisager upgrade vers Cloud Startup' 
                : 'Capacité suffisante'
        ];
        
    } catch (Exception $e) {
        $health['checks']['database_connections'] = [
            'status' => 'unknown',
            'message' => 'Impossible de vérifier les connexions'
        ];
    }
    
    // Compter les boutiques actives
    try {
        $stmt = $pdo->query("SELECT COUNT(*) as total FROM stores WHERE active = 1");
        $stores = $stmt->fetch();
        $activeStores = (int)$stores['total'];
        
        $storeStatus = 'ok';
        if ($activeStores > 10) {
            $storeStatus = 'warning';
            $health['alerts'][] = $activeStores . ' boutiques actives (recommandé < 15 pour Premium)';
        }
        if ($activeStores > 15) {
            $storeStatus = 'critical';
            $health['status'] = 'warning';
            $health['alerts'][] = 'ALERTE : Trop de boutiques pour Premium. Upgrade nécessaire.';
        }
        
        $health['checks']['stores'] = [
            'status' => $storeStatus,
            'active' => $activeStores,
            'recommended_max' => 15,
            'recommendation' => $activeStores > 10 
                ? 'Surveiller performances, prévoir upgrade' 
                : 'Capacité OK'
        ];
        
    } catch (Exception $e) {
        $health['checks']['stores'] = [
            'status' => 'error',
            'message' => 'Impossible de compter les boutiques'
        ];
    }
    
} catch (Exception $e) {
    $health['status'] = 'error';
    $health['checks']['database'] = [
        'status' => 'error',
        'message' => 'Erreur de connexion : ' . $e->getMessage()
    ];
}

// ============================================================
// TEST 2 : CONFIGURATION PHP
// ============================================================
$memoryLimit = ini_get('memory_limit');
$memoryUsage = memory_get_usage(true);
$memoryPeak = memory_get_peak_usage(true);

// Convertir memory_limit en bytes pour comparaison
$memoryLimitBytes = preg_replace('/[^0-9]/', '', $memoryLimit) * 1024 * 1024;
$memoryPercentage = round(($memoryPeak / $memoryLimitBytes) * 100, 1);

$health['checks']['php_memory'] = [
    'status' => $memoryPercentage < 80 ? 'ok' : 'warning',
    'limit' => $memoryLimit,
    'current_usage' => round($memoryUsage / 1048576, 2) . ' MB',
    'peak_usage' => round($memoryPeak / 1048576, 2) . ' MB',
    'percentage' => $memoryPercentage . '%'
];

$health['checks']['php_config'] = [
    'version' => phpversion(),
    'max_execution_time' => ini_get('max_execution_time') . 's',
    'upload_max_filesize' => ini_get('upload_max_filesize'),
    'post_max_size' => ini_get('post_max_size'),
];

// ============================================================
// TEST 3 : EXTENSIONS PHP
// ============================================================
$health['checks']['php_extensions'] = [
    'pdo_mysql' => extension_loaded('pdo_mysql') ? 'ok' : 'missing',
    'json' => extension_loaded('json') ? 'ok' : 'missing',
    'mbstring' => extension_loaded('mbstring') ? 'ok' : 'missing',
    'opcache' => extension_loaded('Zend OPcache') ? 'ok' : 'not available',
    'apcu' => extension_loaded('apcu') ? 'ok' : 'not available (normal sur mutualisé)',
];

// ============================================================
// TEST 4 : DOSSIERS SYSTÈME
// ============================================================
$cacheDir = __DIR__ . '/../cache';
$logsDir = __DIR__ . '/../logs';

$health['checks']['directories'] = [
    'cache' => [
        'exists' => is_dir($cacheDir),
        'writable' => is_writable($cacheDir),
        'path' => $cacheDir
    ],
    'logs' => [
        'exists' => is_dir($logsDir),
        'writable' => is_writable($logsDir),
        'path' => $logsDir
    ]
];

// Alertes si problèmes de dossiers
if (!is_dir($cacheDir) || !is_writable($cacheDir)) {
    $health['alerts'][] = 'Dossier cache/ manquant ou non accessible en écriture';
}
if (!is_dir($logsDir) || !is_writable($logsDir)) {
    $health['alerts'][] = 'Dossier logs/ manquant ou non accessible en écriture';
}

// ============================================================
// TEST 5 : CACHE SYSTÈME
// ============================================================
if (file_exists(__DIR__ . '/../cache.php')) {
    require_once __DIR__ . '/../cache.php';
    try {
        $cacheInfo = $cache->getInfo();
        $health['checks']['cache_system'] = [
            'status' => 'ok',
            'driver' => $cacheInfo['driver'],
            'apcu_available' => $cacheInfo['apcu_available']
        ];
    } catch (Exception $e) {
        $health['checks']['cache_system'] = [
            'status' => 'error',
            'message' => $e->getMessage()
        ];
    }
} else {
    $health['checks']['cache_system'] = [
        'status' => 'warning',
        'message' => 'Fichier cache.php non trouvé'
    ];
}

// ============================================================
// RECOMMANDATIONS
// ============================================================
$health['recommendations'] = [];

if (isset($health['checks']['database_connections']['current'])) {
    $connections = $health['checks']['database_connections']['current'];
    if ($connections > 30) {
        $health['recommendations'][] = 'Connexions DB élevées : Envisager upgrade Cloud Startup (+4€/mois)';
    }
}

if (isset($health['checks']['stores']['active'])) {
    $stores = $health['checks']['stores']['active'];
    if ($stores > 10) {
        $health['recommendations'][] = 'Plus de 10 boutiques : Surveiller performances quotidiennement';
    }
    if ($stores > 15) {
        $health['recommendations'][] = 'URGENT : Plus de 15 boutiques = Upgrade vers Cloud Professional recommandé';
    }
}

if ($memoryPercentage > 70) {
    $health['recommendations'][] = 'Utilisation mémoire élevée : Optimiser le code ou augmenter memory_limit';
}

// ============================================================
// RÉSUMÉ FINAL
// ============================================================
$health['summary'] = [
    'overall_status' => $health['status'],
    'checks_passed' => count(array_filter($health['checks'], function($check) {
        return isset($check['status']) && $check['status'] === 'ok';
    })),
    'total_checks' => count($health['checks']),
    'alerts_count' => count($health['alerts']),
];

// Emoji pour statut visuel
$statusEmoji = [
    'ok' => '✅',
    'warning' => '⚠️',
    'error' => '❌'
];

$health['summary']['emoji'] = $statusEmoji[$health['status']] ?? '❓';

// ============================================================
// OUTPUT JSON
// ============================================================
echo json_encode($health, JSON_PRETTY_PRINT);
?>
