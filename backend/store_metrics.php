<?php
require_once __DIR__ . '/cache.php';

const STORE_METRICS_CACHE_NAMESPACE = 'store_metrics';
const STORE_METRICS_CACHE_TTL_SECONDS = 45;

function store_metrics_day_start_ms(int $timestamp): int {
    if ($timestamp <= 0) {
        return 0;
    }

    return intdiv($timestamp, 86400000) * 86400000;
}

function store_metrics_has_table(PDO $pdo, string $tableName): bool {
    static $tablePresence = [];
    if (array_key_exists($tableName, $tablePresence)) {
        return $tablePresence[$tableName];
    }

    $stmt = $pdo->prepare(
        'SELECT 1
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name = ?
         LIMIT 1'
    );
    $stmt->execute([$tableName]);
    $tablePresence[$tableName] = $stmt->fetchColumn() !== false;

    return $tablePresence[$tableName];
}

function store_metrics_has_summary_tables(PDO $pdo): bool {
    return store_metrics_has_table($pdo, 'store_daily_sales_summary')
        && store_metrics_has_table($pdo, 'store_daily_expense_summary')
        && store_metrics_has_table($pdo, 'store_daily_indirect_category_summary');
}

function store_metrics_invalidate_cache(?string $storeId = null): void {
    invalidateCacheNamespace(STORE_METRICS_CACHE_NAMESPACE);
}

function store_metrics_delete_store_summaries(PDO $pdo, string $storeId): void {
    if (!store_metrics_has_summary_tables($pdo)) {
        return;
    }

    $tables = [
        'store_daily_sales_summary',
        'store_daily_expense_summary',
        'store_daily_indirect_category_summary',
    ];

    foreach ($tables as $table) {
        $stmt = $pdo->prepare("DELETE FROM `$table` WHERE storeId = ?");
        $stmt->execute([$storeId]);
    }
}

function store_metrics_refresh_sales_summary_for_timestamp(PDO $pdo, ?string $storeId, ?int $timestamp): void {
    $storeId = trim((string)$storeId);
    $timestamp = (int)$timestamp;
    if ($storeId === '' || $timestamp <= 0 || !store_metrics_has_summary_tables($pdo)) {
        return;
    }

    $dayStart = store_metrics_day_start_ms($timestamp);
    $dayEnd = $dayStart + 86400000;

    $salesStmt = $pdo->prepare(
        'SELECT
            COUNT(*) AS transactions,
            COALESCE(SUM(CAST(s.total AS DECIMAL(20,2))), 0) AS revenue
         FROM sales s
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId = ?
           AND s.createdAt >= ?
           AND s.createdAt < ?
           AND s.refunded = 0
           AND (s.shiftId IS NULL OR sh.status = "closed")'
    );
    $salesStmt->execute([$storeId, $dayStart, $dayEnd]);
    $salesRow = $salesStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $cogsStmt = $pdo->prepare(
        'SELECT
            COALESCE(SUM(
                CASE
                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                    ELSE 0
                END
            ), 0) AS cogs
         FROM sales s
         JOIN sale_items si ON s.id = si.saleId
         LEFT JOIN products p ON p.id = si.productId
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId = ?
           AND s.createdAt >= ?
           AND s.createdAt < ?
           AND s.refunded = 0
           AND (s.shiftId IS NULL OR sh.status = "closed")'
    );
    $cogsStmt->execute([$storeId, $dayStart, $dayEnd]);
    $cogs = (float)$cogsStmt->fetchColumn();

    $upsertStmt = $pdo->prepare(
        'REPLACE INTO store_daily_sales_summary (storeId, dayStart, revenue_closed, cogs_closed, transactions_closed, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $upsertStmt->execute([
        $storeId,
        $dayStart,
        (float)($salesRow['revenue'] ?? 0),
        $cogs,
        (int)($salesRow['transactions'] ?? 0),
        (int)(microtime(true) * 1000),
    ]);
}

