ALTER TABLE `email_settings`
  ADD COLUMN IF NOT EXISTS `inbox_stock_adjustments` tinyint(1) DEFAULT 1 AFTER `inbox_stock_signals`;