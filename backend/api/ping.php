<?php
require_once __DIR__ . '/_bootstrap.php';

init_api_headers(['GET', 'OPTIONS', 'HEAD']);

if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    http_response_code(200);
    exit;
}

$start = microtime(true);
$claims = require_auth();
$checkDatabase = isset($_GET['db']) && $_GET['db'] === '1';

if (!$checkDatabase) {
    echo json_encode([
        'success' => true,
        'message' => 'Authenticated API reachable',
        'userId' => (string)($claims['sub'] ?? ''),
        'db' => 'not_checked',
        'latency_ms' => (int)((microtime(true) - $start) * 1000),
        'timestamp' => (int)(microtime(true) * 1000),
    ]);
    exit;
}

require_once __DIR__ . '/../config.php';

try {
    $stmt = $pdo->query('SELECT 1');
    $dbOk = $stmt !== false;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database check failed',
        'error' => $e->getMessage(),
        'timestamp' => (int)(microtime(true) * 1000),
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => 'Server healthy',
    'db' => $dbOk,
    'latency_ms' => (int)((microtime(true) - $start) * 1000),
    'timestamp' => (int)(microtime(true) * 1000),
]);
?>