function store_metrics_refresh_sales_summaries_for_shift(PDO $pdo, ?string $shiftId, ?string $fallbackStoreId = null): void {
    $shiftId = trim((string)$shiftId);
    if ($shiftId === '' || !store_metrics_has_summary_tables($pdo)) {
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT DISTINCT storeId, createdAt
         FROM sales
         WHERE shiftId = ?'
    );
    $stmt->execute([$shiftId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows) && $fallbackStoreId) {
        return;
    }

    foreach ($rows as $row) {
        store_metrics_refresh_sales_summary_for_timestamp(
            $pdo,
            (string)($row['storeId'] ?? $fallbackStoreId ?? ''),
            (int)($row['createdAt'] ?? 0)
        );
    }
}

function store_metrics_refresh_expense_summary_for_timestamp(PDO $pdo, ?string $storeId, ?int $timestamp): void {
    $storeId = trim((string)$storeId);
    $timestamp = (int)$timestamp;
    if ($storeId === '' || $timestamp <= 0 || !store_metrics_has_summary_tables($pdo)) {
        return;
    }

    $dayStart = store_metrics_day_start_ms($timestamp);
    $dayEnd = $dayStart + 86400000;

    $expenseStmt = $pdo->prepare(
        'SELECT
            COALESCE(SUM(CASE WHEN type = "direct" THEN amount ELSE 0 END), 0) AS directExpenses,
            COALESCE(SUM(CASE WHEN type = "indirect" THEN amount ELSE 0 END), 0) AS indirectExpenses,
            COALESCE(SUM(CASE WHEN type = "operational" THEN amount ELSE 0 END), 0) AS operationalExpenses
         FROM expenses_advanced
         WHERE storeId = ?
           AND date >= ?
           AND date < ?'
    );
    $expenseStmt->execute([$storeId, $dayStart, $dayEnd]);
    $expenseRow = $expenseStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $upsertStmt = $pdo->prepare(
        'REPLACE INTO store_daily_expense_summary (storeId, dayStart, direct_expenses, indirect_expenses, operational_expenses, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $upsertStmt->execute([
        $storeId,
        $dayStart,
        (float)($expenseRow['directExpenses'] ?? 0),
        (float)($expenseRow['indirectExpenses'] ?? 0),
        (float)($expenseRow['operationalExpenses'] ?? 0),
        (int)(microtime(true) * 1000),
    ]);

    $deleteCategoryStmt = $pdo->prepare(
        'DELETE FROM store_daily_indirect_category_summary
         WHERE storeId = ?
           AND dayStart = ?'
    );
    $deleteCategoryStmt->execute([$storeId, $dayStart]);

    $categoryStmt = $pdo->prepare(
        'SELECT categoryId, COALESCE(SUM(amount), 0) AS amount
         FROM expenses_advanced
         WHERE storeId = ?
           AND date >= ?
           AND date < ?
           AND type = "indirect"
           AND categoryId IS NOT NULL
           AND categoryId <> ""
         GROUP BY categoryId'
    );
    $categoryStmt->execute([$storeId, $dayStart, $dayEnd]);
    $categoryRows = $categoryStmt->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($categoryRows)) {
        $insertCategoryStmt = $pdo->prepare(
            'INSERT INTO store_daily_indirect_category_summary (storeId, dayStart, categoryId, amount, updatedAt)
             VALUES (?, ?, ?, ?, ?)'
        );
        $updatedAt = (int)(microtime(true) * 1000);
        foreach ($categoryRows as $categoryRow) {
            $insertCategoryStmt->execute([
                $storeId,
                $dayStart,
                (string)$categoryRow['categoryId'],
                (float)$categoryRow['amount'],
                $updatedAt,
            ]);
        }
    }
}

