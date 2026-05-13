<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';

init_api_headers(['GET', 'OPTIONS']);
$claims = require_auth();

if (!is_super_admin_claims($claims)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

$start = isset($_GET['start']) ? (int)$_GET['start'] : null;
$end = isset($_GET['end']) ? (int)$_GET['end'] : null;

if (!$start || !$end) {
    http_response_code(400);
    echo json_encode(['error' => 'start and end parameters required']);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT
        s.storeId AS storeId,
        COUNT(*) AS transactions,
        COALESCE(SUM(CAST(s.total AS DECIMAL(20,2))), 0) AS revenue
     FROM sales s
     WHERE s.createdAt >= ?
       AND s.createdAt <= ?
       AND s.refunded = 0
       AND s.storeId IS NOT NULL
       AND s.storeId <> ""
     GROUP BY s.storeId'
);
$stmt->execute([$start, $end]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stats = array_map(static function (array $row): array {
    return [
        'storeId' => (string)($row['storeId'] ?? ''),
        'revenue' => (float)($row['revenue'] ?? 0),
        'transactions' => (int)($row['transactions'] ?? 0),
    ];
}, $rows);

echo json_encode($stats);
?>
