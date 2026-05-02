-- Indexes complémentaires pour réduire le coût des lectures MySQL
-- sur les endpoints les plus sollicités (sales, shifts, stores, notifications).
--
-- Cette migration est défensive : chaque index n'est ajouté que s'il n'existe pas déjà.
-- Compatible MySQL / MariaDB avec INFORMATION_SCHEMA.

DROP PROCEDURE IF EXISTS add_index_if_missing;

DELIMITER //

CREATE PROCEDURE add_index_if_missing(
    IN p_table_name VARCHAR(128),
    IN p_index_name VARCHAR(128),
    IN p_ddl TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = p_table_name
          AND index_name = p_index_name
    ) THEN
        SET @ddl = p_ddl;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

-- shifts.php : GET par storeId + ORDER BY openedAt DESC
CALL add_index_if_missing(
    'shifts',
    'idx_shifts_store_openedAt',
    'ALTER TABLE `shifts` ADD INDEX `idx_shifts_store_openedAt` (`storeId`, `openedAt`)'
);

-- shifts.php : vérification d''un shift ouvert par user/store/status
CALL add_index_if_missing(
    'shifts',
    'idx_shifts_user_store_status',
    'ALTER TABLE `shifts` ADD INDEX `idx_shifts_user_store_status` (`userId`, `storeId`, `status`)'
);

-- sales_stats.php : différences de caisse par store sur closedAt
CALL add_index_if_missing(
    'shifts',
    'idx_shifts_store_status_closedAt',
    'ALTER TABLE `shifts` ADD INDEX `idx_shifts_store_status_closedAt` (`storeId`, `status`, `closedAt`)'
);

-- sales_stats.php : variantes filtrées par user
CALL add_index_if_missing(
    'shifts',
    'idx_shifts_user_status_closedAt',
    'ALTER TABLE `shifts` ADD INDEX `idx_shifts_user_status_closedAt` (`userId`, `status`, `closedAt`)'
);

-- expense_categories.php : listing/filtrage par magasin et type
CALL add_index_if_missing(
    'expense_categories',
    'idx_expense_categories_store_type_active',
    'ALTER TABLE `expense_categories` ADD INDEX `idx_expense_categories_store_type_active` (`storeId`, `type`, `active`)'
);

-- stores.php / expenses_advanced.php : sommes par magasin sur la colonne date
CALL add_index_if_missing(
    'expenses_advanced',
    'idx_expenses_adv_store_date',
    'ALTER TABLE `expenses_advanced` ADD INDEX `idx_expenses_adv_store_date` (`storeId`, `date`)'
);

-- stores.php : sommes par magasin, date et type
CALL add_index_if_missing(
    'expenses_advanced',
    'idx_expenses_adv_store_type_date',
    'ALTER TABLE `expenses_advanced` ADD INDEX `idx_expenses_adv_store_type_date` (`storeId`, `type`, `date`)'
);

-- stock_adjust.php / historiques : filtres fréquents par magasin et période
CALL add_index_if_missing(
    'stock_adjustments',
    'idx_stock_adjustments_store_createdAt',
    'ALTER TABLE `stock_adjustments` ADD INDEX `idx_stock_adjustments_store_createdAt` (`storeId`, `createdAt`)'
);

-- stores.php : recherche des réglages d''un magasin
CALL add_index_if_missing(
    'store_balance_settings',
    'uniq_store_balance_settings_storeId',
    'ALTER TABLE `store_balance_settings` ADD UNIQUE INDEX `uniq_store_balance_settings_storeId` (`storeId`)'
);

-- stores.php : dernier override global par magasin
CALL add_index_if_missing(
    'store_balance_overrides',
    'idx_store_balance_overrides_store_applied_created',
    'ALTER TABLE `store_balance_overrides` ADD INDEX `idx_store_balance_overrides_store_applied_created` (`storeId`, `appliedAt`, `createdAt`)'
);

-- stores.php : dernier override d''indicateur par magasin + indicateur
CALL add_index_if_missing(
    'store_indicator_overrides',
    'idx_store_indicator_overrides_store_indicator_applied_created',
    'ALTER TABLE `store_indicator_overrides` ADD INDEX `idx_store_indicator_overrides_store_indicator_applied_created` (`storeId`, `indicator`, `appliedAt`, `createdAt`)'
);

-- subscription_payments.php : filtre par magasin + tri paidAt DESC
CALL add_index_if_missing(
    'subscription_payments',
    'idx_sp_store_paidAt',
    'ALTER TABLE `subscription_payments` ADD INDEX `idx_sp_store_paidAt` (`storeId`, `paidAt`)'
);

-- users.php / stores.php : accès rapides par store principal
CALL add_index_if_missing(
    'users',
    'idx_users_storeId',
    'ALTER TABLE `users` ADD INDEX `idx_users_storeId` (`storeId`)'
);

-- auth / mapping multi-store : parcours par user puis store
CALL add_index_if_missing(
    'user_stores',
    'idx_user_stores_user_store',
    'ALTER TABLE `user_stores` ADD UNIQUE INDEX `idx_user_stores_user_store` (`userId`, `storeId`)'
);

-- notifications / stores : recherche des users d''un store
CALL add_index_if_missing(
    'user_stores',
    'idx_user_stores_store_user',
    'ALTER TABLE `user_stores` ADD INDEX `idx_user_stores_store_user` (`storeId`, `userId`)'
);

-- sales_stats.php : gros agrégats par magasin sur ventes non remboursées
CALL add_index_if_missing(
    'sales',
    'idx_sales_store_refunded_created',
    'ALTER TABLE `sales` ADD INDEX `idx_sales_store_refunded_created` (`storeId`, `refunded`, `createdAt`)'
);

-- sales_stats.php : variante filtrée par utilisateur
CALL add_index_if_missing(
    'sales',
    'idx_sales_user_refunded_created',
    'ALTER TABLE `sales` ADD INDEX `idx_sales_user_refunded_created` (`userId`, `refunded`, `createdAt`)'
);

-- notifications.php : vue "created" par expéditeur
CALL add_index_if_missing(
    'notifications',
    'idx_notifications_sender_active_created',
    'ALTER TABLE `notifications` ADD INDEX `idx_notifications_sender_active_created` (`senderUserId`, `active`, `createdAt`)'
);

-- stores / dashboards : filtres fréquents sur activité et abonnements
CALL add_index_if_missing(
    'stores',
    'idx_stores_active_subscriptionEnd',
    'ALTER TABLE `stores` ADD INDEX `idx_stores_active_subscriptionEnd` (`active`, `subscriptionEnd`)'
);

DROP PROCEDURE IF EXISTS add_index_if_missing;