function store_metrics_fetch_settings_map(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $stmt = $pdo->prepare("SELECT * FROM store_balance_settings WHERE storeId IN ($placeholders)");
    $stmt->execute($storeIds);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $map[(string)$row['storeId']] = $row;
    }

    return $map;
}

function store_metrics_fetch_latest_balance_overrides_map(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT *
         FROM store_balance_overrides
         WHERE storeId IN ($placeholders)
         ORDER BY storeId ASC, appliedAt DESC, createdAt DESC"
    );
    $stmt->execute($storeIds);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        if (!isset($map[$storeId])) {
            $map[$storeId] = $row;
        }
    }

    return $map;
}

function store_metrics_fetch_latest_indicator_overrides_map(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT *
         FROM store_indicator_overrides
         WHERE storeId IN ($placeholders)
           AND indicator IN ('fond_roulement', 'benefice')
         ORDER BY storeId ASC, indicator ASC, appliedAt DESC, createdAt DESC"
    );
    $stmt->execute($storeIds);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        $indicator = (string)$row['indicator'];
        if (!isset($map[$storeId])) {
            $map[$storeId] = [];
        }
        if (!isset($map[$storeId][$indicator])) {
            $map[$storeId][$indicator] = $row;
        }
    }

    return $map;
}

function store_metrics_fetch_all_time_sales_map(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [];
    }

    $map = [];
    if (store_metrics_has_summary_tables($pdo)) {
        $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
        $stmt = $pdo->prepare(
            "SELECT
                storeId,
                COALESCE(SUM(revenue_closed), 0) AS revenue,
                COALESCE(SUM(cogs_closed), 0) AS cogs
             FROM store_daily_sales_summary
             WHERE storeId IN ($placeholders)
             GROUP BY storeId"
        );
        $stmt->execute($storeIds);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $map[(string)$row['storeId']] = [
                'revenue' => (float)($row['revenue'] ?? 0),
                'cogs' => (float)($row['cogs'] ?? 0),
            ];
        }

        $remainingStoreIds = array_values(array_diff($storeIds, array_keys($map)));
        if (empty($remainingStoreIds)) {
            return $map;
        }
        $storeIds = $remainingStoreIds;
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $revenueStmt = $pdo->prepare(
        "SELECT
            s.storeId,
            COALESCE(SUM(si.price * si.quantity), 0) AS revenue
         FROM sales s
         JOIN sale_items si ON s.id = si.saleId
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId IN ($placeholders)
           AND s.refunded = 0
           AND (s.shiftId IS NULL OR sh.status = 'closed')
         GROUP BY s.storeId"
    );
    $revenueStmt->execute($storeIds);
    foreach ($revenueStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        $map[$storeId] = [
            'revenue' => (float)($row['revenue'] ?? 0),
            'cogs' => 0.0,
        ];
    }

    $cogsStmt = $pdo->prepare(
        "SELECT
            s.storeId,
            COALESCE(SUM(
                CASE
                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                    ELSE 0
                END
            ), 0) AS cogs
         FROM sales s
         JOIN sale_items si ON s.id = si.saleId
         LEFT JOIN products p ON p.id = si.productId
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId IN ($placeholders)
           AND s.refunded = 0
           AND (s.shiftId IS NULL OR sh.status = 'closed')
         GROUP BY s.storeId"
    );
    $cogsStmt->execute($storeIds);
    foreach ($cogsStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        if (!isset($map[$storeId])) {
            $map[$storeId] = ['revenue' => 0.0, 'cogs' => 0.0];
        }
        $map[$storeId]['cogs'] = (float)($row['cogs'] ?? 0);
    }

    return $map;
}

function store_metrics_fetch_all_time_legacy_expenses_map(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT storeId, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE storeId IN ($placeholders)
         GROUP BY storeId"
    );
    $stmt->execute($storeIds);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $map[(string)$row['storeId']] = (float)($row['total'] ?? 0);
    }

    return $map;
}

