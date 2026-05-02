<?php
// Endpoint public de sante: volontairement accessible depuis n'importe quelle
// origine pour eviter les faux "hors ligne" dans les WebView Android.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS, HEAD');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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
