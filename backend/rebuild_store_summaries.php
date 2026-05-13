<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/store_metrics.php';

header('Content-Type: text/plain; charset=utf-8');

if (!store_metrics_has_summary_tables($pdo)) {
    http_response_code(400);
    echo "Summary tables are missing. Apply backend/migrations/012_store_summary_tables.sql first.\n";
    exit;
}

$salesDaysStmt = $pdo->query(
    'SELECT DISTINCT storeId, (createdAt - MOD(createdAt, 86400000)) AS dayStart
     FROM sales
     WHERE storeId IS NOT NULL
       AND storeId <> ""
       AND createdAt IS NOT NULL'
);
$salesDays = $salesDaysStmt ? $salesDaysStmt->fetchAll(PDO::FETCH_ASSOC) : [];

$expenseDaysStmt = $pdo->query(
    'SELECT DISTINCT storeId, (date - MOD(date, 86400000)) AS dayStart
     FROM expenses_advanced
     WHERE storeId IS NOT NULL
       AND storeId <> ""
       AND date IS NOT NULL'
);
$expenseDays = $expenseDaysStmt ? $expenseDaysStmt->fetchAll(PDO::FETCH_ASSOC) : [];

$salesCount = 0;
foreach ($salesDays as $row) {
    store_metrics_refresh_sales_summary_for_timestamp($pdo, (string)$row['storeId'], (int)$row['dayStart']);
    $salesCount++;
}

$expenseCount = 0;
foreach ($expenseDays as $row) {
    store_metrics_refresh_expense_summary_for_timestamp($pdo, (string)$row['storeId'], (int)$row['dayStart']);
    $expenseCount++;
}

store_metrics_invalidate_cache();

echo "Sales summaries rebuilt: {$salesCount}\n";
echo "Expense summaries rebuilt: {$expenseCount}\n";
echo "Store metrics cache invalidated.\n";
?>
