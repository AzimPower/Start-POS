-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1:3306
-- Généré le : mer. 08 avr. 2026 à 22:16
-- Version du serveur : 11.8.6-MariaDB-log
-- Version de PHP : 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `u538245909_pos`
--

-- --------------------------------------------------------

--
-- Structure de la table `categories`
--

CREATE TABLE `categories` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `storeId` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `customers`
--

CREATE TABLE `customers` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT 0.00,
  `createdAt` bigint(20) NOT NULL,
  `storeId` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `email_settings`
--

CREATE TABLE `email_settings` (
  `id` varchar(36) NOT NULL,
  `store_id` varchar(36) NOT NULL,
  `shifts` tinyint(1) DEFAULT 1,
  `stock_signals` tinyint(1) DEFAULT 1,
  `expenses` tinyint(1) DEFAULT 1,
  `logins` tinyint(1) DEFAULT 1,
  `refunds` tinyint(1) DEFAULT 1,
  `updated_at` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expenses`
--

CREATE TABLE `expenses` (
  `id` varchar(36) NOT NULL,
  `shiftId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expenses_advanced`
--

CREATE TABLE `expenses_advanced` (
  `id` varchar(36) NOT NULL,
  `type` enum('direct','indirect','operational') NOT NULL,
  `name` varchar(100) NOT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `date` bigint(20) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT NULL,
  `directProduct_productId` varchar(36) DEFAULT NULL,
  `directProduct_quantity` int(11) DEFAULT NULL,
  `directProduct_startDate` bigint(20) DEFAULT NULL,
  `directProduct_endDate` bigint(20) DEFAULT NULL,
  `categoryId` varchar(36) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `updatedAt` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expense_categories`
--

CREATE TABLE `expense_categories` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` enum('indirect','operational') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `productIds` text DEFAULT NULL COMMENT 'JSON array of product IDs for indirect categories'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `notifications`
--

CREATE TABLE `notifications` (
  `id` varchar(36) NOT NULL,
  `title` varchar(160) NOT NULL,
  `message` text NOT NULL,
  `type` enum('info','success','warning','critical') NOT NULL DEFAULT 'info',
  `targetType` enum('all','role','store','user') NOT NULL,
  `targetRole` enum('super_admin','manager','admin','cashier') DEFAULT NULL,
  `targetStoreId` varchar(36) DEFAULT NULL,
  `targetUserId` varchar(36) DEFAULT NULL,
  `senderUserId` varchar(36) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `expiresAt` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `notification_reads`
--

CREATE TABLE `notification_reads` (
  `id` varchar(36) NOT NULL,
  `notificationId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `readAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `notification_dismissals`
--

CREATE TABLE `notification_dismissals` (
  `id` varchar(36) NOT NULL,
  `notificationId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `dismissedAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `saleId` varchar(36) DEFAULT NULL,
  `method` enum('cash','mobile_money','card','check','credit') DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `products`
--

CREATE TABLE `products` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sku` varchar(50) NOT NULL,
  `categoryId` varchar(36) DEFAULT NULL,
  `salePrice` decimal(10,2) DEFAULT NULL,
  `costPrice` decimal(10,2) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `taxRate` decimal(5,2) DEFAULT NULL,
  `minStock` int(11) DEFAULT NULL,
  `imageUrl` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `updatedAt` bigint(20) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `trackStock` tinyint(1) DEFAULT 0,
  `targetMargin` decimal(10,2) DEFAULT NULL,
  `variablePrices` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `product_stock`
--

CREATE TABLE `product_stock` (
  `productId` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL,
  `stock` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `push_subscriptions`
--

CREATE TABLE `push_subscriptions` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `endpoint` text NOT NULL,
  `endpointHash` char(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `contentEncoding` varchar(32) DEFAULT 'aes128gcm',
  `userAgent` varchar(255) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `updatedAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `sales`
--

CREATE TABLE `sales` (
  `id` varchar(36) NOT NULL,
  `shiftId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `customerId` varchar(36) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `paymentMethod` enum('cash','mobile_money','mixed','card','check','credit') DEFAULT NULL,
  `cashAmount` decimal(10,2) DEFAULT NULL,
  `mobileMoneyAmount` decimal(10,2) DEFAULT NULL,
  `otherAmount` decimal(10,2) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `refunded` tinyint(1) DEFAULT 0,
  `refundedAt` bigint(20) DEFAULT NULL,
  `draft` tinyint(1) DEFAULT 0,
  `completedAt` bigint(20) DEFAULT NULL,
  `receiptSequence` int(11) DEFAULT NULL,
  `receiptNumber` varchar(50) DEFAULT NULL,
  `cardAmount` decimal(10,2) DEFAULT 0.00 COMMENT 'Montant payé par carte',
  `checkAmount` decimal(10,2) DEFAULT 0.00 COMMENT 'Montant payé par chèque',
  `creditAmount` decimal(10,2) DEFAULT 0.00 COMMENT 'Montant en crédit client'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `sale_items`
--

CREATE TABLE `sale_items` (
  `saleId` varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shifts`
--

CREATE TABLE `shifts` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `openingAmount` decimal(10,2) DEFAULT NULL,
  `closingAmount` decimal(10,2) DEFAULT NULL,
  `expectedAmount` decimal(10,2) DEFAULT NULL,
  `difference` decimal(10,2) DEFAULT NULL,
  `cashAmount` decimal(10,2) DEFAULT NULL,
  `mobileMoneyAmount` decimal(10,2) DEFAULT NULL,
  `otherAmount` decimal(10,2) DEFAULT NULL,
  `openedAt` bigint(20) NOT NULL,
  `closedAt` bigint(20) DEFAULT NULL,
  `status` enum('open','closed') NOT NULL,
  `open_constraint` varchar(73) GENERATED ALWAYS AS (case when `status` = 'open' then concat(`userId`,'_',`storeId`,'_open') else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stock_adjustments`
--

CREATE TABLE `stock_adjustments` (
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `productName` varchar(255) DEFAULT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `userName` varchar(255) DEFAULT NULL,
  `storeId` varchar(36) NOT NULL,
  `oldStock` int(11) DEFAULT NULL,
  `delta` int(11) NOT NULL,
  `newStock` int(11) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `globalReason` varchar(500) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stock_signals`
--

CREATE TABLE `stock_signals` (
  `id` varchar(36) NOT NULL,
  `expenseId` varchar(36) DEFAULT NULL,
  `productId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `startDate` bigint(20) DEFAULT NULL,
  `endDate` bigint(20) DEFAULT NULL,
  `purchaseAmount` decimal(10,2) DEFAULT NULL,
  `quantityBought` int(11) DEFAULT NULL,
  `quantitySold` int(11) DEFAULT NULL,
  `revenue` decimal(10,2) DEFAULT NULL,
  `margin` decimal(10,2) DEFAULT NULL,
  `realMargin` decimal(15,2) DEFAULT 0.00,
  `marginPercentage` decimal(5,2) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stores`
--

CREATE TABLE `stores` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `subscriptionStart` bigint(20) DEFAULT NULL,
  `subscriptionEnd` bigint(20) DEFAULT NULL,
  `lastPayment` bigint(20) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `paymentMethods` text DEFAULT NULL COMMENT 'JSON array des moyens de paiement disponibles (cash, mobile_money, card, check, credit)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `store_balance_overrides`
--

CREATE TABLE `store_balance_overrides` (
  `id` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL,
  `value` decimal(14,2) NOT NULL,
  `appliedAt` bigint(20) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `store_balance_settings`
--

CREATE TABLE `store_balance_settings` (
  `id` varchar(64) NOT NULL,
  `storeId` varchar(255) NOT NULL,
  `fondCategories` text DEFAULT NULL,
  `beneficeCategories` text DEFAULT NULL,
  `trackIndirectExpenses` tinyint(1) DEFAULT 1,
  `trackIndirectExpensesEnabledAt` bigint(20) DEFAULT NULL,
  `fondManualValue` double DEFAULT NULL,
  `fondManualAppliedAt` bigint(20) DEFAULT NULL,
  `beneficeManualValue` double DEFAULT NULL,
  `beneficeManualAppliedAt` bigint(20) DEFAULT NULL,
  `createdAt` bigint(20) DEFAULT NULL,
  `updatedAt` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Structure de la table `store_indicator_overrides`
--

CREATE TABLE `store_indicator_overrides` (
  `id` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL,
  `indicator` enum('fond_roulement','benefice') NOT NULL,
  `value` decimal(14,2) NOT NULL,
  `appliedAt` bigint(20) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `subscription_payments`
--

CREATE TABLE `subscription_payments` (
  `id` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL,
  `storeName` varchar(255) NOT NULL,
  `months` int(11) NOT NULL DEFAULT 1,
  `amount` decimal(10,2) NOT NULL,
  `paidAt` bigint(20) NOT NULL,
  `note` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `username` varchar(50) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `pin` varchar(255) DEFAULT NULL,
  `role` enum('super_admin','manager','admin','cashier') NOT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `pinEnabled` tinyint(1) DEFAULT 0 COMMENT 'Activation du code PIN pour cet utilisateur'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `user_stores`
--

CREATE TABLE `user_stores` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_categories_storeId` (`storeId`),
  ADD KEY `idx_categories_createdAt` (`createdAt`);

--
-- Index pour la table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customers_storeId` (`storeId`),
  ADD KEY `idx_customers_phone` (`phone`),
  ADD KEY `idx_customers_email` (`email`),
  ADD KEY `idx_customers_createdAt` (`createdAt`);

--
-- Index pour la table `email_settings`
--
ALTER TABLE `email_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_store_id` (`store_id`),
  ADD KEY `idx_store_id` (`store_id`);

--
-- Index pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_expenses_shiftId` (`shiftId`),
  ADD KEY `idx_expenses_userId` (`userId`),
  ADD KEY `idx_expenses_storeId` (`storeId`),
  ADD KEY `idx_expenses_category` (`category`),
  ADD KEY `idx_expenses_createdAt` (`createdAt`),
  ADD KEY `idx_expenses_store_created` (`storeId`,`createdAt`);

--
-- Index pour la table `expenses_advanced`
--
ALTER TABLE `expenses_advanced`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_expenses_adv_storeId` (`storeId`),
  ADD KEY `idx_expenses_adv_type` (`type`),
  ADD KEY `idx_expenses_adv_createdAt` (`createdAt`),
  ADD KEY `idx_expenses_adv_store_created` (`storeId`,`createdAt`);

--
-- Index pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_createdAt` (`createdAt`),
  ADD KEY `idx_notifications_targetType` (`targetType`),
  ADD KEY `idx_notifications_targetRole` (`targetRole`),
  ADD KEY `idx_notifications_targetStoreId` (`targetStoreId`),
  ADD KEY `idx_notifications_targetUserId` (`targetUserId`),
  ADD KEY `idx_notifications_senderUserId` (`senderUserId`),
  ADD KEY `idx_notifications_active_expires` (`active`,`expiresAt`);

--
-- Index pour la table `notification_reads`
--
ALTER TABLE `notification_reads`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_notification_user` (`notificationId`,`userId`),
  ADD KEY `idx_notification_reads_userId` (`userId`),
  ADD KEY `idx_notification_reads_notificationId` (`notificationId`);

--
-- Index pour la table `notification_dismissals`
--
ALTER TABLE `notification_dismissals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_notification_dismissal_user` (`notificationId`,`userId`),
  ADD KEY `idx_notification_dismissals_userId` (`userId`),
  ADD KEY `idx_notification_dismissals_notificationId` (`notificationId`);

--
-- Index pour la table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `sku` (`sku`),
  ADD KEY `idx_products_storeId` (`storeId`),
  ADD KEY `idx_products_categoryId` (`categoryId`),
  ADD KEY `idx_products_trackStock` (`trackStock`),
  ADD KEY `idx_products_createdAt` (`createdAt`);

--
-- Index pour la table `product_stock`
--
ALTER TABLE `product_stock`
  ADD PRIMARY KEY (`productId`,`storeId`),
  ADD KEY `idx_product_stock_storeId` (`storeId`);

--
-- Index pour la table `push_subscriptions`
--
ALTER TABLE `push_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_push_endpoint_hash` (`endpointHash`),
  ADD KEY `idx_push_subscriptions_userId` (`userId`),
  ADD KEY `idx_push_subscriptions_active` (`active`),
  ADD KEY `idx_push_subscriptions_user_active` (`userId`,`active`);

--
-- Index pour la table `sales`
--
ALTER TABLE `sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_storeId` (`storeId`),
  ADD KEY `idx_sales_userId` (`userId`),
  ADD KEY `idx_sales_createdAt` (`createdAt`),
  ADD KEY `idx_sales_refunded` (`refunded`),
  ADD KEY `idx_sales_draft` (`draft`),
  ADD KEY `idx_sales_shiftId` (`shiftId`),
  ADD KEY `idx_sales_customerId` (`customerId`),
  ADD KEY `idx_sales_store_created` (`storeId`,`createdAt`),
  ADD KEY `idx_sales_user_created` (`userId`,`createdAt`),
  ADD KEY `idx_sales_shift_created` (`shiftId`,`createdAt`);

--
-- Index pour la table `sale_items`
--
ALTER TABLE `sale_items`
  ADD PRIMARY KEY (`saleId`,`productId`),
  ADD KEY `idx_sale_items_productId` (`productId`);

--
-- Index pour la table `shifts`
--
ALTER TABLE `shifts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_unique_open_shift` (`open_constraint`);

--
-- Index pour la table `stock_adjustments`
--
ALTER TABLE `stock_adjustments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_storeId` (`storeId`),
  ADD KEY `idx_createdAt` (`createdAt`);

--
-- Index pour la table `stock_signals`
--
ALTER TABLE `stock_signals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stock_signals_store_created` (`storeId`,`createdAt`),
  ADD KEY `idx_stock_signals_store_product_created` (`storeId`,`productId`,`createdAt`);

--
-- Index pour la table `stores`
--
ALTER TABLE `stores`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `store_balance_overrides`
--
ALTER TABLE `store_balance_overrides`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_store_balance_overrides_storeId` (`storeId`);

--
-- Index pour la table `store_balance_settings`
--
ALTER TABLE `store_balance_settings`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `store_indicator_overrides`
--
ALTER TABLE `store_indicator_overrides`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_store_indicator_overrides_storeId` (`storeId`);

--
-- Index pour la table `subscription_payments`
--
ALTER TABLE `subscription_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sp_storeId` (`storeId`),
  ADD KEY `idx_sp_paidAt` (`paidAt`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `phone` (`phone`),
  ADD KEY `idx_users_email` (`email`),
  ADD KEY `idx_email` (`email`);

--
-- Index pour la table `user_stores`
--
ALTER TABLE `user_stores`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user` (`userId`),
  ADD KEY `idx_store` (`storeId`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