function store_metrics_fetch_all_time_expense_maps(PDO $pdo, array $storeIds): array {
    if (empty($storeIds)) {
        return [
            'types' => [],
            'indirectCategories' => [],
        ];
    }

    $typeMap = [];
    $categoryMap = [];
    if (store_metrics_has_summary_tables($pdo)) {
        $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
        $expenseStmt = $pdo->prepare(
            "SELECT
                storeId,
                COALESCE(SUM(direct_expenses), 0) AS directExpenses,
                COALESCE(SUM(indirect_expenses), 0) AS indirectExpenses,
                COALESCE(SUM(operational_expenses), 0) AS operationalExpenses
             FROM store_daily_expense_summary
             WHERE storeId IN ($placeholders)
             GROUP BY storeId"
        );
        $expenseStmt->execute($storeIds);
        foreach ($expenseStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $typeMap[(string)$row['storeId']] = [
                'direct' => (float)($row['directExpenses'] ?? 0),
                'indirect' => (float)($row['indirectExpenses'] ?? 0),
                'operational' => (float)($row['operationalExpenses'] ?? 0),
            ];
        }

        $categoryStmt = $pdo->prepare(
            "SELECT storeId, categoryId, COALESCE(SUM(amount), 0) AS amount
             FROM store_daily_indirect_category_summary
             WHERE storeId IN ($placeholders)
             GROUP BY storeId, categoryId"
        );
        $categoryStmt->execute($storeIds);
        foreach ($categoryStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $storeId = (string)$row['storeId'];
            $categoryId = (string)$row['categoryId'];
            if (!isset($categoryMap[$storeId])) {
                $categoryMap[$storeId] = [];
            }
            $categoryMap[$storeId][$categoryId] = (float)($row['amount'] ?? 0);
        }

        $remainingStoreIds = array_values(array_diff($storeIds, array_keys($typeMap)));
        if (empty($remainingStoreIds)) {
            return [
                'types' => $typeMap,
                'indirectCategories' => $categoryMap,
            ];
        }
        $storeIds = $remainingStoreIds;
    }

    $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
    $expenseStmt = $pdo->prepare(
        "SELECT storeId, type, COALESCE(SUM(amount), 0) AS total
         FROM expenses_advanced
         WHERE storeId IN ($placeholders)
         GROUP BY storeId, type"
    );
    $expenseStmt->execute($storeIds);
    foreach ($expenseStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        if (!isset($typeMap[$storeId])) {
            $typeMap[$storeId] = [
                'direct' => 0.0,
                'indirect' => 0.0,
                'operational' => 0.0,
            ];
        }
        $typeMap[$storeId][(string)$row['type']] = (float)($row['total'] ?? 0);
    }

    $categoryStmt = $pdo->prepare(
        "SELECT storeId, categoryId, COALESCE(SUM(amount), 0) AS amount
         FROM expenses_advanced
         WHERE storeId IN ($placeholders)
           AND type = 'indirect'
           AND categoryId IS NOT NULL
           AND categoryId <> ''
         GROUP BY storeId, categoryId"
    );
    $categoryStmt->execute($storeIds);
    foreach ($categoryStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $storeId = (string)$row['storeId'];
        $categoryId = (string)$row['categoryId'];
        if (!isset($categoryMap[$storeId])) {
            $categoryMap[$storeId] = [];
        }
        $categoryMap[$storeId][$categoryId] = (float)($row['amount'] ?? 0);
    }

    return [
        'types' => $typeMap,
        'indirectCategories' => $categoryMap,
    ];
}

function store_metrics_sum_categories(array $categoryTotals, array $categoryIds): float {
    if (empty($categoryIds)) {
        return 0.0;
    }

    $sum = 0.0;
    foreach ($categoryIds as $categoryId) {
        $key = (string)$categoryId;
        $sum += (float)($categoryTotals[$key] ?? 0);
    }

    return $sum;
}

