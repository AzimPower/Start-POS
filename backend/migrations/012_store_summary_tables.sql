-- Tables de synthèse pour accélérer les agrégats des dashboards magasins.
-- Elles sont utilisées en priorité quand elles existent, avec fallback automatique
-- vers les tables sources si la migration n'a pas encore été appliquée.

CREATE TABLE IF NOT EXISTS `store_daily_sales_summary` (
  `storeId` varchar(36) NOT NULL,
  `dayStart` bigint(20) NOT NULL,
  `revenue_closed` decimal(20,2) NOT NULL DEFAULT 0.00,
  `cogs_closed` decimal(20,2) NOT NULL DEFAULT 0.00,
  `transactions_closed` int(11) NOT NULL DEFAULT 0,
  `updatedAt` bigint(20) NOT NULL,
  PRIMARY KEY (`storeId`, `dayStart`),
  KEY `idx_store_daily_sales_dayStart` (`dayStart`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_daily_expense_summary` (
  `storeId` varchar(36) NOT NULL,
  `dayStart` bigint(20) NOT NULL,
  `direct_expenses` decimal(20,2) NOT NULL DEFAULT 0.00,
  `indirect_expenses` decimal(20,2) NOT NULL DEFAULT 0.00,
  `operational_expenses` decimal(20,2) NOT NULL DEFAULT 0.00,
  `updatedAt` bigint(20) NOT NULL,
  PRIMARY KEY (`storeId`, `dayStart`),
  KEY `idx_store_daily_expense_dayStart` (`dayStart`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_daily_indirect_category_summary` (
  `storeId` varchar(36) NOT NULL,
  `dayStart` bigint(20) NOT NULL,
  `categoryId` varchar(36) NOT NULL,
  `amount` decimal(20,2) NOT NULL DEFAULT 0.00,
  `updatedAt` bigint(20) NOT NULL,
  PRIMARY KEY (`storeId`, `dayStart`, `categoryId`),
  KEY `idx_store_daily_indirect_category_dayStart` (`dayStart`),
  KEY `idx_store_daily_indirect_category_category` (`categoryId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
