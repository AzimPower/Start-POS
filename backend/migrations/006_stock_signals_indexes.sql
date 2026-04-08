ALTER TABLE `stock_signals`
  ADD KEY `idx_stock_signals_store_created` (`storeId`, `createdAt`),
  ADD KEY `idx_stock_signals_store_product_created` (`storeId`, `productId`, `createdAt`);