function store_metrics_fetch_window_metrics(PDO $pdo, string $storeId, int $sinceTimestamp): array {
    static $requestCache = [];
    $cacheKey = $storeId . '|' . $sinceTimestamp;
    if (isset($requestCache[$cacheKey])) {
        return $requestCache[$cacheKey];
    }

    $metrics = [
        'revenue' => 0.0,
        'cogs' => 0.0,
        'legacy' => 0.0,
        'direct' => 0.0,
        'indirect' => 0.0,
        'operational' => 0.0,
        'indirectCategories' => [],
    ];

    $revenueStmt = $pdo->prepare(
        'SELECT COALESCE(SUM(si.price * si.quantity), 0)
         FROM sales s
         JOIN sale_items si ON s.id = si.saleId
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId = ?
           AND s.refunded = 0
           AND s.createdAt >= ?
           AND (s.shiftId IS NULL OR sh.status = "closed")'
    );
    $revenueStmt->execute([$storeId, $sinceTimestamp]);
    $metrics['revenue'] = (float)$revenueStmt->fetchColumn();

    $cogsStmt = $pdo->prepare(
        'SELECT COALESCE(SUM(
            CASE
                WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                ELSE 0
            END
        ), 0)
         FROM sales s
         JOIN sale_items si ON s.id = si.saleId
         LEFT JOIN products p ON p.id = si.productId
         LEFT JOIN shifts sh ON s.shiftId = sh.id
         WHERE s.storeId = ?
           AND s.refunded = 0
           AND s.createdAt >= ?
           AND (s.shiftId IS NULL OR sh.status = "closed")'
    );
    $cogsStmt->execute([$storeId, $sinceTimestamp]);
    $metrics['cogs'] = (float)$cogsStmt->fetchColumn();

    $legacyStmt = $pdo->prepare(
        'SELECT COALESCE(SUM(amount), 0)
         FROM expenses
         WHERE storeId = ?
           AND createdAt >= ?'
    );
    $legacyStmt->execute([$storeId, $sinceTimestamp]);
    $metrics['legacy'] = (float)$legacyStmt->fetchColumn();

    $typeStmt = $pdo->prepare(
        'SELECT type, COALESCE(SUM(amount), 0) AS total
         FROM expenses_advanced
         WHERE storeId = ?
           AND date >= ?
         GROUP BY type'
    );
    $typeStmt->execute([$storeId, $sinceTimestamp]);
    foreach ($typeStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $type = (string)$row['type'];
        $metrics[$type] = (float)($row['total'] ?? 0);
    }

    $categoryStmt = $pdo->prepare(
        'SELECT categoryId, COALESCE(SUM(amount), 0) AS total
         FROM expenses_advanced
         WHERE storeId = ?
           AND date >= ?
           AND type = "indirect"
           AND categoryId IS NOT NULL
           AND categoryId <> ""
         GROUP BY categoryId'
    );
    $categoryStmt->execute([$storeId, $sinceTimestamp]);
    foreach ($categoryStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $metrics['indirectCategories'][(string)$row['categoryId']] = (float)($row['total'] ?? 0);
    }

    $requestCache[$cacheKey] = $metrics;
    return $metrics;
}

