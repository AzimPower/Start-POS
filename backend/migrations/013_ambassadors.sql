ALTER TABLE `users`
  MODIFY COLUMN `role` enum('super_admin','manager','admin','cashier','ambassador') NOT NULL;

ALTER TABLE `users`
  ADD COLUMN `promoCode` varchar(64) DEFAULT NULL,
  ADD COLUMN `commissionRate` decimal(5,2) DEFAULT 50.00,
  ADD COLUMN `withdrawalPhone` varchar(30) DEFAULT NULL;

ALTER TABLE `stores`
  ADD COLUMN `ambassadorUserId` varchar(36) DEFAULT NULL;

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
