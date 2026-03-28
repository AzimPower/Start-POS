-- ============================================================
-- OPTIMISATION BASE DE DONNÉES POUR 100+ UTILISATEURS SIMULTANÉS
-- ============================================================
-- Ce script ajoute les index critiques pour améliorer les performances
-- Exécutez ce script avec: mysql -u user -p database < 001_performance_indexes.sql
-- ============================================================

-- Index pour les requêtes fréquentes sur la table SALES
-- Les requêtes filtrent souvent par storeId, userId, createdAt et vérifient refunded, draft
ALTER TABLE `sales` 
  ADD INDEX `idx_sales_storeId` (`storeId`),
  ADD INDEX `idx_sales_userId` (`userId`),
  ADD INDEX `idx_sales_createdAt` (`createdAt`),
  ADD INDEX `idx_sales_refunded` (`refunded`),
  ADD INDEX `idx_sales_draft` (`draft`),
  ADD INDEX `idx_sales_shiftId` (`shiftId`),
  ADD INDEX `idx_sales_customerId` (`customerId`),
  -- Index composite pour les requêtes les plus fréquentes
  ADD INDEX `idx_sales_store_created` (`storeId`, `createdAt`),
  ADD INDEX `idx_sales_user_created` (`userId`, `createdAt`),
  ADD INDEX `idx_sales_shift_created` (`shiftId`, `createdAt`);

-- Index pour la table SALE_ITEMS (jointures fréquentes)
-- La clé primaire composite existe déjà, ajoutons un index inverse
ALTER TABLE `sale_items`
  ADD INDEX `idx_sale_items_productId` (`productId`);

-- Index pour la table PRODUCTS
-- Recherches fréquentes par storeId et categoryId
ALTER TABLE `products`
  ADD INDEX `idx_products_storeId` (`storeId`),
  ADD INDEX `idx_products_categoryId` (`categoryId`),
  ADD INDEX `idx_products_trackStock` (`trackStock`),
  ADD INDEX `idx_products_createdAt` (`createdAt`);

-- Index pour la table PRODUCT_STOCK
-- Recherches par productId déjà couverte par la clé primaire
-- Ajoutons un index sur storeId pour les requêtes inverses
ALTER TABLE `product_stock`
  ADD INDEX `idx_product_stock_storeId` (`storeId`);

-- Index pour la table CATEGORIES
ALTER TABLE `categories`
  ADD INDEX `idx_categories_storeId` (`storeId`),
  ADD INDEX `idx_categories_createdAt` (`createdAt`);

-- Index pour la table CUSTOMERS
ALTER TABLE `customers`
  ADD INDEX `idx_customers_storeId` (`storeId`),
  ADD INDEX `idx_customers_phone` (`phone`),
  ADD INDEX `idx_customers_email` (`email`),
  ADD INDEX `idx_customers_createdAt` (`createdAt`);

-- Index pour la table EXPENSES
ALTER TABLE `expenses`
  ADD INDEX `idx_expenses_shiftId` (`shiftId`),
  ADD INDEX `idx_expenses_userId` (`userId`),
  ADD INDEX `idx_expenses_storeId` (`storeId`),
  ADD INDEX `idx_expenses_category` (`category`),
  ADD INDEX `idx_expenses_createdAt` (`createdAt`),
  ADD INDEX `idx_expenses_store_created` (`storeId`, `createdAt`);

-- Index pour la table EXPENSES_ADVANCED
ALTER TABLE `expenses_advanced`
  ADD INDEX `idx_expenses_adv_storeId` (`storeId`),
  ADD INDEX `idx_expenses_adv_type` (`type`),
  ADD INDEX `idx_expenses_adv_createdAt` (`createdAt`),
  ADD INDEX `idx_expenses_adv_store_created` (`storeId`, `createdAt`);

-- Index pour la table SHIFTS
ALTER TABLE `shifts`
  ADD INDEX `idx_shifts_userId` (`userId`),
  ADD INDEX `idx_shifts_storeId` (`storeId`),
  ADD INDEX `idx_shifts_startedAt` (`startedAt`),
  ADD INDEX `idx_shifts_endedAt` (`endedAt`),
  ADD INDEX `idx_shifts_store_started` (`storeId`, `startedAt`);

-- Index pour la table STOCK_SIGNALS
ALTER TABLE `stock_signals`
  ADD INDEX `idx_stock_signals_storeId` (`storeId`),
  ADD INDEX `idx_stock_signals_productId` (`productId`),
  ADD INDEX `idx_stock_signals_acknowledged` (`acknowledged`),
  ADD INDEX `idx_stock_signals_createdAt` (`createdAt`);

-- Index pour la table STORES
ALTER TABLE `stores`
  ADD INDEX `idx_stores_name` (`name`),
  ADD INDEX `idx_stores_createdAt` (`createdAt`);

-- Index pour la table PAYMENTS
ALTER TABLE `payments`
  ADD INDEX `idx_payments_customerId` (`customerId`),
  ADD INDEX `idx_payments_storeId` (`storeId`),
  ADD INDEX `idx_payments_createdAt` (`createdAt`);

-- ============================================================
-- OPTIMISATIONS SUPPLÉMENTAIRES
-- ============================================================

-- Analyse des tables pour mettre à jour les statistiques
ANALYZE TABLE 
  `sales`, 
  `sale_items`, 
  `products`, 
  `product_stock`, 
  `categories`, 
  `customers`, 
  `expenses`, 
  `expenses_advanced`, 
  `shifts`, 
  `stock_signals`, 
  `stores`,
  `payments`,
  `users`,
  `user_stores`;

-- Optimisation des tables (défragmentation)
OPTIMIZE TABLE 
  `sales`, 
  `sale_items`, 
  `products`, 
  `product_stock`, 
  `categories`, 
  `customers`, 
  `expenses`, 
  `expenses_advanced`, 
  `shifts`, 
  `stock_signals`, 
  `stores`,
  `payments`,
  `users`,
  `user_stores`;

-- ============================================================
-- VÉRIFICATION DES INDEX
-- ============================================================
-- Pour vérifier que les index ont été créés, exécutez:
-- SHOW INDEX FROM sales;
-- SHOW INDEX FROM products;
-- etc.
-- ============================================================
