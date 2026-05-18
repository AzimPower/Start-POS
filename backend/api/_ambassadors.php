<?php

function ambassador_column_exists(PDO $pdo, string $table, string $column): bool {
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return false;
    }
}

function ensure_ambassador_schema(PDO $pdo): void {
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $initialized = true;

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `ambassador_commissions` (
              `id` varchar(36) NOT NULL,
              `ambassadorUserId` varchar(36) NOT NULL,
              `storeId` varchar(36) NOT NULL,
              `subscriptionPaymentId` varchar(36) NOT NULL,
              `storeName` varchar(255) NOT NULL,
              `promoCode` varchar(64) DEFAULT NULL,
              `amountBase` decimal(10,2) NOT NULL DEFAULT 0.00,
              `commissionRate` decimal(5,2) NOT NULL DEFAULT 50.00,
              `commissionAmount` decimal(10,2) NOT NULL DEFAULT 0.00,
              `createdAt` bigint(20) NOT NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_ambassador_first_payment` (`subscriptionPaymentId`),
              KEY `idx_ambassador_commissions_user` (`ambassadorUserId`),
              KEY `idx_ambassador_commissions_store` (`storeId`),
              KEY `idx_ambassador_commissions_created` (`createdAt`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `ambassador_withdrawals` (
              `id` varchar(36) NOT NULL,
              `ambassadorUserId` varchar(36) NOT NULL,
              `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
              `phone` varchar(30) DEFAULT NULL,
              `status` enum('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
              `note` varchar(255) DEFAULT NULL,
              `requestedAt` bigint(20) NOT NULL,
              `processedAt` bigint(20) DEFAULT NULL,
              `processedByUserId` varchar(36) DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `idx_ambassador_withdrawals_user` (`ambassadorUserId`),
              KEY `idx_ambassador_withdrawals_status` (`status`),
              KEY `idx_ambassador_withdrawals_requested` (`requestedAt`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    } catch (Exception $e) {
    }

    try {
        $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','manager','admin','cashier','ambassador') NOT NULL");
    } catch (Exception $e) {
    }

    $userColumns = [
        "ALTER TABLE `users` ADD COLUMN `promoCode` varchar(64) DEFAULT NULL",
        "ALTER TABLE `users` ADD COLUMN `commissionRate` decimal(5,2) DEFAULT 50.00",
        "ALTER TABLE `users` ADD COLUMN `withdrawalPhone` varchar(30) DEFAULT NULL",
    ];

    foreach ($userColumns as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Exception $e) {
        }
    }

    if (!ambassador_column_exists($pdo, 'stores', 'ambassadorUserId')) {
        try {
            $pdo->exec("ALTER TABLE `stores` ADD COLUMN `ambassadorUserId` varchar(36) DEFAULT NULL");
        } catch (Exception $e) {
        }
    }
}

function calculate_ambassador_available_balance(PDO $pdo, string $ambassadorUserId): array {
    ensure_ambassador_schema($pdo);

    $commissionStmt = $pdo->prepare('SELECT IFNULL(SUM(commissionAmount), 0) FROM ambassador_commissions WHERE ambassadorUserId = ?');
    $commissionStmt->execute([$ambassadorUserId]);
    $totalRevenue = (float)$commissionStmt->fetchColumn();

    $pendingStmt = $pdo->prepare("SELECT IFNULL(SUM(amount), 0) FROM ambassador_withdrawals WHERE ambassadorUserId = ? AND status = 'pending'");
    $pendingStmt->execute([$ambassadorUserId]);
    $pendingWithdrawals = (float)$pendingStmt->fetchColumn();

    $paidStmt = $pdo->prepare("SELECT IFNULL(SUM(amount), 0) FROM ambassador_withdrawals WHERE ambassadorUserId = ? AND status IN ('approved', 'paid')");
    $paidStmt->execute([$ambassadorUserId]);
    $paidWithdrawals = (float)$paidStmt->fetchColumn();

    return [
        'totalRevenue' => $totalRevenue,
        'pendingWithdrawals' => $pendingWithdrawals,
        'paidWithdrawals' => $paidWithdrawals,
        'availableBalance' => max(0, $totalRevenue - $pendingWithdrawals - $paidWithdrawals),
    ];
}

function create_first_subscription_commission(PDO $pdo, array $paymentData): void {
    ensure_ambassador_schema($pdo);

    $storeId = trim((string)($paymentData['storeId'] ?? ''));
    $subscriptionPaymentId = trim((string)($paymentData['id'] ?? ''));
    if ($storeId === '' || $subscriptionPaymentId === '') {
        return;
    }

    $storeStmt = $pdo->prepare('SELECT id, name, ambassadorUserId FROM stores WHERE id = ? LIMIT 1');
    $storeStmt->execute([$storeId]);
    $store = $storeStmt->fetch(PDO::FETCH_ASSOC);
    if (!$store || empty($store['ambassadorUserId'])) {
        return;
    }

    $existingCommissionStmt = $pdo->prepare('SELECT id FROM ambassador_commissions WHERE subscriptionPaymentId = ? LIMIT 1');
    $existingCommissionStmt->execute([$subscriptionPaymentId]);
    if ($existingCommissionStmt->fetch(PDO::FETCH_ASSOC)) {
        return;
    }

    $paymentsCountStmt = $pdo->prepare('SELECT COUNT(*) FROM subscription_payments WHERE storeId = ?');
    $paymentsCountStmt->execute([$storeId]);
    $paymentsCount = (int)$paymentsCountStmt->fetchColumn();
    if ($paymentsCount !== 1) {
        return;
    }

    $ambassadorStmt = $pdo->prepare('SELECT id, promoCode, commissionRate, role FROM users WHERE id = ? LIMIT 1');
    $ambassadorStmt->execute([$store['ambassadorUserId']]);
    $ambassador = $ambassadorStmt->fetch(PDO::FETCH_ASSOC);
    if (!$ambassador || (string)($ambassador['role'] ?? '') !== 'ambassador') {
        return;
    }

    $amountBase = (float)($paymentData['amount'] ?? 0);
    if ($amountBase <= 0) {
        return;
    }

    $commissionRate = isset($ambassador['commissionRate']) && $ambassador['commissionRate'] !== null
        ? (float)$ambassador['commissionRate']
        : 50.0;
    $commissionAmount = round($amountBase * ($commissionRate / 100), 2);
    if ($commissionAmount <= 0) {
        return;
    }

    $insert = $pdo->prepare(
        'INSERT INTO ambassador_commissions (id, ambassadorUserId, storeId, subscriptionPaymentId, storeName, promoCode, amountBase, commissionRate, commissionAmount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        uniqid('ambc_', true),
        $ambassador['id'],
        $storeId,
        $subscriptionPaymentId,
        (string)($paymentData['storeName'] ?? $store['name'] ?? $storeId),
        $ambassador['promoCode'] ?? null,
        $amountBase,
        $commissionRate,
        $commissionAmount,
        isset($paymentData['paidAt']) ? (int)$paymentData['paidAt'] : (int)(microtime(true) * 1000),
    ]);
}
