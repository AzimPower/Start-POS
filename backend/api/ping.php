<?php
// CORS & JSON headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');

// Répondre immédiatement aux préflight / HEAD
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS' || $_SERVER['REQUEST_METHOD'] === 'HEAD') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

$start = microtime(true);

// Charger la config et tenter une requête minimale BD
require_once __DIR__ . '/../config.php'; // fournit $pdo ou termine avec 500 si échec

try {
    // Requête simple pour valider lecture (évite dépendre d'une table métier spécifique)
    $stmt = $pdo->query('SELECT 1');
    $db_ok = $stmt !== false;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database check failed',
        'error' => $e->getMessage(),
        'timestamp' => (int)(microtime(true) * 1000)
    ]);
    exit;
}

$duration_ms = (int) ((microtime(true) - $start) * 1000);

echo json_encode([
    'success' => true,
    'message' => 'Server healthy',
    'db' => $db_ok,
    'latency_ms' => $duration_ms,
    'timestamp' => (int)(microtime(true) * 1000)
]);
?>