function store_metrics_compute_for_stores_uncached(PDO $pdo, array $stores): array {
    if (empty($stores)) {
        return [];
    }

    $storeIds = array_values(array_filter(array_map(static function ($store) {
        return isset($store['id']) ? (string)$store['id'] : '';
    }, $stores)));

    $settingsMap = store_metrics_fetch_settings_map($pdo, $storeIds);
    $balanceOverrideMap = store_metrics_fetch_latest_balance_overrides_map($pdo, $storeIds);
    $indicatorOverrideMap = store_metrics_fetch_latest_indicator_overrides_map($pdo, $storeIds);
    $allTimeSalesMap = store_metrics_fetch_all_time_sales_map($pdo, $storeIds);
    $allTimeLegacyExpenseMap = store_metrics_fetch_all_time_legacy_expenses_map($pdo, $storeIds);
    $expenseMaps = store_metrics_fetch_all_time_expense_maps($pdo, $storeIds);
    $allTimeExpenseTypeMap = $expenseMaps['types'];
    $allTimeIndirectCategoryMap = $expenseMaps['indirectCategories'];

    foreach ($stores as &$store) {
        $storeId = (string)$store['id'];
        $settings = $settingsMap[$storeId] ?? null;
        $fondCats = [];
        $benefCats = [];
        $trackIndirectExpenses = true;
        $trackIndirectExpensesEnabledAt = null;

        if ($settings) {
            $fondCats = isset($settings['fondCategories']) && $settings['fondCategories']
                ? json_decode($settings['fondCategories'], true)
                : [];
            $benefCats = isset($settings['beneficeCategories']) && $settings['beneficeCategories']
                ? json_decode($settings['beneficeCategories'], true)
                : [];
            if (!is_array($fondCats)) {
                $fondCats = [];
            }
            if (!is_array($benefCats)) {
                $benefCats = [];
            }
            if (isset($settings['trackIndirectExpenses'])) {
                $trackIndirectExpenses = (int)$settings['trackIndirectExpenses'] === 1;
            }
            $trackIndirectExpensesEnabledAt = isset($settings['trackIndirectExpensesEnabledAt']) && $settings['trackIndirectExpensesEnabledAt'] !== null
                ? (int)$settings['trackIndirectExpensesEnabledAt']
                : null;
        }

        $store['trackIndirectExpenses'] = $trackIndirectExpenses;
        $store['trackIndirectExpensesEnabledAt'] = $trackIndirectExpensesEnabledAt;
        $store['fondCategories'] = $fondCats;
        $store['beneficeCategories'] = $benefCats;

        $salesRevenue = (float)($allTimeSalesMap[$storeId]['revenue'] ?? 0);
        $cogs = (float)($allTimeSalesMap[$storeId]['cogs'] ?? 0);
        $legacyExpenses = (float)($allTimeLegacyExpenseMap[$storeId] ?? 0);
        $expenseTypes = $allTimeExpenseTypeMap[$storeId] ?? ['direct' => 0.0, 'indirect' => 0.0, 'operational' => 0.0];
        $indirectCategories = $allTimeIndirectCategoryMap[$storeId] ?? [];

        $expensesDirect = (float)($expenseTypes['direct'] ?? 0);
        $expensesIndirectAll = (float)($expenseTypes['indirect'] ?? 0);
        $expensesOperational = (float)($expenseTypes['operational'] ?? 0);
        $expensesIndirectFond = store_metrics_sum_categories($indirectCategories, $fondCats);
        $expensesIndirectBenef = store_metrics_sum_categories($indirectCategories, $benefCats);
        $expensesTotal = $legacyExpenses + $expensesDirect + $expensesIndirectAll + $expensesOperational;

        $balanceOverride = $balanceOverrideMap[$storeId] ?? null;
        $fondOverride = $indicatorOverrideMap[$storeId]['fond_roulement'] ?? null;
        $beneficeOverride = $indicatorOverrideMap[$storeId]['benefice'] ?? null;

        if ($balanceOverride) {
            $store['solde_manual'] = (float)$balanceOverride['value'];
            $store['solde_manual_appliedAt'] = isset($balanceOverride['appliedAt']) ? (int)$balanceOverride['appliedAt'] : null;
            $store['solde_manual_userId'] = $balanceOverride['userId'] ?? null;
            $store['solde_manual_note'] = $balanceOverride['note'] ?? null;

            $appliedAt = isset($balanceOverride['appliedAt']) ? (int)$balanceOverride['appliedAt'] : 0;
            if ($appliedAt > 0) {
                $window = store_metrics_fetch_window_metrics($pdo, $storeId, $appliedAt);
                $store['solde'] = round(
                    (float)$balanceOverride['value']
                    + $window['revenue']
                    - ($window['legacy'] + $window['direct'] + $window['indirect'] + $window['operational']),
                    2
                );
            } else {
                $store['solde'] = round((float)$balanceOverride['value'] + $salesRevenue - $expensesTotal, 2);
            }
        } else {
            $store['solde'] = round($salesRevenue - $expensesTotal, 2);
            $store['solde_manual'] = null;
        }

        if ($fondOverride) {
            $store['fond_roulement_manual'] = (float)$fondOverride['value'];
            $store['fond_roulement_manual_appliedAt'] = isset($fondOverride['appliedAt']) ? (int)$fondOverride['appliedAt'] : null;
            $store['fond_roulement_manual_userId'] = $fondOverride['userId'] ?? null;
            $store['fond_roulement_manual_note'] = $fondOverride['note'] ?? null;

            $appliedAt = isset($fondOverride['appliedAt']) ? (int)$fondOverride['appliedAt'] : 0;
            if ($appliedAt > 0) {
                $window = store_metrics_fetch_window_metrics($pdo, $storeId, $appliedAt);
                $store['fond_roulement'] = round(
                    (float)$fondOverride['value']
                    + $window['cogs']
                    - $window['direct']
                    - store_metrics_sum_categories($window['indirectCategories'], $fondCats),
                    2
                );
            } else {
                $store['fond_roulement'] = round(
                    (float)$fondOverride['value'] + $cogs - $expensesDirect - $expensesIndirectFond,
                    2
                );
            }
        } else {
            $store['fond_roulement'] = round($cogs - $expensesDirect - $expensesIndirectFond, 2);
            $store['fond_roulement_manual'] = null;
        }

        if ($beneficeOverride) {
            $store['benefice_manual'] = (float)$beneficeOverride['value'];
            $store['benefice_manual_appliedAt'] = isset($beneficeOverride['appliedAt']) ? (int)$beneficeOverride['appliedAt'] : null;
            $store['benefice_manual_userId'] = $beneficeOverride['userId'] ?? null;
            $store['benefice_manual_note'] = $beneficeOverride['note'] ?? null;

            $appliedAt = isset($beneficeOverride['appliedAt']) ? (int)$beneficeOverride['appliedAt'] : 0;
            if ($appliedAt > 0) {
                $window = store_metrics_fetch_window_metrics($pdo, $storeId, $appliedAt);
                $store['benefice'] = round(
                    (float)$beneficeOverride['value']
                    + (($window['revenue'] - $window['cogs']) - store_metrics_sum_categories($window['indirectCategories'], $benefCats))
                    - $window['operational'],
                    2
                );
            } else {
                $store['benefice'] = round(
                    (float)$beneficeOverride['value']
                    + (($salesRevenue - $cogs) - $expensesIndirectBenef)
                    - $expensesOperational,
                    2
                );
            }
        } else {
            $store['benefice'] = round((($salesRevenue - $cogs) - $expensesIndirectBenef) - $expensesOperational, 2);
            $store['benefice_manual'] = null;
        }
    }
    unset($store);

    return $stores;
}

function store_metrics_build_for_stores(PDO $pdo, array $stores): array {
    $storeIds = array_values(array_filter(array_map(static function ($store) {
        return isset($store['id']) ? (string)$store['id'] : '';
    }, $stores)));

    $cacheKey = generateNamespacedCacheKey(STORE_METRICS_CACHE_NAMESPACE, [
        'storeIds' => $storeIds,
    ]);

    global $cache;
    return $cache->remember($cacheKey, static function () use ($pdo, $stores) {
        return store_metrics_compute_for_stores_uncached($pdo, $stores);
    }, STORE_METRICS_CACHE_TTL_SECONDS);
}
?>
