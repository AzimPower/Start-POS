<?php

function sales_discount_column_exists(PDO $pdo, string $table, string $column): bool {
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return false;
    }
}

function ensure_sales_discount_schema(PDO $pdo): void {
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $initialized = true;

    $salesColumns = [
        'discountTotal' => "ALTER TABLE `sales` ADD COLUMN `discountTotal` decimal(20,2) NOT NULL DEFAULT 0.00",
        'globalDiscountType' => "ALTER TABLE `sales` ADD COLUMN `globalDiscountType` varchar(16) DEFAULT NULL",
        'globalDiscountValue' => "ALTER TABLE `sales` ADD COLUMN `globalDiscountValue` decimal(20,2) DEFAULT NULL",
        'globalDiscountAmount' => "ALTER TABLE `sales` ADD COLUMN `globalDiscountAmount` decimal(20,2) NOT NULL DEFAULT 0.00",
    ];

    foreach ($salesColumns as $column => $sql) {
        if (!sales_discount_column_exists($pdo, 'sales', $column)) {
            try {
                $pdo->exec($sql);
            } catch (Exception $e) {
            }
        }
    }

    $saleItemsColumns = [
        'subtotal' => "ALTER TABLE `sale_items` ADD COLUMN `subtotal` decimal(20,2) DEFAULT NULL",
        'discountAmount' => "ALTER TABLE `sale_items` ADD COLUMN `discountAmount` decimal(20,2) NOT NULL DEFAULT 0.00",
        'lineDiscountType' => "ALTER TABLE `sale_items` ADD COLUMN `lineDiscountType` varchar(16) DEFAULT NULL",
        'lineDiscountValue' => "ALTER TABLE `sale_items` ADD COLUMN `lineDiscountValue` decimal(20,2) DEFAULT NULL",
        'lineDiscountAmount' => "ALTER TABLE `sale_items` ADD COLUMN `lineDiscountAmount` decimal(20,2) NOT NULL DEFAULT 0.00",
        'globalDiscountShare' => "ALTER TABLE `sale_items` ADD COLUMN `globalDiscountShare` decimal(20,2) NOT NULL DEFAULT 0.00",
        'originalSubtotal' => "ALTER TABLE `sale_items` ADD COLUMN `originalSubtotal` decimal(20,2) DEFAULT NULL",
    ];

    foreach ($saleItemsColumns as $column => $sql) {
        if (!sales_discount_column_exists($pdo, 'sale_items', $column)) {
            try {
                $pdo->exec($sql);
            } catch (Exception $e) {
            }
        }
    }

    if (!sales_discount_column_exists($pdo, 'store_balance_settings', 'allowSalesDiscounts')) {
        try {
            $pdo->exec("ALTER TABLE `store_balance_settings` ADD COLUMN `allowSalesDiscounts` tinyint(1) NOT NULL DEFAULT 0");
        } catch (Exception $e) {
        }
    }

    if (!sales_discount_column_exists($pdo, 'store_balance_settings', 'vatRate')) {
        try {
            $pdo->exec("ALTER TABLE `store_balance_settings` ADD COLUMN `vatRate` decimal(5,2) DEFAULT 0.00");
        } catch (Exception $e) {
        }
    }
}
