<?php
require_once './_bootstrap.php';
init_api_headers(['GET', 'OPTIONS', 'HEAD']);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
    http_response_code(200);
    exit;
}

$start = microtime(true);

echo json_encode([
    'success' => true,
    'message' => 'API reachable',
    'db' => 'not_checked',
    'latency_ms' => (int)((microtime(true) - $start) * 1000),
    'timestamp' => (int)(microtime(true) * 1000),
]);
?>
