ALTER TABLE `email_settings`
  ADD COLUMN IF NOT EXISTS `inbox_shifts` tinyint(1) DEFAULT 1 AFTER `refunds`,
  ADD COLUMN IF NOT EXISTS `inbox_stock_signals` tinyint(1) DEFAULT 1 AFTER `inbox_shifts`,
  ADD COLUMN IF NOT EXISTS `inbox_stock_adjustments` tinyint(1) DEFAULT 1 AFTER `inbox_stock_signals`,
  ADD COLUMN IF NOT EXISTS `inbox_expenses` tinyint(1) DEFAULT 1 AFTER `inbox_stock_adjustments`,
  ADD COLUMN IF NOT EXISTS `inbox_logins` tinyint(1) DEFAULT 1 AFTER `inbox_expenses`,
  ADD COLUMN IF NOT EXISTS `inbox_refunds` tinyint(1) DEFAULT 1 AFTER `inbox_logins`,
  ADD COLUMN IF NOT EXISTS `inbox_low_stock` tinyint(1) DEFAULT 1 AFTER `inbox_refunds`,
  ADD COLUMN IF NOT EXISTS `inbox_out_of_stock` tinyint(1) DEFAULT 1 AFTER `inbox_low_stock`;